import SearchableSelect from './SearchableSelect';
import { useEffect, useRef, useState } from 'react';
import type { CompanyScope } from './workspaceIdentity';
import {
  listCompanyMembers,
  saveCompanyProfile,
  saveCompanyMember,
  type CompanyMember,
} from './companyAccess';
import { connectionMessage } from './async';
export default function CompanyMembersPanel({ scope }: { scope: CompanyScope }) {
  const [members, setMembers] = useState<CompanyMember[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const active = useRef(false),
    locked = useRef(false);
  useEffect(() => {
    active.current = true;
    void listCompanyMembers(scope)
      .then((rows) => {
        if (active.current) setMembers(rows);
      })
      .catch((error) => {
        if (active.current) setError(connectionMessage(error));
      });
    return () => {
      active.current = false;
    };
  }, [scope.companyId, scope.actorUid]);
  async function run(task: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await task();
      const rows = await listCompanyMembers(scope);
      if (active.current) {
        setMembers(rows);
        setNotice('บันทึกสิทธิ์บริษัทแล้ว สมาชิกต้องใช้บัญชี Google ของตนเอง');
      }
    } catch (error) {
      if (active.current) setError(connectionMessage(error));
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <section className="panel padded" aria-label="สมาชิกบริษัท">
      <h2>บริษัทและสิทธิ์สมาชิก</h2>
      <p>
        รหัสบริษัท: <strong>{scope.companyId}</strong>
      </p>
      <p>
        เจ้าของจัดการสมาชิกและสิทธิ์ ผู้จัดการดูแลงานและการเงิน
        พนักงานบันทึกเที่ยว/งานเปิด/หลักฐานและดูรายงานงาน โดยไม่มีสิทธิ์การเงินหรือปิดวัน
      </p>
      <p>
        ให้สมาชิกเข้าสู่ระบบ Google ก่อน แล้วคัดลอกรหัสผู้ใช้จากหน้าเลือกบริษัทมาเพิ่มที่นี่
        แชร์โฟลเดอร์ Drive ให้บัญชีที่ร่วมงาน และให้แต่ละคนเชื่อม Drive ของตนเอง
        สิทธิ์สมาชิกในแอปกับการแชร์ Google Drive ต้องจัดการทั้งสองส่วน
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const name = String(new FormData(event.currentTarget).get('companyName') ?? '');
          void run(() => saveCompanyProfile(scope, name));
        }}
      >
        <label className="field">
          ชื่อบริษัท
          <input name="companyName" aria-label="ชื่อบริษัท" required maxLength={200} />
        </label>
        <button disabled={busy}>บันทึกชื่อบริษัท</button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          void run(() =>
            saveCompanyMember(scope, {
              uid: String(fields.get('uid') ?? '').trim(),
              name: String(fields.get('name') ?? ''),
              role: String(fields.get('role')) as CompanyMember['role'],
              enabled: true,
            }),
          );
        }}
      >
        <label className="field">
          รหัสผู้ใช้สมาชิก
          <input name="uid" aria-label="รหัสผู้ใช้สมาชิก" required maxLength={128} />
        </label>
        <label className="field">
          ชื่อสมาชิก
          <input name="name" aria-label="ชื่อสมาชิก" required maxLength={200} />
        </label>
        <label className="field">
          สิทธิ์สมาชิก
          <SearchableSelect name="role" aria-label="สิทธิ์สมาชิก">
            <option value="operator">พนักงานบันทึกข้อมูล</option>
            <option value="manager">ผู้จัดการ</option>
          </SearchableSelect>
        </label>
        <button disabled={busy}>เพิ่มหรือเปิดสิทธิ์สมาชิก</button>
      </form>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>ชื่อ/รหัสผู้ใช้</th>
              <th>สิทธิ์</th>
              <th>สถานะ</th>
              <th>แก้ไข</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.uid}>
                <td>
                  {member.name}
                  <br />
                  {member.uid}
                </td>
                <td>{member.role === 'manager' ? 'ผู้จัดการ' : 'พนักงาน'}</td>
                <td>{member.enabled ? 'ใช้งาน' : 'ปิดสิทธิ์'}</td>
                <td>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        saveCompanyMember(scope, {
                          ...member,
                          role: member.role === 'manager' ? 'operator' : 'manager',
                        }),
                      )
                    }
                  >
                    เปลี่ยนสิทธิ์ {member.name}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        saveCompanyMember(scope, { ...member, enabled: !member.enabled }),
                      )
                    }
                  >
                    {member.enabled ? 'ปิด' : 'เปิด'}สิทธิ์ {member.name}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {busy && <p role="status">กำลังบันทึกสิทธิ์…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
