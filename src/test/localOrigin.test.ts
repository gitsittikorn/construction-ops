import { canonicalLocalUrl, legacyOriginHasData, legacyRecoveryOwners } from '../localOrigin';
import { openLocalDatabase, persistData } from '../storage';
import { emptyData } from '../models';
import { cacheOwner } from '../workspaceIdentity';
import { fixture } from './syncFixtures';
import { Blob as NodeBlob } from 'node:buffer';

it('chooses the numeric loopback while retaining navigation and leaving other domains alone', () => {
  expect(canonicalLocalUrl('http://localhost:5173/path?q=1#daily')).toBe(
    'http://127.0.0.1:5173/path?q=1#daily',
  );
  expect(canonicalLocalUrl('http://127.0.0.1:5173/')).toBeNull();
  expect(canonicalLocalUrl('https://example.com/')).toBeNull();
});

it('does not leave behind records in another account, immutable backup or upload store', async () => {
  const db = await openLocalDatabase();
  // Isolated fake IndexedDB only; never run this against a browser profile.
  for (const store of ['state', 'uploads', 'scopedUploads', 'driveSettings']) await db.clear(store);
  expect(await legacyOriginHasData()).toBeFalsy();
  await db.put('state', fixture(), ['phase1-backup', 'previous-account']);
  expect(await legacyOriginHasData()).toBeTruthy();
  expect(await db.get('state', ['phase1-backup', 'previous-account'])).toEqual(fixture());
  await db.clear('state');
  await db.put('scopedUploads', { owner: 'old', id: 'original', blob: new NodeBlob(['original']) });
  expect(await legacyOriginHasData()).toBeTruthy();
  expect((await db.get('scopedUploads', ['old', 'original'])).blob.size).toBe(8);
  expect(await (await db.get('scopedUploads', ['old', 'original'])).blob.text()).toBe('original');
  db.close();
});

it('lists only local-mode and the authenticated account workspaces, retaining all other records', async () => {
  const uid = crypto.randomUUID();
  const member = cacheOwner({ companyId: 'shared-company', actorUid: uid, role: 'manager' });
  await persistData(uid, fixture());
  await persistData(member, fixture());
  await persistData('local', structuredClone(emptyData));
  await persistData('unrelated-private-account', fixture());
  expect(await legacyRecoveryOwners(uid)).toEqual(expect.arrayContaining([uid, member, 'local']));
  expect(await legacyRecoveryOwners(uid)).not.toContain('unrelated-private-account');
  expect(await legacyRecoveryOwners(null)).toEqual(['local']);
});
