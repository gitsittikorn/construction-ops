import {
  collection,
  documentId,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  startAfter,
  type QueryConstraint,
} from 'firebase/firestore';
import { ownerDatabase } from './firebase';
import { authorizeCloud } from './cloudFirestore';
import { openLocalDatabase } from './storage';
import type { UploadRecord } from './uploads';
import { withDeadline } from './async';

export async function restoreDocumentMetadata(owner: string) {
  await authorizeCloud(owner);
  const remote: UploadRecord[] = [],
    db = ownerDatabase(owner);
  let cursor: QueryConstraint[] = [];
  for (;;) {
    const page = await withDeadline(
      getDocsFromServer(
        query(
          collection(db, 'users', owner, 'documents'),
          orderBy(documentId()),
          ...cursor,
          limit(200),
        ),
      ),
      25000,
      'โหลดรายการเอกสารไม่สำเร็จ ข้อมูลในเครื่องยังอยู่',
    );
    ownerDatabase(owner);
    for (const snapshot of page.docs) {
      const d = snapshot.data();
      if (
        d.id !== snapshot.id ||
        d.owner !== owner ||
        d.status !== 'synced' ||
        !d.uploadedAt ||
        ['projectId', 'tripId', 'fileId', 'folderId', 'name', 'mimeType', 'createdAt'].some(
          (key) => typeof d[key] !== 'string',
        ) ||
        !d.fileId ||
        !d.folderId ||
        !Number.isSafeInteger(d.size) ||
        d.size <= 0
      )
        throw Error('Metadata เอกสาร Cloud ไม่ถูกต้อง');
      if (
        d.evidenceId &&
        (['driverId', 'truckId', 'workDate'].some((key) => typeof d[key] !== 'string') ||
          !['driver-photo', 'signature', 'trip-slip'].includes(d.category))
      )
        throw Error('Metadata หลักฐานไม่ครบ');
      remote.push({
        id: d.id,
        owner,
        projectId: d.projectId,
        tripId: d.tripId,
        driveId: d.fileId,
        folderId: d.folderId,
        name: d.name,
        mimeType: d.mimeType,
        size: d.size,
        createdAt: d.createdAt,
        status: 'synced',
        error: '',
        ...(d.evidenceId
          ? {
              evidenceId: d.evidenceId,
              driverId: d.driverId,
              truckId: d.truckId,
              workDate: d.workDate,
              category: d.category,
            }
          : {}),
      });
    }
    if (page.size < 200) break;
    cursor = [startAfter(page.docs.at(-1)!)];
  }
  const local = await openLocalDatabase();
  try {
    ownerDatabase(owner);
    const tx = local.transaction('uploads', 'readwrite');
    for (const record of remote) {
      const existing: UploadRecord | undefined = await tx.store.get(record.id);
      if (!existing) await tx.store.add(record);
    }
    await tx.done;
    window.dispatchEvent(new Event('construction-uploads-changed'));
  } finally {
    local.close();
  }
  return remote.length;
}
