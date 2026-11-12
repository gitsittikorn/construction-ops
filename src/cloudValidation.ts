import type { CloudRecord, EntityCollection } from './syncModel';
import { payloadOf } from './syncModel';
import { validateWorkspace } from './workspaceValidation';
import { validatePriceHistory } from './soilPriceValidation';

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function validateCloudRecord(
  collection: EntityCollection,
  value: unknown,
): asserts value is CloudRecord {
  if (!object(value) || value.schemaVersion !== 1)
    throw Error('ไม่รองรับ Schema Version ของข้อมูล Cloud');
  const p = value.payload;
  if (
    !object(p) ||
    typeof value.id !== 'string' ||
    !value.id ||
    value.id.includes('/') ||
    p.id !== value.id ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1 ||
    typeof value.operationId !== 'string' ||
    !value.operationId ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    p.createdAt !== value.createdAt ||
    p.updatedAt !== value.updatedAt ||
    !(value.deletedAt === null || typeof value.deletedAt === 'string')
  )
    throw Error('รูปแบบข้อมูล Cloud ไม่ถูกต้อง');
  if (collection === 'workspaces') {
    validateWorkspace(p);
    return;
  }
  const strings =
    collection === 'projects'
      ? ['name', 'customer', 'location', 'startDate', 'endDate', 'status', 'description']
      : collection === 'masters'
        ? ['kind', 'name', 'detail']
        : ['projectId', 'date', 'time', 'truckId', 'driverId', 'sourceId', 'soilType', 'notes'];
  if (strings.some((field) => typeof p[field] !== 'string'))
    throw Error('ข้อมูล Cloud มีฟิลด์ไม่ครบ');
  const optional =
    collection === 'projects'
      ? ['latitude', 'longitude']
      : collection === 'masters'
        ? [
            'capacity',
            'active',
            'province',
            'phone',
            'nickname',
            'truckType',
            'tagIds',
            'driverId',
            'soilPrice',
          ]
        : ['revision', 'capacityPerTrip'];
  const allowed = new Set(['id', 'createdAt', 'updatedAt', ...strings, ...optional]);
  if (
    Object.keys(p).some((key) => !allowed.has(key)) ||
    Object.keys(value).some(
      (key) =>
        ![
          'schemaVersion',
          'id',
          'revision',
          'operationId',
          'createdAt',
          'updatedAt',
          'deletedAt',
          'payload',
          'serverUpdatedAt',
        ].includes(key),
    )
  )
    throw Error('พบฟิลด์ Cloud ที่ไม่รองรับ กรุณาอัปเดตแอป');
  if (
    collection !== 'trips' &&
    (!String(p.name).trim() || String(p.name).length > (collection === 'masters' ? 200 : 500))
  )
    throw Error('ชื่อข้อมูล Cloud ไม่ถูกต้อง');
  for (const field of ['description', 'detail', 'notes'])
    if (typeof p[field] === 'string' && p[field].length > 10000)
      throw Error('รายละเอียด Cloud ยาวเกินไป');
  if (
    collection === 'masters' &&
    ((p.province !== undefined && typeof p.province !== 'string') ||
      (p.phone !== undefined && typeof p.phone !== 'string') ||
      (p.nickname !== undefined && (typeof p.nickname !== 'string' || p.nickname.length > 100)) ||
      (p.truckType !== undefined &&
        !['six-wheel', 'ten-wheel', 'other'].includes(String(p.truckType))))
  )
    throw Error('ข้อมูลรถ Cloud ไม่ถูกต้อง');
  if (collection === 'masters') {
    if (
      p.driverId !== undefined &&
      (p.kind !== 'truck' || typeof p.driverId !== 'string' || p.driverId.length > 200)
    )
      throw Error('ข้อมูลคนขับประจำรถ Cloud ไม่ถูกต้อง');
    if (p.kind === 'soilPrice' || p.soilPrice !== undefined) {
      if (
        p.kind !== 'soilPrice' ||
        !object(p.soilPrice) ||
        p.soilPrice.id !== p.id ||
        p.soilPrice.at !== p.createdAt ||
        p.createdAt !== p.updatedAt ||
        value.deletedAt !== null
      )
        throw Error('ประวัติราคา Cloud ไม่ถูกต้อง');
      validatePriceHistory([p.soilPrice]);
    }
  }
  if (
    collection === 'projects' &&
    (!['draft', 'active', 'completed', 'archived'].includes(String(p.status)) ||
      ((p.latitude !== undefined || p.longitude !== undefined) &&
        !(
          typeof p.latitude === 'number' &&
          Number.isFinite(p.latitude) &&
          Math.abs(p.latitude) <= 90 &&
          typeof p.longitude === 'number' &&
          Number.isFinite(p.longitude) &&
          Math.abs(p.longitude) <= 180
        )))
  )
    throw Error('ข้อมูลโครงการ Cloud ไม่ถูกต้อง');
  if (
    collection === 'masters' &&
    (!['truck', 'driver', 'source', 'customer', 'soilType', 'tag', 'soilPrice'].includes(
      String(p.kind),
    ) ||
      typeof p.capacity !== 'number' ||
      !Number.isFinite(p.capacity) ||
      p.capacity < 0 ||
      typeof p.active !== 'boolean' ||
      (p.tagIds !== undefined &&
        (!Array.isArray(p.tagIds) || p.tagIds.some((id) => typeof id !== 'string'))))
  )
    throw Error('ข้อมูลหลัก Cloud ไม่ถูกต้อง');
  if (
    collection === 'trips' &&
    (!p.projectId ||
      !p.truckId ||
      !Number.isSafeInteger(p.revision) ||
      Number(p.revision) < 1 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(p.date)) ||
      !Number.isFinite(Date.parse(String(p.date))) ||
      new Date(String(p.date)).toISOString().slice(0, 10) !== p.date ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(p.time)))
  )
    throw Error('ข้อมูลเที่ยวรถ Cloud ไม่ถูกต้อง');
  if (
    collection === 'trips' &&
    p.capacityPerTrip !== undefined &&
    (typeof p.capacityPerTrip !== 'number' ||
      !Number.isFinite(p.capacityPerTrip) ||
      p.capacityPerTrip <= 0)
  )
    throw Error('ความจุต่อเที่ยว Cloud ไม่ถูกต้อง');
}
export function decodeCloudRecord(
  collection: EntityCollection,
  id: string,
  raw: Record<string, unknown>,
): CloudRecord {
  let value: unknown = raw;
  if (raw.schemaVersion === undefined && collection === 'trips') {
    const { serverUpdatedAt: _server, ...trip } = raw;
    value = {
      schemaVersion: 1,
      id,
      revision: raw.revision,
      operationId: `legacy-${id}-${raw.revision}`,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      deletedAt: raw.deletedAt ?? null,
      payload: payloadOf(trip as unknown as CloudRecord['payload']),
    };
    delete ((value as CloudRecord).payload as unknown as Record<string, unknown>).deletedAt;
  }
  validateCloudRecord(collection, value);
  if (value.id !== id) throw Error('ID เอกสาร Cloud ไม่ตรงกับข้อมูล');
  return value;
}
