import { actorUid } from './workspaceIdentity';
import type { Data, Master } from './models';
import { validateMaster } from './domain';
export const truckTypes = { 'six-wheel': 'หกล้อ', 'ten-wheel': 'สิบล้อ', other: 'อื่น ๆ' } as const;
export const normalizeName = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
export const plateKey = (plate: string, province = '') =>
  `${normalizeName(plate).replace(/[\s-]/g, '')}|${normalizeName(province)}`;
export function validateExtendedMaster(record: Master, masters: Master[]) {
  validateMaster(record);
  if (record.phone && !/^[+\d][\d\s()+-]{4,24}$/.test(record.phone))
    throw Error('เบอร์โทรต้องมี 5–25 ตัวอักษร ใช้ตัวเลข + - วงเล็บ และช่องว่าง');
  if (record.province && record.province.length > 100) throw Error('จังหวัดทะเบียนยาวเกินไป');
  if (record.truckType && !Object.hasOwn(truckTypes, record.truckType))
    throw Error('ประเภทรถไม่ถูกต้อง');
  if (record.kind === 'tag') {
    if (record.name.length > 50 || /[,;|\n]/.test(record.name))
      throw Error('ชื่อแท็กไม่เกิน 50 ตัวอักษร และไม่ใช้ , ; | หรือขึ้นบรรทัดใหม่');
    if (
      masters.some(
        (item) =>
          item.kind === 'tag' &&
          item.id !== record.id &&
          normalizeName(item.name) === normalizeName(record.name),
      )
    )
      throw Error('มีชื่อแท็กนี้อยู่แล้ว');
  }
  if (
    record.kind === 'truck' &&
    masters.some(
      (item) =>
        item.kind === 'truck' &&
        item.id !== record.id &&
        plateKey(item.name, item.province) === plateKey(record.name, record.province),
    )
  )
    throw Error('ทะเบียนรถและจังหวัดนี้มีอยู่แล้ว');
  const previous = masters.find((item) => item.id === record.id);
  if (new Set(record.tagIds ?? []).size !== (record.tagIds ?? []).length)
    throw Error('แท็กซ้ำในรายการ');
  for (const id of record.tagIds ?? []) {
    const tag = masters.find((item) => item.id === id && item.kind === 'tag');
    if ((!tag || !tag.active) && !previous?.tagIds?.includes(id))
      throw Error('กรุณาเลือกแท็กที่เปิดใช้งาน');
  }
}
export function saveMaster(data: Data, record: Master, actor: string): Data {
  validateExtendedMaster(record, data.masters);
  const before = data.masters.find((item) => item.id === record.id) ?? null;
  return {
    ...data,
    masters: [...data.masters.filter((item) => item.id !== record.id), record],
    audit: [
      ...data.audit,
      {
        id: crypto.randomUUID(),
        entityId: record.id,
        action: before ? 'update' : 'create',
        at: new Date().toISOString(),
        actor: actorUid(actor),
        before,
        after: record,
      },
    ],
  };
}
export function tagNames(record: Master, masters: Master[]) {
  return (record.tagIds ?? []).map(
    (id) => masters.find((item) => item.id === id && item.kind === 'tag')?.name ?? 'แท็กเดิม',
  );
}
export function matchesMaster(record: Master, masters: Master[], query: string, tagId: string) {
  const text = [
    record.name,
    record.detail,
    record.province,
    record.phone,
    record.truckType ? truckTypes[record.truckType] : '',
    ...tagNames(record, masters),
  ]
    .join(' ')
    .toLocaleLowerCase();
  return (
    (!tagId || record.tagIds?.includes(tagId)) && text.includes(query.trim().toLocaleLowerCase())
  );
}
