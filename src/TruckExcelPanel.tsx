import { useRef, useState, type ChangeEvent } from 'react';
import type { Data, Master } from './models';
import { createTruckWorkbook, readTruckWorkbookSource } from './truckExcel';
import TruckImportPreview, { ImportSummary } from './TruckImportPreview';
import {
  planTruckImport,
  applyTruckImport,
  importHistory,
  type TruckImportRow,
} from './truckImport';
import { readBlobBytes } from './files';
import TruckSheetsPanel from './TruckSheetsPanel';
import { saveTruckSync } from './truckSheets';
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
    [linkDrivers, setLinkDrivers] = useState(true),
    [fromSheet, setFromSheet] = useState(false),
    [syncVersion, setSyncVersion] = useState(0),
    [snapshot, setSnapshot] = useState<Master[]>([]),
    [clearBlank, setClearBlank] = useState(false),
    [unmapped, setUnmapped] = useState<string[]>([]),
    [result, setResult] = useState<ReturnType<typeof planTruckImport> | null>(null);
  const lock = useRef(false);
  const plan = rows
    ? planTruckImport(
        rows,
        data.masters,
        update,
        linkDrivers,
        clearBlank,
        importHistory(data.audit),
      )
    : null;
  function preview(parsed: TruckImportRow[], columns: string[], sheet: boolean) {
    setRows(parsed);
    setUnmapped(columns);
    setSnapshot(structuredClone(data.masters));
    setUpdate(false);
    setClearBlank(false);
    setResult(null);
    setFromSheet(sheet);
  }
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
      const source = await readTruckWorkbookSource(await readBlobBytes(file));
      if (!source.rows.length) throw Error('ไม่มีข้อมูลรถในชีต Trucks กรุณากรอกข้อมูลก่อนนำเข้า');
      preview(source.rows, source.unmapped, false);
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
      await onChange((old) =>
        applyTruckImport(old, rows, update, actor, snapshot, linkDrivers, clearBlank),
      );
      setResult(plan);
      setNotice(
        `นำเข้าสำเร็จ เพิ่ม ${plan.creates} แก้ไข ${plan.updates} ข้าม ${plan.skips} รายการ · ผูกคนขับ ${plan.links} (คนขับใหม่ ${plan.newDrivers})`,
      );
      setRows(null);
      if (fromSheet) {
        try {
          await saveTruckSync(actor, {
            at: new Date().toISOString(),
            creates: plan.creates,
            updates: plan.updates,
            links: plan.links,
            skips: plan.skips,
          });
          setSyncVersion((value) => value + 1);
        } catch {
          setError('นำเข้าข้อมูลแล้ว แต่บันทึกเวลาซิงก์ล่าสุดไม่สำเร็จ');
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="excel-panel content-stack">
      <TruckSheetsPanel
        owner={actor}
        syncVersion={syncVersion}
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
        onRows={(parsed, columns) => {
          preview(parsed, columns, true);
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
        ทะเบียนรถ จังหวัด เบอร์โทร ชื่อคนขับ ประเภทรถ ความจุ แท็กทีม รายละเอียด และสถานะ ·
        เบอร์โทรเก็บเป็นข้อความ
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
      {result && !plan && (
        <section className="panel padded" aria-label="ผลการนำเข้า">
          <h3>ผลการนำเข้า</h3>
          <ImportSummary plan={result} />
        </section>
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
                if (!event.target.checked) setClearBlank(false);
                setSnapshot(structuredClone(data.masters));
              }}
              disabled={busy}
            />
            อัปเดตรถเดิมด้วยข้อมูลทุกคอลัมน์จากไฟล์ (ช่องว่างคงค่าเดิม)
          </label>
          {update && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={clearBlank}
                onChange={(event) => {
                  setClearBlank(event.target.checked);
                  setSnapshot(structuredClone(data.masters));
                }}
                disabled={busy}
              />
              ให้ช่องว่างในไฟล์ล้างข้อมูลเดิม
            </label>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={linkDrivers}
              onChange={(event) => {
                setLinkDrivers(event.target.checked);
                setSnapshot(structuredClone(data.masters));
              }}
              disabled={busy}
            />
            สร้างและผูกคนขับประจำรถ (ใช้คอลัมน์ ชื่อคนขับ หากไม่มีใช้ ชื่อเล่น)
          </label>
          {unmapped.length > 0 && (
            <p role="alert">คอลัมน์ที่ระบบยังไม่รองรับและจะไม่ถูกนำเข้า: {unmapped.join(', ')}</p>
          )}
          <ImportSummary plan={plan} />
          {plan.newTags.length > 0 && <p>แท็กใหม่ที่จะสร้าง: {plan.newTags.join(', ')}</p>}
          <TruckImportPreview plan={plan} />
          <div className="drive-actions">
            <button
              className="primary"
              disabled={
                busy || plan.errors > 0 || plan.creates + plan.updates + plan.linkOnly === 0
              }
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
