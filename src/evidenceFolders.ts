import { ensureDriveFolder, generateDriveIds } from './drive';
import { resolveEvidenceFolder } from './firebase';
import { sha256 } from './evidence';
import type { UploadRecord } from './uploads';

export async function ensureEvidenceFolder(
  token: string,
  record: UploadRecord,
  documentsId: string,
) {
  if (
    !record.evidenceId ||
    !record.workDate ||
    !record.driverId ||
    !record.truckId ||
    !record.category
  )
    return documentsId;
  let parent = documentsId;
  for (const [identity, name] of [
    [record.workDate, record.workDate],
    [
      `${record.driverId}:${record.truckId}`,
      `${record.driverName ?? record.driverId} - ${record.truckName ?? record.truckId}`,
    ],
    [
      record.category === 'trip-slip' ? 'slips' : 'evidence',
      record.category === 'trip-slip' ? 'Trip Slips' : 'Driver Evidence',
    ],
  ]) {
    const key = await sha256(`${parent}:${identity}`);
    const candidate = (await generateDriveIds(token, 1))[0];
    const mapping = await resolveEvidenceFolder(record.owner, key, {
      id: candidate,
      parentId: parent,
      name,
    });
    if (mapping.parentId !== parent) throw Error('โฟลเดอร์หลักฐานมีความสัมพันธ์ไม่ตรงกัน');
    await ensureDriveFolder(token, mapping.id, mapping.name, parent);
    parent = mapping.id;
  }
  return parent;
}
