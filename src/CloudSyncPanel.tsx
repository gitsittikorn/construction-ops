import { useState } from 'react';
import type { Data } from './models';
import { integrityIssues, type CloudRecord } from './syncModel';
import { exportLocalBackup } from './backup';
import { workDate, workTimestamp } from './domain';

function title(record: CloudRecord, data: Data) {
  const p = record.payload;
  return 'name' in p
    ? p.name
    : `${p.date} ${data.masters.find((m) => m.id === p.truckId)?.name ?? p.truckId}`;
}
function Version({ record, data }: { record: CloudRecord | null; data: Data }) {
  if (!record) return <p>ไม่พบฉบับ Cloud</p>;
  const p = record.payload;
  const rows: [string, string][] = [
    ['รายการ', title(record, data)],
    ['สถานะข้อมูล', record.deletedAt ? 'ลบออกจากการใช้งานแล้ว' : 'ยังใช้งานอยู่'],
    ['แก้ไขล่าสุด', record.updatedAt],
  ];
  if ('recordType' in p)
    return (
      <div>
        <p>
          {p.name} · {record.updatedAt}
        </p>
        <pre>{JSON.stringify(p.body, null, 2)}</pre>
      </div>
    );
  if ('projectId' in p)
    rows.push(
      ['โครงการ', data.projects.find((v) => v.id === p.projectId)?.name ?? p.projectId],
      ['เวลา', p.time],
      ['คนขับ', data.masters.find((v) => v.id === p.driverId)?.name ?? p.driverId],
      ['แหล่งดิน', data.masters.find((v) => v.id === p.sourceId)?.name ?? p.sourceId],
      ['ชนิดดิน', p.soilType],
      ['หมายเหตุ', p.notes],
    );
  else if ('kind' in p)
    rows.push(
      ['รายละเอียด', p.detail],
      ['ความจุ', String(p.capacity)],
      ['เปิดใช้งาน', p.active ? 'ใช่' : 'ไม่'],
      ['จังหวัด', p.province ?? ''],
      ['เบอร์โทร', p.phone ?? ''],
      ['ประเภทรถ', p.truckType ?? ''],
      [
        'ทีม',
        (p.tagIds ?? []).map((id) => data.masters.find((m) => m.id === id)?.name ?? id).join(', '),
      ],
    );
  else
    rows.push(
      ['ลูกค้า', p.customer],
      ['สถานที่', p.location],
      ['วันเริ่มต้น', p.startDate],
      ['วันสิ้นสุด', p.endDate],
      ['สถานะโครงการ', p.status],
      ['รายละเอียด', p.description],
      ['พิกัด', p.latitude === undefined ? '' : `${p.latitude}, ${p.longitude}`],
    );
  return (
    <table>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th>{label}</th>
            <td>{value || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CloudSyncPanel({
  owner,
  data,
  configured,
  online,
  busy,
  status,
  failure,
  onSync,
  onResolve,
}: {
  owner: string;
  data: Data;
  configured: boolean;
  online: boolean;
  busy: boolean;
  status: string;
  failure?: string;
  onSync: () => Promise<void>;
  onResolve: (key: string, choice: 'local' | 'remote') => Promise<void>;
}) {
  const [error, setError] = useState('');
  const entries = Object.entries(data.sync?.entries ?? {});
  const pending = entries.filter(([, entry]) => entry.status === 'pending');
  const conflicts = entries.filter(([, entry]) => entry.status === 'conflict');
  const issues = integrityIssues(data);
  async function download() {
    setError('');
    try {
      const blob = await exportLocalBackup(owner),
        url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `construction-ops-backup-${workDate()}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'สำรองข้อมูลไม่สำเร็จ');
    }
  }
  return (
    <section className="panel padded cloud-sync-panel" aria-label="ความปลอดภัยและซิงก์ข้อมูล">
      <h2>ความปลอดภัยและซิงก์ข้อมูล</h2>
      <p aria-live="polite">
        {!configured
          ? 'บันทึกในเครื่อง ยังไม่ได้เชื่อมต่อ Cloud'
          : !online
            ? 'ออฟไลน์ — เก็บข้อมูลและคิวไว้ในเครื่อง'
            : status || 'กำลังตรวจสอบสิทธิ์และข้อมูล Cloud'}
      </p>
      <p>
        รอซิงก์ {pending.length} รายการ · ขัดแย้ง {conflicts.length} รายการ
      </p>
      {configured && (
        <button disabled={busy || !online} onClick={() => void onSync()}>
          ซิงก์และกู้คืนจาก Cloud
        </button>
      )}
      <button onClick={() => void download()}>ดาวน์โหลดข้อมูลสำรองพร้อมไฟล์แนบ</button>
      {data.sync?.restoredAt && (
        <p>ตรวจข้อมูลจาก Cloud ล่าสุด: {workTimestamp(data.sync.restoredAt)}</p>
      )}
      {error && <p role="alert">{error}</p>}
      {failure && <p role="alert">{failure}</p>}
      {pending
        .filter(([, entry]) => entry.error)
        .map(([key, entry]) => (
          <p role="alert" key={key}>
            {title(entry.desired, data)}: {entry.error}
          </p>
        ))}
      {!!issues.length && (
        <details>
          <summary>พบความสัมพันธ์ข้อมูลที่ต้องตรวจสอบ {issues.length} รายการ</summary>
          {issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </details>
      )}
      {conflicts.map(([key, entry]) => (
        <details key={key}>
          <summary>ตรวจสอบข้อมูลขัดแย้ง: {title(entry.desired, data)}</summary>
          <p>ข้อมูลทั้งสองฉบับยังถูกเก็บไว้ กรุณาตรวจสอบก่อนเลือก</p>
          <h3>ฉบับในเครื่อง</h3>
          <Version record={entry.desired} data={data} />
          <h3>ฉบับ Cloud</h3>
          <Version record={entry.conflict?.remote ?? null} data={data} />
          {'recordType' in entry.desired.payload &&
          entry.desired.payload.recordType === 'finance' ? (
            <p>
              ประวัติการเงินเดิมแก้ทับไม่ได้ กรุณาตรวจทั้งสองฉบับแล้วเลือกฉบับ Cloud
              หากต้องแก้ยอดให้เพิ่มเรตฉบับใหม่หรือรายการกลับพร้อมเหตุผล
            </p>
          ) : (
            <button disabled={busy || !online} onClick={() => void onResolve(key, 'local')}>
              เก็บฉบับในเครื่องแล้วส่งใหม่
            </button>
          )}
          <button
            disabled={busy || !online || !entry.conflict?.remote}
            onClick={() => void onResolve(key, 'remote')}
          >
            ใช้ฉบับ Cloud
          </button>
        </details>
      ))}
    </section>
  );
}
