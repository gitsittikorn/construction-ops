import type { Data, Master } from './models';
import {
  normalizeName,
  plateKey,
  saveMaster,
  tagNames,
  truckTypes,
  validateExtendedMaster,
} from './masterData';
export const legacyTruckHeaders = [
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
export const truckHeaders = [
  'รหัสรถ',
  'ทะเบียนรถ',
  'จังหวัดทะเบียน',
  'ประเภทรถ',
  'เบอร์โทร',
  'ชื่อเล่น',
  'แท็กทีม',
  'ความจุ (m³)',
  'รายละเอียด',
  'สถานะ',
];
// Optional extra column: the user's established sheet layout above stays unchanged.
export const driverHeader = 'ชื่อคนขับ';
// A safety ceiling only; nothing is ever cut off silently.
export const maxImportRows = 20000;

const headerKey = (value: string) => value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const knownHeaders = [...truckHeaders, driverHeader];
const canonicalHeader = (value: unknown) => {
  const label = typeof value === 'string' ? value.trim() : '';
  return knownHeaders.find((header) => headerKey(header) === headerKey(label)) ?? label;
};
/** Columns present in the file that this system does not read. */
export const unmappedHeaders = (header: unknown[] = []) =>
  header.map(canonicalHeader).filter((label) => label && !knownHeaders.includes(label));
export const hasTruckHeaders = (header: unknown[] = []) => {
  const labels = header.map(canonicalHeader);
  return legacyTruckHeaders.every((required) => labels.includes(required));
};

export interface TruckImportRow {
  row: number;
  id: string;
  plate: string;
  province: string;
  phone: string;
  nickname?: string;
  driver?: string;
  truckType: Master['truckType'];
  capacity: number;
  tags: string[];
  detail: string;
  active: boolean;
  errors: string[];
  /** The sheet cell was empty, so an existing value is kept unless clearing is chosen. */
  blankStatus?: boolean;
  blankCapacity?: boolean;
}
export interface FieldChange {
  label: string;
  before: string;
  after: string;
}
export interface DriverAssignment {
  id: string;
  name: string;
  isNew: boolean;
}
export interface TruckImportPlanRow {
  source: TruckImportRow;
  action: 'create' | 'update' | 'link' | 'skip' | 'error';
  existingId?: string;
  errors: string[];
  notes: string[];
  driver?: DriverAssignment;
  /** Stored value compared with the value the sheet would write. */
  changes: FieldChange[];
  review: boolean;
  incomplete: boolean;
}
export interface TruckImportPlan {
  rows: TruckImportPlanRow[];
  newTags: string[];
  links: number;
  newDrivers: number;
  creates: number;
  updates: number;
  /** Existing trucks that are not written at all. */
  skips: number;
  errors: number;
  linkOnly: number;
  unchanged: number;
  incomplete: number;
  existingDrivers: number;
  reviews: number;
  existingTags: number;
  teamLinks: number;
}

function text(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value).trim();
  throw Error('ชนิดข้อมูลในเซลล์ไม่รองรับ');
}
export function parseTruckRows(rows: unknown[][]): TruckImportRow[] {
  if (!rows.length) throw Error('ไฟล์ไม่มีหัวตาราง');
  const headers = rows[0].map(canonicalHeader);
  if (!headers.includes('ทะเบียนรถ')) throw Error('ไม่พบคอลัมน์ ทะเบียนรถ กรุณาใช้ไฟล์ตัวอย่าง');
  if (legacyTruckHeaders.some((header) => !headers.includes(header)))
    throw Error('หัวตารางไม่ครบ กรุณาใช้ไฟล์ตัวอย่างและคงชื่อคอลัมน์ทั้งหมด');
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length)
    throw Error('หัวคอลัมน์ซ้ำ กรุณาตรวจไฟล์');
  if (rows.length > maxImportRows + 1)
    throw Error(`รองรับไม่เกิน ${maxImportRows.toLocaleString('en-US')} แถวต่อครั้ง`);
  return rows
    .slice(1)
    .map((cells, index) => {
      // A row of spaces is blank; a row with any real value is kept and reported.
      if (cells.every((value) => value === null || value === undefined || !String(value).trim()))
        return null;
      const get = (key: string) => text(cells[headers.indexOf(key)]);
      const errors: string[] = [];
      let plate = '',
        province = '',
        phone = '',
        nickname: string | undefined,
        driver: string | undefined,
        id = '',
        detail = '',
        tags: string[] = [],
        capacity = 0,
        active = true,
        blankStatus = false,
        blankCapacity = false,
        truckType: Master['truckType'];
      try {
        plate = get('ทะเบียนรถ');
        province = get('จังหวัดทะเบียน');
        phone = get('เบอร์โทร');
        nickname = headers.includes('ชื่อเล่น') ? get('ชื่อเล่น') : undefined;
        driver = headers.includes(driverHeader) ? get(driverHeader) : undefined;
        if (driver && driver.length > 200) errors.push('ชื่อคนขับยาวเกิน 200 ตัวอักษร');
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
        blankCapacity = !rawCapacity;
        if (!Number.isFinite(capacity) || capacity < 0)
          errors.push('ความจุต้องเป็นเลขศูนย์หรือมากกว่า');
        tags = Array.from(
          new Map(
            get('แท็กทีม')
              .split(/[,;|\n]/)
              .map((tag) => tag.trim().replace(/\s+/g, ' '))
              .filter(Boolean)
              .map((tag) => [normalizeName(tag), tag]),
          ).values(),
        );
        if (tags.some((tag) => tag.length > 50)) errors.push('ชื่อแท็กต้องไม่เกิน 50 ตัวอักษร');
        const state = get('สถานะ');
        blankStatus = !state;
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
            ...(nickname !== undefined ? { nickname } : {}),
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
        ...(nickname !== undefined ? { nickname } : {}),
        ...(driver !== undefined ? { driver } : {}),
        truckType,
        capacity,
        tags,
        detail,
        active,
        errors,
        ...(blankStatus ? { blankStatus: true as boolean } : {}),
        ...(blankCapacity ? { blankCapacity: true as boolean } : {}),
      };
    })
    .filter((row): row is TruckImportRow => row !== null);
}

// Compare phones as national digits so "+66 81..." and "081-..." are one number.
export const phoneDigits = (value = '') => value.replace(/\D/g, '').replace(/^66(?=\d{9}$)/, '0');
// A sheet may have no driver column; its nickname column then holds the driver's name.
export const sheetDriverName = (row: TruckImportRow) => (row.driver || row.nickname || '').trim();
const sameName = (driver: Master, key: string) =>
  [driver.name, driver.nickname ?? ''].some((value) => value && normalizeName(value) === key);

/**
 * Evidence from the local change history: which driver a truck had before, and which trucks are
 * inactive only because the fleet reset tool switched them off.
 */
export function importHistory(audit: Data['audit']) {
  const found = new Set<string>();
  for (const { entityId, action, before } of audit) {
    const record = before as Partial<Master> | null;
    if (record?.kind !== 'truck') continue;
    if (record.driverId) found.add(`${record.id}|${record.driverId}`);
    if (action === 'fleet-reset-deactivate') found.add(`reset|${entityId}`);
    else found.delete(`reset|${entityId}`);
  }
  return found;
}

function driverPlanner(masters: Master[], history: Set<string>) {
  const drivers = masters.filter((item) => item.kind === 'driver');
  const taken = new Set(
    masters.flatMap((item) => (item.kind === 'truck' && item.driverId ? [item.driverId] : [])),
  );
  const created: { name: string; phone: string }[] = [];
  return (
    source: TruckImportRow,
    notes: string[],
    truckId = '',
  ): { driver?: DriverAssignment; review: boolean } => {
    const name = sheetDriverName(source),
      key = normalizeName(name),
      phone = phoneDigits(source.phone);
    const use = (driver: Master) => {
      taken.add(driver.id);
      return { driver: { id: driver.id, name: driver.name, isNew: false }, review: false };
    };
    const review = (message: string) => {
      notes.push(message);
      return { review: true };
    };
    const samePhone = phone ? drivers.filter((item) => phoneDigits(item.phone) === phone) : [];
    const samePerson = samePhone.filter((item) => sameName(item, key));
    if (samePerson.length) {
      const free = samePerson.find((item) => !taken.has(item.id));
      return free ? use(free) : review(`คนขับ ${name} เบอร์เดียวกันมีรถประจำแล้ว จึงไม่ผูกซ้ำ`);
    }
    if (samePhone.length)
      return review(`เบอร์นี้เป็นของคนขับ ${samePhone[0].name} กรุณาตรวจและผูกเองในหน้ารถ`);
    if (phone && created.some((item) => item.phone === phone))
      return review(`เบอร์ของ ${name} อยู่ในแถวก่อนหน้าแล้ว จึงไม่สร้างคนขับซ้ำ`);
    const named = drivers.filter((item) => sameName(item, key));
    // A nickname alone never identifies a person; another phone number means another person.
    const possible = named.filter(
      (item) => !taken.has(item.id) && (!phone || !phoneDigits(item.phone)),
    );
    const teams = source.tags.map((value) => normalizeName(value));
    const confirmed = possible.filter(
      (item) =>
        history.has(`${truckId}|${item.id}`) ||
        tagNames(item, masters).some((value) => teams.includes(normalizeName(value))),
    );
    if (confirmed.length === 1) return use(confirmed[0]);
    if (possible.length)
      return review(`พบคนขับชื่อ ${name} อยู่แล้วแต่ยืนยันตัวบุคคลไม่ได้ กรุณาผูกเองในหน้ารถ`);
    if (named.length || created.some((item) => item.name === key))
      notes.push(`ชื่อ ${name} ซ้ำกับคนขับของรถคันอื่น ตรวจว่าเป็นคนละคน`);
    created.push({ name: key, phone });
    return { driver: { id: crypto.randomUUID(), name, isNew: true }, review: false };
  };
}

const plainPlate = (value: string) => normalizeName(value).replace(/[\s-]/g, '');
const statusLabel = (active: boolean) => (active ? 'ใช้งาน' : 'ปิดใช้งาน');

/** The values an update would write. Blank cells keep stored values unless clearing is chosen. */
function mergedValues(
  source: TruckImportRow,
  old: Master,
  clearBlank: boolean,
  history: Set<string>,
) {
  const keepStatus = source.blankStatus && !clearBlank && !history.has(`reset|${old.id}`);
  const pick = (next: string, previous = '') => (next || clearBlank ? next : previous);
  return {
    name: source.plate,
    province: pick(source.province, old.province),
    phone: pick(source.phone, old.phone),
    nickname: source.nickname === undefined ? old.nickname : pick(source.nickname, old.nickname),
    truckType: source.truckType ?? (clearBlank ? undefined : old.truckType),
    capacity: source.blankCapacity && !clearBlank ? old.capacity : source.capacity,
    detail: pick(source.detail, old.detail),
    active: keepStatus ? old.active : source.active,
  };
}
function compare(
  source: TruckImportRow,
  old: Master,
  masters: Master[],
  clearBlank: boolean,
  history: Set<string>,
): FieldChange[] {
  const next = mergedValues(source, old, clearBlank, history);
  const type = (value: Master['truckType']) => (value ? truckTypes[value] : '');
  const teams = tagNames(old, masters);
  const nextTeams = source.tags.length || clearBlank ? source.tags : teams;
  const teamKey = (values: string[]) => values.map(normalizeName).sort().join('|');
  const pairs: [string, string, string][] = [
    ['ทะเบียนรถ', old.name, next.name],
    ['จังหวัดทะเบียน', old.province ?? '', next.province],
    ['ประเภทรถ', type(old.truckType), type(next.truckType)],
    ['เบอร์โทร', old.phone ?? '', next.phone],
    ['ชื่อเล่น', old.nickname ?? '', next.nickname ?? ''],
    ['ความจุ (m³)', String(old.capacity), String(next.capacity)],
    ['รายละเอียด', old.detail, next.detail],
    ['สถานะ', statusLabel(old.active), statusLabel(next.active)],
  ];
  const changes = pairs
    .filter(([, before, after]) => before !== after)
    .map(([label, before, after]) => ({ label, before, after }));
  if (teamKey(teams) !== teamKey(nextTeams))
    changes.push({ label: 'แท็กทีม', before: teams.join(', '), after: nextTeams.join(', ') });
  return changes;
}

export function planTruckImport(
  rows: TruckImportRow[],
  masters: Master[],
  updateExisting: boolean,
  linkDrivers = true,
  clearBlank = false,
  history: Set<string> = new Set(),
): TruckImportPlan {
  const assignDriver = driverPlanner(masters, history);
  const seen = new Set<string>(),
    targets = new Set<string>(),
    newTags = new Map<string, string>(),
    existingTags = new Set<string>(),
    existingDrivers = new Set<string>();
  const result: TruckImportPlan = {
    rows: [],
    newTags: [],
    links: 0,
    newDrivers: 0,
    creates: 0,
    updates: 0,
    skips: 0,
    errors: 0,
    linkOnly: 0,
    unchanged: 0,
    incomplete: 0,
    existingDrivers: 0,
    reviews: 0,
    existingTags: 0,
    teamLinks: 0,
  };
  const tagByName = new Map(
    masters
      .filter((item) => item.kind === 'tag')
      .map((item) => [normalizeName(item.name), item] as const),
  );
  const trucks = masters.filter((item) => item.kind === 'truck');
  for (const source of rows) {
    const errors = [...source.errors],
      notes: string[] = [],
      key = plateKey(source.plate, source.province);
    if (seen.has(key)) errors.push('ทะเบียนและจังหวัดซ้ำภายในไฟล์');
    seen.add(key);
    const byId = source.id ? trucks.find((item) => item.id === source.id) : undefined;
    if (source.id && !byId) errors.push('รหัสรถไม่พบในบัญชีนี้ ให้เว้นว่างสำหรับเพิ่มรถใหม่');
    // Without a province on either side only a single registration match is usable.
    const candidates = trucks.filter(
      (item) =>
        plateKey(item.name, item.province) === key ||
        ((!item.province || !source.province) &&
          plainPlate(item.name) === plainPlate(source.plate)),
    );
    if (!byId && candidates.length > 1)
      errors.push('พบทะเบียนเดิมหลายรายการ กรุณาใช้รหัสรถจากไฟล์ส่งออก');
    const existing = byId ?? candidates[0];
    if (existing && targets.has(existing.id)) errors.push('มีหลายแถวอ้างถึงรถเดิมคันเดียวกัน');
    if (existing) targets.add(existing.id);
    if (
      trucks.some((item) => item.id !== existing?.id && plateKey(item.name, item.province) === key)
    )
      errors.push('ทะเบียนและจังหวัดชนกับรถคันอื่น');
    for (const tag of source.tags) {
      const found = tagByName.get(normalizeName(tag));
      if (!found) continue;
      existingTags.add(found.id);
      if (!found.active && !existing?.tagIds?.includes(found.id))
        errors.push(`แท็ก ${tag} ถูกปิดใช้งาน`);
    }
    const missing = [
      !source.province && 'จังหวัดทะเบียน',
      !source.truckType && 'ประเภทรถ',
      !(source.capacity > 0) && 'ความจุ',
    ].filter(Boolean);
    if (source.plate && missing.length)
      notes.push(`ไม่ระบุ${missing.join(' · ')} ระบบไม่เดาค่าให้`);
    const changes =
      existing && !errors.length ? compare(source, existing, masters, clearBlank, history) : [];
    let action: TruckImportPlanRow['action'] = errors.length
      ? 'error'
      : !existing
        ? 'create'
        : updateExisting && changes.length
          ? 'update'
          : 'skip';
    let driver: DriverAssignment | undefined;
    let review = false;
    const name = sheetDriverName(source);
    if (linkDrivers && !errors.length) {
      const current = masters.find(
        (item) => item.kind === 'driver' && item.id === existing?.driverId,
      );
      const matches = current && name && sameName(current, normalizeName(name));
      // An existing assignment only changes in update mode, and only when the sheet itself changed.
      const replace =
        current &&
        name &&
        !matches &&
        updateExisting &&
        (Boolean(source.driver) || normalizeName(existing?.nickname ?? '') !== normalizeName(name));
      if (name && (!current || replace)) {
        ({ driver, review = false } = assignDriver(source, notes, existing?.id));
        if (driver && current)
          changes.push({ label: 'คนขับ', before: current.name, after: driver.name });
        if (driver && action === 'skip') action = replace ? 'update' : 'link';
      } else if (current) {
        existingDrivers.add(current.id);
        if (name && !matches) notes.push(`คงคนขับเดิม ${current.name}`);
      }
    }
    if (action === 'skip' && changes.length)
      notes.push(`ข้อมูลต่างจากเดิม ${changes.length} ช่อง เปิดตัวเลือกอัปเดตเพื่อใช้ค่าจากไฟล์`);
    if (existing && !existing.active && source.active && (action === 'skip' || action === 'link'))
      notes.push('รถคันนี้ปิดใช้งานอยู่ เปิดตัวเลือกอัปเดตเพื่อเปิดใช้งานตามไฟล์');
    const incomplete = !errors.length && missing.length > 0;
    result.rows.push({
      source,
      action,
      existingId: existing?.id,
      errors,
      notes,
      driver,
      changes,
      review,
      incomplete,
    });
    if (driver) {
      result.links++;
      if (driver.isNew) result.newDrivers++;
      else existingDrivers.add(driver.id);
    }
    if (review) result.reviews++;
    if (incomplete) result.incomplete++;
    if (action === 'create' || action === 'update') {
      for (const tag of source.tags)
        if (!tagByName.has(normalizeName(tag))) newTags.set(normalizeName(tag), tag);
      if (
        source.tags.length &&
        (action === 'create' || changes.some((change) => change.label === 'แท็กทีม'))
      )
        result.teamLinks++;
    }
    if (action === 'create') result.creates++;
    else if (action === 'update') result.updates++;
    else if (action === 'link') result.linkOnly++;
    else if (action === 'error') result.errors++;
    else {
      result.skips++;
      if (!changes.length) result.unchanged++;
    }
  }
  result.newTags = [...newTags.values()];
  result.existingTags = existingTags.size;
  result.existingDrivers = existingDrivers.size;
  return result;
}

export function applyTruckImport(
  data: Data,
  rows: TruckImportRow[],
  updateExisting: boolean,
  actor: string,
  previewMasters: Master[],
  linkDrivers = true,
  clearBlank = false,
): Data {
  if (JSON.stringify(data.masters) !== JSON.stringify(previewMasters))
    throw Error('ข้อมูลพื้นฐานเปลี่ยนระหว่างตรวจไฟล์ กรุณาตรวจรายการนำเข้าใหม่ก่อนบันทึก');
  const history = importHistory(data.audit);
  const plan = planTruckImport(
    rows,
    data.masters,
    updateExisting,
    linkDrivers,
    clearBlank,
    history,
  );
  if (plan.errors) throw Error('กรุณาแก้แถวที่มีข้อผิดพลาดก่อนนำเข้า');
  let next = data;
  const now = new Date().toISOString();
  const blank = (kind: Master['kind'], id: string, name: string): Master => ({
    id,
    kind,
    name,
    detail: '',
    capacity: 0,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  for (const name of plan.newTags)
    next = saveMaster(next, blank('tag', crypto.randomUUID(), name), actor);
  const tags = new Map(
    next.masters
      .filter((item) => item.kind === 'tag')
      .map((item) => [normalizeName(item.name), item.id] as const),
  );
  for (const row of plan.rows) {
    if (row.action === 'skip' || row.action === 'error') continue;
    const old = next.masters.find((item) => item.id === row.existingId);
    const source = row.source;
    const sheetTagIds = source.tags.map((name) => tags.get(normalizeName(name))!);
    const tagIds =
      row.action === 'link'
        ? (old!.tagIds ?? [])
        : !old || sheetTagIds.length || clearBlank
          ? sheetTagIds
          : (old.tagIds ?? []);
    // Teams follow the truck to its driver, but never replace teams a driver already has.
    const driver = next.masters.find(
      (item) => item.kind === 'driver' && item.id === (row.driver?.id ?? old?.driverId),
    );
    const usable = tagIds.filter((id) =>
      next.masters.some((item) => item.id === id && item.active),
    );
    if (row.driver && !driver)
      next = saveMaster(
        next,
        {
          ...blank('driver', row.driver.id, row.driver.name),
          phone: source.phone,
          nickname: source.nickname ?? '',
          ...(usable.length ? { tagIds: usable } : {}),
        },
        actor,
      );
    else if (driver) {
      const wanted: Master = {
        ...driver,
        ...(row.driver ? { active: true, phone: driver.phone || source.phone } : {}),
        ...(!driver.tagIds?.length && usable.length ? { tagIds: usable } : {}),
      };
      if (JSON.stringify(wanted) !== JSON.stringify(driver))
        next = saveMaster(next, { ...wanted, updatedAt: now }, actor);
    }
    if (row.action === 'link') {
      next = saveMaster(next, { ...old!, driverId: row.driver!.id, updatedAt: now }, actor);
      continue;
    }
    const truck: Master = {
      ...old,
      id: old?.id ?? crypto.randomUUID(),
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
      kind: 'truck',
      ...(old
        ? mergedValues(source, old, clearBlank, history)
        : {
            name: source.plate,
            province: source.province,
            phone: source.phone,
            nickname: source.nickname,
            truckType: source.truckType,
            capacity: source.capacity,
            detail: source.detail,
            active: source.active,
          }),
      tagIds,
      ...(row.driver ? { driverId: row.driver.id } : {}),
    };
    if (truck.nickname === undefined) delete truck.nickname;
    next = saveMaster(next, truck, actor);
  }
  return next;
}
