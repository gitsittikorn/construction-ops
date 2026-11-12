import { actorUid, companyId, companyRole } from './workspaceIdentity';
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
  const role = companyRole(owner);
  const admin = await bounded(
    getDocFromServer(
      role === 'owner'
        ? doc(db, 'admins', actorUid(owner))
        : doc(db, 'companies', companyId(owner), 'members', actorUid(owner)),
    ),
  );
  ownerDatabase(owner);
  if (
    !admin.exists() ||
    admin.data().enabled !== true ||
    (role !== 'owner' && admin.data().role !== role)
  )
    throw Object.assign(
      Error(
        role === 'owner'
          ? 'บัญชีนี้ไม่มีสิทธิ์ Admin สำหรับ Cloud'
          : 'สิทธิ์บริษัทเปลี่ยนแล้ว กรุณาเลือกบริษัทใหม่',
      ),
      {
        code: 'permission-denied',
      },
    );
}
export async function readCloudRecord(owner: string, kind: EntityCollection, id: string) {
  const db = ownerDatabase(owner),
    snapshot = await bounded(getDocFromServer(doc(db, 'users', companyId(owner), kind, id)));
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
function driverKey(kind: EntityCollection, record: CloudRecord | null) {
  if (
    kind !== 'masters' ||
    !record ||
    record.deletedAt ||
    !('kind' in record.payload) ||
    record.payload.kind !== 'truck' ||
    !record.payload.driverId
  )
    return null;
  return `driver-${record.payload.driverId}`;
}
export async function pushCloudRecord(
  owner: string,
  kind: EntityCollection,
  entry: SyncEntry,
): Promise<CloudRecord> {
  const db = ownerDatabase(owner),
    desired = entry.desired;
  validateCloudRecord(kind, desired);
  const ref = doc(db, 'users', companyId(owner), kind, desired.id);
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
      const newKeys = [uniqueKey(kind, desired), driverKey(kind, desired)].filter(
        (key): key is string => !!key,
      );
      const oldKeys = [uniqueKey(kind, remote), driverKey(kind, remote)].filter(
        (key): key is string => !!key && !newKeys.includes(key),
      );
      const claims = [];
      // All reads precede writes, including plate and driver claims in the same transaction.
      for (const key of [...newKeys, ...oldKeys]) {
        const ref = doc(db, 'users', companyId(owner), 'uniqueKeys', key);
        claims.push({ key, ref, snapshot: await transaction.get(ref) });
      }
      for (const { key, snapshot } of claims)
        if (
          newKeys.includes(key) &&
          snapshot.exists() &&
          snapshot.data().active === true &&
          snapshot.data().entityId !== desired.id
        )
          throw Error(
            key.startsWith('driver-')
              ? 'คนขับนี้มีรถประจำบน Cloud แล้ว กรุณายกเลิกการผูกเดิมก่อน'
              : 'ทะเบียนรถหรือชื่อทีมนี้มีอยู่บน Cloud แล้ว กรุณาตรวจสอบรายการซ้ำ',
          );
      for (const { key, ref, snapshot } of claims) {
        if (newKeys.includes(key)) transaction.set(ref, { entityId: desired.id, active: true });
        else if (snapshot.exists() && snapshot.data().entityId === desired.id)
          transaction.set(ref, { entityId: desired.id, active: false });
      }
      transaction.set(ref, { ...desired, serverUpdatedAt: serverTimestamp() });
      transaction.set(doc(db, 'users', companyId(owner), 'audit', desired.operationId), {
        entityId: desired.id,
        action: desired.deletedAt ? 'soft-delete' : 'sync',
        actor: actorUid(owner),
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
    if (kind === 'workspaces' && companyRole(owner) === 'operator')
      constraints.unshift(where('payload.recordType', 'in', ['daily', 'evidence', 'survey']));
    let after: QueryConstraint[] = [];
    for (;;) {
      ownerDatabase(owner);
      const page = await bounded(
        getDocsFromServer(
          query(
            collection(db, 'users', companyId(owner), kind),
            ...constraints,
            ...after,
            limit(200),
          ),
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
  restoreDocuments: async (owner) =>
    (await import('./documentRecovery')).restoreDocumentMetadata(owner),
  authorize: authorizeCloud,
  pull: pullCloud,
  push: pushCloudRecord,
  read: readCloudRecord,
};
