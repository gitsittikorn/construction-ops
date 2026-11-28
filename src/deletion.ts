import { actorUid } from './workspaceIdentity';
import type { Data, Project, Master } from './models';
import type { UploadRecord } from './uploads';

export type DeletableType = 'project' | 'master' | 'trip';

const collectionOf = { project: 'projects', master: 'masters', trip: 'trips' } as const;

/** Trucks that currently point at this driver. Unlinking them is a separate, visible step. */
export const trucksOfDriver = (data: Data, driverId: string) =>
  data.masters.filter((item) => item.kind === 'truck' && item.driverId === driverId);

/**
 * Human readable reasons why a record cannot be removed. An empty list means nothing else
 * points at it. Driver assignment is reported by `trucksOfDriver`, not here.
 */
export function recordUsage(
  data: Data,
  type: DeletableType,
  id: string,
  uploads: UploadRecord[] = [],
): string[] {
  const record = data[collectionOf[type]].find((item) => item.id === id);
  if (!record) return [];
  const reasons: string[] = [];
  const add = (count: number, text: string) => {
    if (count) reasons.push(`${text} ${count} รายการ`);
  };
  const history = [...data.trips, ...(data.deletedTrips ?? [])];
  const live = data.workspaces ?? [];
  const all = [...live, ...(data.deletedWorkspaces ?? [])];

  if (type === 'trip') {
    add(
      uploads.filter((item) => item.tripId === id).length,
      'มีเอกสารหรือคิวอัปโหลดอ้างอิงเที่ยวนี้',
    );
    return reasons;
  }
  if (type === 'project') {
    add(history.filter((trip) => trip.projectId === id).length, 'มีประวัติเที่ยวรถ');
    const work = (kind: string) =>
      live.filter((item) => item.projectId === id && item.recordType === kind).length;
    add(work('daily'), 'มีงานรายวันอ้างอิง');
    add(work('evidence'), 'มีหลักฐานอ้างอิง');
    add(work('finance'), 'มีข้อมูลการเงินอ้างอิง');
    add(work('survey'), 'มีงานสำรวจอ้างอิง');
    add(
      uploads.filter((item) => item.projectId === id).length,
      'มีเอกสารหรือคิวอัปโหลดอ้างอิงโครงการ',
    );
    return reasons;
  }

  const master = record as Master;
  if (master.kind === 'soilPrice') return ['ประวัติราคาเป็นข้อมูลอ้างอิงถาวร ลบหรือแก้ไม่ได้'];
  add(
    history.filter(
      (trip) =>
        [trip.truckId, trip.driverId, trip.sourceId].includes(id) ||
        (master.kind === 'soilType' && trip.soilType === master.name),
    ).length,
    'อ้างอิงจากประวัติเที่ยวรถ',
  );
  add(
    all.filter((item) => {
      if (item.recordType === 'finance')
        return item.body.kind === 'rate'
          ? item.body.entry.partyId === id
          : item.body.entry.truckId === id;
      if (item.recordType === 'evidence')
        return item.body.truckId === id || item.body.driverId === id;
      if (item.recordType !== 'daily') return false;
      return item.body.rows.some(
        (row) =>
          [row.truckId, row.driverId, row.teamId, row.sourceId].includes(id) ||
          (row.transactions ?? []).some((trip) => [trip.driverId, trip.sourceId].includes(id)) ||
          (master.kind === 'soilType' &&
            (row.soilType === master.name ||
              (row.transactions ?? []).some((trip) => trip.soilType === master.name))),
      );
    }).length,
    'อ้างอิงจากงานรายวัน หลักฐาน หรือการเงิน',
  );
  // Team tags only apply to trucks and drivers; stale tags on other kinds must not block.
  add(
    data.masters.filter(
      (item) => (item.kind === 'truck' || item.kind === 'driver') && item.tagIds?.includes(id),
    ).length,
    'ถูกใช้เป็นแท็กทีมและอ้างอิงจากรถหรือคนขับ',
  );
  add(
    data.masters.filter(
      (item) => item.soilPrice?.sourceId === id || item.soilPrice?.soilTypeId === id,
    ).length,
    'อ้างอิงจากประวัติราคาดิน',
  );
  if (master.kind === 'customer')
    add(
      data.projects.filter((project) => project.customer.trim() === master.name.trim()).length,
      'ชื่อลูกค้านี้ถูกอ้างอิงในโครงการ',
    );
  add(
    uploads.filter((item) => item.truckId === id || item.driverId === id).length,
    'มีเอกสารหรือคิวอัปโหลดอ้างอิง',
  );
  return reasons;
}

export function deleteRecord(
  data: Data,
  type: DeletableType,
  id: string,
  actor: string,
  uploads: UploadRecord[] = [],
): Data {
  const key = collectionOf[type];
  const record = data[key].find((item) => item.id === id);
  if (!record) throw Error('ไม่พบรายการ อาจถูกลบแล้ว กรุณาเปิดรายการใหม่');
  const reasons = recordUsage(data, type, id, uploads);
  if (type === 'master')
    for (const truck of trucksOfDriver(data, id))
      reasons.push(`อ้างอิงเป็นคนขับประจำรถ ${truck.name}`);
  if (reasons.length) throw Error(`ลบไม่ได้: ${reasons.join(' · ')}`);
  const now = new Date().toISOString();
  return {
    ...data,
    [key]: data[key].filter((item) => item.id !== id),
    ...(type === 'project'
      ? {
          deletedProjects: [
            ...(data.deletedProjects ?? []),
            { ...(record as Project), updatedAt: now, deletedAt: now },
          ],
        }
      : {}),
    ...(type === 'master'
      ? {
          deletedMasters: [
            ...(data.deletedMasters ?? []),
            { ...(record as Master), updatedAt: now, deletedAt: now },
          ],
        }
      : {}),
    ...(type === 'trip' && 'revision' in record
      ? {
          deletedTrips: [
            ...(data.deletedTrips ?? []),
            {
              ...record,
              deletedAt: now,
              updatedAt: now,
              revision: record.revision + 1,
              syncStatus: 'pending' as const,
            },
          ],
        }
      : {}),
    audit: [
      ...data.audit,
      {
        id: crypto.randomUUID(),
        entityId: id,
        action: 'delete',
        at: now,
        actor: actorUid(actor),
        before: record,
        after: null,
      },
    ],
  };
}

/** Survey history is referenced by nothing else, so it can be soft deleted on its own. */
export function deleteSurvey(data: Data, id: string, actor: string): Data {
  const record = (data.workspaces ?? []).find((item) => item.id === id);
  if (record?.recordType !== 'survey') throw Error('ไม่พบงานสำรวจ อาจถูกลบแล้ว');
  const now = new Date().toISOString();
  return {
    ...data,
    workspaces: (data.workspaces ?? []).filter((item) => item.id !== id),
    deletedWorkspaces: [
      ...(data.deletedWorkspaces ?? []),
      { ...record, updatedAt: now, deletedAt: now },
    ],
    audit: [
      ...data.audit,
      {
        id: crypto.randomUUID(),
        entityId: id,
        action: 'delete',
        at: now,
        actor: actorUid(actor),
        before: record,
        after: null,
      },
    ],
  };
}
