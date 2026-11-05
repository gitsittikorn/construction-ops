import {
  collection,
  doc,
  documentId,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  Timestamp,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { ownerDatabase } from './firebase';
import { withDeadline } from './async';
import { CloudConflict, type CloudBatch, type CloudTransport } from './cloudSync';
import {
  collections,
  sameContent,
  sameVersion,
  type CloudRecord,
  type EntityCollection,
  type SyncEntry,
  type SyncState,
} from './syncModel';
import { decodeCloudRecord, validateCloudRecord } from './cloudValidation';
import { normalizeName, plateKey } from './masterData';

const bounded = <T>(operation: Promise<T>) =>
  withDeadline(operation, 25000, 'ติดต่อ Cloud ไม่สำเร็จ ข้อมูลยังอยู่ในเครื่อง กรุณาลองซิงก์ใหม่');
export async function authorizeCloud(owner: string) {
  const db = ownerDatabase(owner);
  const admin = await bounded(getDocFromServer(doc(db, 'admins', owner)));
  ownerDatabase(owner);
  if (!admin.exists() || admin.data().enabled !== true)
    throw Object.assign(Error('บัญชีนี้ไม่มีสิทธิ์ Admin สำหรับ Cloud'), {
      code: 'permission-denied',
    });
}
export async function readCloudRecord(owner: string, kind: EntityCollection, id: string) {
  const db = ownerDatabase(owner),
    snapshot = await bounded(getDocFromServer(doc(db, 'users', owner, kind, id)));
  ownerDatabase(owner);
  return snapshot.exists() ? decodeCloudRecord(kind, id, snapshot.data()) : null;
}
// Claim keys protect the existing truck/tag uniqueness rules across devices.
function uniqueKey(kind: EntityCollection, record: CloudRecord | null) {
  if (kind !== 'masters' || !record || record.deletedAt || !('kind' in record.payload)) return null;
  const p = record.payload;
  const value =
    p.kind === 'truck'
      ? `truck:${plateKey(p.name, p.province)}`
      : p.kind === 'tag'
        ? `tag:${normalizeName(p.name)}`
        : null;
  if (!value) return null;
  if (value.length > 250) throw Error('ชื่อหรือทะเบียนยาวเกินไปสำหรับตรวจสอบข้อมูลซ้ำ');
  return encodeURIComponent(value);
}
export async function pushCloudRecord(
  owner: string,
  kind: EntityCollection,
  entry: SyncEntry,
): Promise<CloudRecord> {
  const db = ownerDatabase(owner),
    desired = entry.desired;
  validateCloudRecord(kind, desired);
  const ref = doc(db, 'users', owner, kind, desired.id);
  return bounded(
    runTransaction(db, async (transaction) => {
      ownerDatabase(owner);
      const snapshot = await transaction.get(ref);
      const remote = snapshot.exists()
        ? decodeCloudRecord(kind, desired.id, snapshot.data())
        : null;
      if (remote && sameContent(remote, desired)) return remote;
      if (!sameVersion(entry.base, remote)) throw new CloudConflict(remote);
      if (
        desired.revision !== (remote?.revision ?? 0) + 1 ||
        (remote && desired.createdAt !== remote.createdAt)
      )
        throw Error('เวอร์ชันข้อมูลไม่ถูกต้อง');
      const oldKey = uniqueKey(kind, remote),
        newKey = uniqueKey(kind, desired);
      const newClaim = newKey ? doc(db, 'users', owner, 'uniqueKeys', newKey) : null;
      const oldClaim =
        oldKey && oldKey !== newKey ? doc(db, 'users', owner, 'uniqueKeys', oldKey) : null;
      const claim = newClaim ? await transaction.get(newClaim) : null;
      const previousClaim = oldClaim ? await transaction.get(oldClaim) : null;
      if (claim?.exists() && claim.data().active === true && claim.data().entityId !== desired.id)
        throw Error('ทะเบียนรถหรือชื่อทีมนี้มีอยู่บน Cloud แล้ว กรุณาตรวจสอบรายการซ้ำ');
      if (newClaim) transaction.set(newClaim, { entityId: desired.id, active: true });
      if (oldClaim && previousClaim?.exists() && previousClaim.data().entityId === desired.id)
        transaction.set(oldClaim, { entityId: desired.id, active: false });
      transaction.set(ref, { ...desired, serverUpdatedAt: serverTimestamp() });
      transaction.set(doc(db, 'users', owner, 'audit', desired.operationId), {
        entityId: desired.id,
        action: desired.deletedAt ? 'soft-delete' : 'sync',
        actor: owner,
        revision: desired.revision,
        at: serverTimestamp(),
      });
      return desired;
    }),
  );
}
export async function pullCloud(owner: string, cursors: SyncState['cursors']): Promise<CloudBatch> {
  const db = ownerDatabase(owner),
    records: CloudBatch['records'] = [],
    next = { ...cursors };
  for (const kind of collections) {
    let initialTimestampSeen = false;
    const constraints: QueryConstraint[] = cursors[kind]
      ? [
          where(
            'serverUpdatedAt',
            '>=',
            new Timestamp(cursors[kind]!.seconds, cursors[kind]!.nanoseconds),
          ),
          orderBy('serverUpdatedAt'),
          orderBy(documentId()),
        ]
      : [orderBy(documentId())];
    let after: QueryConstraint[] = [];
    for (;;) {
      ownerDatabase(owner);
      const page = await bounded(
        getDocsFromServer(
          query(collection(db, 'users', owner, kind), ...constraints, ...after, limit(200)),
        ),
      );
      ownerDatabase(owner);
      for (const snapshot of page.docs) {
        records.push({
          collection: kind,
          record: decodeCloudRecord(kind, snapshot.id, snapshot.data()),
        });
        const stamp = snapshot.data().serverUpdatedAt as Timestamp | undefined;
        const current = next[kind];
        if (stamp && typeof stamp.seconds === 'number' && typeof stamp.nanoseconds === 'number')
          initialTimestampSeen = true;
        if (
          stamp &&
          typeof stamp.seconds === 'number' &&
          typeof stamp.nanoseconds === 'number' &&
          (!current ||
            stamp.seconds > current.seconds ||
            (stamp.seconds === current.seconds && stamp.nanoseconds > current.nanoseconds))
        )
          next[kind] = { seconds: stamp.seconds, nanoseconds: stamp.nanoseconds };
      }
      if (page.size < 200) break;
      after = [startAfter(page.docs[page.docs.length - 1])];
    }
    // Replay all timestamped records once after the initial ID scan so concurrent
    // insertions before an earlier page boundary cannot be skipped.
    if (!cursors[kind] && initialTimestampSeen) next[kind] = { seconds: 0, nanoseconds: 0 };
  }
  return { records, cursors: next };
}
export const firestoreTransport: CloudTransport = {
  authorize: authorizeCloud,
  pull: pullCloud,
  push: pushCloudRecord,
  read: readCloudRecord,
};
