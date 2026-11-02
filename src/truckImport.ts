import type { Data, Master } from './models';
import { normalizeName, plateKey, saveMaster, validateExtendedMaster } from './masterData';
export const truckHeaders = [
  'รหัสรถ',
  'ทะเบียนรถ',
  'จังหวัดทะเบียน',
  'เบอร์โทร',
  'ประเภทรถ',
  'ความจุ (m³)',
  'แท็กทีม',
  'รายละเอียด',
  'สถานะ',
];
export interface TruckImportRow {
  row: number;
  id: string;
  plate: string;
  province: string;
  phone: string;
  truckType: Master['truckType'];
  capacity: number;
  tags: string[];
  detail: string;
  active: boolean;
  errors: string[];
}
export interface TruckImportPlan {
  rows: {
    source: TruckImportRow;
    action: 'create' | 'update' | 'skip' | 'error';
    existingId?: string;
    errors: string[];
  }[];
  newTags: string[];
  creates: number;
  updates: number;
  skips: number;
  errors: number;
}
function text(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value).trim();
  throw Error('ชนิดข้อมูลในเซลล์ไม่รองรับ');
}
export function parseTruckRows(rows: unknown[][]): TruckImportRow[] {
  if (!rows.length) throw Error('ไฟล์ไม่มีหัวตาราง');
  const headers = rows[0].map(text);
  if (!headers.includes('ทะเบียนรถ')) throw Error('ไม่พบคอลัมน์ ทะเบียนรถ กรุณาใช้ไฟล์ตัวอย่าง');
  if (truckHeaders.some((header) => !headers.includes(header)))
    throw Error('หัวตารางไม่ครบ กรุณาใช้ไฟล์ตัวอย่างและคงชื่อคอลัมน์ทั้งหมด');
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length)
    throw Error('หัวคอลัมน์ซ้ำ กรุณาตรวจไฟล์');
  if (rows.length > 1001) throw Error('รองรับไม่เกิน 1,000 แถวต่อครั้ง');
  return rows
    .slice(1)
    .map((cells, index) => {
      if (cells.every((value) => value === null || value === undefined || value === ''))
        return null;
      const get = (key: string) => text(cells[headers.indexOf(key)]);
      const errors: string[] = [];
      let plate = '',
        province = '',
        phone = '',
        id = '',
        detail = '',
        tags: string[] = [],
        capacity = 0,
        active = true,
        truckType: Master['truckType'];
      try {
        plate = get('ทะเบียนรถ');
        province = get('จังหวัดทะเบียน');
        phone = get('เบอร์โทร');
        id = get('รหัสรถ');
        detail = get('รายละเอียด');
        if (!plate) errors.push('กรุณาระบุทะเบียนรถ');
        if (phone && typeof cells[headers.indexOf('เบอร์โทร')] !== 'string')
          errors.push('เบอร์โทรต้องเป็นข้อความใน Excel เพื่อรักษาเลข 0 นำหน้า');
        if (plate && typeof cells[headers.indexOf('ทะเบียนรถ')] !== 'string')
          errors.push('ทะเบียนรถต้องเป็นข้อความใน Excel');
        const type = get('ประเภทรถ');
        const types: Record<string, Master['truckType']> = {
          หกล้อ: 'six-wheel',
          '6 ล้อ': 'six-wheel',
          '6': 'six-wheel',
          'six-wheel': 'six-wheel',
          สิบล้อ: 'ten-wheel',
          '10 ล้อ': 'ten-wheel',
          '10': 'ten-wheel',
          'ten-wheel': 'ten-wheel',
          'อื่น ๆ': 'other',
          อื่นๆ: 'other',
          other: 'other',
        };
        if (type && !types[type]) errors.push('ประเภทรถต้องเป็น หกล้อ สิบล้อ หรือ อื่น ๆ');
        else truckType = types[type];
        const rawCapacity = get('ความจุ (m³)');
        capacity = rawCapacity ? Number(rawCapacity) : 0;
        if (!Number.isFinite(capacity) || capacity < 0)
          errors.push('ความจุต้องเป็นเลขศูนย์หรือมากกว่า');
        tags = Array.from(
          new Map(
            get('แท็กทีม')
              .split(/[,;|\n]/)
              .map((tag) => tag.trim())
              .filter(Boolean)
              .map((tag) => [normalizeName(tag), tag]),
          ).values(),
        );
        if (tags.some((tag) => tag.length > 50)) errors.push('ชื่อแท็กต้องไม่เกิน 50 ตัวอักษร');
        const state = get('สถานะ');
        if (state) {
          if (['ใช้งาน', 'true', '1'].includes(state.toLowerCase())) active = true;
          else if (['ปิดใช้งาน', 'false', '0'].includes(state.toLowerCase())) active = false;
          else errors.push('สถานะต้องเป็น ใช้งาน หรือ ปิดใช้งาน');
        }
        validateExtendedMaster(
          {
            id: 'validation',
            name: plate,
            kind: 'truck',
            detail,
            capacity,
            active,
            province,
            phone,
            truckType,
            createdAt: '',
            updatedAt: '',
          },
          [],
        );
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'ข้อมูลไม่ถูกต้อง');
      }
      return {
        row: index + 2,
        id,
        plate,
        province,
        phone,
        truckType,
        capacity,
        tags,
        detail,
        active,
        errors,
      };
    })
    .filter((row): row is TruckImportRow => row !== null);
}
export function planTruckImport(
  rows: TruckImportRow[],
  masters: Master[],
  updateExisting: boolean,
): TruckImportPlan {
  const seen = new Set<string>(),
    targets = new Set<string>(),
    newTags = new Map<string, string>();
  const result: TruckImportPlan = {
    rows: [],
    newTags: [],
    creates: 0,
    updates: 0,
    skips: 0,
    errors: 0,
  };
  for (const source of rows) {
    const errors = [...source.errors],
      key = plateKey(source.plate, source.province);
    if (seen.has(key)) errors.push('ทะเบียนและจังหวัดซ้ำภายในไฟล์');
    seen.add(key);
    const byId = source.id
      ? masters.find((item) => item.id === source.id && item.kind === 'truck')
      : undefined;
    if (source.id && !byId) errors.push('รหัสรถไม่พบในบัญชีนี้ ให้เว้นว่างสำหรับเพิ่มรถใหม่');
    const candidates = masters.filter(
      (item) =>
        item.kind === 'truck' &&
        (plateKey(item.name, item.province) === key ||
          (!item.province &&
            normalizeName(item.name).replace(/[\s-]/g, '') ===
              normalizeName(source.plate).replace(/[\s-]/g, ''))),
    );
    if (!byId && candidates.length > 1)
      errors.push('พบทะเบียนเดิมหลายรายการ กรุณาใช้รหัสรถจากไฟล์ส่งออก');
    const existing = byId ?? candidates[0];
    if (existing && targets.has(existing.id)) errors.push('มีหลายแถวอ้างถึงรถเดิมคันเดียวกัน');
    if (existing) targets.add(existing.id);
    if (
      masters.some(
        (item) =>
          item.kind === 'truck' &&
          item.id !== existing?.id &&
          plateKey(item.name, item.province) === key,
      )
    )
      errors.push('ทะเบียนและจังหวัดชนกับรถคันอื่น');
    for (const tag of source.tags) {
      const found = masters.find(
        (item) => item.kind === 'tag' && normalizeName(item.name) === normalizeName(tag),
      );
      if (found && !found.active && !existing?.tagIds?.includes(found.id))
        errors.push(`แท็ก ${tag} ถูกปิดใช้งาน`);
    }
    const action = errors.length
      ? 'error'
      : existing
        ? updateExisting
          ? 'update'
          : 'skip'
        : 'create';
    result.rows.push({ source, action, existingId: existing?.id, errors });
    if (action === 'create' || action === 'update')
      for (const tag of source.tags)
        if (
          !masters.some(
            (item) => item.kind === 'tag' && normalizeName(item.name) === normalizeName(tag),
          )
        )
          newTags.set(normalizeName(tag), tag);
    if (action === 'create') result.creates++;
    else if (action === 'update') result.updates++;
    else if (action === 'skip') result.skips++;
    else result.errors++;
  }
  result.newTags = [...newTags.values()];
  return result;
}
export function applyTruckImport(
  data: Data,
  rows: TruckImportRow[],
  updateExisting: boolean,
  actor: string,
  previewMasters: Master[],
): Data {
  if (JSON.stringify(data.masters) !== JSON.stringify(previewMasters))
    throw Error('ข้อมูลพื้นฐานเปลี่ยนระหว่างตรวจไฟล์ กรุณาตรวจรายการนำเข้าใหม่ก่อนบันทึก');
  const plan = planTruckImport(rows, data.masters, updateExisting);
  if (plan.errors) throw Error('กรุณาแก้แถวที่มีข้อผิดพลาดก่อนนำเข้า');
  let next = data;
  const now = new Date().toISOString();
  for (const name of plan.newTags)
    next = saveMaster(
      next,
      {
        id: crypto.randomUUID(),
        kind: 'tag',
        name,
        detail: '',
        capacity: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      actor,
    );
  for (const row of plan.rows.filter((row) => row.action === 'create' || row.action === 'update')) {
    const old = next.masters.find((item) => item.id === row.existingId);
    const source = row.source;
    const tagIds = source.tags.map(
      (name) =>
        next.masters.find(
          (item) => item.kind === 'tag' && normalizeName(item.name) === normalizeName(name),
        )!.id,
    );
    const record: Master = {
      ...old,
      id: old?.id ?? crypto.randomUUID(),
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
      kind: 'truck',
      name: source.plate,
      province: source.province,
      phone: source.phone,
      truckType: source.truckType,
      capacity: source.capacity,
      detail: source.detail,
      active: source.active,
      tagIds,
    };
    next = saveMaster(next, record, actor);
  }
  return next;
}
