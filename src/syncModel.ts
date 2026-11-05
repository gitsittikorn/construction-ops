import type { Data, Master, Project, Trip } from './models';

export const collections = ['projects', 'masters', 'trips'] as const;
export type EntityCollection = (typeof collections)[number];
export type Entity = Project | Master | Trip;
export interface CloudRecord {
  schemaVersion: 1;
  id: string;
  revision: number;
  operationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  payload: Entity;
}
export interface SyncEntry {
  base: CloudRecord | null;
  desired: CloudRecord;
  status: 'pending' | 'synced' | 'conflict';
  conflict?: { remote: CloudRecord | null; detectedAt: string };
  error?: string;
  attempts?: number;
  retryAt?: number;
}
export interface SyncState {
  schemaVersion: 1;
  entries: Record<string, SyncEntry>;
  cursors: Partial<Record<EntityCollection, { seconds: number; nanoseconds: number }>>;
  restoredAt?: string;
  adminVerifiedAt?: string;
}
export const entityKey = (collection: EntityCollection, id: string) => `${collection}/${id}`;
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function payloadOf(entity: Entity): Entity {
  const copy = JSON.parse(JSON.stringify(entity));
  delete copy.syncStatus;
  return copy;
}
export function sameContent(a: CloudRecord, b: CloudRecord) {
  return a.deletedAt === b.deletedAt && canonical(a.payload) === canonical(b.payload);
}
export function sameVersion(a: CloudRecord | null, b: CloudRecord | null) {
  return a === null || b === null
    ? a === b
    : a.revision === b.revision && a.operationId === b.operationId && sameContent(a, b);
}
function records(data: Data, collection: EntityCollection): Entity[] {
  return [
    ...data[collection],
    ...(collection === 'trips'
      ? (data.deletedTrips ?? [])
      : collection === 'projects'
        ? (data.deletedProjects ?? [])
        : (data.deletedMasters ?? [])),
  ];
}
export function prepareSync(previous: Data, next: Data): Data {
  if (previous.sync && previous.sync.schemaVersion !== 1)
    throw Error('ไม่รองรับเวอร์ชันข้อมูลซิงก์นี้ กรุณาอัปเดตแอป');
  const sync: SyncState = structuredClone(
    previous.sync ?? { schemaVersion: 1, entries: {}, cursors: {} },
  );
  for (const collection of collections) {
    const before = records(previous, collection);
    const after = records(next, collection);
    const ids = new Set<string>();
    for (const item of after) {
      if (ids.has(item.id)) throw Error('พบ ID ซ้ำในข้อมูล กรุณาตรวจสอบ');
      ids.add(item.id);
      const key = entityKey(collection, item.id),
        entry = sync.entries[key];
      const deletedAt = 'deletedAt' in item ? String(item.deletedAt) : null;
      const payload = payloadOf(item);
      // Tombstones retain the original entity, with deletion metadata outside the payload.
      delete (payload as Entity & { deletedAt?: string }).deletedAt;
      if (
        entry &&
        canonical(entry.desired.payload) === canonical(payload) &&
        entry.desired.deletedAt === deletedAt
      )
        continue;
      sync.entries[key] = {
        base: entry?.base ?? null,
        desired: {
          schemaVersion: 1,
          id: item.id,
          revision: (entry?.base?.revision ?? 0) + 1,
          operationId: crypto.randomUUID(),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          deletedAt,
          payload,
        },
        status: entry?.status === 'conflict' ? 'conflict' : 'pending',
        ...(entry?.conflict ? { conflict: entry.conflict } : {}),
      };
    }
    // Protect callers that remove a record without explicitly creating a tombstone.
    for (const item of before.filter((item) => !ids.has(item.id))) {
      const key = entityKey(collection, item.id),
        entry = sync.entries[key];
      if (entry?.desired.deletedAt) continue;
      const now = new Date().toISOString();
      sync.entries[key] = {
        base: entry?.base ?? null,
        desired: {
          schemaVersion: 1,
          id: item.id,
          revision: (entry?.base?.revision ?? 0) + 1,
          operationId: crypto.randomUUID(),
          createdAt: item.createdAt,
          updatedAt: now,
          deletedAt: now,
          payload: { ...payloadOf(item), updatedAt: now },
        },
        status: 'pending',
      };
    }
  }
  const tripStatus = (trip: Trip): Trip['syncStatus'] =>
    sync.entries[entityKey('trips', trip.id)]?.status === 'synced' ? 'synced' : 'pending';
  return {
    ...next,
    sync,
    trips: next.trips.map((trip) => ({ ...trip, syncStatus: tripStatus(trip) })),
    ...(next.deletedTrips
      ? {
          deletedTrips: next.deletedTrips.map((trip) => ({
            ...trip,
            syncStatus: tripStatus(trip),
          })),
        }
      : {}),
  };
}
export function applyRecord(
  data: Data,
  collection: EntityCollection,
  record: CloudRecord,
  synced: boolean,
): Data {
  const item = {
    ...record.payload,
    ...(collection === 'trips' ? { syncStatus: synced ? 'synced' : 'pending' } : {}),
  };
  const deletedKey =
    collection === 'trips'
      ? 'deletedTrips'
      : collection === 'projects'
        ? 'deletedProjects'
        : 'deletedMasters';
  return {
    ...data,
    [collection]: [
      ...data[collection].filter((entity) => entity.id !== record.id),
      ...(record.deletedAt ? [] : [item]),
    ],
    [deletedKey]: [
      ...(data[deletedKey] ?? []).filter((entity) => entity.id !== record.id),
      ...(record.deletedAt ? [{ ...item, deletedAt: record.deletedAt }] : []),
    ],
  };
}
export function integrityIssues(data: Data): string[] {
  const issues: string[] = [];
  const projects = new Set([...data.projects, ...(data.deletedProjects ?? [])].map((p) => p.id));
  const masters = [...data.masters, ...(data.deletedMasters ?? [])];
  for (const trip of [...data.trips, ...(data.deletedTrips ?? [])]) {
    if (!projects.has(trip.projectId))
      issues.push(`เที่ยวรถ ${trip.id}: ไม่พบโครงการ ${trip.projectId}`);
    for (const [id, kind] of [
      [trip.truckId, 'truck'],
      [trip.driverId, 'driver'],
      [trip.sourceId, 'source'],
    ])
      if ((id || kind === 'truck') && !masters.some((m) => m.id === id && m.kind === kind))
        issues.push(`เที่ยวรถ ${trip.id}: ไม่พบ ${kind} ${id}`);
  }
  for (const master of masters)
    for (const id of master.tagIds ?? [])
      if (!masters.some((m) => m.id === id && m.kind === 'tag'))
        issues.push(`ข้อมูล ${master.id}: ไม่พบทีม ${id}`);
  return issues;
}
