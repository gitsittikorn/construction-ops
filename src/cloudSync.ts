import { loadData, updateData, updateSyncData } from './storage';
import {
  applyRecord,
  collections,
  entityKey,
  integrityIssues,
  sameContent,
  sameVersion,
  type CloudRecord,
  type EntityCollection,
  type SyncEntry,
  type SyncState,
} from './syncModel';
import { validateCloudRecord } from './cloudValidation';
import type { Data } from './models';

export class CloudConflict extends Error {
  constructor(public remote: CloudRecord | null) {
    super('ข้อมูลถูกแก้ไขจากอุปกรณ์อื่น กรุณาตรวจสอบทั้งสองฉบับ');
  }
}
export interface CloudBatch {
  records: { collection: EntityCollection; record: CloudRecord }[];
  cursors: SyncState['cursors'];
}
export interface CloudTransport {
  restoreDocuments?: (owner: string) => Promise<number>;
  authorize(owner: string): Promise<void>;
  pull(owner: string, cursors: SyncState['cursors']): Promise<CloudBatch>;
  push(owner: string, collection: EntityCollection, entry: SyncEntry): Promise<CloudRecord>;
  read(owner: string, collection: EntityCollection, id: string): Promise<CloudRecord | null>;
}
export function mergeCloud(data: Data, batch: CloudBatch): Data {
  if (!data.sync) throw Error('ยังไม่ได้เตรียมข้อมูลซิงก์');
  const next = structuredClone(data);
  let merged = next;
  for (const { collection, record } of batch.records) {
    validateCloudRecord(collection, record);
    const key = entityKey(collection, record.id),
      entry = next.sync!.entries[key];
    if (entry && entry.status !== 'synced') {
      if (sameVersion(entry.base, record)) continue;
      if (sameContent(entry.desired, record)) {
        next.sync!.entries[key] = { base: record, desired: record, status: 'synced' };
        merged = applyRecord(merged, collection, record, true);
      } else {
        next.sync!.entries[key] = {
          ...entry,
          status: 'conflict',
          conflict: { remote: record, detectedAt: new Date().toISOString() },
        };
      }
    } else {
      if (entry?.base && record.revision < entry.base.revision)
        throw Error('Cloud ส่งเวอร์ชันย้อนหลัง กรุณาตรวจสอบ');
      if (
        entry?.base &&
        record.revision === entry.base.revision &&
        !sameVersion(entry.base, record)
      )
        throw Error('Cloud มีเวอร์ชันซ้ำที่ข้อมูลไม่ตรงกัน');
      next.sync!.entries[key] = { base: record, desired: record, status: 'synced' };
      merged = applyRecord(merged, collection, record, true);
    }
  }
  const issues = integrityIssues(merged);
  // Keep a pending dependent record and surface the integrity report; do not erase either version.
  if (issues.length) throw Error(`กู้คืนไม่สำเร็จ: ${issues.join('; ')}`);
  merged.sync = {
    ...next.sync!,
    cursors: { ...next.sync!.cursors, ...batch.cursors },
    restoredAt: new Date().toISOString(),
  };
  return merged;
}
export function acknowledge(
  data: Data,
  collection: EntityCollection,
  sent: SyncEntry,
  remote: CloudRecord,
): Data {
  validateCloudRecord(collection, remote);
  if (remote.id !== sent.desired.id || !sameContent(remote, sent.desired))
    throw Error('Server ยืนยันข้อมูลไม่ตรงกับรายการที่ส่ง');
  const next = structuredClone(data),
    key = entityKey(collection, remote.id),
    current = next.sync?.entries[key];
  if (!current) return next;
  if (current.desired.operationId === sent.desired.operationId) {
    next.sync!.entries[key] = { base: remote, desired: remote, status: 'synced' };
    return applyRecord(next, collection, remote, true);
  }
  if (sameVersion(current.base, sent.base) && current.status !== 'conflict') {
    next.sync!.entries[key] = {
      ...current,
      base: remote,
      desired: { ...current.desired, revision: remote.revision + 1 },
      status: 'pending',
    };
  }
  return next;
}
export async function resolveConflict(
  owner: string,
  key: string,
  choice: 'local' | 'remote',
  transport: CloudTransport,
  active: () => boolean = () => true,
) {
  await transport.authorize(owner);
  if (!active()) throw Error('บัญชีเปลี่ยนแล้ว');
  const snapshot = (await loadData(owner)).sync?.entries[key];
  if (!snapshot?.conflict) throw Error('ไม่พบข้อมูลขัดแย้ง');
  const latest = await transport.read(
    owner,
    key.split('/')[0] as EntityCollection,
    snapshot.desired.id,
  );
  if (!active()) throw Error('บัญชีเปลี่ยนแล้ว');
  let stale = false;
  const result = await updateSyncData(owner, (data) => {
    const next = structuredClone(data),
      entry = next.sync?.entries[key];
    if (!entry?.conflict) throw Error('ไม่พบข้อมูลขัดแย้ง');
    if (
      entry.desired.operationId !== snapshot.desired.operationId ||
      !sameVersion(entry.conflict.remote, latest)
    ) {
      entry.conflict = { remote: latest, detectedAt: new Date().toISOString() };
      stale = true;
      return next;
    }
    const collection = key.split('/')[0] as EntityCollection;
    const remote = entry.conflict.remote;
    const audit = {
      id: crypto.randomUUID(),
      entityId: entry.desired.id,
      action: `resolve-${choice}`,
      actor: owner,
      at: new Date().toISOString(),
      before: { local: entry.desired, remote },
      after: choice,
    };
    next.audit.push(audit);
    if (choice === 'remote') {
      if (!remote) throw Error('ไม่พบฉบับ Cloud กรุณาเลือกเก็บฉบับในเครื่อง');
      next.sync!.entries[key] = { base: remote, desired: remote, status: 'synced' };
      const merged = applyRecord(next, collection, remote, true);
      const issues = integrityIssues(merged);
      if (issues.length) throw Error(issues.join('; '));
      return merged;
    }
    const now = new Date().toISOString();
    next.sync!.entries[key] = {
      base: remote,
      desired: {
        ...entry.desired,
        revision: (remote?.revision ?? 0) + 1,
        operationId: crypto.randomUUID(),
        createdAt: remote?.createdAt ?? entry.desired.createdAt,
        updatedAt: now,
        payload: {
          ...entry.desired.payload,
          createdAt: remote?.createdAt ?? entry.desired.createdAt,
          updatedAt: now,
        },
      },
      status: 'pending',
    };
    return applyRecord(next, collection, next.sync!.entries[key].desired, false);
  });
  if (stale) throw Error('ข้อมูลเปลี่ยนอีกครั้ง กรุณาตรวจสอบฉบับล่าสุด');
  return result;
}
const running = new Set<string>();
export async function synchronize(
  owner: string,
  transport: CloudTransport,
  active: () => boolean = () => true,
  status: (value: string) => void = () => {},
  force = true,
) {
  const assertActive = () => {
    if (!active()) throw Error('บัญชีหรือการเชื่อมต่อเปลี่ยนแล้ว หยุดซิงก์โดยเก็บคิวเดิม');
  };
  const task = async () => {
    if (running.has(owner)) {
      status('มีแท็บอื่นกำลังซิงก์ ข้อมูลค้างยังถูกเก็บในเครื่อง');
      return;
    }
    running.add(owner);
    try {
      assertActive();
      await transport.authorize(owner);
      assertActive();
      await updateData(owner, (data) => data);
      await updateSyncData(owner, (data) => ({
        ...data,
        sync: { ...data.sync!, adminVerifiedAt: new Date().toISOString() },
      }));
      status('กำลังกู้คืนและตรวจสอบข้อมูล Cloud');
      const previous = await loadData(owner);
      const batch = await transport.pull(owner, previous.sync!.cursors);
      assertActive();
      await updateSyncData(owner, (data) => mergeCloud(data, batch));
      if (transport.restoreDocuments) {
        status('กำลังกู้คืนข้อมูลอ้างอิงเอกสารจาก Cloud');
        await transport.restoreDocuments(owner);
        assertActive();
      }
      status('กำลังส่งข้อมูลที่รอซิงก์');
      for (const collection of collections) {
        const state = (await loadData(owner)).sync!;
        for (const [key, entry] of Object.entries(state.entries).filter(
          ([key, entry]) =>
            key.startsWith(`${collection}/`) &&
            entry.status === 'pending' &&
            (force || !entry.retryAt || entry.retryAt <= Date.now()),
        )) {
          assertActive();
          try {
            const remote = await transport.push(owner, collection, entry);
            assertActive();
            await updateSyncData(owner, (data) => acknowledge(data, collection, entry, remote));
          } catch (error) {
            assertActive();
            await updateSyncData(owner, (data) => {
              const next = structuredClone(data),
                current = next.sync!.entries[key];
              if (!current) return next;
              if (error instanceof CloudConflict) {
                next.sync!.entries[key] = {
                  ...current,
                  status: 'conflict',
                  conflict: { remote: error.remote, detectedAt: new Date().toISOString() },
                };
              } else {
                current.error = error instanceof Error ? error.message : String(error);
                current.attempts = (current.attempts ?? 0) + 1;
                current.retryAt =
                  Date.now() + Math.min(300000, 1000 * 2 ** Math.min(current.attempts, 9));
              }
              return next;
            });
            if (!(error instanceof CloudConflict)) throw error;
          }
        }
      }
      assertActive();
      const latest = await loadData(owner);
      const remaining = Object.values(latest.sync!.entries).filter(
        (entry) => entry.status !== 'synced',
      );
      status(
        remaining.length
          ? `ยังมี ${remaining.length} รายการรอซิงก์หรือตรวจสอบ`
          : 'ตรวจสอบกับ Cloud แล้ว ข้อมูลซิงก์ครบ',
      );
    } finally {
      running.delete(owner);
    }
  };
  if (navigator.locks)
    return navigator.locks.request(
      `construction-sync-${owner}`,
      { ifAvailable: true },
      async (lock) => {
        if (lock) await task();
        else status('มีแท็บอื่นกำลังซิงก์ ข้อมูลค้างยังถูกเก็บในเครื่อง');
      },
    );
  return task();
}
