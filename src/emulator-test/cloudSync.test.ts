import { actorUid, cacheOwner } from '../workspaceIdentity';
import { resolveCompany, saveCompanyProfile, saveCompanyMember } from '../companyAccess';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import { firestoreTransport } from '../cloudFirestore';
import { synchronize, resolveConflict } from '../cloudSync';
import { loadData, persistData, updateData } from '../storage';
import { emptyData } from '../models';
import { fixture, project, truck, trip } from '../test/syncFixtures';
import { deleteRecord } from '../deletion';
import {
  createDaily,
  dailySessions,
  saveDailyRow,
  verifyDaily,
  closeDaily,
  duplicateNextDay,
} from '../daily';
import { deliveredVolume } from '../dailyTrips';
import { saveEvidence } from '../evidence';
import { listUploads, putUpload } from '../uploads';
import { webcrypto } from 'node:crypto';
import { File as NodeFile } from 'node:buffer';
import { IDBFactory } from 'fake-indexeddb';

const session = vi.hoisted(() => ({ owner: '', db: null as Firestore | null }));
vi.mock('../firebase', () => ({
  identityDatabase: () => {
    if (!session.db) throw Error('no session');
    return session.db;
  },
  getSessionIdentity: () => ({ uid: session.owner, email: 'member@example.com' }),
  ownerDatabase: (owner: string) => {
    if (!session.db || session.owner !== actorUid(owner)) throw Error('wrong account');
    return session.db;
  },
}));
let environment: RulesTestEnvironment;
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:9089')
    throw Error('Integration tests require isolated local Firestore');
  environment = await initializeTestEnvironment({
    projectId: 'demo-construction-ops',
    firestore: { host: '127.0.0.1', port: 9089, rules: await readFile('firestore.rules', 'utf8') },
  });
});
afterAll(async () => {
  await environment?.cleanup();
});
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  session.owner = `integration-${crypto.randomUUID()}`;
  await environment.withSecurityRulesDisabled((context) =>
    setDoc(doc(context.firestore(), 'admins', session.owner), { enabled: true }),
  );
  session.db = environment.authenticatedContext(session.owner).firestore() as unknown as Firestore;
});
afterEach(() => vi.unstubAllGlobals());
it('P2 daily trip snapshots survive retry, duplicate day, a concurrent-device conflict and clean-device restore', async () => {
  const owner = session.owner,
    data = fixture();
  data.trips = [];
  data.masters[0].capacity = 6;
  await persistData(owner, data);
  await updateData(owner, (d) => createDaily(d, 'p', '2026-12-31', owner));
  let daily = dailySessions(await loadData(owner))[0];
  await updateData(owner, (d) =>
    saveDailyRow(
      d,
      daily.id,
      daily.body.version,
      {
        id: 'p2-assignment',
        truckId: 'truck',
        driverId: '',
        sourceId: '',
        teamId: '',
        soilType: '',
        tripCount: 10,
        capacity: 6,
        reportedTrips: null,
        notes: '',
      },
      owner,
    ),
  );
  await synchronize(owner, firestoreTransport);
  const deviceB = structuredClone(await loadData(owner));
  daily = dailySessions(deviceB)[0];
  const ids = daily.body.rows[0].transactions!.map((t) => t.id);
  await updateData(owner, (d) =>
    saveDailyRow(
      d,
      daily.id,
      daily.body.version,
      { ...daily.body.rows[0], capacity: 8, tripCount: 11 },
      owner,
    ),
  );
  await synchronize(owner, firestoreTransport);
  await persistData(owner, deviceB);
  await updateData(owner, (d) =>
    saveDailyRow(d, daily.id, daily.body.version, { ...daily.body.rows[0], tripCount: 12 }, owner),
  );
  await synchronize(owner, firestoreTransport);
  expect((await loadData(owner)).sync!.entries[`workspaces/${daily.id}`].status).toBe('conflict');
  await resolveConflict(owner, `workspaces/${daily.id}`, 'remote', firestoreTransport);
  expect(deliveredVolume(dailySessions(await loadData(owner))[0].body.rows[0])).toBe(68);
  await updateData(owner, (d) => duplicateNextDay(d, daily.id, owner));
  await synchronize(owner, firestoreTransport);
  await synchronize(owner, firestoreTransport);
  const originalDatabase = indexedDB;
  vi.stubGlobal('indexedDB', new IDBFactory());
  try {
    await synchronize(owner, firestoreTransport);
    const restored = dailySessions(await loadData(owner));
    expect(restored).toHaveLength(2);
    const source = restored.find((s) => s.body.date === '2026-12-31')!;
    expect(source.body.rows[0].transactions!.slice(0, 10).map((t) => t.id)).toEqual(ids);
    expect(deliveredVolume(source.body.rows[0])).toBe(68);
    expect(restored.find((s) => s.body.date === '2027-01-01')!.body.rows[0]).toMatchObject({
      tripCount: 0,
      transactions: [],
    });
  } finally {
    vi.stubGlobal('indexedDB', originalDatabase);
  }
});
it('P1-07/08/09 recovers a lost commit response and coalesces offline revisions without duplicate cloud records or audit', async () => {
  const owner = session.owner;
  await persistData(owner, fixture());
  for (const name of ['offline one', 'offline two', 'offline final'])
    await updateData(owner, (data) => ({ ...data, projects: [{ ...data.projects[0], name }] }));
  const operation = (await loadData(owner)).sync!.entries['projects/p'].desired.operationId;
  let interrupted = false;
  await expect(
    synchronize(owner, {
      ...firestoreTransport,
      push: async (...args) => {
        const result = await firestoreTransport.push(...args);
        if (!interrupted) {
          interrupted = true;
          throw Error('simulated lost response after server commit');
        }
        return result;
      },
    }),
  ).rejects.toThrow('lost response');
  expect((await loadData(owner)).sync!.entries['projects/p'].status).toBe('pending');
  expect(
    (await getDoc(doc(session.db!, 'users', owner, 'projects', 'p'))).data()?.operationId,
  ).toBe(operation);
  for (let retry = 0; retry < 3; retry++) await synchronize(owner, firestoreTransport);
  expect((await getDocs(collection(session.db!, 'users', owner, 'projects'))).size).toBe(1);
  expect((await getDocs(collection(session.db!, 'users', owner, 'masters'))).size).toBe(1);
  expect((await getDocs(collection(session.db!, 'users', owner, 'trips'))).size).toBe(1);
  expect((await getDocs(collection(session.db!, 'users', owner, 'audit'))).size).toBe(3);
  expect((await loadData(owner)).projects[0].name).toBe('offline final');
  expect(
    Object.values((await loadData(owner)).sync!.entries).every((e) => e.status === 'synced'),
  ).toBe(true);
});

it('P1-10/13/19 restores every master category into independent device storage and preserves another account', async () => {
  const owner = session.owner,
    original = fixture();
  original.masters.push(
    ...(['driver', 'source', 'customer', 'soilType', 'tag'] as const).map((kind) => ({
      ...truck,
      id: kind,
      kind,
    })),
  );
  await persistData(owner, original);
  await synchronize(owner, firestoreTransport);
  const firstDatabase = indexedDB;
  vi.stubGlobal('indexedDB', new IDBFactory());
  try {
    const other = `${owner}-other`;
    await persistData(other, {
      ...emptyData,
      projects: [{ ...project, name: 'Other account private' }],
    });
    expect((await loadData(owner)).projects).toEqual([]);
    await synchronize(owner, firestoreTransport);
    const restored = await loadData(owner);
    expect(restored.projects).toEqual(original.projects);
    expect(restored.masters.map((m) => m.kind).sort()).toEqual([
      'customer',
      'driver',
      'soilType',
      'source',
      'tag',
      'truck',
    ]);
    expect(restored.trips).toEqual([{ ...trip, syncStatus: 'synced' }]);
    expect((await loadData(other)).projects[0].name).toBe('Other account private');
    expect((await loadData(other)).trips).toEqual([]);
  } finally {
    vi.stubGlobal('indexedDB', firstDatabase);
  }
  expect((await loadData(owner)).projects).toEqual(original.projects);
});
it('syncs a daily session with actual rules and restores proof metadata to a separate fake device after simulated Drive upload', async () => {
  const owner = session.owner,
    original = fixture();
  original.masters.push({ ...truck, id: 'driver', kind: 'driver' });
  await persistData(owner, original);
  await updateData(owner, (data) => createDaily(data, 'p', '2026-11-06', owner));
  let daily = dailySessions(await loadData(owner))[0];
  await updateData(owner, (data) =>
    saveDailyRow(
      data,
      daily.id,
      daily.body.version,
      {
        id: 'row',
        truckId: 'truck',
        driverId: 'driver',
        teamId: '',
        sourceId: '',
        soilType: '',
        tripCount: 4,
        capacity: 12,
        reportedTrips: 4,
        notes: '',
      },
      owner,
    ),
  );
  for (const category of ['driver-photo', 'signature', 'trip-slip'] as const)
    await saveEvidence(owner, daily.id, 'row', category, [
      new NodeFile([`original ${category}`], `${category}.png`, {
        type: 'image/png',
      }) as unknown as File,
    ]);
  await synchronize(owner, firestoreTransport);
  for (const file of await listUploads(owner)) {
    const driveId = `simulated-private-drive-${file.id}`;
    await setDoc(doc(session.db!, 'users', owner, 'documents', file.id), {
      id: file.id,
      owner,
      projectId: file.projectId,
      tripId: '',
      evidenceId: file.evidenceId,
      driverId: file.driverId,
      truckId: file.truckId,
      workDate: file.workDate,
      category: file.category,
      fileId: driveId,
      folderId: 'private-folder',
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      createdAt: file.createdAt,
      status: 'synced',
      uploadedAt: serverTimestamp(),
    });
    await putUpload({ ...file, status: 'synced', driveId, folderId: 'private-folder' });
  }
  daily = dailySessions(await loadData(owner))[0];
  await expect(
    updateData(owner, (data) => verifyDaily(data, daily.id, daily.body.version, owner, [])),
  ).rejects.toThrow('อัปโหลด');
  const uploads = await listUploads(owner);
  daily = dailySessions(await loadData(owner))[0];
  await updateData(owner, (data) =>
    verifyDaily(data, daily.id, daily.body.version, owner, uploads),
  );
  daily = dailySessions(await loadData(owner))[0];
  await updateData(owner, (data) => closeDaily(data, daily.id, daily.body.version, owner, uploads));
  await synchronize(owner, firestoreTransport);
  expect(
    (await getDoc(doc(session.db!, 'users', owner, 'workspaces', daily.id))).data()?.payload.body
      .state,
  ).toBe('closed');
  const sealedRef = doc(session.db!, 'users', owner, 'workspaces', daily.id),
    sealed = (await getDoc(sealedRef)).data()!;
  await expect(
    setDoc(sealedRef, {
      ...sealed,
      revision: sealed.revision + 1,
      operationId: crypto.randomUUID(),
      serverUpdatedAt: serverTimestamp(),
      payload: {
        ...sealed.payload,
        body: { ...sealed.payload.body, state: 'open', version: sealed.payload.body.version + 1 },
      },
    }),
  ).rejects.toMatchObject({ code: 'permission-denied' });
  const originalDatabase = indexedDB;
  vi.stubGlobal('indexedDB', new IDBFactory());
  try {
    await synchronize(owner, firestoreTransport);
    const restored = dailySessions(await loadData(owner))[0];
    expect(restored.body.closures[0].volume).toBe(48);
    expect(restored.body.history?.some((e) => e.action === 'daily-verify')).toBe(true);
    expect(await listUploads(owner)).toHaveLength(3);
    expect(
      (await listUploads(owner)).every((file) => file.status === 'synced' && file.driveId),
    ).toBe(true);
  } finally {
    vi.stubGlobal('indexedDB', originalDatabase);
  }
});
it('uses the real adapter and rules for upload, verified restore, incremental edits and tombstones', async () => {
  const owner = session.owner,
    original = fixture();
  original.masters.push(
    ...(['driver', 'source', 'customer', 'soilType', 'tag'] as const).map((kind) => ({
      ...truck,
      id: kind,
      kind,
    })),
  );
  await persistData(owner, original);
  await synchronize(owner, firestoreTransport);
  const synced = await loadData(owner);
  expect(Object.values(synced.sync!.entries).every((entry) => entry.status === 'synced')).toBe(
    true,
  );
  expect(
    (await getDoc(doc(session.db!, 'users', owner, 'trips', trip.id))).data()?.payload.projectId,
  ).toBe(project.id);
  // Simulate a fresh device using only this test's fake IndexedDB state.
  await persistData(owner, structuredClone(emptyData));
  await synchronize(owner, firestoreTransport);
  expect((await loadData(owner)).masters).toHaveLength(6);
  expect((await loadData(owner)).trips[0].syncStatus).toBe('synced');
  await updateData(owner, (data) => ({ ...data, projects: [{ ...project, name: 'updated' }] }));
  await synchronize(owner, firestoreTransport);
  expect(
    (await getDoc(doc(session.db!, 'users', owner, 'projects', project.id))).data()?.payload.name,
  ).toBe('updated');
  await updateData(owner, (data) => deleteRecord(data, 'trip', trip.id, owner));
  await synchronize(owner, firestoreTransport);
  expect(
    (await getDoc(doc(session.db!, 'users', owner, 'trips', trip.id))).data()?.deletedAt,
  ).toBeTruthy();
  await persistData(owner, structuredClone(emptyData));
  await synchronize(owner, firestoreTransport);
  expect((await loadData(owner)).trips).toEqual([]);
  expect((await loadData(owner)).deletedTrips).toHaveLength(1);
});
it('preserves concurrent device edits and validates manual resolution against the server', async () => {
  const owner = session.owner;
  await persistData(owner, fixture());
  await synchronize(owner, firestoreTransport);
  const deviceB = structuredClone(await loadData(owner));
  await updateData(owner, (data) => ({ ...data, projects: [{ ...project, name: 'device A' }] }));
  await synchronize(owner, firestoreTransport);
  await persistData(owner, deviceB);
  await updateData(owner, (data) => ({ ...data, projects: [{ ...project, name: 'device B' }] }));
  await synchronize(owner, firestoreTransport);
  const conflict = (await loadData(owner)).sync!.entries['projects/p'];
  expect(conflict.status).toBe('conflict');
  expect((conflict.desired.payload as typeof project).name).toBe('device B');
  expect((conflict.conflict!.remote!.payload as typeof project).name).toBe('device A');
  await resolveConflict(owner, 'projects/p', 'local', firestoreTransport);
  await synchronize(owner, firestoreTransport);
  expect(
    (await getDoc(doc(session.db!, 'users', owner, 'projects', 'p'))).data()?.payload.name,
  ).toBe('device B');
});
it('preserves durable pending data on duplicate cross-device plates and revoked permissions', async () => {
  const owner = session.owner;
  await persistData(owner, fixture());
  await synchronize(owner, firestoreTransport);
  await updateData(owner, (data) => ({
    ...data,
    masters: [...data.masters, { ...truck, id: 'duplicate' }],
  }));
  await expect(synchronize(owner, firestoreTransport)).rejects.toThrow('ซ้ำ');
  expect((await loadData(owner)).sync!.entries['masters/duplicate'].status).toBe('pending');
  await environment.withSecurityRulesDisabled((context) =>
    setDoc(doc(context.firestore(), 'admins', owner), { enabled: false }),
  );
  await expect(synchronize(owner, firestoreTransport)).rejects.toThrow('Admin');
  expect((await loadData(owner)).masters).toHaveLength(2);
});
it('migrates a legacy cloud trip only after its baseline matches and retains its document ID', async () => {
  const owner = session.owner;
  await environment.withSecurityRulesDisabled((context) =>
    setDoc(doc(context.firestore(), 'users', owner, 'trips', trip.id), {
      ...trip,
      syncStatus: 'synced',
      serverUpdatedAt: serverTimestamp(),
    }),
  );
  await persistData(owner, fixture());
  await synchronize(owner, firestoreTransport);
  expect((await loadData(owner)).trips[0].syncStatus).toBe('synced');
  await updateData(owner, (data) => ({
    ...data,
    trips: [{ ...data.trips[0], revision: 2, notes: 'legacy updated', syncStatus: 'pending' }],
  }));
  await synchronize(owner, firestoreTransport);
  const migrated = (await getDoc(doc(session.db!, 'users', owner, 'trips', trip.id))).data();
  expect(migrated?.schemaVersion).toBe(1);
  expect(migrated?.id).toBe(trip.id);
  expect(migrated?.revision).toBe(2);
  expect(migrated?.payload.notes).toBe('legacy updated');
});

it('finance: multiple offline events sync idempotently in dependency order and restore on a clean device', async () => {
  const {
    addFinanceRate,
    addProjectExpense,
    reverseProjectExpense,
    financeVersion,
    financeRecords,
    financeSummary,
  } = await import('../finance');
  const owner = session.owner,
    data = fixture();
  data.trips[0].capacityPerTrip = 12;
  data.trips[0].driverId = 'driver';
  data.masters.push({ ...truck, id: 'driver', kind: 'driver' });
  let next = data;
  for (const [side, satang] of [
    ['revenue', 10000],
    ['truck', 5000],
    ['driver', 0],
  ] as const)
    next = addFinanceRate(
      next,
      'p',
      financeVersion(next, 'p'),
      { side, satang, partyId: '', unit: 'trip', effectiveFrom: '2026-11-01', reason: 'agreed' },
      owner,
    );
  next = addProjectExpense(
    next,
    'p',
    financeVersion(next, 'p'),
    { date: '2026-11-06', category: 'fuel', truckId: 'truck', satang: 1000, reason: 'receipt' },
    owner,
  );
  const expense = financeRecords(next, 'p').at(-1)!;
  next = reverseProjectExpense(
    next,
    'p',
    financeVersion(next, 'p'),
    expense.id,
    'wrong receipt',
    owner,
  );
  // Imported array order is arbitrary: the reversal must wait for the original.
  next.workspaces!.reverse();
  await persistData(owner, next);
  await synchronize(owner, firestoreTransport);
  expect(
    Object.values((await loadData(owner)).sync!.entries).every(
      (entry) => entry.status === 'synced',
    ),
  ).toBe(true);
  await synchronize(owner, firestoreTransport);
  const remote = await getDocs(collection(session.db!, 'users', owner, 'workspaces'));
  expect(remote.size).toBe(5);
  const originalDatabase = indexedDB;
  vi.stubGlobal('indexedDB', new IDBFactory());
  try {
    await synchronize(owner, firestoreTransport);
    const restored = await loadData(owner);
    expect(financeRecords(restored, 'p')).toHaveLength(5);
    expect(financeSummary(restored, 'p').expenseTotal).toBe(0);
    expect(financeSummary(restored, 'p').netKnown).toBe(5000);
    expect(financeSummary(restored, 'p').verified.revenue).toBe(0);
  } finally {
    vi.stubGlobal('indexedDB', originalDatabase);
  }
});

it('company: manager and operator share data with isolated caches, actual actors, downgrade and revocation enforcement', async () => {
  const { addFinanceRate, financeVersion, financeRecords } = await import('../finance');
  const { readCloudRecord, pushCloudRecord, authorizeCloud } = await import('../cloudFirestore');
  const { prepareSync } = await import('../syncModel');
  const root = session.owner,
    rootScope = { companyId: root, actorUid: root, role: 'owner' as const };
  const manager = `manager-${crypto.randomUUID()}`,
    worker = `worker-${crypto.randomUUID()}`;
  await saveCompanyProfile(rootScope, 'Shared construction company');
  await saveCompanyMember(rootScope, {
    uid: manager,
    name: 'Manager',
    role: 'manager',
    enabled: true,
  });
  await saveCompanyMember(rootScope, {
    uid: worker,
    name: 'Worker',
    role: 'operator',
    enabled: true,
  });
  let data = addFinanceRate(
    fixture(),
    'p',
    financeVersion(fixture(), 'p'),
    {
      side: 'revenue',
      partyId: '',
      unit: 'trip',
      satang: 10000,
      effectiveFrom: '2026-11-01',
      reason: 'owner agreed',
    },
    root,
  );
  await persistData(root, data);
  await synchronize(root, firestoreTransport);
  const financialId = financeRecords(await loadData(root), 'p')[0].id;
  const asUser = (uid: string) => {
    session.owner = uid;
    session.db = environment.authenticatedContext(uid).firestore() as unknown as Firestore;
  };
  asUser(manager);
  const managerScope = await resolveCompany(manager, root),
    managerKey = cacheOwner(managerScope);
  expect(managerScope.role).toBe('manager');
  await synchronize(managerKey, firestoreTransport);
  expect((await loadData(managerKey)).projects[0].id).toBe('p');
  expect(financeRecords(await loadData(managerKey), 'p')).toHaveLength(1);
  await updateData(managerKey, (previous) =>
    addFinanceRate(
      previous,
      'p',
      financeVersion(previous, 'p'),
      {
        side: 'revenue',
        partyId: '',
        unit: 'trip',
        satang: 12000,
        effectiveFrom: '2026-11-01',
        reason: 'manager correction',
      },
      managerKey,
    ),
  );
  await synchronize(managerKey, firestoreTransport);
  const actualAudit = await getDocs(collection(session.db!, 'users', root, 'audit'));
  expect(actualAudit.docs.some((snapshot) => snapshot.data().actor === manager)).toBe(true);
  asUser(worker);
  const operatorScope = await resolveCompany(worker, root),
    operatorKey = cacheOwner(operatorScope);
  await synchronize(operatorKey, firestoreTransport);
  expect((await loadData(operatorKey)).projects[0].id).toBe('p');
  expect(financeRecords(await loadData(operatorKey), 'p')).toEqual([]);
  await expect(readCloudRecord(operatorKey, 'workspaces', financialId)).rejects.toThrow();
  const forgedKey = cacheOwner({ ...operatorScope, role: 'manager' });
  await expect(authorizeCloud(forgedKey)).rejects.toHaveProperty('code', 'permission-denied');
  data = addFinanceRate(
    await loadData(operatorKey),
    'p',
    financeVersion(await loadData(operatorKey), 'p'),
    {
      side: 'revenue',
      partyId: '',
      unit: 'trip',
      satang: 1,
      effectiveFrom: '2026-11-01',
      reason: 'forged role',
    },
    forgedKey,
  );
  const forgedRecord = financeRecords(data, 'p').at(-1)!;
  const forgedEntry = prepareSync(await loadData(operatorKey), data).sync!.entries[
    `workspaces/${forgedRecord.id}`
  ];
  await expect(pushCloudRecord(forgedKey, 'workspaces', forgedEntry)).rejects.toThrow();
  await updateData(operatorKey, (previous) =>
    createDaily(previous, 'p', '2026-11-08', operatorKey),
  );
  await synchronize(operatorKey, firestoreTransport);
  asUser(manager);
  await synchronize(managerKey, firestoreTransport);
  expect(dailySessions(await loadData(managerKey))).toHaveLength(1);
  await expect(
    saveCompanyMember(managerScope, {
      uid: worker,
      name: 'Worker',
      role: 'manager',
      enabled: true,
    }),
  ).rejects.toThrow('สิทธิ์');
  const retainedManager = structuredClone(await loadData(managerKey));
  asUser(root);
  await saveCompanyMember(rootScope, {
    uid: manager,
    name: 'Manager',
    role: 'operator',
    enabled: true,
  });
  asUser(manager);
  await expect(authorizeCloud(managerKey)).rejects.toHaveProperty('code', 'permission-denied');
  const downgraded = cacheOwner(await resolveCompany(manager, root));
  expect(downgraded).not.toBe(managerKey);
  await synchronize(downgraded, firestoreTransport);
  expect(financeRecords(await loadData(downgraded), 'p')).toEqual([]);
  expect(await loadData(managerKey)).toEqual(retainedManager);
  asUser(worker);
  await updateData(operatorKey, (previous) => ({
    ...previous,
    trips: [
      {
        ...previous.trips[0],
        notes: 'pending before revocation',
        revision: previous.trips[0].revision + 1,
      },
    ],
  }));
  const pending = structuredClone(await loadData(operatorKey));
  asUser(root);
  await saveCompanyMember(rootScope, {
    uid: worker,
    name: 'Worker',
    role: 'operator',
    enabled: false,
  });
  asUser(worker);
  await expect(synchronize(operatorKey, firestoreTransport)).rejects.toHaveProperty(
    'code',
    'permission-denied',
  );
  expect(await loadData(operatorKey)).toEqual(pending);
});
