import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createAccessStore } from '../accessStore.mjs';
import { createAccessService } from '../accessService.mjs';
import { grantPath } from '../accessModel.mjs';
import { prepareAccessBootstrap, applyAccessBootstrap } from '../bootstrapAccess.mjs';

let app, db, store, service;
const cid = 'access-integration',
  root = {
    uid: cid,
    email: 'integration-root@example.com',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  };
const input = (email, role = 'staff', status = 'enabled', expectedRevision = null) => ({
  email,
  name: email,
  role,
  status,
  expectedRevision,
});
before(() => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:9089')
    throw Error('Access integration requires isolated local emulator');
  app = initializeApp({ projectId: 'demo-construction-ops' }, 'access-integration');
  db = getFirestore(app);
  store = createAccessStore(db);
  service = createAccessService({ store, auth: { revokeRefreshTokens: async () => {} } });
});
after(async () => {
  await deleteApp(app);
});
test('real Firestore bootstrap and email binding retain the original namespace and business records', async () => {
  await db.doc(`users/${cid}/projects/real`).set({ preserved: true });
  const auth = {
    getUserByEmail: async () => ({
      uid: cid,
      email: root.email,
      emailVerified: true,
      providerData: [{ providerId: 'google.com' }],
    }),
    getUser: async () => {
      throw Error('No legacy members expected');
    },
  };
  const plan = await prepareAccessBootstrap({
    store,
    auth,
    companyId: cid,
    email: root.email,
    companyName: 'Integration company',
  });
  assert.equal(await store.get(`companies/${cid}`), null);
  await applyAccessBootstrap(store, plan);
  await service.save(root, cid, input('integration-worker@example.com'));
  const worker = { ...root, uid: 'integration-worker', email: 'integration-worker@example.com' };
  const bound = await service.session(worker, cid);
  assert.equal(bound.role, 'operator');
  assert.equal((await store.get(grantPath(cid, worker.email))).uid, worker.uid);
  assert.deepEqual(await store.get(`users/${cid}/projects/real`), { preserved: true });
  await service.save(root, cid, input(worker.email, 'viewer', 'disabled', 1));
  await assert.rejects(service.session(worker, cid), { code: 'access_denied' });
});
test('real Firestore transactions preserve one bound super admin under concurrent self-disable requests', async () => {
  await service.save(root, cid, input('integration-second@example.com', 'super_admin'));
  const second = { ...root, uid: 'integration-second', email: 'integration-second@example.com' };
  await Promise.all([service.session(second, cid), service.session(second, cid)]);
  assert.equal((await store.get(`companies/${cid}/access_control/state`)).enabledSuperAdmins, 2);
  const results = await Promise.allSettled([
    service.save(root, cid, input(root.email, 'super_admin', 'disabled', 1)),
    service.save(second, cid, input(second.email, 'super_admin', 'disabled', 1)),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await store.get(`companies/${cid}/access_control/state`)).enabledSuperAdmins, 1);
});
