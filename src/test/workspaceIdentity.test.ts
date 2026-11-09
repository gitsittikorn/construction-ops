import { Blob as NodeBlob } from 'node:buffer';
import {
  cacheOwner,
  ownerScope,
  uploadStore,
  setWorkspaceSession,
  workspaceMatches,
  activeCacheOwner,
} from '../workspaceIdentity';
import { openLocalDatabase, updateDataAndUploads, loadData } from '../storage';
import { listUploads, type UploadRecord } from '../uploads';
import { readBlobBytes } from '../files';
import { fixture } from './syncFixtures';
import { exportLocalBackup } from '../backup';
afterEach(() => setWorkspaceSession(null));
it('partitions actor/company/role keys and preserves legacy UID keys', () => {
  expect(cacheOwner({ actorUid: 'owner', companyId: 'owner', role: 'owner' })).toBe('owner');
  const scope = { actorUid: 'worker', companyId: 'owner', role: 'operator' as const },
    key = cacheOwner(scope);
  expect(key.length).toBeGreaterThan(128);
  expect(ownerScope(key)).toEqual(scope);
  expect(uploadStore(key)).toBe('scopedUploads');
  expect(cacheOwner({ ...scope, role: 'manager' })).not.toBe(key);
  expect(cacheOwner({ ...scope, companyId: 'other' })).not.toBe(key);
  setWorkspaceSession(scope);
  expect(workspaceMatches(key, 'worker')).toBe(true);
  expect(workspaceMatches(key, 'other')).toBe(false);
  expect(workspaceMatches('worker', 'worker')).toBe(false);
  expect(activeCacheOwner('worker')).toBe(key);
  expect(() => ownerScope('company-v1:' + 'bad'.repeat(50))).toThrow('พื้นที่ทำงาน');
});
it('keeps original bytes and local data isolated when two members restore the same cloud operation ID', async () => {
  const a = cacheOwner({ companyId: 'company', actorUid: 'a', role: 'operator' }),
    b = cacheOwner({ companyId: 'company', actorUid: 'b', role: 'operator' });
  const file = (owner: string, bytes: string) =>
    ({
      id: 'same-cloud-id',
      owner,
      projectId: 'p',
      tripId: 'trip',
      name: 'slip.pdf',
      mimeType: 'application/pdf',
      size: bytes.length,
      createdAt: new Date().toISOString(),
      status: 'pending',
      driveId: '',
      folderId: '',
      error: '',
      blob: new NodeBlob([bytes], { type: 'application/pdf' }),
    }) as unknown as UploadRecord;
  const first = file(a, 'first original'),
    second = file(b, 'second original');
  await updateDataAndUploads(a, [first], () => ({
    ...fixture(),
    projects: [{ ...fixture().projects[0], name: 'A pending' }],
  }));
  await updateDataAndUploads(b, [second], () => ({
    ...fixture(),
    projects: [{ ...fixture().projects[0], name: 'B pending' }],
  }));
  expect(new TextDecoder().decode(await readBlobBytes((await listUploads(a))[0].blob!))).toBe(
    'first original',
  );
  expect(new TextDecoder().decode(await readBlobBytes((await listUploads(b))[0].blob!))).toBe(
    'second original',
  );
  expect((await loadData(a)).projects[0].name).toBe('A pending');
  expect((await loadData(b)).projects[0].name).toBe('B pending');
  const backup = JSON.parse(
    new TextDecoder().decode(await readBlobBytes(await exportLocalBackup(a))),
  );
  expect(backup.uploads).toHaveLength(1);
  expect(atob(backup.uploads[0].blobBase64)).toBe('first original');
  const db = await openLocalDatabase();
  expect(db.version).toBe(3);
  expect(db.objectStoreNames.contains('uploads')).toBe(true);
  expect(db.objectStoreNames.contains('scopedUploads')).toBe(true);
  db.close();
});

it('upgrades a legacy database additively without changing existing state or pending originals', async () => {
  const { IDBFactory } = await import('fake-indexeddb'),
    { openDB } = await import('idb');
  const original = indexedDB;
  vi.stubGlobal('indexedDB', new IDBFactory());
  try {
    const legacy = await openDB('construction-ops', 2, {
      upgrade(db) {
        db.createObjectStore('state');
        db.createObjectStore('uploads', { keyPath: 'id' });
        db.createObjectStore('driveSettings');
      },
    });
    await legacy.put('state', fixture(), 'legacy-owner');
    await legacy.put('uploads', {
      id: 'original',
      owner: 'legacy-owner',
      blob: new NodeBlob(['legacy bytes']),
    });
    legacy.close();
    const upgraded = await openLocalDatabase();
    expect(upgraded.version).toBe(3);
    expect(await upgraded.get('state', 'legacy-owner')).toEqual(fixture());
    expect(
      new TextDecoder().decode(
        await readBlobBytes((await upgraded.get('uploads', 'original')).blob),
      ),
    ).toBe('legacy bytes');
    expect(await upgraded.getAll('scopedUploads')).toEqual([]);
    upgraded.close();
  } finally {
    vi.stubGlobal('indexedDB', original);
  }
});
