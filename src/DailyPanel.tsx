import { useRef, useState, type FormEvent } from 'react';
import type { Data, Master } from './models';
import type { DailyRow } from './workspaceModels';
import { workDate } from './domain';
import {
  createDaily,
  dailySessions,
  sessionId,
  saveDailyRow,
  undoDaily,
  duplicateNextDay,
  verifyDaily,
  closeDaily,
  reopenDaily,
  verificationState,
  summarizeDaily,
  rowFingerprint,
  dailyRowVolume,
  correctDailyTrip,
} from './daily';
import { listUploads } from './uploads';
import EvidencePanel from './EvidencePanel';
import DrivePanel from './DrivePanel';
import { connectionMessage } from './async';
import { verificationLabels } from './workspaceLabels';

export default function DailyPanel({
  owner,
  data,
  onChange,
  online,
}: {
  owner: string;
  data: Data;
  onChange: (change: (data: Data) => Data) => Promise<void>;
  online: boolean;
}) {
  const [project, setProject] = useState(
      data.projects.find((p) => p.status === 'active')?.id ?? '',
    ),
    [date, setDate] = useState(workDate()),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [reason, setReason] = useState(''),
    [editing, setEditing] = useState<DailyRow | null>(null),
    [editingVersion, setEditingVersion] = useState<number | null>(null),
    [evidenceRow, setEvidenceRow] = useState(''),
    [selectedTruck, setSelectedTruck] = useState(''),
    [busy, setBusy] = useState(false),
    [driveVisible, setDriveVisible] = useState(false);
  const lock = useRef(false),
    draftId = useRef(crypto.randomUUID());
  const lastTap = useRef({ key: '', at: 0 });
  const session = dailySessions(data).find((s) => s.id === sessionId(project, date));
  const rows = session?.body.rows ?? [];
  const name = (id: string) => data.masters.find((m) => m.id === id)?.name ?? '—';
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice('บันทึกในเครื่องแล้ว สถานะ Cloud แสดงแยกด้านบน');
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
    setEditing(row);
    setEditingVersion(row ? (session?.body.version ?? null) : null);
    setSelectedTruck(row?.truckId ?? '');
    draftId.current = crypto.randomUUID();
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
          defaultValue={value}
          onChange={key === 'truckId' ? (e) => setSelectedTruck(e.target.value) : undefined}
        >
          <option value="">เลือก{label}</option>
          {data.masters
            .filter((m) => m.kind === kind && (m.active || m.id === value))
            .map((m) => (
              <option value={m.id} key={m.id}>
                {m.name}
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
      id: editing?.id ?? draftId.current,
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
  const volume = (list: DailyRow[]) => list.reduce((sum, r) => sum + dailyRowVolume(r), 0);
  return (
    <section aria-label="งานรายวัน">
      <h2>งานรายวัน → หลักฐาน → ตรวจยอด → ปิดวัน</h2>
      <div className="operations-filters">
        <label>
          โครงการทำงาน
          <select
            aria-label="โครงการทำงาน"
            value={project}
            onChange={(e) => {
              setProject(e.target.value);
              edit(null);
              setEvidenceRow('');
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
              edit(null);
              setEvidenceRow('');
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
                edit(null);
              }
            }}
          >
            <option value="">เลือกวันทำงานเดิม</option>
            {dailySessions(data)
              .filter((s) => !project || s.projectId === project)
              .sort((a, b) => b.body.date.localeCompare(a.body.date))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.body.date} · {s.body.state}
                </option>
              ))}
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!session ? (
        <button
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
              onChange={(e) => setReason(e.target.value)}
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
              onClick={() => void mutate((old) => duplicateNextDay(old, session.id, owner))}
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
              disabled={busy || session.body.state === 'closed'}
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
              disabled={busy || session.body.state === 'closed'}
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
              disabled={busy || session.body.state !== 'closed'}
              onClick={() =>
                void mutate((old) =>
                  reopenDaily(old, session.id, session.body.version, owner, reason),
                )
              }
            >
              เปิดวันใหม่พร้อมเหตุผล
            </button>
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
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{name(row.truckId)}</td>
                    <td>{name(row.driverId)}</td>
                    <td>{name(row.teamId)}</td>
                    <td>{row.tripCount}</td>
                    <td>{row.reportedTrips ?? 'ยังไม่กรอก'}</td>
                    <td>{row.reportedTrips === null ? '—' : row.tripCount - row.reportedTrips}</td>
                    <td>{dailyRowVolume(row)}</td>
                    <td>
                      {verificationState(session, row)} ·{' '}
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
                      <button onClick={() => edit(row)}>แก้ไข {name(row.truckId)}</button>
                      <button onClick={() => setEvidenceRow(row.id)}>
                        หลักฐาน {name(row.truckId)}
                      </button>
                      <button
                        disabled={busy || session.body.state === 'closed'}
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
              key={`${session.id}-${editing?.id ?? draftId.current}`}
              onSubmit={(e) => void save(e)}
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
                  <select name="soilType" defaultValue={editing?.soilType ?? ''}>
                    <option value="">ไม่ระบุ</option>
                    {data.masters
                      .filter(
                        (m) => m.kind === 'soilType' && (m.active || m.name === editing?.soilType),
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
                    defaultValue={editing?.tripCount ?? 0}
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
                      editing?.capacity ??
                      data.masters.find((m) => m.id === selectedTruck)?.capacity ??
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
                    defaultValue={editing?.reportedTrips ?? ''}
                  />
                </label>
                <label>
                  หมายเหตุงาน
                  <input name="notes" defaultValue={editing?.notes ?? ''} />
                </label>
              </div>
              <button disabled={busy} type="submit">
                บันทึกยอดรถ
              </button>
              {editing && (
                <button type="button" onClick={() => edit(null)}>
                  เพิ่มรถคันอื่น
                </button>
              )}
            </form>
          )}
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
              row.trips?.map((trip) => (
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
                    {trip.migrated ? ' · จากยอดรวมเดิม' : ''}
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
