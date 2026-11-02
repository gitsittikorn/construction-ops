import type { Master } from './models';
export default function TagFields({
  masters,
  record,
}: {
  masters: Master[];
  record: Master | null;
}) {
  const selected = record?.tagIds ?? [];
  const tags = masters.filter(
    (item) => item.kind === 'tag' && (item.active || selected.includes(item.id)),
  );
  const missing = selected.filter(
    (id) => !masters.some((item) => item.id === id && item.kind === 'tag'),
  );
  return (
    <fieldset className="tag-fields">
      <legend>แท็กทีม / กลุ่ม</legend>
      {!tags.length && !missing.length && <small>สร้างแท็กได้ที่ ข้อมูลพื้นฐาน → แท็กทีม</small>}
      {tags.map((tag) => (
        <label key={tag.id}>
          <input
            type="checkbox"
            name="tagIds"
            value={tag.id}
            defaultChecked={selected.includes(tag.id)}
          />
          {tag.name}
          {!tag.active ? ' (ปิดใช้งาน)' : ''}
        </label>
      ))}
      {missing.map((id) => (
        <label key={id}>
          <input type="checkbox" name="tagIds" value={id} defaultChecked />
          แท็กเดิมที่ไม่พบข้อมูล
        </label>
      ))}
    </fieldset>
  );
}
