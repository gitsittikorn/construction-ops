import { managesBusiness, recordsBusiness } from './workspaceIdentity';
import { useRef, useState, type FormEvent } from 'react';
import type { Data, Master } from './models';
import type { DailyRow } from './workspaceModels';
import { workTimestamp } from './domain';
import { defaultTripCapacity, deliveredVolume, activeDailyTrips } from './dailyTrips';
import { useDailyUi } from './useDailyUi';
import DailyTripCorrections from './DailyTripCorrections';
import {
  createDaily,
  dailySessions,
  sessionId,
  saveDailyRow,
  undoDaily,
  duplicateNextDay,
  duplicatePreview,
  correctDailyTrip,
  verifyDaily,
  closeDaily,
  reopenDaily,
  verificationState,
  summarizeDaily,
  rowFingerprint,
} from './daily';
import { listUploads } from './uploads';
import EvidencePanel from './EvidencePanel';
import DrivePanel from './DrivePanel';
import { connectionMessage } from './async';
import { verificationLabels } from './workspaceLabels';

export default function DailyPanel({
  owner,
  defaultProject = '',
  data,
  onChange,
  online,
}: {
  owner: string;
  defaultProject?: string;
  data: Data;
  onChange: (change: (data: Data) => Data) => Promise<void>;
  online: boolean;
}) {
  const canVerify = managesBusiness(owner);
  const ui = useDailyUi(
    owner,
    defaultProject || data.projects.find((p) => p.status === 'active')?.id || '',
  );
  const { project, date, reason } = ui.state;
  const setProject = (value: string) => ui.update((s) => ({ ...s, project: value }));
  const setDate = (value: string) => ui.update((s) => ({ ...s, date: value }));
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [evidenceRow, setEvidenceRow] = useState(''),
    [working, setBusy] = useState(false),
    [driveVisible, setDriveVisible] = useState(false),
    [copyPreview, setCopyPreview] = useState<ReturnType<typeof duplicatePreview> | null>(null),
    [truckFilter, setTruckFilter] = useState(''),
    [driverFilter, setDriverFilter] = useState(''),
    [historyState, setHistoryState] = useState('');
  const lock = useRef(false),
    draftId = useRef(crypto.randomUUID());
  const busy = working || !recordsBusiness(owner);
  const lastTap = useRef({ key: '', at: 0 });
  const session = dailySessions(data).find((s) => s.id === sessionId(project, date));
  const rows = session?.body.rows ?? [];
  const draftKey = sessionId(project, date),
    draft = ui.state.drafts[draftKey];
  const editing = rows.find((r) => r.id === draft?.editingId) ?? null;
  const editingVersion = draft?.version ?? null;
  const selectedTruck = draft?.values.truckId ?? editing?.truckId ?? '';
  const shownRows = rows.filter(
    (r) =>
      (!truckFilter || r.truckId === truckFilter) &&
      (!driverFilter ||
        r.driverId === driverFilter ||
        activeDailyTrips(r).some((t) => t.driverId === driverFilter)),
  );
  const name = (id: string) => data.masters.find((m) => m.id === id)?.name ?? '—';
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice('บันทึกในเครื่องแล้ว ตรวจสถานะ Cloud ได้ที่เมนูซิงก์และสำรองข้อมูล');
    } catch (e) {
      setError(connectionMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const mutate = (change: (old: Data) => Data) => run(() => onChange(change));
  function quickCount(row: DailyRow, delta: number) {
    if (!session) return;
    const key = `${session.id}:${row.id}:${delta}`,
      now = Date.now();
    if (lastTap.current.key === key && now - lastTap.current.at < 350) return;
    lastTap.current = { key, at: now };
    void mutate((old) =>
      saveDailyRow(
        old,
        session.id,
        session.body.version,
        { ...row, tripCount: row.tripCount + delta },
        owner,
        reason,
      ),
    );
  }
  function edit(row: DailyRow | null) {
    draftId.current = crypto.randomUUID();
    ui.update((s) => ({
      ...s,
      drafts: {
        ...s.drafts,
        [draftKey]: {
          id: draftId.current,
          editingId: row?.id,
          version: row ? session?.body.version : undefined,
          values: row
            ? Object.fromEntries(
                Object.entries(row)
                  .filter(([key]) => key !== 'transactions')
                  .map(([key, value]) => [key, value === null ? '' : String(value)]),
              )
            : {},
        },
      },
    }));
  }
  function keepDraft(form: HTMLFormElement, changed: string) {
    const values = Object.fromEntries(
      [...new FormData(form)].map(([key, value]) => [key, String(value)]),
    );
    if (changed === 'truckId' && !editing)
      values.capacity = String(
        defaultTripCapacity(data.masters.find((m) => m.id === values.truckId)) ?? '',
      );
    ui.update((s) => ({
      ...s,
      drafts: {
        ...s.drafts,
        [draftKey]: {
          id: draft?.id ?? draftId.current,
          editingId: draft?.editingId,
          version: draft?.version,
          values,
        },
      },
    }));
  }
  function masterSelect(
    key: string,
    label: string,
    kind: Master['kind'],
    value = '',
    required = false,
  ) {
    return (
      <label>
        {label}
        <select
          name={key}
          aria-label={label}
          required={required}
          defaultValue={draft?.values[key] ?? value}
        >
          <option value="">เลือก{label}</option>
          {data.masters
            .filter(
              (m) => m.kind === kind && (m.active || m.id === value || m.id === draft?.values[key]),
            )
            .map((m) => (
              <option value={m.id} key={m.id}>
                {m.name}
                {!m.active ? ' (ปิดใช้งาน)' : ''}
              </option>
            ))}
        </select>
      </label>
    );
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const f = new FormData(event.currentTarget),
      text = (key: string) => String(f.get(key) ?? '').trim();
    const row: DailyRow = {
      id: editing?.id ?? draft?.id ?? draftId.current,
      truckId: text('truckId'),
      driverId: text('driverId'),
      teamId: text('teamId'),
      sourceId: text('sourceId'),
      soilType: text('soilType'),
      tripCount: Number(text('tripCount')),
      capacity: Number(text('capacity')),
      reportedTrips: text('reportedTrips') === '' ? null : Number(text('reportedTrips')),
      notes: text('notes'),
    };
    await run(async () => {
      await onChange((old) =>
        saveDailyRow(
          old,
          session.id,
          editing ? (editingVersion ?? -1) : session.body.version,
          row,
          owner,
          reason,
        ),
      );
      edit(null);
    });
  }
  const verified = rows.filter((r) => verificationState(session!, r) === 'VERIFIED');
  const volume = (list: DailyRow[]) => list.reduce((sum, r) => sum + deliveredVolume(r), 0);
  if (!ui.ready)
    return (
      <section aria-label="งานรายวัน">
        <p role="status">กำลังเปิดร่างงานรายวัน…</p>
        {ui.error && <p role="alert">{ui.error}</p>}
      </section>
    );
  return (
    <section aria-label="งานรายวัน" className="daily-operations content-stack">
      <h2>ยอดรถและเที่ยวประจำวัน</h2>
      <p role="status">
        {busy ? 'กำลังบันทึกข้อมูล…' : ui.saving ? 'กำลังเก็บร่าง…' : 'เก็บร่างในเครื่องแล้ว'}
      </p>
      {ui.error && <p role="alert">{ui.error}</p>}
      <div className="operations-filters">
        <label>
          โครงการทำงาน
          <select
            aria-label="โครงการทำงาน"
            value={project}
            onChange={(e) => {
              setProject(e.target.value);
              setEvidenceRow('');
              setCopyPreview(null);
            }}
          >
            <option value="">เลือกโครงการ</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          วันที่ทำงาน
          <input
            aria-label="วันที่ทำงาน"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setEvidenceRow('');
              setCopyPreview(null);
            }}
          />
        </label>
        <label>
          เปิดประวัติ
          <select
            aria-label="ประวัติวันทำงาน"
            value={session?.id ?? ''}
            onChange={(e) => {
              const s = dailySessions(data).find((s) => s.id === e.target.value);
              if (s) {
                setProject(s.projectId);
                setDate(s.body.date);
                setEvidenceRow('');
                setCopyPreview(null);
              }
            }}
          >
            <option value="">เลือกวันทำงานเดิม</option>
            {dailySessions(data)
              .filter(
                (s) =>
                  (!project || s.projectId === project) &&
                  (!historyState || s.body.state === historyState),
              )
              .sort((a, b) => b.body.date.localeCompare(a.body.date))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.body.date} ·{' '}
                  {s.body.state === 'closed'
                    ? 'ปิดวันแล้ว'
                    : s.body.state === 'reopened'
                      ? 'เปิดใหม่'
                      : 'เปิดรับรายการ'}
                </option>
              ))}
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <details className="panel padded">
        <summary>รายการวันทำงาน — เปิดรับ / ปิดวัน / ประวัติ</summary>
        {dailySessions(data)
          .filter(
            (s) =>
              (!project || s.projectId === project) &&
              (!historyState || s.body.state === historyState),
          )
          .sort((a, b) => b.body.date.localeCompare(a.body.date))
          .map((s) => (
            <button
              key={s.id}
              onClick={() => {
                ui.update((state) => ({ ...state, project: s.projectId, date: s.body.date }));
                setEvidenceRow('');
                setCopyPreview(null);
              }}
            >
              {s.body.date} · {data.projects.find((p) => p.id === s.projectId)?.name} ·{' '}
              {s.body.state === 'closed' ? 'ปิดวันแล้ว' : 'เปิดรับรายการ'} ·{' '}
              {s.body.rows.reduce((n, r) => n + r.tripCount, 0)} เที่ยว · {volume(s.body.rows)} m³
            </button>
          ))}
        {!dailySessions(data).length && <p>ยังไม่มีวันทำงาน เลือกโครงการและวันที่เพื่อเริ่มงาน</p>}
      </details>
      <label>
        สถานะประวัติ{' '}
        <select
          aria-label="สถานะประวัติวันทำงาน"
          value={historyState}
          onChange={(e) => setHistoryState(e.target.value)}
        >
          <option value="">ทั้งหมด</option>
          <option value="open">เปิดรับรายการ</option>
          <option value="closed">ปิดวันแล้ว</option>
          <option value="reopened">เปิดใหม่</option>
        </select>
      </label>
      {!session ? (
        <button
          className="primary"
          disabled={busy || !project}
          onClick={() => void mutate((old) => createDaily(old, project, date, owner))}
        >
          สร้างวันทำงาน
        </button>
      ) : (
        <>
          <p>
            สถานะวัน:{' '}
            {session.body.state === 'closed'
              ? 'ปิดวันแล้ว'
              : session.body.state === 'reopened'
                ? 'เปิดใหม่ — ต้องระบุเหตุผลทุกการแก้ไข'
                : 'เปิดรับรายการ'}
          </p>
          <p>
            ปริมาตรดินส่งจริงแบบหลวม ใช้ความจุของแต่ละเที่ยว ไม่รวมตัวคูณบวมตัวหรือบดอัด
            ปริมาตรตามแบบ/บดอัดดูแยกในงานสำรวจ
          </p>
          <p role="status">
            {data.sync?.entries[`workspaces/${session.id}`]?.status === 'synced'
              ? 'ซิงก์วันทำงานกับ Cloud แล้ว'
              : data.sync?.entries[`workspaces/${session.id}`]?.status === 'conflict'
                ? 'วันทำงานขัดแย้ง — ตรวจสอบทั้งสองฉบับที่เมนูซิงก์และสำรองข้อมูล'
                : 'วันทำงานบันทึกในเครื่อง — รอซิงก์ Cloud'}
          </p>
          <p>
            รถ {rows.length} คัน · คนขับ {new Set(rows.map((r) => r.driverId).filter(Boolean)).size}{' '}
            คน · เที่ยวบันทึก {rows.reduce((n, r) => n + r.tripCount, 0)} · ปริมาตร{' '}
            {volume(rows).toLocaleString('th-TH')} m³
          </p>
          <p>
            ยืนยันแล้ว {verified.reduce((n, r) => n + r.tripCount, 0)} เที่ยว /{' '}
            {volume(verified).toLocaleString('th-TH')} m³ · รอตรวจ {volume(rows) - volume(verified)}{' '}
            m³
          </p>
          <label>
            เหตุผลแก้ไข / เปิดวันใหม่
            <input
              aria-label="เหตุผลแก้ไข"
              value={reason}
              onChange={(e) => ui.update((s) => ({ ...s, reason: e.target.value }))}
            />
          </label>
          <details>
            <summary>สรุปเที่ยวและปริมาตรตามรถ / คนขับ / แหล่งดิน</summary>
            {Object.entries(summarizeDaily(session)).map(([key, groups]) => (
              <div key={key}>
                <h3>{key === 'byTruck' ? 'รถ' : key === 'byDriver' ? 'คนขับ' : 'แหล่งดิน'}</h3>
                {groups.map((value) => (
                  <p key={value.id}>
                    {name(value.id)} · {value.trips} เที่ยว · {value.volume.toLocaleString('th-TH')}{' '}
                    m³
                  </p>
                ))}
              </div>
            ))}
          </details>
          <div className="operations-actions">
            <button
              disabled={busy}
              onClick={() => {
                try {
                  setCopyPreview(duplicatePreview(data, session.id));
                  setError('');
                } catch (e) {
                  setError(connectionMessage(e));
                }
              }}
            >
              คัดลอกข้อมูลไปวันถัดไป
            </button>
            <button
              disabled={busy || session.body.state === 'closed'}
              onClick={() =>
                void mutate((old) =>
                  undoDaily(old, session.id, session.body.version, owner, reason),
                )
              }
            >
              ย้อนการแก้ไขล่าสุด
            </button>
            <button
              disabled={!canVerify || busy || session.body.state === 'closed'}
              onClick={() =>
                void run(async () => {
                  const uploads = await listUploads(owner);
                  await onChange((old) =>
                    verifyDaily(
                      old,
                      session.id,
                      session.body.version,
                      owner,
                      uploads,
                      undefined,
                      reason,
                    ),
                  );
                })
              }
            >
              ยืนยันยอดทั้งวัน
            </button>
            <button
              disabled={!canVerify || busy || session.body.state === 'closed'}
              onClick={() =>
                void run(async () => {
                  const uploads = await listUploads(owner);
                  await onChange((old) =>
                    closeDaily(old, session.id, session.body.version, owner, uploads, reason),
                  );
                })
              }
            >
              ปิดวันทำงาน
            </button>
            <button
              disabled={!canVerify || busy || session.body.state !== 'closed'}
              onClick={() =>
                void mutate((old) =>
                  reopenDaily(old, session.id, session.body.version, owner, reason),
                )
              }
            >
              เปิดวันใหม่พร้อมเหตุผล
            </button>
          </div>
          {copyPreview && (
            <section className="panel padded" aria-label="ตัวอย่างคัดลอกวันถัดไป">
              <h3>ตรวจสอบก่อนคัดลอกไป {copyPreview.targetDate}</h3>
              <p>
                คัดลอกรถ {copyPreview.rows.length} คัน เริ่มศูนย์เที่ยว ไม่คัดลอกเที่ยวเดิม ไฟล์แนบ
                ลายเซ็น หรือสถานะยืนยัน ปรับรถและคนขับได้หลังยืนยัน
              </p>
              {copyPreview.rows.map((r) => (
                <p key={r.id}>
                  {name(r.truckId)} · {name(r.driverId)} · {name(r.sourceId)} ·{' '}
                  {r.soilType || 'ไม่ระบุชนิดดิน'} · {r.capacity} m³/เที่ยว
                </p>
              ))}
              {copyPreview.warnings.map((warning) => (
                <p role="alert" key={warning}>
                  {warning}
                </p>
              ))}
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await onChange((old) =>
                      duplicateNextDay(
                        old,
                        copyPreview.source.id,
                        owner,
                        copyPreview.source.body.version,
                      ),
                    );
                    setCopyPreview(null);
                  })
                }
              >
                ยืนยันคัดลอกวันถัดไป
              </button>
              <button disabled={busy} onClick={() => setCopyPreview(null)}>
                ยกเลิกคัดลอก
              </button>
            </section>
          )}
          <div className="operations-filters">
            <label>
              กรองรถ{' '}
              <select
                aria-label="กรองรถรายวัน"
                value={truckFilter}
                onChange={(e) => setTruckFilter(e.target.value)}
              >
                <option value="">รถทุกคัน</option>
                {data.masters
                  .filter((m) => m.kind === 'truck')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              กรองคนขับ{' '}
              <select
                aria-label="กรองคนขับรายวัน"
                value={driverFilter}
                onChange={(e) => setDriverFilter(e.target.value)}
              >
                <option value="">คนขับทุกคน</option>
                {data.masters
                  .filter((m) => m.kind === 'driver')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    'รถ',
                    'คนขับ',
                    'ทีม',
                    'เที่ยวบันทึก',
                    'เที่ยวรายงาน',
                    'ผลต่าง',
                    'm³',
                    'สถานะ',
                    'ดำเนินการ',
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {name(row.truckId)}
                      {data.masters.some(
                        (m) =>
                          [row.truckId, row.driverId, row.sourceId].includes(m.id) && !m.active,
                      ) && <p role="alert">มีข้อมูลปิดใช้งาน ปรับรายการก่อนเพิ่มเที่ยว</p>}
                    </td>
                    <td>{name(row.driverId)}</td>
                    <td>{name(row.teamId)}</td>
                    <td>{row.tripCount}</td>
                    <td>{row.reportedTrips ?? 'ยังไม่กรอก'}</td>
                    <td>{row.reportedTrips === null ? '—' : row.tripCount - row.reportedTrips}</td>
                    <td>{deliveredVolume(row)}</td>
                    <td data-status={verificationState(session, row)}>
                      {verificationLabels[verificationState(session, row)]}
                    </td>
                    <td>
                      <button
                        aria-label={`เพิ่มเที่ยว ${name(row.truckId)}`}
                        disabled={busy || session.body.state === 'closed'}
                        onClick={() => quickCount(row, 1)}
                      >
                        +1
                      </button>
                      <button
                        aria-label={`ลดเที่ยว ${name(row.truckId)}`}
                        disabled={busy || row.tripCount === 0 || session.body.state === 'closed'}
                        onClick={() => quickCount(row, -1)}
                      >
                        −1
                      </button>
                      <button disabled={busy} onClick={() => edit(row)}>
                        แก้ไข {name(row.truckId)}
                      </button>
                      <button onClick={() => setEvidenceRow(row.id)}>
                        หลักฐาน {name(row.truckId)}
                      </button>
                      <button
                        disabled={!canVerify || busy || session.body.state === 'closed'}
                        onClick={() =>
                          void run(async () => {
                            const uploads = await listUploads(owner);
                            await onChange((old) =>
                              verifyDaily(
                                old,
                                session.id,
                                session.body.version,
                                owner,
                                uploads,
                                row.id,
                                reason,
                              ),
                            );
                          })
                        }
                      >
                        ยืนยัน {name(row.truckId)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {session.body.state !== 'closed' && (
            <form
              key={`${session.id}-${draft?.id ?? draftId.current}`}
              onSubmit={(e) => void save(e)}
              onChange={(e) =>
                keepDraft(e.currentTarget, (e.target as HTMLElement).getAttribute('name') ?? '')
              }
              className="panel padded"
            >
              <h3>{editing ? 'แก้ไขยอดรถ' : 'เพิ่มรถในวันทำงาน'}</h3>
              <div className="form-grid">
                {masterSelect('truckId', 'รถทำงาน', 'truck', editing?.truckId, true)}
                {masterSelect('driverId', 'คนขับทำงาน', 'driver', editing?.driverId)}
                {masterSelect('teamId', 'ทีมทำงาน', 'tag', editing?.teamId)}
                {masterSelect('sourceId', 'แหล่งดินทำงาน', 'source', editing?.sourceId)}
                <label>
                  ชนิดดินทำงาน
                  <select
                    aria-label="ชนิดดินทำงาน"
                    name="soilType"
                    defaultValue={draft?.values.soilType ?? editing?.soilType ?? ''}
                  >
                    <option value="">ไม่ระบุ</option>
                    {data.masters
                      .filter(
                        (m) =>
                          m.kind === 'soilType' &&
                          (m.active ||
                            m.name === editing?.soilType ||
                            m.name === draft?.values.soilType),
                      )
                      .map((m) => (
                        <option key={m.id}>{m.name}</option>
                      ))}
                  </select>
                </label>
                <label>
                  เที่ยวบันทึก
                  <input
                    aria-label="เที่ยวบันทึก"
                    name="tripCount"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={draft?.values.tripCount ?? editing?.tripCount ?? 0}
                    required
                  />
                </label>
                <label>
                  ความจุต่อเที่ยว (m³)
                  <input
                    key={selectedTruck}
                    aria-label="ความจุต่อเที่ยว"
                    name="capacity"
                    type="number"
                    min={0.001}
                    step="any"
                    defaultValue={
                      draft?.values.capacity ??
                      editing?.capacity ??
                      defaultTripCapacity(data.masters.find((m) => m.id === selectedTruck)) ??
                      ''
                    }
                    required
                  />
                </label>
                <label>
                  เที่ยวรายงาน
                  <input
                    aria-label="เที่ยวรายงาน"
                    name="reportedTrips"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={draft?.values.reportedTrips ?? editing?.reportedTrips ?? ''}
                  />
                </label>
                <label>
                  หมายเหตุงาน
                  <input name="notes" defaultValue={draft?.values.notes ?? editing?.notes ?? ''} />
                </label>
              </div>
              <button className="primary" disabled={busy} type="submit">
                บันทึกยอดรถ
              </button>
              {editing && (
                <button type="button" onClick={() => edit(null)}>
                  เพิ่มรถคันอื่น
                </button>
              )}
            </form>
          )}
          {!shownRows.length && <p>ยังไม่มีรถตามตัวกรอง เลือกรถและคนขับเพื่อเริ่มบันทึก</p>}
          <DailyTripCorrections
            session={session}
            masters={data.masters}
            draft={ui.state.drafts[`correction-${session.id}`]}
            busy={busy}
            onDraft={(draft) =>
              ui.update((s) => ({
                ...s,
                drafts: { ...s.drafts, [`correction-${session.id}`]: draft },
              }))
            }
            onSave={() =>
              void run(async () => {
                const correction = ui.state.drafts[`correction-${session.id}`],
                  v = correction.values;
                await onChange((old) =>
                  correctDailyTrip(
                    old,
                    session.id,
                    correction.version ?? -1,
                    v.rowId,
                    v.tripId,
                    {
                      capacity: Number(v.capacity),
                      driverId: v.driverId,
                      sourceId: v.sourceId,
                      soilType: v.soilType,
                    },
                    owner,
                    v.reason,
                  ),
                );
                ui.update((s) => ({
                  ...s,
                  drafts: {
                    ...s.drafts,
                    [`correction-${session.id}`]: { id: crypto.randomUUID(), values: {} },
                  },
                }));
              })
            }
          />
          <details>
            <summary>รายการเที่ยวและประวัติแก้ไข</summary>
            {rows.flatMap((row) =>
              activeDailyTrips(row).map((trip) => (
                <p key={trip.id}>
                  {name(row.truckId)} · {name(trip.driverId)} · {trip.capacity} m³ ·{' '}
                  {workTimestamp(trip.recordedAt)} · {trip.id}
                </p>
              )),
            )}
            {session.body.history?.map((entry) => (
              <p key={entry.id}>
                {workTimestamp(entry.at)} · {entry.action} · {entry.by} ·{' '}
                {entry.reason || 'แก้ไขรายการ'}
              </p>
            ))}
          </details>
          {rows.find((r) => r.id === evidenceRow) && (
            <EvidencePanel
              key={`${session.id}-${evidenceRow}-${rowFingerprint(
                session,
                rows.find((r) => r.id === evidenceRow)!,
              )}`}
              owner={owner}
              data={data}
              session={session}
              row={rows.find((r) => r.id === evidenceRow)!}
            />
          )}
          <details>
            <summary>ตรวจและแก้ไขรายเที่ยว</summary>
            <p>เที่ยวเก่าที่แปลงจากยอดรวมมีรหัสใหม่ ณ วันที่แปลง โดยคงความจุเดิมไว้</p>
            {rows.map((row) =>
              activeDailyTrips(row).map((trip) => (
                <form
                  key={trip.id}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const capacity = Number(new FormData(event.currentTarget).get('capacity'));
                    void mutate((old) =>
                      correctDailyTrip(
                        old,
                        session.id,
                        session.body.version,
                        row.id,
                        trip.id,
                        capacity,
                        owner,
                        reason,
                      ),
                    );
                  }}
                >
                  <label>
                    {name(row.truckId)} · {trip.id}
                    {trip.id.startsWith('legacy-') ? ' · จากยอดรวมเดิม' : ''}
                    <input
                      aria-label={`ความจุเที่ยว ${trip.id}`}
                      name="capacity"
                      type="number"
                      min="0.001"
                      step="any"
                      required
                      defaultValue={trip.capacity}
                    />
                  </label>
                  <button disabled={busy || session.body.state === 'closed'}>แก้ไขรายเที่ยว</button>
                </form>
              )),
            )}
          </details>
          {!!session.body.closures.length && (
            <details>
              <summary>ประวัติปิดวัน {session.body.closures.length} ครั้ง</summary>
              {session.body.closures.map((s, i) => (
                <p key={i}>
                  {s.at} · {s.trips} เที่ยว · {s.volume} m³ · {s.by}
                </p>
              ))}
            </details>
          )}
        </>
      )}
      <details onToggle={(event) => setDriveVisible(event.currentTarget.open)}>
        <summary>อัปโหลดหลักฐาน / ดูเอกสาร Google Drive</summary>
        {driveVisible && (
          <DrivePanel owner={owner} projects={data.projects} trips={data.trips} online={online} />
        )}
      </details>
    </section>
  );
}
