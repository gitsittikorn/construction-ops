import { recordUsage } from './deletion';
import { normalizeName, plateKey } from './masterData';
import { actorUid } from './workspaceIdentity';
import type { Data, Master } from './models';
import type { UploadRecord } from './uploads';

const groups = (values: Master[], key: (item: Master) => string) => {
  const found = new Map<string, Master[]>();
  for (const item of values) found.set(key(item), [...(found.get(key(item)) ?? []), item]);
  return [...found.values()].filter((list) => list.length > 1);
};

/** Read-only health check of trucks, drivers, teams and history. */
export function analyzeFleet(data: Data, uploads: UploadRecord[] = []) {
  const trucks = data.masters.filter((item) => item.kind === 'truck'),
    drivers = data.masters.filter((item) => item.kind === 'driver');
  const used = (item: Master) => recordUsage(data, 'master', item.id, uploads).length > 0;
  const assigned = trucks.flatMap((item) => (item.driverId ? [item.driverId] : []));
  return {
    trucks,
    drivers,
    usedTrucks: trucks.filter(used),
    usedDrivers: drivers.filter(used),
    withoutDriver: trucks.filter((item) => !item.driverId),
    brokenLinks: trucks.filter(
      (item) => item.driverId && !drivers.some((driver) => driver.id === item.driverId),
    ),
    sharedDrivers: drivers.filter((item) => assigned.filter((id) => id === item.id).length > 1),
    spareDrivers: drivers.filter((item) => !assigned.includes(item.id)),
    duplicatePlates: groups(trucks, (item) => plateKey(item.name, item.province)),
    duplicateDrivers: groups(
      drivers,
      (item) => `${normalizeName(item.name)}|${(item.phone ?? '').replace(/\D/g, '')}`,
    ),
    withoutTeam: trucks.filter((item) => !item.tagIds?.length),
  };
}

export const fleetSnapshot = (data: Data) =>
  JSON.stringify(data.masters.filter((item) => item.kind === 'truck' || item.kind === 'driver'));

/**
 * Soft deletes unused trucks and drivers. Records that history points at keep their ID and are
 * only deactivated (and unlinked), so old trips, daily work and finance still resolve.
 */
export function resetFleet(
  data: Data,
  actor: string,
  uploads: UploadRecord[],
  expected: string,
): Data {
  if (fleetSnapshot(data) !== expected)
    throw Error('ข้อมูลรถหรือคนขับเปลี่ยนแล้ว กรุณาตรวจสรุปใหม่ก่อนรีเซ็ต');
  const report = analyzeFleet(data, uploads);
  if (!report.trucks.length && !report.drivers.length)
    throw Error('ไม่มีข้อมูลรถหรือคนขับให้รีเซ็ต');
  const keep = new Set([...report.usedTrucks, ...report.usedDrivers].map((item) => item.id));
  const now = new Date().toISOString();
  const masters: Master[] = [],
    deleted: NonNullable<Data['deletedMasters']> = [...(data.deletedMasters ?? [])],
    audit = [...data.audit];
  for (const item of data.masters) {
    if (item.kind !== 'truck' && item.kind !== 'driver') {
      masters.push(item);
      continue;
    }
    let after: Master | null = null;
    if (keep.has(item.id)) {
      after = {
        ...item,
        active: false,
        ...(item.driverId ? { driverId: '' } : {}),
        updatedAt: now,
      };
      masters.push(after);
    } else deleted.push({ ...item, updatedAt: now, deletedAt: now });
    audit.push({
      id: crypto.randomUUID(),
      entityId: item.id,
      action: after ? 'fleet-reset-deactivate' : 'delete',
      at: now,
      actor: actorUid(actor),
      before: item,
      after,
    });
  }
  return { ...data, masters, deletedMasters: deleted, audit };
}
