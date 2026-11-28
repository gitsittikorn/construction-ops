import { useEffect, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { exportLocalBackup } from './backup';
import { connectionMessage } from './async';
import { workDate } from './domain';
import { analyzeFleet, fleetSnapshot, resetFleet } from './fleetReset';
import { listUploads, type UploadRecord } from './uploads';
import type { Data, Master } from './models';

const phrase = 'ล้างข้อมูลรถ';
const names = (items: Master[]) =>
  items
    .slice(0, 20)
    .map((item) => item.name)
    .join(', ') + (items.length > 20 ? ` และอีก ${items.length - 20}` : '');

export default function FleetResetPanel({
  data,
  actor,
  onChange,
}: {
  data: Data;
  actor: string;
  onChange: (change: (data: Data) => Data) => Promise<void>;
}) {
  const [uploads, setUploads] = useState<UploadRecord[] | null>(null);
  const [backedUp, setBackedUp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  useEffect(() => {
    let active = true;
    void listUploads(actor)
      .then((rows) => {
        if (active) setUploads(rows);
      })
      .catch(() => {
        if (active) setError('ตรวจเอกสารที่อ้างอิงไม่สำเร็จ กรุณาเปิดหน้านี้ใหม่');
      });
    return () => {
      active = false;
    };
  }, [actor, data]);
  const report = analyzeFleet(data, uploads ?? []);
  const snapshot = fleetSnapshot(data);
  async function backup() {
    setBusy(true);
    setError('');
    try {
      const url = URL.createObjectURL(await exportLocalBackup(actor));
      const link = document.createElement('a');
      link.href = url;
      link.download = `construction-ops-before-fleet-reset-${workDate()}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackedUp(snapshot);
    } catch (e) {
      setError(connectionMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const issues: [string, Master[]][] = [
    ['ทะเบียนซ้ำ', report.duplicatePlates.flat()],
    ['คนขับชื่อและเบอร์ซ้ำ', report.duplicateDrivers.flat()],
    ['รถที่ยังไม่ผูกคนขับ', report.withoutDriver],
    ['รถที่ผูกกับคนขับซึ่งไม่พบ', report.brokenLinks],
    ['คนขับที่ผูกหลายคัน', report.sharedDrivers],
    ['คนขับที่ยังไม่มีรถ', report.spareDrivers],
    ['รถที่ยังไม่มีทีม', report.withoutTeam],
  ];
  return (
    <details className="panel padded fleet-reset">
      <summary>ตรวจข้อมูลรถและคนขับ / ล้างเพื่อซิงก์ใหม่</summary>
      <p>
        รถ {report.trucks.length} คัน · คนขับ {report.drivers.length} คน · มีประวัติใช้งาน รถ{' '}
        {report.usedTrucks.length} / คนขับ {report.usedDrivers.length}
      </p>
      <ul>
        {issues.map(([title, items]) => (
          <li key={title}>
            {title}: {items.length}
            {items.length > 0 && <small> — {names(items)}</small>}
          </li>
        ))}
      </ul>
      <p>
        การล้างจะซ่อนรถและคนขับที่ไม่มีประวัติ (เก็บเป็นข้อมูลที่ลบแล้ว) ส่วนรายการที่มีประวัติจะ
        ปิดใช้งานและยกเลิกการผูก โดยคงรหัสเดิมไว้ให้ประวัติเก่าอ้างถึงได้ โครงการ เที่ยวรถ งานรายวัน
        การเงิน และแท็กทีมไม่ถูกแก้
      </p>
      <p>
        หลังล้าง ให้นำเข้าจาก Google Sheets และเลือก “อัปเดตรถเดิม”
        เพื่อเปิดใช้งานรถเดิมและผูกคนขับใหม่ ไฟล์สำรองใช้เก็บหลักฐานก่อนล้าง
        เมนูกู้คืนจะเพิ่มเฉพาะข้อมูลที่ขาด จึงไม่ย้อนการล้างให้อัตโนมัติ
      </p>
      <div className="drive-actions">
        <button className="secondary" disabled={busy} onClick={() => void backup()}>
          1. ดาวน์โหลดไฟล์สำรองก่อนล้าง
        </button>
        <button
          className="danger-outline"
          disabled={
            busy ||
            !uploads ||
            backedUp !== snapshot ||
            (!report.trucks.length && !report.drivers.length)
          }
          onClick={() => {
            setTyped('');
            setNotice('');
            setConfirming(true);
          }}
        >
          2. ล้างข้อมูลรถและคนขับ
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {confirming && (
        <ConfirmDialog
          title="ล้างข้อมูลรถและคนขับ"
          message={`จะซ่อนรถ ${report.trucks.length - report.usedTrucks.length} คัน คนขับ ${report.drivers.length - report.usedDrivers.length} คน และปิดใช้งานรถ ${report.usedTrucks.length} คัน คนขับ ${report.usedDrivers.length} คนที่มีประวัติ รายการนี้จะซิงก์ขึ้น Cloud ตามปกติ`}
          confirmLabel="ยืนยันล้างข้อมูล"
          cancelLabel="ยกเลิกการล้าง"
          disabled={typed.trim() !== phrase}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            const files = await listUploads(actor);
            await onChange((old) => resetFleet(old, actor, files, backedUp));
            setConfirming(false);
            setBackedUp('');
            setNotice('ล้างข้อมูลรถและคนขับแล้ว นำเข้าข้อมูลใหม่ได้จากแผง Google Sheets ด้านบน');
          }}
        >
          <label className="field">
            <span>พิมพ์ “{phrase}” เพื่อยืนยัน</span>
            <input value={typed} onChange={(event) => setTyped(event.target.value)} />
          </label>
        </ConfirmDialog>
      )}
    </details>
  );
}
