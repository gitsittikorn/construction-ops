import { Blob as NodeBlob } from 'node:buffer';
import { readCachedOriginal, restoreOriginalForOffline } from '../documentCache';
import { listUploads, putUpload, type UploadRecord } from '../uploads';
import { readBlobBytes } from '../files';

const bytes = () => new NodeBlob(['original bytes'], { type: 'image/png' }) as unknown as Blob;
async function setup() {
  const owner = crypto.randomUUID();
  const record: UploadRecord = {
    id: crypto.randomUUID(),
    owner,
    projectId: 'p',
    tripId: '',
    name: 'proof.png',
    mimeType: 'image/png',
    size: 14,
    createdAt: 'now',
    status: 'synced',
    driveId: 'private-file',
    folderId: 'private-folder',
    error: '',
  };
  await putUpload(record);
  return {
    owner,
    record,
    dependencies: { download: vi.fn(async () => bytes()), active: () => true },
  };
}
it('restores exact bytes without changing upload/verification state, isolates owners, and coalesces retries', async () => {
  const { owner, record, dependencies } = await setup();
  await Promise.all([
    restoreOriginalForOffline(owner, record, dependencies),
    restoreOriginalForOffline(owner, record, dependencies),
  ]);
  const blob = await readCachedOriginal(owner, record);
  expect(new TextDecoder().decode(await readBlobBytes(blob!))).toBe('original bytes');
  await restoreOriginalForOffline(owner, record, dependencies);
  expect(dependencies.download).toHaveBeenCalledOnce();
  expect(await listUploads(owner)).toEqual([record]);
  expect(await readCachedOriginal('another-owner', record)).toBeNull();
});
it('leaves metadata intact on expired OAuth and retries without duplicate records', async () => {
  const { owner, record, dependencies } = await setup();
  dependencies.download.mockRejectedValueOnce(Error('OAuth expired'));
  await expect(restoreOriginalForOffline(owner, record, dependencies)).rejects.toThrow('OAuth');
  expect(await readCachedOriginal(owner, record)).toBeNull();
  expect(await listUploads(owner)).toEqual([record]);
  await restoreOriginalForOffline(owner, record, dependencies);
  expect(await readCachedOriginal(owner, record)).not.toBeNull();
  expect(await listUploads(owner)).toHaveLength(1);
});
it('rejects truncated bytes, wrong MIME, pending files and foreign accounts without storing copies', async () => {
  const { owner, record, dependencies } = await setup();
  for (const blob of [
    new NodeBlob(['bad'], { type: 'image/png' }),
    new NodeBlob(['original bytes'], { type: 'application/pdf' }),
  ]) {
    dependencies.download.mockResolvedValueOnce(blob as unknown as Blob);
    await expect(restoreOriginalForOffline(owner, record, dependencies)).rejects.toThrow('ไม่ตรง');
    expect(await readCachedOriginal(owner, record)).toBeNull();
  }
  await expect(restoreOriginalForOffline('other', record, dependencies)).rejects.toThrow('บัญชี');
  await expect(
    restoreOriginalForOffline(owner, { ...record, status: 'pending' }, dependencies),
  ).rejects.toThrow('ยืนยัน');
  expect(dependencies.download).toHaveBeenCalledTimes(2);
});
it('never overwrites a pending local original when the record changes during download', async () => {
  const { owner, record, dependencies } = await setup();
  const pending = { ...record, status: 'pending' as const, blob: bytes() };
  dependencies.download.mockImplementationOnce(async () => {
    await putUpload(pending);
    return bytes();
  });
  await expect(restoreOriginalForOffline(owner, record, dependencies)).rejects.toThrow(
    'ข้อมูลไฟล์เปลี่ยน',
  );
  expect((await listUploads(owner))[0].status).toBe('pending');
  expect((await listUploads(owner))[0].blob).toBeDefined();
  expect(await readCachedOriginal(owner, record)).toBeNull();
});
it('aborts safely on an account change and refuses to use a cache under a changed Drive reference', async () => {
  const { owner, record, dependencies } = await setup();
  let active = true;
  dependencies.active = () => active;
  dependencies.download.mockImplementationOnce(async () => {
    active = false;
    return bytes();
  });
  await expect(restoreOriginalForOffline(owner, record, dependencies)).rejects.toThrow('บัญชี');
  expect(await readCachedOriginal(owner, record)).toBeNull();
  active = true;
  await restoreOriginalForOffline(owner, record, dependencies);
  const changed = { ...record, driveId: 'changed-file' };
  await putUpload(changed);
  expect(await readCachedOriginal(owner, changed)).toBeNull();
  expect(await readCachedOriginal(owner, record)).toBeNull();
});
it('preserves upload data when browser storage is full and can retry later', async () => {
  const { owner, record, dependencies } = await setup();
  const original = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value,
    key,
  ) {
    if (Array.isArray(key) && key[0] === 'document-cache')
      throw new DOMException('Storage full', 'QuotaExceededError');
    return original.call(this, value, key);
  });
  try {
    await expect(restoreOriginalForOffline(owner, record, dependencies)).rejects.toThrow(
      'Storage full',
    );
    expect(await readCachedOriginal(owner, record)).toBeNull();
    expect(await listUploads(owner)).toEqual([record]);
  } finally {
    spy.mockRestore();
  }
  await restoreOriginalForOffline(owner, record, dependencies);
  expect(await readCachedOriginal(owner, record)).not.toBeNull();
});
