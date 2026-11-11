import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
import { createDriveCredentialStore } from '../backend/driveCredentialStore.mjs';
import { createDriveService, driveScope } from '../backend/driveService.mjs';
import { createTokenVault } from '../backend/tokenVault.mjs';

const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const { initializeApp, deleteApp } = requireBackend('firebase-admin/app');
const { getFirestore } = requireBackend('firebase-admin/firestore');
const clientId = 'personal.apps.googleusercontent.com';
const previousClientId = 'previous.apps.googleusercontent.com';
const user = { uid: 'credential-owner', email: 'owner@example.com' };
const now = 1000000;
const vault = createTokenVault(randomBytes(32).toString('base64'));
const credentials = {
  access_token: 'synthetic-access',
  refresh_token: 'synthetic-refresh',
  expiry_date: now + 3600000,
  scope: driveScope,
};
let app, db;
before(() => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:9089')
    throw Error('Credential storage tests require the isolated local emulator');
  app = initializeApp({ projectId: 'demo-construction-ops' }, 'drive-credential-tests');
  db = getFirestore(app);
});
after(async () => {
  if (app) await deleteApp(app);
});
const service = (id, google) =>
  createDriveService({
    clientId: id,
    store: createDriveCredentialStore(db, id),
    google,
    vault,
    now: () => now,
  });

test('additive OAuth migration retains legacy and other-client encrypted records across restart and reconnect', async () => {
  const legacyRef = db.collection('_driveCredentials').doc(user.uid);
  const original = vault.seal(user.uid, credentials);
  await legacyRef.set(original);
  const previousStore = createDriveCredentialStore(db, previousClientId);
  const previousRecord = vault.seal(user.uid, {
    ...credentials,
    oauth_client_id: previousClientId,
  });
  await previousStore.put(user.uid, previousRecord);
  let exchanges = 0,
    refreshes = 0;
  let issueRefresh = false;
  const google = {
    exchange: async () => {
      exchanges++;
      return {
        ...credentials,
        refresh_token: issueRefresh ? credentials.refresh_token : undefined,
      };
    },
    email: async () => user.email,
    refresh: async () => {
      refreshes++;
      return { access_token: 'synthetic-renewed', expiry_date: now + 7200000 };
    },
  };
  const current = service(clientId, google);
  await assert.rejects(current.session(user), { code: 'reconnect_required' });
  await assert.rejects(current.exchange(user, 'code', 'https://app.example.com'), {
    code: 'reconnect_required',
  });
  assert.equal(refreshes, 0);
  assert.equal(await createDriveCredentialStore(db, clientId).get(user.uid), null);
  issueRefresh = true;
  const session = await current.exchange(user, 'fresh-code', 'https://app.example.com');
  assert.equal(session.clientId, clientId);
  assert.equal(exchanges, 2);
  const restarted = service(clientId, google);
  assert.equal((await restarted.session(user)).token, 'synthetic-access');
  assert.equal((await restarted.session(user, true)).token, 'synthetic-renewed');
  assert.equal(refreshes, 1);
  const encrypted = await createDriveCredentialStore(db, clientId).get(user.uid);
  assert.equal(vault.open(user.uid, encrypted).oauth_client_id, clientId);
  assert.ok(!JSON.stringify(encrypted).includes('synthetic-refresh'));
  assert.deepEqual((await legacyRef.get()).data(), original);
  assert.deepEqual(await previousStore.get(user.uid), previousRecord);
});

test('binding rejects copied grants and disconnect or invalidation affects only the current user and client', async () => {
  const owner = { ...user, uid: 'scoped-owner' };
  const member = { uid: 'scoped-member', email: 'member@example.com' };
  const legacyRef = db.collection('_driveCredentials').doc(owner.uid);
  const legacy = vault.seal(owner.uid, credentials);
  await legacyRef.set(legacy);
  const currentStore = createDriveCredentialStore(db, clientId);
  const previousStore = createDriveCredentialStore(db, previousClientId);
  const previousRecord = vault.seal(owner.uid, {
    ...credentials,
    oauth_client_id: previousClientId,
  });
  await previousStore.put(owner.uid, previousRecord);
  let refreshes = 0;
  const google = {
    exchange: async () => ({ ...credentials }),
    email: async () => owner.email,
    refresh: async () => {
      refreshes++;
      throw { response: { data: { error: 'invalid_grant' } } };
    },
  };
  const current = service(clientId, google);
  await currentStore.put(owner.uid, previousRecord);
  await assert.rejects(current.session(owner, true), { code: 'reconnect_required' });
  assert.equal(refreshes, 0);
  assert.deepEqual(await currentStore.get(owner.uid), previousRecord);
  // Seed a correctly bound record to simulate successful personal-client authorization.
  await currentStore.put(
    owner.uid,
    vault.seal(owner.uid, { ...credentials, oauth_client_id: clientId }),
  );
  await assert.rejects(current.session(member), { code: 'reconnect_required' });
  await assert.rejects(current.session(owner, true), { code: 'reconnect_required' });
  assert.equal(refreshes, 1);
  assert.equal(await currentStore.get(owner.uid), null);
  await current.exchange(owner, 'fresh-code', 'https://app.example.com');
  const memberRecord = vault.seal(member.uid, { ...credentials, oauth_client_id: clientId });
  await currentStore.put(member.uid, memberRecord);
  await current.disconnect(owner);
  assert.equal(await currentStore.get(owner.uid), null);
  assert.deepEqual(await currentStore.get(member.uid), memberRecord);
  assert.deepEqual(await previousStore.get(owner.uid), previousRecord);
  assert.deepEqual((await legacyRef.get()).data(), legacy);
});

test('browser users cannot read, list, create, overwrite or delete either credential namespace', async () => {
  const { initializeTestEnvironment, assertFails } = await import('@firebase/rules-unit-testing');
  const { readFile } = await import('node:fs/promises');
  const { doc, collection, getDoc, getDocs, setDoc, deleteDoc } =
    await import('firebase/firestore');
  const env = await initializeTestEnvironment({
    projectId: 'demo-construction-ops',
    firestore: { host: '127.0.0.1', port: 9089, rules: await readFile('firestore.rules', 'utf8') },
  });
  try {
    const hash = createHash('sha256').update(clientId).digest('hex');
    for (const context of [
      env.unauthenticatedContext(),
      env.authenticatedContext(user.uid),
      env.authenticatedContext('admin'),
    ]) {
      const browser = context.firestore();
      for (const path of [
        `_driveCredentials/${user.uid}`,
        `_driveCredentials/${user.uid}/oauthClients/${hash}`,
      ]) {
        const ref = doc(browser, path);
        await assertFails(getDoc(ref));
        await assertFails(setDoc(ref, { forbidden: true }));
        await assertFails(deleteDoc(ref));
      }
      await assertFails(
        getDocs(collection(browser, '_driveCredentials', user.uid, 'oauthClients')),
      );
    }
  } finally {
    await env.cleanup();
  }
});
