import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import { firestoreTransport } from '../cloudFirestore';
import { synchronize, resolveConflict } from '../cloudSync';
import { loadData, persistData, updateData } from '../storage';
import { emptyData } from '../models';
import { fixture, project, truck, trip } from '../test/syncFixtures';
import { deleteRecord } from '../deletion';

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
  session.owner = `integration-${crypto.randomUUID()}`;
  await environment.withSecurityRulesDisabled((context) =>
    setDoc(doc(context.firestore(), 'admins', session.owner), { enabled: true }),
  );
  session.db = environment.authenticatedContext(session.owner).firestore() as unknown as Firestore;
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
