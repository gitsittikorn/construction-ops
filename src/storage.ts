import { openDB } from 'idb';
import { emptyData, type Data } from './models';
import { withDeadline } from './async';
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
    return (await database.get('state', owner)) ?? structuredClone(emptyData);
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
  const database = await db();
  try {
    const transaction = database.transaction('state', 'readwrite');
    const previous: Data = (await transaction.store.get(owner)) ?? structuredClone(emptyData);
    let next: Data;
    try {
      next = change(previous);
    } catch (error) {
      transaction.abort();
      await transaction.done.catch(() => {});
      throw error;
    }
    await transaction.store.put(next, owner);
    await transaction.done;
    notifyDataChanged(owner);
    return next;
  } finally {
    database.close();
  }
}
const changeEvent = 'construction-data-changed';
function notifyDataChanged(owner: string) {
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
