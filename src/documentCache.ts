import { openLocalDatabase } from './storage';
import { canonical } from './syncModel';
import type { UploadRecord } from './uploads';

// Separate, disposable copies of verified originals; never part of the pending upload queue.
function fingerprint(record: UploadRecord) {
  const { blob: _blob, error: _error, ...metadata } = record;
  void _blob;
  void _error;
  return canonical(metadata);
}
function valid(owner: string, record: UploadRecord) {
  return (
    record.owner === owner &&
    record.status === 'synced' &&
    record.driveId &&
    record.folderId &&
    Number.isSafeInteger(record.size) &&
    record.size > 0 &&
    record.size <= 100 * 1024 * 1024 &&
    (record.mimeType.startsWith('image/') || record.mimeType === 'application/pdf')
  );
}
type CachedOriginal = { fingerprint: string; savedAt: string; blob: Blob };
export async function readCachedOriginal(
  owner: string,
  record: UploadRecord,
): Promise<Blob | null> {
  if (!valid(owner, record)) return null;
  const db = await openLocalDatabase();
  try {
    const tx = db.transaction(['state', 'uploads'], 'readonly');
    const current: UploadRecord | undefined = await tx.objectStore('uploads').get(record.id);
    const cached: CachedOriginal | undefined = await tx
      .objectStore('state')
      .get(['document-cache', owner, record.id]);
    await tx.done;
    return current &&
      valid(owner, current) &&
      fingerprint(current) === fingerprint(record) &&
      cached?.fingerprint === fingerprint(record) &&
      cached.blob.size === record.size &&
      cached.blob.type.split(';')[0] === record.mimeType
      ? cached.blob
      : null;
  } finally {
    db.close();
  }
}
const running = new Map<string, Promise<Blob>>();
export function restoreOriginalForOffline(
  owner: string,
  record: UploadRecord,
  dependencies: { download: (record: UploadRecord) => Promise<Blob>; active: () => boolean },
): Promise<Blob> {
  const assertActive = () => {
    if (!dependencies.active())
      throw Error('บัญชีหรือการเชื่อมต่อเปลี่ยนแล้ว หยุดกู้คืนโดยเก็บข้อมูลเดิม');
  };
  const key = JSON.stringify([owner, record.id]);
  const existing = running.get(key);
  if (existing)
    return existing.then(async () => {
      const blob = await readCachedOriginal(owner, record);
      assertActive();
      if (!blob) throw Error('ข้อมูลไฟล์เปลี่ยนแล้ว กรุณาโหลดรายการใหม่');
      return blob;
    });
  const task = async () => {
    assertActive();
    if (!valid(owner, record)) throw Error('เลือกไฟล์ที่อัปโหลดและยืนยันแล้วของบัญชีนี้');
    const cached = await readCachedOriginal(owner, record);
    assertActive();
    if (cached) return cached;
    const db = await openLocalDatabase();
    try {
      const before: UploadRecord | undefined = await db.get('uploads', record.id);
      if (!before || !valid(owner, before) || fingerprint(before) !== fingerprint(record))
        throw Error('ข้อมูลไฟล์เปลี่ยนแล้ว กรุณาโหลดรายการใหม่');
      const blob = await dependencies.download(record);
      assertActive();
      if (blob.size !== record.size || blob.type.split(';')[0] !== record.mimeType)
        throw Error('ไฟล์ที่ดาวน์โหลดไม่ตรงกับต้นฉบับ กรุณาลองใหม่');
      const tx = db.transaction(['state', 'uploads'], 'readwrite');
      try {
        const latest: UploadRecord | undefined = await tx.objectStore('uploads').get(record.id);
        assertActive();
        if (!latest || !valid(owner, latest) || fingerprint(latest) !== fingerprint(record))
          throw Error('ข้อมูลไฟล์เปลี่ยนแล้ว ยังไม่บันทึกทับข้อมูลเดิม');
        await tx
          .objectStore('state')
          .put({ fingerprint: fingerprint(record), savedAt: new Date().toISOString(), blob }, [
            'document-cache',
            owner,
            record.id,
          ]);
        assertActive();
        await tx.done;
      } catch (error) {
        tx.abort();
        await tx.done.catch(() => {});
        throw error;
      }
      window.dispatchEvent(new Event('construction-uploads-changed'));
      return blob;
    } finally {
      db.close();
    }
  };
  const promise = Promise.resolve()
    .then(async () => {
      if (navigator.locks)
        return await navigator.locks.request(`construction-restore-${key}`, task);
      return await task();
    })
    .finally(() => running.delete(key));
  running.set(key, promise);
  return promise;
}
