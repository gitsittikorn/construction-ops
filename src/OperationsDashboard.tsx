import { useEffect, useState } from 'react';
import type { Data } from './models';
import { emptyReportFilter, reportRows, reportTotals } from './reports';
import { workDate } from './domain';
import { dailySessions, evidenceFor, verificationState } from './daily';
import { listUploads, type UploadRecord } from './uploads';
import { evidenceStatus } from './evidence';
export default function OperationsDashboard({
  owner,
  data,
  onDaily,
}: {
  owner: string;
  data: Data;
  onDaily: () => void;
}) {
  const [uploads, setUploads] = useState<UploadRecord[] | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void listUploads(owner)
        .then((items) => {
          if (active) setUploads(items);
        })
        .catch(() => {
          if (active) setError('อ่านสถานะคิวหลักฐานไม่สำเร็จ');
        });
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener('construction-uploads-changed', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('construction-uploads-changed', refresh);
    };
  }, [owner, data]);
  const today = workDate(),
    rows = reportRows(data, { ...emptyReportFilter, from: today, to: today }),
    totals = reportTotals(rows);
  let pendingEvidence = 0;
  for (const s of dailySessions(data).filter((s) => s.body.date === today))
    for (const row of s.body.rows) {
      const evidence = evidenceFor(data, s, row).at(-1),
        files =
          evidence?.recordType === 'evidence'
            ? evidence.body.files
                .map((f) => uploads?.find((u) => u.id === f.uploadId))
                .filter((u): u is UploadRecord => !!u)
            : [];
      if (
        !['UPLOADED', 'VERIFIED'].includes(
          evidenceStatus(files, verificationState(s, row) === 'VERIFIED'),
        )
      )
        pendingEvidence++;
    }
  return (
    <section className="panel padded" aria-label="สถานะงานและหลักฐานวันนี้">
      <h2>งานและหลักฐานวันนี้</h2>
      <p>
        ปริมาตรวันนี้ที่ทราบ {totals.volume.toLocaleString('th-TH')} m³ · ไม่ทราบความจุ{' '}
        {totals.unknownVolumeTrips} เที่ยว
      </p>
      <p>
        ยืนยัน {totals.verifiedTrips} เที่ยว / {totals.verifiedVolume.toLocaleString('th-TH')} m³ ·
        รอตรวจ {totals.trips - totals.verifiedTrips} เที่ยว
      </p>
      <p>
        คนขับทั้งหมด {data.masters.filter((m) => m.kind === 'driver').length} คน · หลักฐานค้าง{' '}
        {uploads === null ? 'กำลังตรวจสอบ' : pendingEvidence} รายการ · อัปโหลดล้มเหลว{' '}
        {uploads === null ? 'กำลังตรวจสอบ' : uploads.filter((u) => u.status === 'error').length}{' '}
        ไฟล์
      </p>
      {error && <p role="alert">{error}</p>}
      <button onClick={onDaily}>เปิดงานรายวัน → หลักฐาน → ตรวจยอด → ปิดวัน</button>
    </section>
  );
}
