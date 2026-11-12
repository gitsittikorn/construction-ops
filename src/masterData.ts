import { actorUid } from './workspaceIdentity';
import type { Data, Master } from './models';
import { validateMaster } from './domain';
import { validatePriceHistory } from './soilPriceValidation';
export const truckTypes = { 'six-wheel': 'หกล้อ', 'ten-wheel': 'สิบล้อ', other: 'อื่น ๆ' } as const;
export const normalizeName = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
export const plateKey = (plate: string, province = '') =>
  `${normalizeName(plate).replace(/[\s-]/g, '')}|${normalizeName(province)}`;
export function validateExtendedMaster(record: Master, masters: Master[]) {
  validateMaster(record);
  if (
    record.driverId !== undefined &&
    (record.kind !== 'truck' || typeof record.driverId !== 'string' || record.driverId.length > 200)
  )
    throw Error('ข้อมูลคนขับประจำรถไม่ถูกต้อง');
  if (record.driverId) {
    const previous = masters.find((item) => item.id === record.id);
    if (
      !masters.some(
        (item) =>
          item.kind === 'driver' &&
          item.id === record.driverId &&
          (item.active || previous?.driverId === item.id),
      )
    )
      throw Error('กรุณาเลือกคนขับที่เปิดใช้งาน');
    if (
      masters.some(
        (item) =>
          item.kind === 'truck' && item.id !== record.id && item.driverId === record.driverId,
      )
    )
      throw Error('คนขับนี้มีรถประจำแล้ว กรุณายกเลิกการผูกกับรถเดิมก่อน');
  }
  if (record.kind === 'soilPrice' || record.soilPrice !== undefined) {
    if (record.kind !== 'soilPrice' || !record.soilPrice || record.soilPrice.id !== record.id)
      throw Error('ข้อมูลราคาดินไม่ถูกต้อง');
    validatePriceHistory([record.soilPrice]);
  }
  if (
    record.nickname !== undefined &&
    (typeof record.nickname !== 'string' || record.nickname.length > 100)
  )
    throw Error('ชื่อเล่นต้องเป็นข้อความไม่เกิน 100 ตัวอักษร');
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
export function saveMaster(data: Data, record: Master, actor: string, appendPrice = false): Data {
  const before = data.masters.find((item) => item.id === record.id) ?? null;
  if (before && before.kind !== record.kind) throw Error('เปลี่ยนประเภทข้อมูลเดิมไม่ได้');
  record = { ...before, ...record };
  if (record.kind === 'soilPrice' && (!appendPrice || before))
    throw Error('ประวัติราคาเดิมแก้ไขหรือลบไม่ได้ กรุณาบันทึกราคาใหม่');
  validateExtendedMaster(record, data.masters);
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
export function saveTruckWithDriver(
  data: Data,
  record: Master,
  actor: string,
  newDriverName = '',
): Data {
  if (newDriverName.trim()) {
    if (record.kind !== 'truck' || record.driverId)
      throw Error('เลือกคนขับเดิมหรือเพิ่มคนขับใหม่อย่างใดอย่างหนึ่ง');
    const driver: Master = {
      id: crypto.randomUUID(),
      kind: 'driver',
      name: newDriverName.trim(),
      detail: '',
      phone: record.phone ?? '',
      nickname: record.nickname ?? '',
      capacity: 0,
      active: true,
      createdAt: record.updatedAt,
      updatedAt: record.updatedAt,
    };
    data = saveMaster(data, driver, actor);
    record = { ...record, driverId: driver.id };
  }
  return saveMaster(data, record, actor);
}

export function assignedDriver(masters: Master[], truckId: string) {
  const id = masters.find((item) => item.kind === 'truck' && item.id === truckId)?.driverId;
  return masters.find((item) => item.kind === 'driver' && item.id === id && item.active)?.id ?? '';
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
    record.nickname,
    record.truckType ? truckTypes[record.truckType] : '',
    ...tagNames(record, masters),
  ]
    .join(' ')
    .toLocaleLowerCase();
  return (
    (!tagId || record.tagIds?.includes(tagId)) && text.includes(query.trim().toLocaleLowerCase())
  );
}
