import { exportLocalBackup } from '../backup';
import { readBlobBytes } from '../files';
import { openLocalDatabase, persistData, updateData } from '../storage';
import { fixture } from './syncFixtures';
import { Blob as NodeBlob } from 'node:buffer';

it('exports an account-scoped consistent backup including pending file bytes and migration source', async () => {
  const owner = crypto.randomUUID(),
    data = fixture();
  await persistData(owner, data);
  await updateData(owner, (previous) => previous);
  const db = await openLocalDatabase();
  const file = {
    id: crypto.randomUUID(),
    owner,
    name: 'scan.png',
    mimeType: 'image/png',
    blob: new NodeBlob(['original bytes'], { type: 'image/png' }),
    status: 'pending',
  };
  await db.put('uploads', file);
  await db.put('uploads', { ...file, id: crypto.randomUUID(), owner: 'other', blob: undefined });
  await db.put('driveSettings', { rootId: 'folder', projects: {} }, owner);
  db.close();
  // fake-indexeddb preserves structured data but Node's Blob is used for binary fidelity.
  const exported = JSON.parse(
    new TextDecoder().decode(await readBlobBytes(await exportLocalBackup(owner))),
  );
  expect(exported.owner).toBe(owner);
  expect(exported.migrationBackup).toEqual(data);
  expect(exported.uploads).toHaveLength(1);
  expect(atob(exported.uploads[0].blobBase64)).toBe('original bytes');
  expect(exported.state.sync.entries['trips/trip'].status).toBe('pending');
  expect(exported.driveSettings.rootId).toBe('folder');
});
it('does not silently export corrupt or unreadable attachment bytes as a successful backup', async () => {
  const owner = crypto.randomUUID(),
    db = await openLocalDatabase();
  await db.put('uploads', { id: crypto.randomUUID(), owner, blob: { invalid: true } });
  db.close();
  await expect(exportLocalBackup(owner)).rejects.toThrow();
});
