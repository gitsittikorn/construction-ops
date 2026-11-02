import type { Master } from './models';
export default function SoilTypePicker({
  masters,
  value,
  onChange,
  previousValue,
}: {
  masters: Master[];
  value: string;
  onChange: (value: string) => void;
  previousValue?: string;
}) {
  const types = masters.filter((master) => master.kind === 'soilType' && master.active);
  const keepPrevious = Boolean(
    previousValue && !types.some((master) => master.name === previousValue),
  );
  return (
    <label className="field">
      <span>ชนิดดิน</span>
      <select
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
      </select>
      {!types.length && (
        <small>
          เพิ่มชนิดดินได้ที่ ข้อมูลพื้นฐาน → ชนิดดิน หรือเว้นว่างเพื่อบันทึกเที่ยวรถก่อน
        </small>
      )}
      {keepPrevious && value === previousValue && (
        <small>เก็บชื่อชนิดดินเดิมของเที่ยวนี้ไว้ แม้รายการพื้นฐานถูกแก้ชื่อหรือปิดใช้งาน</small>
      )}
    </label>
  );
}
