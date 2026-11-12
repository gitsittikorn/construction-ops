import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
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
  query,
  where,
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

test('driver claims enforce one truck per driver, atomic release and company isolation', async () => {
  const db = env.authenticatedContext('admin').firestore();
  const path = (kind, id) => doc(db, 'users', 'admin', kind, id);
  await assertSucceeds(
    setDoc(path('masters', 'fleet-driver'), envelope(master('fleet-driver', 'driver'))),
  );
  const first = { ...master('fleet-one'), driverId: 'fleet-driver' };
  await assertFails(setDoc(path('masters', first.id), envelope(first)));
  await assertSucceeds(
    runTransaction(db, async (tx) => {
      tx.set(path('masters', first.id), envelope(first));
      tx.set(path('uniqueKeys', 'driver-fleet-driver'), { entityId: first.id, active: true });
    }),
  );
  const second = { ...master('fleet-two'), driverId: 'fleet-driver' };
  await assertFails(
    runTransaction(db, async (tx) => {
      tx.set(path('masters', second.id), envelope(second));
      tx.set(path('uniqueKeys', 'driver-fleet-driver'), { entityId: second.id, active: true });
    }),
  );
  await assertFails(
    setDoc(path('uniqueKeys', 'driver-fleet-driver'), { entityId: first.id, active: false }),
  );
  await assertSucceeds(
    runTransaction(db, async (tx) => {
      tx.set(path('masters', first.id), envelope({ ...first, driverId: '' }, 2));
      tx.set(path('uniqueKeys', 'driver-fleet-driver'), { entityId: first.id, active: false });
    }),
  );
  await assertSucceeds(
    runTransaction(db, async (tx) => {
      tx.set(path('masters', second.id), envelope(second));
      tx.set(path('uniqueKeys', 'driver-fleet-driver'), { entityId: second.id, active: true });
    }),
  );
  const outsider = env.authenticatedContext('other').firestore();
  await assertFails(
    setDoc(
      doc(outsider, 'users', 'admin', 'masters', 'foreign-truck'),
      envelope({ ...master('foreign-truck'), driverId: 'fleet-driver' }),
    ),
  );
});

test('soil price events validate exact currency, references and authors, and cannot be edited or deleted', async () => {
  const db = env.authenticatedContext('admin').firestore();
  const path = (id) => doc(db, 'users', 'admin', 'masters', id);
  await assertSucceeds(setDoc(path('price-soil'), envelope(master('price-soil', 'soilType'))));
  await assertSucceeds(setDoc(path('price-source'), envelope(master('price-source', 'source'))));
  const price = {
    ...master('price-event', 'soilPrice'),
    soilPrice: {
      id: 'price-event',
      soilTypeId: 'price-soil',
      sourceId: 'price-source',
      sourceName: 'แหล่งหนึ่ง',
      soilName: 'ดินถม',
      satang: 12050,
      unit: 'm3',
      at: '2026-11-05T00:00:00Z',
      by: 'admin',
      note: '',
    },
  };
  await assertSucceeds(setDoc(path(price.id), envelope(price)));
  await assertFails(
    setDoc(path(price.id), envelope({ ...price, soilPrice: { ...price.soilPrice, satang: 1 } }, 2)),
  );
  await assertFails(setDoc(path(price.id), { ...envelope(price, 2), deletedAt: 'now' }));
  await assertFails(deleteDoc(path(price.id)));
  for (const patch of [
    { satang: -1 },
    { satang: 1.5 },
    { satang: 1000000000001 },
    { unit: 'ton' },
    { sourceId: 'missing' },
    { soilTypeId: 'price-source' },
    { by: 'other' },
    { unexpected: true },
  ]) {
    const id = `price-bad-${Object.keys(patch)[0]}-${String(Object.values(patch)[0])}`;
    await assertFails(
      setDoc(path(id), envelope({ ...price, id, soilPrice: { ...price.soilPrice, id, ...patch } })),
    );
  }
  const zero = {
    ...price,
    id: 'price-zero',
    soilPrice: { ...price.soilPrice, id: 'price-zero', satang: 0 },
  };
  await assertSucceeds(setDoc(path(zero.id), envelope(zero)));
  const outsider = env.authenticatedContext('other').firestore();
  await assertFails(
    setDoc(
      doc(outsider, 'users', 'admin', 'masters', 'price-foreign'),
      envelope({ ...price, id: 'price-foreign' }),
    ),
  );
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
test('optional truck nicknames accept bounded text and reject malformed values', async () => {
  const db = env.authenticatedContext('admin').firestore();
  const payload = { ...master('nickname-truck', 'truck'), nickname: 'รถเล็ก' };
  const ref = doc(db, 'users', 'admin', 'masters', payload.id);
  await assertSucceeds(setDoc(ref, envelope(payload)));
  for (const nickname of [123, 'x'.repeat(101)])
    await assertFails(setDoc(ref, envelope({ ...payload, nickname }, 2)));
  assert.equal((await getDoc(ref)).data().payload.nickname, 'รถเล็ก');
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

test('shared company roles protect finance, membership, sealed days and actual audit actors even without the UI', async () => {
  const root = env.authenticatedContext('admin').firestore();
  const at = '2026-11-08T00:00:00Z';
  await assertSucceeds(
    setDoc(doc(root, 'companies', 'admin'), {
      ownerUid: 'admin',
      name: 'Shared company',
      createdAt: at,
      updatedAt: at,
    }),
  );
  for (const [uid, role] of [
    ['manager', 'manager'],
    ['worker', 'operator'],
  ])
    await assertSucceeds(
      setDoc(doc(root, 'companies', 'admin', 'members', uid), {
        uid,
        name: uid,
        role,
        enabled: true,
        updatedAt: at,
      }),
    );
  const manager = env.authenticatedContext('manager').firestore(),
    worker = env.authenticatedContext('worker').firestore(),
    foreign = env.authenticatedContext('outsider').firestore();
  await assertSucceeds(getDoc(doc(worker, 'users', 'admin', 'projects', 'p')));
  await assertFails(getDoc(doc(foreign, 'users', 'admin', 'projects', 'p')));
  await assertFails(
    setDoc(doc(worker, 'companies', 'admin', 'members', 'worker'), {
      uid: 'worker',
      name: 'worker',
      role: 'manager',
      enabled: true,
      updatedAt: at,
    }),
  );
  await assertFails(
    setDoc(doc(manager, 'companies', 'admin', 'members', 'outsider'), {
      uid: 'outsider',
      name: 'outsider',
      role: 'manager',
      enabled: true,
      updatedAt: at,
    }),
  );
  await assertFails(
    setDoc(doc(root, 'companies', 'admin', 'members', 'admin'), {
      uid: 'admin',
      name: 'owner',
      role: 'operator',
      enabled: false,
      updatedAt: at,
    }),
  );
  await assertFails(getDocs(collection(worker, 'companies', 'admin', 'members')));
  await assertFails(getDoc(doc(worker, 'users', 'admin', 'workspaces', 'valid-rate')));
  await assertSucceeds(getDoc(doc(manager, 'users', 'admin', 'workspaces', 'valid-rate')));
  await assertFails(getDocs(collection(worker, 'users', 'admin', 'workspaces')));
  await assertSucceeds(
    getDocs(
      query(
        collection(worker, 'users', 'admin', 'workspaces'),
        where('payload.recordType', 'in', ['daily', 'evidence', 'survey']),
      ),
    ),
  );
  await assertFails(
    setDoc(
      doc(worker, 'users', 'admin', 'projects', 'worker-project'),
      envelope(project('worker-project')),
    ),
  );
  const day = {
    id: 'daily-p-2026-11-08',
    createdAt: at,
    updatedAt: at,
    recordType: 'daily',
    projectId: 'p',
    name: 'Working day',
    body: {
      date: '2026-11-08',
      version: 1,
      state: 'open',
      rows: [],
      verifications: {},
      closures: [],
      reason: '',
    },
  };
  const dayRef = doc(worker, 'users', 'admin', 'workspaces', day.id);
  await assertSucceeds(getDoc(dayRef));
  await assertSucceeds(setDoc(dayRef, envelope(day)));
  const verified = {
    ...day,
    body: { ...day.body, version: 2, verifications: { forged: { by: 'worker' } } },
  };
  await assertFails(setDoc(dayRef, envelope(verified, 2)));
  const closure = { rows: [], verifications: {}, by: 'manager', at, trips: 0, volume: 0 };
  const closed = {
    ...day,
    body: { ...day.body, version: 2, state: 'closed', closures: [closure] },
  };
  await assertFails(setDoc(dayRef, envelope(closed, 2)));
  await assertSucceeds(
    setDoc(doc(manager, 'users', 'admin', 'workspaces', day.id), envelope(closed, 2)),
  );
  await assertFails(
    setDoc(
      dayRef,
      envelope(
        {
          ...closed,
          body: { ...closed.body, version: 3, state: 'reopened', reason: 'forged reopen' },
        },
        3,
      ),
    ),
  );
  await assertFails(
    setDoc(doc(worker, 'users', 'admin', 'audit', 'forged-actor'), {
      actor: 'admin',
      at: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    setDoc(doc(worker, 'users', 'admin', 'audit', 'actual-actor'), {
      actor: 'worker',
      at: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    setDoc(doc(root, 'companies', 'admin', 'members', 'worker'), {
      uid: 'worker',
      name: 'worker',
      role: 'operator',
      enabled: false,
      updatedAt: at,
    }),
  );
  await assertFails(getDoc(doc(worker, 'users', 'admin', 'projects', 'p')));
});

test('evidence cannot be reparented out of a sealed day or rewritten after a later closeout generation', async () => {
  const root = env.authenticatedContext('other').firestore(),
    worker = env.authenticatedContext('proof-worker').firestore(),
    at = '2026-11-09T00:00:00Z';
  await setDoc(doc(root, 'companies', 'other'), {
    ownerUid: 'other',
    name: 'Proof company',
    createdAt: at,
    updatedAt: at,
  });
  await setDoc(doc(root, 'companies', 'other', 'members', 'proof-worker'), {
    uid: 'proof-worker',
    name: 'Worker',
    role: 'operator',
    enabled: true,
    updatedAt: at,
  });
  await setDoc(
    doc(root, 'users', 'other', 'projects', 'proof-project'),
    envelope(project('proof-project')),
  );
  const day = (date) => ({
    id: `daily-proof-project-${date}`,
    createdAt: at,
    updatedAt: at,
    recordType: 'daily',
    projectId: 'proof-project',
    name: date,
    body: {
      date,
      version: 1,
      state: 'open',
      rows: [],
      verifications: {},
      closures: [],
      reason: '',
    },
  });
  const originalDay = day('2026-11-09'),
    otherDay = day('2026-11-10');
  const ref = (db, id) => doc(db, 'users', 'other', 'workspaces', id);
  await setDoc(ref(root, originalDay.id), envelope(originalDay));
  await setDoc(ref(root, otherDay.id), envelope(otherDay));
  const evidence = {
    id: 'proof-original',
    createdAt: at,
    updatedAt: at,
    recordType: 'evidence',
    projectId: 'proof-project',
    name: 'Original signature',
    body: {
      sessionId: originalDay.id,
      rowId: 'row',
      date: originalDay.body.date,
      truckId: 'truck',
      driverId: 'driver',
      fingerprint: 'signed-totals',
      files: [{ uploadId: 'original-file', category: 'signature', name: 'signature.png' }],
    },
  };
  await assertSucceeds(setDoc(ref(worker, evidence.id), envelope(evidence)));
  const proof = {
    fingerprint: evidence.body.fingerprint,
    evidenceId: evidence.id,
    fileIds: ['original-drive'],
    by: 'other',
    at,
  };
  const closed = {
    ...originalDay,
    body: {
      ...originalDay.body,
      version: 2,
      state: 'closed',
      verifications: { row: proof },
      closures: [{ rows: [], verifications: { row: proof }, by: 'other', at, trips: 0, volume: 0 }],
    },
  };
  await setDoc(ref(root, closed.id), envelope(closed, 2));
  const reparented = {
    ...evidence,
    body: { ...evidence.body, sessionId: otherDay.id, date: otherDay.body.date },
  };
  await assertFails(setDoc(ref(worker, evidence.id), envelope(reparented, 2)));
  await assertFails(
    setDoc(ref(root, evidence.id), envelope({ ...evidence, name: 'rewritten closed proof' }, 2)),
  );
  const reopened = {
    ...closed,
    body: {
      ...closed.body,
      version: 3,
      state: 'reopened',
      verifications: {},
      reason: 'Supervisor reopened',
    },
  };
  await setDoc(ref(root, reopened.id), envelope(reopened, 3));
  await assertFails(
    setDoc(
      ref(worker, evidence.id),
      envelope({ ...evidence, name: 'overwrite historical proof' }, 2),
    ),
  );
  const fresh = {
    ...evidence,
    id: 'proof-current',
    body: { ...evidence.body, closureGeneration: 1 },
  };
  await assertSucceeds(setDoc(ref(worker, fresh.id), envelope(fresh)));
  const verified = {
    ...reopened,
    body: {
      ...reopened.body,
      version: 4,
      verifications: { row: { ...proof, evidenceId: fresh.id } },
    },
  };
  await setDoc(ref(root, verified.id), envelope(verified, 4));
  await assertFails(
    setDoc(ref(worker, fresh.id), envelope({ ...fresh, name: 'replace without invalidation' }, 2)),
  );
  const cleared = { ...verified, body: { ...verified.body, version: 5, verifications: {} } };
  await setDoc(ref(root, cleared.id), envelope(cleared, 5));
  await assertSucceeds(
    setDoc(
      ref(worker, fresh.id),
      envelope({ ...fresh, name: 'allowed after explicit invalidation' }, 2),
    ),
  );
  // A clean-profile restore can create a missing historical proof named by a closure,
  // but cannot use an operator grant to manufacture historical evidence.
  const restoredProof = { ...proof, evidenceId: 'proof-restored' },
    historicalDay = day('2026-11-11');
  const historical = {
    ...historicalDay,
    body: {
      ...historicalDay.body,
      state: 'closed',
      verifications: { row: restoredProof },
      closures: [
        { rows: [], verifications: { row: restoredProof }, by: 'other', at, trips: 0, volume: 0 },
      ],
    },
  };
  await setDoc(ref(root, historical.id), envelope(historical));
  const restored = {
    ...evidence,
    id: restoredProof.evidenceId,
    body: { ...evidence.body, sessionId: historical.id, date: historical.body.date },
  };
  await assertFails(setDoc(ref(worker, restored.id), envelope(restored)));
  await assertSucceeds(setDoc(ref(root, restored.id), envelope(restored)));
  const unused = {
    ...restored,
    id: 'proof-historical-alternative',
    body: { ...restored.body, fingerprint: 'previously replaced totals' },
  };
  await assertFails(setDoc(ref(worker, unused.id), envelope(unused)));
  await assertSucceeds(setDoc(ref(root, unused.id), envelope(unused)));
});
