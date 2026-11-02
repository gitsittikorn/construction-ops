import { openLocalDatabase } from './storage';
const activeQueues = new Set<string>();
export async function withUploadLock(owner: string, task: () => Promise<void>) {
  if (navigator.locks) {
    return navigator.locks.request(
      `construction-upload-${owner}`,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) throw Error('มีแท็บอื่นกำลังอัปโหลด กรุณารอแล้วลองใหม่');
        await task();
      },
    );
  }
  if (activeQueues.has(owner)) throw Error('มีคิวอื่นกำลังอัปโหลด');
  activeQueues.add(owner);
  try {
    await task();
  } finally {
    activeQueues.delete(owner);
  }
}
export interface UploadRecord {
  id: string;
  owner: string;
  projectId: string;
  tripId: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  status: 'pending' | 'preparing' | 'uploading' | 'metadata-pending' | 'synced' | 'error';
  driveId: string;
  folderId: string;
  error: string;
  blob?: Blob;
}
export interface DriveFolders {
  rootId: string;
  projectsId: string;
  projects: Record<string, { projectId: string; documentsId: string }>;
}
export async function listUploads(owner: string): Promise<UploadRecord[]> {
  const db = await openLocalDatabase();
  try {
    return (await db.getAll('uploads'))
      .filter((item: UploadRecord) => item.owner === owner)
      .sort((a: UploadRecord, b: UploadRecord) => b.createdAt.localeCompare(a.createdAt));
  } finally {
    db.close();
  }
}
export async function putUpload(record: UploadRecord) {
  const db = await openLocalDatabase();
  try {
    await db.put('uploads', record);
  } finally {
    db.close();
  }
}
export async function getFolders(owner: string): Promise<DriveFolders | undefined> {
  const db = await openLocalDatabase();
  try {
    return await db.get('driveSettings', owner);
  } finally {
    db.close();
  }
}
export async function putFolders(owner: string, value: DriveFolders) {
  const db = await openLocalDatabase();
  try {
    await db.put('driveSettings', value, owner);
  } finally {
    db.close();
  }
}
function createUpload(owner: string, projectId: string, tripId: string, file: File): UploadRecord {
  if (!owner || !projectId) throw Error('กรุณาเลือกโครงการ');
  if (!file.size) throw Error('ไฟล์ว่างเปล่า');
  if (file.size > 100 * 1024 * 1024) throw Error('รุ่นนี้รองรับไฟล์ขนาดไม่เกิน 100 MB ต่อไฟล์');
  const mimeType = file.type || 'application/octet-stream';
  if (!(mimeType.startsWith('image/') || mimeType === 'application/pdf'))
    throw Error('รองรับเฉพาะรูปภาพและ PDF');
  const record: UploadRecord = {
    id: crypto.randomUUID(),
    owner,
    projectId,
    tripId,
    name: file.name,
    mimeType,
    size: file.size,
    createdAt: new Date().toISOString(),
    status: 'pending',
    driveId: '',
    folderId: '',
    error: '',
    blob: file,
  };
  return record;
}
export async function queueFiles(owner: string, projectId: string, tripId: string, files: File[]) {
  if (!files.length) throw Error('กรุณาเลือกไฟล์');
  const records = files.map((file) => createUpload(owner, projectId, tripId, file));
  const db = await openLocalDatabase();
  try {
    const transaction = db.transaction('uploads', 'readwrite');
    await Promise.all([
      ...records.map((record) => transaction.store.add(record)),
      transaction.done,
    ]);
    return records;
  } finally {
    db.close();
  }
}
export async function queueUpload(owner: string, projectId: string, tripId: string, file: File) {
  return (await queueFiles(owner, projectId, tripId, [file]))[0];
}
export interface UploadDependencies {
  prepare: (record: UploadRecord) => Promise<UploadRecord>;
  upload: (record: UploadRecord, onProgress: (percent: number) => void) => Promise<void>;
  metadata: (record: UploadRecord) => Promise<void>;
  save: (record: UploadRecord) => Promise<void>;
}
// Persist every recovery checkpoint before the corresponding remote side effect.
export async function processUpload(
  record: UploadRecord,
  deps: UploadDependencies,
  onProgress = (percent: number) => {
    void percent;
  },
): Promise<UploadRecord> {
  if (record.status === 'synced') return record;
  let current = { ...record };
  try {
    current = { ...current, status: 'preparing', error: '' };
    await deps.save(current);
    current = await deps.prepare(current);
    await deps.save(current);
    current = { ...current, status: 'uploading', error: '' };
    await deps.save(current);
    await deps.upload(current, onProgress);
    current = { ...current, status: 'metadata-pending' };
    await deps.save(current);
    await deps.metadata(current);
    const { blob, ...metadata } = current;
    void blob;
    current = { ...metadata, status: 'synced', error: '' };
    await deps.save(current);
    return current;
  } catch (error) {
    current = {
      ...current,
      status: 'error',
      error: error instanceof Error ? error.message : 'อัปโหลดไม่สำเร็จ',
    };
    await deps.save(current);
    throw error;
  }
}
