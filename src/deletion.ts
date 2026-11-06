import type { Data, Project, Master } from './models';
import type { UploadRecord } from './uploads';

export function deleteRecord(
  data: Data,
  type: 'project' | 'master' | 'trip',
  id: string,
  actor: string,
  uploads: UploadRecord[] = [],
): Data {
  const key = type === 'project' ? 'projects' : type === 'master' ? 'masters' : 'trips';
  const record = data[key].find((item) => item.id === id);
  if (!record) throw Error('ไม่พบรายการ อาจถูกลบแล้ว กรุณาเปิดรายการใหม่');
  if (
    uploads.some((item) =>
      type === 'project' ? item.projectId === id : type === 'trip' && item.tripId === id,
    )
  )
    throw Error('ลบไม่ได้: มีเอกสารหรือคิวอัปโหลดอ้างอิงรายการนี้');
  const history = [...data.trips, ...(data.deletedTrips ?? [])];
  if (type === 'project' && history.some((trip) => trip.projectId === id))
    throw Error('ลบไม่ได้: โครงการมีประวัติเที่ยวรถ กรุณาเปลี่ยนสถานะเป็นจัดเก็บแล้ว');
  if (type === 'master' && 'kind' in record) {
    if (
      history.some(
        (trip) =>
          [trip.truckId, trip.driverId, trip.sourceId].includes(id) ||
          (record.kind === 'soilType' && trip.soilType === record.name),
      ) ||
      data.masters.some((item) => item.tagIds?.includes(id))
    )
      throw Error(
        'ลบไม่ได้: มีรายการอื่นอ้างอิงข้อมูลนี้ กรุณาปิดใช้งานหรือเอาแท็กออกจากรายการที่ใช้อยู่ก่อน',
      );
  }
  const now = new Date().toISOString();
  if (
    (data.workspaces ?? []).some((item) =>
      type === 'project'
        ? item.projectId === id
        : type === 'master' &&
          item.recordType === 'daily' &&
          item.body.rows.some((row) =>
            [row.truckId, row.driverId, row.teamId, row.sourceId].includes(id),
          ),
    )
  )
    throw Error('ลบไม่ได้: มีวันทำงานหรือหลักฐานอ้างอิง กรุณาปิดใช้งานแทน');
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
        actor,
        before: record,
        after: null,
      },
    ],
  };
}
