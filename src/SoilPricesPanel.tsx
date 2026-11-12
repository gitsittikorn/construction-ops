import { useState, type FormEvent } from 'react';
import type { Data } from './models';
import SearchableSelect from './SearchableSelect';
import { saveSoilPrice, priceHistory } from './soilPrices';
import { workTimestamp } from './domain';

export default function SoilPricesPanel({
  data,
  actor,
  canManage,
  onChange,
}: {
  data: Data;
  actor: string;
  canManage: boolean;
  onChange: (mutate: (old: Data) => Data) => Promise<unknown>;
}) {
  const [soilId, setSoilId] = useState(''),
    [sourceId, setSourceId] = useState('');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const soil = data.masters.find((item) => item.kind === 'soilType' && item.id === soilId);
  const history = soil ? priceHistory(data, soil, sourceId) : [];
  const latest = new Map<string, (typeof history)[number]>();
  for (const entry of history) if (!latest.has(entry.sourceId)) latest.set(entry.sourceId, entry);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canManage) return;
    const form = event.currentTarget,
      fields = new FormData(form);
    const input = {
      soilId,
      sourceId,
      amount: String(fields.get('amount') ?? ''),
      unit: String(fields.get('unit') ?? ''),
      note: String(fields.get('note') ?? ''),
    };
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await onChange((old) => saveSoilPrice(old, input, actor));
      // Only clear submitted values after the atomic local write succeeds.
      (form.elements.namedItem('amount') as HTMLInputElement).value = '';
      (form.elements.namedItem('note') as HTMLInputElement).value = '';
      setNotice('บันทึกราคาดินในเครื่องแล้ว รอซิงก์ตามสถานะข้อมูล');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'บันทึกราคาไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel padded content-stack" aria-label="ราคาดินตามแหล่ง">
      <h2>ราคาดินตามแหล่งและประวัติราคา</h2>
      <p>
        ดินชนิดเดียวกันตั้งราคาต่างกันในแต่ละแหล่งได้ ประวัติเรียงล่าสุดก่อน (DESC)
        และไม่เปลี่ยนยอดเงินของเที่ยวรถเก่า
      </p>
      <form onSubmit={(event) => void save(event)} className="content-stack">
        <div className="form-grid">
          <label className="field">
            <span>ชนิดดินสำหรับราคา</span>
            <SearchableSelect
              aria-label="ชนิดดินสำหรับราคา"
              value={soilId}
              onChange={(event) => setSoilId(event.target.value)}
            >
              <option value="">เลือกชนิดดิน</option>
              {data.masters
                .filter((item) => item.kind === 'soilType')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.active ? '' : ' (ปิดใช้งาน)'}
                  </option>
                ))}
            </SearchableSelect>
          </label>
          <label className="field">
            <span>แหล่งดินสำหรับราคา</span>
            <SearchableSelect
              aria-label="แหล่งดินสำหรับราคา"
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
            >
              <option value="">ทุกแหล่งดิน / เลือกแหล่งเพื่อบันทึกราคา</option>
              {data.masters
                .filter((item) => item.kind === 'source')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.active ? '' : ' (ปิดใช้งาน)'}
                  </option>
                ))}
            </SearchableSelect>
          </label>
          {canManage && (
            <>
              <label className="field">
                <span>ราคาดิน (บาท)</span>
                <input
                  name="amount"
                  aria-label="ราคาดิน (บาท)"
                  inputMode="decimal"
                  placeholder="เช่น 120.50"
                />
              </label>
              <label className="field">
                <span>หน่วยราคาดิน</span>
                <SearchableSelect name="unit" aria-label="หน่วยราคาดิน" defaultValue="m3">
                  <option value="m3">บาท/ลบ.ม. (ดินหลวม)</option>
                  <option value="trip">บาท/เที่ยว</option>
                </SearchableSelect>
              </label>
              <label className="field">
                <span>หมายเหตุราคา</span>
                <input name="note" maxLength={500} />
              </label>
            </>
          )}
        </div>
        {canManage && (
          <button className="primary" disabled={busy} type="submit">
            บันทึกราคาดินใหม่
          </button>
        )}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </form>
      {soil && (
        <>
          <h3>ราคาล่าสุดแยกตามแหล่ง</h3>
          {[...latest.values()].map((entry) => (
            <p key={entry.sourceId}>
              {entry.sourceName} ·{' '}
              {(entry.satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท/
              {entry.unit === 'm3' ? 'ลบ.ม. (ดินหลวม)' : 'เที่ยว'} · อัปเดตล่าสุด{' '}
            {workTimestamp(entry.at, true)}
            </p>
          ))}
          <p>
            บันทึกราคาทั้งหมด {history.length} ครั้ง (เริ่มต้น{' '}
            {new Set(history.map((entry) => entry.sourceId)).size} แหล่ง · ปรับราคา{' '}
            {history.length - new Set(history.map((entry) => entry.sourceId)).size} ครั้ง)
          </p>
          <div className="table-scroll" tabIndex={0} aria-label="ประวัติราคาดิน">
            <table>
              <thead>
                <tr>
                  {[
                    'ลำดับครั้งที่',
                    'วันเวลา (ไทย)',
                    'แหล่งดิน',
                    'ชนิดดิน ณ วันบันทึก',
                    'ราคา (บาท)',
                    'หน่วย',
                    'หมายเหตุ',
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.sequence}</td>
                    <td><time dateTime={entry.at}>{workTimestamp(entry.at, true)}</time></td>
                    <td>{entry.sourceName}</td>
                    <td>{entry.soilName}</td>
                    <td>
                      {(entry.satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </td>
                    <td>{entry.unit === 'm3' ? 'บาท/ลบ.ม. (ดินหลวม)' : 'บาท/เที่ยว'}</td>
                    <td>{entry.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!history.length && <p>ยังไม่มีประวัติราคาในตัวเลือกนี้</p>}
        </>
      )}
    </section>
  );
}
