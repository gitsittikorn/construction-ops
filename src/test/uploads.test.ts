import { File as NodeFile } from 'node:buffer';
import { openDB } from 'idb';
import { loadData } from '../storage';
import { emptyData } from '../models';
import {
  queueUpload,
  queueFiles,
  withUploadLock,
  listUploads,
  processUpload,
  putUpload,
  type UploadRecord,
} from '../uploads';
const file = () =>
  new NodeFile(['original-photo-content'], 'photo.jpg', { type: 'image/jpeg' }) as unknown as File;
it('upgrades the previous database without losing existing records', async () => {
  const db = await openDB('construction-ops', 1, {
    upgrade(db) {
      db.createObjectStore('state');
    },
  });
  await db.put('state', { ...emptyData, audit: [{ id: 'existing' }] }, 'old-owner');
  db.close();
  expect((await loadData('old-owner')).audit[0].id).toBe('existing');
});
it('persists original file bytes and isolates upload queues by account', async () => {
  const owner = crypto.randomUUID();
  const item = await queueUpload(owner, 'project', 'trip', file());
  const loaded = (await listUploads(owner))[0];
  expect(loaded.id).toBe(item.id);
  expect(await loaded.blob!.text()).toBe('original-photo-content');
  expect(loaded.status).toBe('pending');
  expect(await listUploads('different-owner')).toEqual([]);
});
it('rejects empty, unsupported and oversized files and missing projects', async () => {
  await expect(
    queueUpload('u', 'p', '', new File([], 'empty.jpg', { type: 'image/jpeg' })),
  ).rejects.toThrow();
  await expect(
    queueUpload('u', 'p', '', new File(['x'], 'run.exe', { type: 'application/x-msdownload' })),
  ).rejects.toThrow();
  await expect(queueUpload('u', '', '', file())).rejects.toThrow();
  const oversized = { name: 'large.jpg', type: 'image/jpeg', size: 100 * 1024 * 1024 + 1 } as File;
  await expect(queueUpload('u', 'p', '', oversized)).rejects.toThrow();
});
function dependencies() {
  return {
    prepare: vi.fn(async (record: UploadRecord) => ({
      ...record,
      driveId: 'stable-id',
      folderId: 'folder',
    })),
    upload: vi.fn().mockResolvedValue(undefined),
    metadata: vi.fn().mockResolvedValue(undefined),
    save: vi.fn(putUpload),
  };
}
it('keeps the original until both upload verification and metadata succeed', async () => {
  const item = await queueUpload(crypto.randomUUID(), 'p', '', file());
  const deps = dependencies();
  const result = await processUpload(item, deps);
  expect(result.status).toBe('synced');
  expect(result.blob).toBeUndefined();
  const checkpoints = deps.save.mock.calls.map(([record]) => record);
  expect(checkpoints.find((r) => r.status === 'metadata-pending')?.blob).toBeDefined();
  expect((await listUploads(item.owner))[0].blob).toBeUndefined();
  expect(deps.metadata).toHaveBeenCalledOnce();
});
it('retains original bytes and stable Drive ID after metadata failure and recovers on retry', async () => {
  const item = await queueUpload(crypto.randomUUID(), 'p', '', file());
  const deps = dependencies();
  deps.metadata.mockRejectedValueOnce(Error('permission-denied'));
  await expect(processUpload(item, deps)).rejects.toThrow('permission-denied');
  const pending = (await listUploads(item.owner))[0];
  expect(pending.driveId).toBe('stable-id');
  expect(pending.status).toBe('error');
  expect(await pending.blob!.text()).toBe('original-photo-content');
  const recovered = await processUpload(pending, deps);
  expect(recovered.status).toBe('synced');
  expect(recovered.driveId).toBe(pending.driveId);
});
it('retains the blob when upload fails and never calls metadata', async () => {
  const item = await queueUpload(crypto.randomUUID(), 'p', '', file());
  const deps = dependencies();
  deps.upload.mockRejectedValueOnce(Error('offline'));
  await expect(processUpload(item, deps)).rejects.toThrow('offline');
  expect(deps.metadata).not.toHaveBeenCalled();
  expect((await listUploads(item.owner))[0].blob).toBeDefined();
});
it('performs no remote work for an already synced operation', async () => {
  const item = await queueUpload(crypto.randomUUID(), 'p', '', file());
  const deps = dependencies();
  await processUpload({ ...item, status: 'synced' }, deps);
  expect(deps.prepare).not.toHaveBeenCalled();
});
afterEach(() => vi.unstubAllGlobals());
it('rejects the entire selection if one file is invalid without partially queuing files', async () => {
  const owner = crypto.randomUUID();
  await expect(
    queueFiles(owner, 'p', '', [
      file(),
      new File(['x'], 'bad.exe', { type: 'application/x-msdownload' }),
    ]),
  ).rejects.toThrow();
  expect(await listUploads(owner)).toEqual([]);
});
it('does not upload when another tab holds the browser lock', async () => {
  const task = vi.fn();
  vi.stubGlobal('navigator', {
    locks: {
      request: vi.fn(async (_: string, __: unknown, callback: (lock: null) => Promise<void>) =>
        callback(null),
      ),
    },
  });
  await expect(withUploadLock('owner', task)).rejects.toThrow();
  expect(task).not.toHaveBeenCalled();
});
it('releases fallback queue locks even after an upload error', async () => {
  vi.stubGlobal('navigator', {});
  await expect(
    withUploadLock('owner', async () => {
      throw Error('network');
    }),
  ).rejects.toThrow();
  const task = vi.fn().mockResolvedValue(undefined);
  await withUploadLock('owner', task);
  expect(task).toHaveBeenCalledOnce();
});
