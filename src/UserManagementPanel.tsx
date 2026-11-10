import { useEffect, useRef, useState } from 'react';
import {
  accessRoleLabels,
  listAccessUsers,
  saveAccessUser,
  listAccessAudit,
  type AccessUser,
  type AccessRole,
  type AccessAudit,
} from './accessBackend';
import type { CompanyScope } from './workspaceIdentity';
import { saveCompanyProfile } from './companyAccess';
import { workTimestamp } from './domain';
import { connectionMessage } from './async';
const defaultApi = { list: listAccessUsers, save: saveAccessUser, audit: listAccessAudit };

export default function UserManagementPanel({
  scope,
  online,
  api = defaultApi,
}: {
  scope: CompanyScope & { name?: string };
  online: boolean;
  api?: typeof defaultApi;
}) {
  const [users, setUsers] = useState<AccessUser[]>([]),
    [events, setEvents] = useState<AccessAudit[]>([]),
    [query, setQuery] = useState(''),
    [next, setNext] = useState<string | null>(null),
    [editing, setEditing] = useState<AccessUser | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const active = useRef(false),
    epoch = useRef(0),
    locked = useRef(false);
  async function load(after = '') {
    const current = ++epoch.current;
    const [result, audit] = await Promise.all([
      api.list(scope.companyId, query, after),
      api.audit(scope.companyId),
    ]);
    if (active.current && current === epoch.current) {
      setUsers(result.users);
      setNext(result.next);
      setEvents(audit.events);
    }
  }
  useEffect(() => {
    if (scope.role !== 'owner' || scope.accessPolicy !== 'allowlist-v1') return;
    active.current = true;
    setBusy(true);
    const current = ++epoch.current;
    void Promise.all([api.list(scope.companyId), api.audit(scope.companyId)])
      .then(([result, audit]) => {
        if (active.current && current === epoch.current) {
          setUsers(result.users);
          setNext(result.next);
          setEvents(audit.events);
        }
      })
      .catch((e) => {
        if (active.current) setError(connectionMessage(e));
      })
      .finally(() => {
        if (active.current) setBusy(false);
      });
    return () => {
      active.current = false;
      epoch.current += 1;
    };
  }, [scope.companyId, scope.actorUid, scope.role, scope.accessPolicy, api]);
  async function run(task: () => Promise<void>) {
    if (locked.current || !online || scope.role !== 'owner') return;
    locked.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await task();
    } catch (e) {
      if (active.current) setError(connectionMessage(e));
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }
  if (scope.role !== 'owner' || scope.accessPolicy !== 'allowlist-v1')
    return <p role="alert">เฉพาะผู้ดูแลสูงสุดที่ผ่านการตรวจสิทธิ์เท่านั้น</p>;
  return (
    <section className="content-stack" aria-label="จัดการผู้ใช้งานและสิทธิ์">
      <h2>อนุญาตอีเมล Google และกำหนดสิทธิ์ทีมงาน</h2>
      <p>
        เพิ่มอีเมลได้ก่อนเข้าระบบครั้งแรก ระบบจะผูก UID หลังยืนยัน Google เท่านั้น
        บัญชีที่ถูกนำออกยังเก็บประวัติไว้ การเปลี่ยนสิทธิ์ไม่ลบงานหรือไฟล์ค้างของสมาชิก
      </p>
      {!online && <p role="status">ออฟไลน์ — ต้องเชื่อมต่อก่อนตรวจรายชื่อหรือเปลี่ยนสิทธิ์</p>}
      <form
        className="operations-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => load());
        }}
      >
        <label>
          ค้นหาอีเมล
          <input
            type="search"
            aria-label="ค้นหาอีเมลผู้ใช้งาน"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={254}
            autoComplete="off"
          />
        </label>
        <button className="secondary" disabled={busy || !online}>
          ค้นหา / โหลดรายชื่อใหม่
        </button>
      </form>
      <section className="panel padded content-stack" aria-label="แบบฟอร์มอนุญาตผู้ใช้งาน">
        <h3>{editing ? `แก้สิทธิ์ ${editing.email}` : 'เพิ่มอีเมลที่อนุญาต'}</h3>
        <form
          key={editing?.email ?? 'new'}
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget,
              data = new FormData(form);
            const status = String(data.get('status')) as AccessUser['status'];
            if (
              status === 'removed' &&
              !window.confirm('ยืนยันนำอีเมลนี้ออกจากรายการอนุญาต? ประวัติและงานเดิมจะยังอยู่')
            )
              return;
            void run(async () => {
              const result = await api.save(scope.companyId, {
                email: String(data.get('email')),
                name: String(data.get('name')),
                role: String(data.get('role')) as AccessRole,
                status,
                expectedRevision: editing?.revision ?? null,
              });
              if (!active.current) return;
              setEditing(null);
              form.reset();
              setNotice(
                result.sessionRevocationPending
                  ? 'สิทธิ์ข้อมูลเปลี่ยนแล้ว แต่การยกเลิกเซสชัน Google ยังรอให้ผู้ดูแลตรวจ Backend'
                  : 'บันทึกสิทธิ์แล้ว สมาชิกต้องใช้บัญชี Google ตามอีเมลที่อนุญาต',
              );
              await load();
            });
          }}
        >
          <fieldset className="access-user-fields" disabled={busy || !online}>
            <label>
              อีเมล Google
              <input
                aria-label="อีเมล Google ที่อนุญาต"
                name="email"
                type="email"
                required
                maxLength={254}
                readOnly={Boolean(editing)}
                defaultValue={editing?.email ?? ''}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label>
              ชื่อทีมงาน
              <input
                aria-label="ชื่อทีมงาน"
                name="name"
                required
                maxLength={200}
                defaultValue={editing?.name ?? ''}
                autoComplete="off"
              />
            </label>
            <label>
              บทบาท
              <select
                aria-label="บทบาทผู้ใช้งาน"
                name="role"
                defaultValue={editing?.role ?? 'staff'}
              >
                {Object.entries(accessRoleLabels).map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              สถานะบัญชี
              <select
                aria-label="สถานะบัญชีผู้ใช้งาน"
                name="status"
                defaultValue={editing?.status ?? 'enabled'}
              >
                <option value="enabled">เปิดสิทธิ์</option>
                <option value="disabled">ปิดสิทธิ์ชั่วคราว</option>
                <option value="removed">นำออกจากรายการอนุญาต (เก็บประวัติ)</option>
              </select>
            </label>
            <div className="operations-actions">
              <button className="primary">บันทึกสิทธิ์ผู้ใช้งาน</button>
              {editing && (
                <button type="button" className="secondary" onClick={() => setEditing(null)}>
                  ยกเลิกแก้ไข / เพิ่มอีเมลใหม่
                </button>
              )}
            </div>
          </fieldset>
        </form>
        <p>
          ผู้ดูแลสูงสุดจัดการสิทธิ์ได้ ผู้จัดการดูแลงานและการเงิน พนักงานบันทึกงานและหลักฐาน
          ผู้ดูข้อมูลอ่านอย่างเดียว ต้องเหลือผู้ดูแลสูงสุดที่เข้าระบบแล้วอย่างน้อย 1 คนเสมอ
        </p>
      </section>
      {busy && <p role="status">กำลังตรวจหรือบันทึกสิทธิ์กับ Backend…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="รายชื่อผู้ใช้งานที่อนุญาต"
      >
        <table>
          <thead>
            <tr>
              {[
                'ชื่อ / อีเมล',
                'บทบาท',
                'สถานะ / UID',
                'เข้าระบบล่าสุด',
                'เพิ่มเมื่อ',
                'แก้ไขล่าสุด',
                'จัดการ',
              ].map((text) => (
                <th key={text}>{text}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.email}>
                <td>
                  {user.name}
                  <br />
                  {user.email}
                </td>
                <td>{accessRoleLabels[user.role]}</td>
                <td>
                  {user.status === 'enabled'
                    ? 'เปิดสิทธิ์'
                    : user.status === 'disabled'
                      ? 'ปิดสิทธิ์'
                      : 'นำออกแล้ว'}
                  <br />
                  {user.uid || 'รอเข้าระบบครั้งแรก'}
                </td>
                <td>{user.lastLoginAt ? workTimestamp(user.lastLoginAt) : 'ยังไม่เคยเข้าระบบ'}</td>
                <td>{workTimestamp(user.createdAt)}</td>
                <td>{workTimestamp(user.updatedAt)}</td>
                <td>
                  <button
                    className="secondary"
                    disabled={busy || !online}
                    onClick={() => {
                      setEditing(user);
                      setError('');
                      setNotice('');
                    }}
                  >
                    แก้สิทธิ์ {user.email}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && <p className="empty-results">ไม่พบผู้ใช้ในรายการที่ค้นหา</p>}
      </div>
      {next && (
        <button
          className="secondary"
          disabled={busy || !online}
          onClick={() => void run(() => load(next))}
        >
          รายชื่อหน้าถัดไป
        </button>
      )}
      <details className="panel padded">
        <summary>ชื่อบริษัทและรหัสบริษัท</summary>
        <p>รหัสบริษัท: {scope.companyId}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get('companyName') ?? '');
            void run(async () => {
              await saveCompanyProfile(scope, name);
              if (active.current) setNotice('บันทึกชื่อบริษัทแล้ว');
            });
          }}
        >
          <label className="field">
            ชื่อบริษัท
            <input
              name="companyName"
              aria-label="ชื่อบริษัท"
              required
              maxLength={200}
              defaultValue={scope.name ?? ''}
            />
          </label>
          <button className="secondary" disabled={busy || !online}>
            บันทึกชื่อบริษัท
          </button>
        </form>
      </details>
      <details className="panel padded">
        <summary>ประวัติการจัดการสิทธิ์ล่าสุด {events.length} รายการ</summary>
        {events.map((event) => (
          <p key={event.id}>
            {workTimestamp(event.at)} · {event.action} · {event.email ?? ''} · ผู้ดำเนินการ{' '}
            {event.actor}
          </p>
        ))}
      </details>
    </section>
  );
}
