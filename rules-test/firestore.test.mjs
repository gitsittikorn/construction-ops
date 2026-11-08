import { readFile } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';

let env;
before(async () => {
  if (!/^127\.0\.0\.1:9089$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? ''))
    throw Error('Rules tests require the isolated local emulator');
  env = await initializeTestEnvironment({
    projectId: 'demo-construction-ops',
    firestore: { host: '127.0.0.1', port: 9089, rules: await readFile('firestore.rules', 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'admins', 'admin'), { enabled: true });
    await setDoc(doc(context.firestore(), 'admins', 'disabled'), { enabled: false });
    await setDoc(doc(context.firestore(), 'admins', 'other'), { enabled: true });
  });
});
after(async () => {
  await env?.cleanup();
});
const project = (id) => ({
  id,
  createdAt: '2026-11-05T00:00:00Z',
  updatedAt: '2026-11-05T00:00:00Z',
  name: 'Site',
  customer: '',
  location: '',
  startDate: '',
  endDate: '',
  status: 'active',
  description: '',
});
const master = (id, kind = 'truck') => ({
  id,
  createdAt: '2026-11-05T00:00:00Z',
  updatedAt: '2026-11-05T00:00:00Z',
  name: id,
  detail: '',
  capacity: 12,
  active: true,
  kind,
});
const envelope = (payload, revision = 1) => ({
  schemaVersion: 1,
  id: payload.id,
  createdAt: payload.createdAt,
  updatedAt: payload.updatedAt,
  revision,
  operationId: `op-${payload.id}-${revision}`,
  payload,
  deletedAt: null,
  serverUpdatedAt: serverTimestamp(),
});

test('anonymous, non-admin and disabled accounts cannot read or write data', async () => {
  for (const context of [
    env.unauthenticatedContext(),
    env.authenticatedContext('member'),
    env.authenticatedContext('disabled'),
  ]) {
    const db = context.firestore();
    for (const kind of [
      'projects',
      'masters',
      'trips',
      'audit',
      'documents',
      'driveFolders',
      'uniqueKeys',
      'workspaces',
      'evidenceFolders',
    ]) {
      await assertFails(getDoc(doc(db, 'users', 'admin', kind, 'forbidden')));
      await assertFails(
        setDoc(doc(db, 'users', 'admin', kind, 'forbidden'), envelope(project('forbidden'))),
      );
    }
    await assertFails(setDoc(doc(db, 'users', 'member', 'projects', 'p'), envelope(project('p'))));
  }
});
test('admin status is readable only for self and never client writable or listable', async () => {
  const db = env.authenticatedContext('admin').firestore();
  await assertSucceeds(getDoc(doc(db, 'admins', 'admin')));
  await assertFails(getDoc(doc(db, 'admins', 'other')));
  await assertFails(getDocs(collection(db, 'admins')));
  await assertFails(setDoc(doc(db, 'admins', 'admin'), { enabled: true }));
});
test('enabled admins cannot cross owner boundaries or access unknown collections', async () => {
  const db = env.authenticatedContext('other').firestore();
  await assertFails(getDoc(doc(db, 'users', 'admin', 'projects', 'p')));
  await assertFails(setDoc(doc(db, 'users', 'admin', 'projects', 'p'), envelope(project('p'))));
  await assertFails(getDoc(doc(db, 'users', 'other', 'unknown', 'p')));
});
test('projects and all master categories accept create, exact next revision and tombstones, never hard delete', async () => {
  const db = env.authenticatedContext('admin').firestore();
  for (const payload of [
    project('p'),
    ...['truck', 'driver', 'source', 'customer', 'soilType', 'tag'].map((kind) =>
      master(kind, kind),
    ),
  ]) {
    const kind = 'kind' in payload ? 'masters' : 'projects',
      ref = doc(db, 'users', 'admin', kind, payload.id);
    await assertSucceeds(setDoc(ref, envelope(payload)));
    await assertSucceeds(getDoc(ref));
    await assertFails(setDoc(ref, envelope(payload)));
    await assertFails(setDoc(ref, envelope(payload, 3)));
    await assertFails(setDoc(ref, { ...envelope(payload, 2), schemaVersion: 99 }));
    await assertFails(setDoc(ref, { ...envelope(payload, 2), id: 'different' }));
    await assertFails(setDoc(ref, { ...envelope(payload, 2), createdAt: 'changed' }));
    await assertFails(setDoc(ref, { ...envelope(payload, 2), extra: 'unexpected' }));
    await assertFails(setDoc(ref, { ...envelope(payload, 2), serverUpdatedAt: null }));
    await assertSucceeds(setDoc(ref, envelope(payload, 2)));
    await assertSucceeds(
      setDoc(ref, { ...envelope(payload, 3), deletedAt: '2026-11-05T01:00:00Z' }),
    );
    await assertFails(deleteDoc(ref));
  }
});
test('trips require related records and valid payloads; legacy documents upgrade without changing IDs', async () => {
  const db = env.authenticatedContext('admin').firestore();
  const trip = {
    id: 'trip',
    createdAt: 'now',
    updatedAt: 'now',
    projectId: 'p',
    truckId: 'truck',
    driverId: 'driver',
    sourceId: 'source',
    date: '2026-11-05',
    time: '10:00',
    soilType: 'historical soil',
    notes: '',
    revision: 1,
  };
  const ref = doc(db, 'users', 'admin', 'trips', trip.id);
  await assertFails(setDoc(ref, envelope({ ...trip, truckId: 'missing' })));
  await assertFails(setDoc(ref, envelope({ ...trip, time: '99:99' })));
  await assertSucceeds(setDoc(ref, envelope(trip)));
  await assertFails(deleteDoc(ref));
  const legacy = {
    ...trip,
    id: 'legacy',
    revision: 4,
    syncStatus: 'synced',
    serverUpdatedAt: serverTimestamp(),
  };
  await env.withSecurityRulesDisabled((context) =>
    setDoc(doc(context.firestore(), 'users', 'admin', 'trips', 'legacy'), legacy),
  );
  await assertSucceeds(getDoc(doc(db, 'users', 'admin', 'trips', 'legacy')));
  const { syncStatus: _status, serverUpdatedAt: _time, ...payload } = legacy;
  await assertSucceeds(setDoc(doc(db, 'users', 'admin', 'trips', 'legacy'), envelope(payload, 5)));
});
test('uniqueness claims cannot be stolen or hard deleted and audit is append only', async () => {
  const db = env.authenticatedContext('admin').firestore(),
    ref = doc(db, 'users', 'admin', 'uniqueKeys', 'truck-key');
  await assertSucceeds(setDoc(ref, { entityId: 'truck', active: true }));
  await assertFails(setDoc(ref, { entityId: 'driver', active: true }));
  await assertFails(deleteDoc(ref));
  const audit = doc(db, 'users', 'admin', 'audit', 'op');
  await assertFails(setDoc(audit, { actor: 'other', at: serverTimestamp() }));
  await assertSucceeds(setDoc(audit, { actor: 'admin', at: serverTimestamp() }));
  await assertFails(setDoc(audit, { actor: 'admin', at: serverTimestamp() }));
  await assertFails(deleteDoc(audit));
});
test('concurrent transactions preserve the losing version for the caller to resolve', async () => {
  const db = env.authenticatedContext('admin').firestore(),
    ref = doc(db, 'users', 'admin', 'projects', 'concurrent');
  await setDoc(ref, envelope(project('concurrent')));
  const write = (name) =>
    runTransaction(db, async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.data().revision !== 1) throw Error('conflict');
      tx.set(ref, envelope({ ...project('concurrent'), name }, 2));
    });
  const results = await Promise.allSettled([write('device A'), write('device B')]);
  if (
    results.filter((r) => r.status === 'fulfilled').length !== 1 ||
    results.filter((r) => r.status === 'rejected').length !== 1
  )
    throw Error('Expected one winner and one conflict');
});

test('finance events enforce money types, scoped parties and immutable originals with exactly one matching reversal', async () => {
  const db = env.authenticatedContext('admin').firestore();
  await assertSucceeds(
    setDoc(
      doc(db, 'users', 'admin', 'projects', 'finance-project'),
      envelope(project('finance-project')),
    ),
  );
  await assertSucceeds(
    setDoc(
      doc(db, 'users', 'admin', 'masters', 'finance-truck'),
      envelope(master('finance-truck')),
    ),
  );
  const event = (id, kind, entry) => ({
    id,
    recordType: 'finance',
    projectId: 'finance-project',
    name: 'Finance',
    createdAt: '2026-11-06T00:00:00Z',
    updatedAt: '2026-11-06T00:00:00Z',
    body: {
      kind,
      entry: { id, at: '2026-11-06T00:00:00Z', by: 'admin', reason: 'receipt', ...entry },
    },
  });
  const save = (payload, revision = 1) =>
    setDoc(doc(db, 'users', 'admin', 'workspaces', payload.id), envelope(payload, revision));
  const rate = (id, extra = {}) =>
    event(id, 'rate', {
      side: 'truck',
      partyId: 'finance-truck',
      effectiveFrom: '2026-11-06',
      unit: 'trip',
      satang: 1000,
      revision: 1,
      ...extra,
    });
  await assertFails(save(rate('invalid-money', { satang: 0.1 })));
  await assertFails(save(rate('invalid-negative', { satang: -1 })));
  await assertFails(save(rate('invalid-party', { partyId: 'missing' })));
  await assertFails(save(rate('invalid-actor', { by: 'other' })));
  await assertSucceeds(save(rate('valid-rate')));
  await assertFails(save(rate('valid-rate', { satang: 2000 }), 2));
  await assertFails(deleteDoc(doc(db, 'users', 'admin', 'workspaces', 'valid-rate')));
  const expense = event('expense', 'expense', {
    date: '2026-11-06',
    category: 'fuel',
    truckId: 'finance-truck',
    satang: 1000,
    reversesId: '',
  });
  await assertSucceeds(save(expense));
  const reversal = event('reversal-expense', 'expense', {
    date: '2026-11-06',
    category: 'fuel',
    truckId: 'finance-truck',
    satang: 1000,
    reversesId: 'expense',
  });
  await assertFails(
    save({
      ...reversal,
      body: { ...reversal.body, entry: { ...reversal.body.entry, satang: 999 } },
    }),
  );
  await assertFails(save({ ...reversal, projectId: 'p' }));
  await assertSucceeds(save(reversal));
  await assertFails(save(reversal, 2));
  await assertFails(
    save(event('second-reversal', 'expense', { ...reversal.body.entry, id: 'second-reversal' })),
  );
});
