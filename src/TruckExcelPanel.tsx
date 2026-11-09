import { useRef, useState, type ChangeEvent } from 'react';
import type { Data, Master } from './models';
import { createTruckWorkbook, readTruckWorkbook } from './truckExcel';
import { planTruckImport, applyTruckImport, type TruckImportRow } from './truckImport';
import { readBlobBytes } from './files';
import TruckSheetsPanel from './TruckSheetsPanel';
export default function TruckExcelPanel({
  data,
  visibleTrucks,
  actor,
  onChange,
}: {
  data: Data;
  visibleTrucks: Master[];
  actor: string;
  onChange: (change: (data: Data) => Data) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [rows, setRows] = useState<TruckImportRow[] | null>(null),
    [update, setUpdate] = useState(false),
    [snapshot, setSnapshot] = useState<Master[]>([]);
  const lock = useRef(false);
  const plan = rows ? planTruckImport(rows, data.masters, update) : null;
  async function download(template: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const blob = await createTruckWorkbook(visibleTrucks, data.masters, template);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = template ? 'trucks-import-template.xlsx' : 'trucks-export.xlsx';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        template
          ? 'ดาวน์โหลดไฟล์ตัวอย่างแล้ว กรอกข้อมูลในชีต Trucks'
          : 'ส่งออกข้อมูลรถตามตัวกรองแล้ว',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function read(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setRows(null);
    setNotice('');
    try {
      if (!file.name.toLowerCase().endsWith('.xlsx')) throw Error('กรุณาเลือกไฟล์ .xlsx');
      if (file.size > 5 * 1024 * 1024) throw Error('ไฟล์ต้องมีขนาดไม่เกิน 5 MB');
      const parsed = await readTruckWorkbook(await readBlobBytes(file));
      if (!parsed.length) throw Error('ไม่มีข้อมูลรถในชีต Trucks กรุณากรอกข้อมูลก่อนนำเข้า');
      setRows(parsed);
      setSnapshot(structuredClone(data.masters));
      setUpdate(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function confirm() {
    if (!rows || !plan || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await onChange((old) => applyTruckImport(old, rows, update, actor, snapshot));
      setNotice(
        `นำเข้าสำเร็จ เพิ่ม ${plan.creates} แก้ไข ${plan.updates} ข้าม ${plan.skips} รายการ`,
      );
      setRows(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="excel-panel">
      <TruckSheetsPanel
        owner={actor}
        disabled={busy}
        onBusy={(value) => {
          setBusy(value);
          lock.current = value;
          if (value) {
            setRows(null);
            setNotice('');
            setError('');
          }
        }}
        onRows={(parsed) => {
          setRows(parsed);
          setSnapshot(structuredClone(data.masters));
          setUpdate(false);
          setError('');
          setNotice('อ่านข้อมูลจาก Google Sheets แล้ว กรุณาตรวจรายการก่อนยืนยัน');
        }}
      />
      <div className="drive-actions">
        <button className="secondary" disabled={busy} onClick={() => void download(true)}>
          ดาวน์โหลด Excel ตัวอย่าง
        </button>
        <button className="secondary" disabled={busy} onClick={() => void download(false)}>
          ส่งออกรถ Excel ({visibleTrucks.length})
        </button>
        <label className="field">
          <span>นำเข้ารถ Excel (.xlsx)</span>
          <input
            type="file"
            accept=".xlsx"
            disabled={busy}
            onChange={(event) => void read(event)}
          />
        </label>
      </div>
      <p>
        ทะเบียนรถ จังหวัด เบอร์โทร ประเภทรถ ความจุ แท็กทีม รายละเอียด และสถานะ ·
        เบอร์โทรเก็บเป็นข้อความ · นำเข้าทีละไม่เกิน 1,000 แถว
      </p>
      {busy && <p role="status">กำลังประมวลผล Excel…</p>}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}
      {plan && (
        <div className="import-preview">
          <h3>ตรวจรายการก่อนนำเข้า</h3>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={update}
              onChange={(event) => {
                setUpdate(event.target.checked);
                setSnapshot(structuredClone(data.masters));
              }}
              disabled={busy}
            />
            อัปเดตรถเดิมด้วยข้อมูลทุกคอลัมน์จากไฟล์ (ช่องว่างจะล้างค่าเดิม)
          </label>
          <p>
            เพิ่ม {plan.creates} · อัปเดต {plan.updates} · ข้าม {plan.skips} · ผิดพลาด {plan.errors}
          </p>
          {plan.newTags.length > 0 && <p>แท็กใหม่ที่จะสร้าง: {plan.newTags.join(', ')}</p>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>แถว</th>
                  <th>ทะเบียน / จังหวัด</th>
                  <th>ชื่อเล่น</th>
                  <th>การดำเนินการ</th>
                  <th>ข้อผิดพลาด</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((row) => (
                  <tr key={row.source.row}>
                    <td>{row.source.row}</td>
                    <td>
                      {row.source.plate} / {row.source.province || 'ไม่ระบุ'}
                    </td>
                    <td>{row.source.nickname ?? 'คงชื่อเล่นเดิม'}</td>
                    <td>
                      {
                        {
                          create: 'เพิ่มใหม่',
                          update: 'อัปเดต',
                          skip: 'ข้ามรถเดิม',
                          error: 'แก้ไขไฟล์ก่อน',
                        }[row.action]
                      }
                    </td>
                    <td>{row.errors.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="drive-actions">
            <button
              className="primary"
              disabled={busy || plan.errors > 0 || plan.creates + plan.updates === 0}
              onClick={() => void confirm()}
            >
              ยืนยันนำเข้ารถ
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                setSnapshot(structuredClone(data.masters));
                setError('');
              }}
            >
              ตรวจรายการใหม่
            </button>
            <button className="secondary" disabled={busy} onClick={() => setRows(null)}>
              ยกเลิกนำเข้า
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
