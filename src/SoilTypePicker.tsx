import SearchableSelect from './SearchableSelect';
import type { Master } from './models';
import { priceHistory } from './soilPrices';
export default function SoilTypePicker({
  masters,
  value,
  onChange,
  previousValue,
  sourceId,
}: {
  masters: Master[];
  value: string;
  onChange: (value: string) => void;
  previousValue?: string;
  sourceId?: string;
}) {
  const types = masters.filter((master) => master.kind === 'soilType' && master.active);
  const soil = types.find((item) => item.name === value);
  const latest =
    soil && sourceId
      ? priceHistory({ masters, projects: [], trips: [], audit: [] }, soil, sourceId)[0]
      : null;
  const keepPrevious = Boolean(
    previousValue && !types.some((master) => master.name === previousValue),
  );
  return (
    <label className="field">
      <span>ชนิดดิน</span>
      <SearchableSelect
        name="soilType"
        aria-label="ชนิดดิน"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">ไม่ระบุชนิดดิน</option>
        {keepPrevious && <option value={previousValue}>{previousValue} (ข้อมูลเดิม)</option>}
        {types.map((master) => (
          <option key={master.id} value={master.name}>
            {master.name}
          </option>
        ))}
      </SearchableSelect>
      {!types.length && (
        <small>
          เพิ่มชนิดดินได้ที่ ข้อมูลพื้นฐาน → ชนิดดิน หรือเว้นว่างเพื่อบันทึกเที่ยวรถก่อน
        </small>
      )}
      {keepPrevious && value === previousValue && (
        <small>เก็บชื่อชนิดดินเดิมของเที่ยวนี้ไว้ แม้รายการพื้นฐานถูกแก้ชื่อหรือปิดใช้งาน</small>
      )}
      {latest && (
        <small>
          ราคาดินล่าสุดของแหล่งนี้{' '}
          {(latest.satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท/
          {latest.unit === 'm3' ? 'ลบ.ม. (ดินหลวม)' : 'เที่ยว'} · ใช้อ้างอิง
          ไม่เปลี่ยนยอดเที่ยวรถเก่า
        </small>
      )}
    </label>
  );
}
