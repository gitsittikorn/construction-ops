import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import { firestoreTransport } from '../cloudFirestore';
import { synchronize, resolveConflict } from '../cloudSync';
import { loadData, persistData, updateData } from '../storage';
import { emptyData } from '../models';
import { fixture, project, truck, trip } from '../test/syncFixtures';
import { deleteRecord } from '../deletion';
import { createDaily, dailySessions, saveDailyRow, verifyDaily, closeDaily } from '../daily';
import { saveEvidence } from '../evidence';
import { listUploads, putUpload } from '../uploads';
import { webcrypto } from 'node:crypto';
import { File as NodeFile } from 'node:buffer';
import { IDBFactory } from 'fake-indexeddb';

const session = vi.hoisted(() => ({ owner: '', db: null as Firestore | null }));
vi.mock('../firebase', () => ({
  ownerDatabase: (owner: string) => {
    if (!session.db || session.owner !== owner) throw Error('wrong account');
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
  const sealedRef=doc(session.db!,'users',owner,'workspaces',daily.id),sealed=(await getDoc(sealedRef)).data()!;
  await expect(setDoc(sealedRef,{...sealed,revision:sealed.revision+1,operationId:crypto.randomUUID(),serverUpdatedAt:serverTimestamp(),payload:{...sealed.payload,body:{...sealed.payload.body,state:'open',version:sealed.payload.body.version+1}}})).rejects.toMatchObject({code:'permission-denied'});
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
