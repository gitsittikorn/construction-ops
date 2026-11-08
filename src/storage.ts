import { openDB } from 'idb';
import { emptyData, type Data } from './models';
import { withDeadline } from './async';
import { prepareSync } from './syncModel';
import type { UploadRecord } from './uploads';
async function db() {
  const opening = openDB('construction-ops', 2, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('state')) database.createObjectStore('state');
      if (!database.objectStoreNames.contains('uploads'))
        database.createObjectStore('uploads', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('driveSettings'))
        database.createObjectStore('driveSettings');
    },
    blocking() {
      void opening.then((database) => database.close());
    },
  });
  try {
    return await withDeadline(
      opening,
      10000,
      'ฐานข้อมูลกำลังรอแท็บเก่า กรุณารีเฟรชหรือปิดแท็บอื่นของแอป แล้วลองใหม่ โดยไม่ต้องล้างข้อมูลเว็บไซต์',
    );
  } catch (error) {
    void opening.then((database) => database.close()).catch(() => {});
    throw error;
  }
}
export async function loadData(owner: string): Promise<Data> {
  const database = await db();
  try {
    const data: Data = (await database.get('state', owner)) ?? structuredClone(emptyData);
    if (data.sync && (data.sync.schemaVersion !== 1 || !data.sync.entries || !data.sync.cursors))
      throw Error('ไม่รองรับเวอร์ชันข้อมูลในเครื่องนี้ กรุณาอัปเดตแอป ข้อมูลเดิมยังถูกเก็บไว้');
    return data;
  } finally {
    database.close();
  }
}
export async function persistData(owner: string, data: Data) {
  const database = await db();
  try {
    await database.put('state', data, owner);
  } finally {
    database.close();
  }
}
export async function updateData(owner: string, change: (previous: Data) => Data): Promise<Data> {
  return mutateData(owner, change, true);
}
export async function updateDataAndUploads(
  owner: string,
  uploads: UploadRecord[],
  change: (previous: Data) => Data,
) {
  if (uploads.some((record) => record.owner !== owner)) throw Error('บัญชีของไฟล์ไม่ตรงกัน');
  return mutateData(owner, change, true, uploads);
}
// Cloud acknowledgements/merges must not enqueue themselves as new local edits.
export async function updateSyncData(
  owner: string,
  change: (previous: Data) => Data,
): Promise<Data> {
  return mutateData(owner, change, false);
}
async function mutateData(
  owner: string,
  change: (previous: Data) => Data,
  enqueue: boolean,
  uploads: UploadRecord[] = [],
): Promise<Data> {
  const database = await db();
  try {
    const transaction = database.transaction(['state', 'uploads'], 'readwrite');
    const store = transaction.objectStore('state');
    const previous: Data = (await store.get(owner)) ?? structuredClone(emptyData);
    let next: Data;
    try {
      if (enqueue && !previous.sync && !(await store.get(['phase1-backup', owner])))
        await store.put(structuredClone(previous), ['phase1-backup', owner]);
      if (enqueue && previous.workspaces === undefined && !(await store.get(['v4-backup', owner])))
        await store.put(structuredClone(previous), ['v4-backup', owner]);
      next = change(previous);
      if (enqueue) next = prepareSync(previous, next);
      for (const record of uploads) {
        const old = await transaction.objectStore('uploads').get(record.id);
        if (
          old &&
          (old.owner !== owner || old.evidenceId !== record.evidenceId || old.size !== record.size)
        )
          throw Error('รหัสไฟล์ซ้ำแต่ข้อมูลไม่ตรงกัน');
        if (!old) await transaction.objectStore('uploads').add(record);
      }
    } catch (error) {
      transaction.abort();
      await transaction.done.catch(() => {});
      throw error;
    }
    await store.put(next, owner);
    await transaction.done;
    notifyDataChanged(owner);
    if (uploads.length) window.dispatchEvent(new Event('construction-uploads-changed'));
    return next;
  } finally {
    database.close();
  }
}
export async function loadMigrationBackup(owner: string): Promise<Data | undefined> {
  const database = await db();
  try {
    return await database.get('state', ['phase1-backup', owner]);
  } finally {
    database.close();
  }
}
const changeEvent = 'construction-data-changed';
export function notifyDataChanged(owner: string) {
  window.dispatchEvent(new CustomEvent(changeEvent, { detail: owner }));
  if (typeof window.BroadcastChannel === 'function') {
    const channel = new BroadcastChannel(changeEvent);
    channel.postMessage({ owner });
    channel.close();
  }
}
export function subscribeDataChanges(owner: string, refresh: () => void) {
  const onLocal = (event: Event) => {
    if ((event as CustomEvent).detail === owner) refresh();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') refresh();
  };
  const channel =
    typeof window.BroadcastChannel === 'function' ? new BroadcastChannel(changeEvent) : null;
  if (channel)
    channel.onmessage = (event) => {
      if (event.data?.owner === owner) refresh();
    };
  window.addEventListener(changeEvent, onLocal);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    channel?.close();
    window.removeEventListener(changeEvent, onLocal);
    window.removeEventListener('focus', refresh);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
export { db as openLocalDatabase };
