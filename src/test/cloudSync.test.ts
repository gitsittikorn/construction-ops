import {
  loadData,
  persistData,
  updateData,
  updateSyncData,
  loadMigrationBackup,
  openLocalDatabase,
} from '../storage';
import {
  acknowledge,
  CloudConflict,
  mergeCloud,
  resolveConflict,
  synchronize,
  type CloudTransport,
} from '../cloudSync';
import {
  canonical,
  entityKey,
  integrityIssues,
  prepareSync,
  sameContent,
  sameVersion,
  type CloudRecord,
  type EntityCollection,
  type SyncEntry,
} from '../syncModel';
import { emptyData } from '../models';
import { decodeCloudRecord } from '../cloudValidation';
import { deleteRecord } from '../deletion';
import { cloudProject, cloudRecords, fixture, project, truck, trip } from './syncFixtures';

function memoryTransport() {
  const remote = new Map<string, CloudRecord>();
  const transport: CloudTransport = {
    authorize: vi.fn(async () => {}),
    read: vi.fn(async (_owner, collection, id) => remote.get(entityKey(collection, id)) ?? null),
    pull: vi.fn(async () => ({
      records: [...remote].map(([key, record]) => ({
        collection: key.split('/')[0] as EntityCollection,
        record: structuredClone(record),
      })),
      cursors: { projects: { seconds: 10, nanoseconds: 5 } },
    })),
    push: vi.fn(async (_owner, collection, entry) => {
      const key = entityKey(collection, entry.desired.id),
        previous = remote.get(key) ?? null;
      if (previous && sameContent(previous, entry.desired)) return previous;
      if (!sameVersion(entry.base, previous)) throw new CloudConflict(previous);
      remote.set(key, structuredClone(entry.desired));
      return entry.desired;
    }),
  };
  return { transport, remote };
}
it('treats legacy synced flags as unverified until a server baseline is established', async () => {
  const owner = crypto.randomUUID(),
    data = fixture();
  data.trips[0].syncStatus = 'synced';
  await persistData(owner, data);
  await updateData(owner, (previous) => previous);
  expect((await loadData(owner)).trips[0].syncStatus).toBe('pending');
  const { transport } = memoryTransport();
  await synchronize(owner, transport);
  expect((await loadData(owner)).trips[0].syncStatus).toBe('synced');
});
it('migrates additively and atomically saves an immutable pre-migration backup and durable outbox', async () => {
  const owner = crypto.randomUUID(),
    old = fixture();
  await persistData(owner, old);
  const migrated = await updateData(owner, (data) => data);
  expect(await loadMigrationBackup(owner)).toEqual(old);
  expect(Object.keys(migrated.sync!.entries)).toHaveLength(3);
  expect((await loadData(owner)).sync).toEqual(migrated.sync);
  await updateData(owner, (data) => ({ ...data, projects: [{ ...project, name: 'edited' }] }));
  expect(await loadMigrationBackup(owner)).toEqual(old);
  expect((await loadData(owner)).sync!.entries['projects/p'].status).toBe('pending');
  const db = await openLocalDatabase();
  expect(db.version).toBe(2);
  expect([...db.objectStoreNames]).toEqual(['driveSettings', 'state', 'uploads']);
  db.close();
});
it('rejects unknown local schema without changing data and aborts invalid changes with their outbox', async () => {
  const owner = crypto.randomUUID();
  await persistData(owner, fixture());
  await expect(updateData(owner, (data) => ({ ...data, masters: [truck, truck] }))).rejects.toThrow(
    'ID',
  );
  expect(await loadData(owner)).toEqual(fixture());
  expect(await loadMigrationBackup(owner)).toBeUndefined();
  const future = { ...fixture(), sync: { schemaVersion: 99, entries: {}, cursors: {} } };
  await persistData(owner, future as never);
  await expect(updateData(owner, (data) => data)).rejects.toThrow('เวอร์ชัน');
  await expect(loadData(owner)).rejects.toThrow('เวอร์ชัน');
  const db = await openLocalDatabase();
  expect(await db.get('state', owner)).toEqual(future);
  db.close();
});
it('syncs every master category, projects and trips and replays without duplicates', async () => {
  const owner = crypto.randomUUID(),
    { transport, remote } = memoryTransport();
  const data = fixture();
  data.masters.push(
    ...(['driver', 'source', 'customer', 'soilType', 'tag'] as const).map((kind) => ({
      ...truck,
      id: kind,
      kind,
    })),
  );
  await persistData(owner, data);
  await synchronize(owner, transport);
  expect(remote.size).toBe(8);
  expect((await loadData(owner)).trips[0].syncStatus).toBe('synced');
  expect(
    Object.values((await loadData(owner)).sync!.entries).every(
      (entry) => entry.status === 'synced',
    ),
  ).toBe(true);
  await synchronize(owner, transport);
  expect(remote.size).toBe(8);
  expect(transport.push).toHaveBeenCalledTimes(8);
});
it('restores a new device completely without deleting unrelated local records', async () => {
  const owner = crypto.randomUUID(),
    { transport, remote } = memoryTransport();
  for (const { collection, record } of cloudRecords())
    remote.set(entityKey(collection, record.id), record);
  await persistData(owner, { ...emptyData, projects: [{ ...project, id: 'local-pending' }] });
  await synchronize(owner, transport);
  const data = await loadData(owner);
  expect(data.projects.map((p) => p.id).sort()).toEqual(['local-pending', 'p']);
  expect(data.trips[0].syncStatus).toBe('synced');
  expect(integrityIssues(data)).toEqual([]);
  expect(data.sync!.restoredAt).toBeTruthy();
});
it('preserves pending data and both versions on concurrent edits instead of overwriting either', () => {
  const local = prepareSync(fixture(), fixture()),
    record = { ...cloudProject(), payload: { ...project, name: 'remote edit' } };
  const next = mergeCloud(local, { records: [{ collection: 'projects', record }], cursors: {} });
  expect(next.projects[0].name).toBe('Site');
  expect(next.sync!.entries['projects/p'].status).toBe('conflict');
  expect(next.sync!.entries['projects/p'].conflict!.remote).toEqual(record);
  expect(next.sync!.entries['projects/p'].desired.payload).toEqual(project);
});
it('detects a two-device conflict even when the losing device made more offline edits', async () => {
  const { transport, remote } = memoryTransport(),
    first = crypto.randomUUID(),
    second = crypto.randomUUID();
  await persistData(first, fixture());
  await synchronize(first, transport);
  await synchronize(second, transport);
  await updateData(first, (data) => ({ ...data, projects: [{ ...project, name: 'device A' }] }));
  await synchronize(first, transport);
  for (const name of ['B1', 'B2', 'B3'])
    await updateData(second, (data) => ({ ...data, projects: [{ ...project, name }] }));
  await synchronize(second, transport);
  expect((remote.get('projects/p')!.payload as typeof project).name).toBe('device A');
  const loser = await loadData(second);
  expect(loser.projects[0].name).toBe('B3');
  expect(loser.sync!.entries['projects/p'].status).toBe('conflict');
});
it('keeps pending data on network errors and retries safely after an unacknowledged server commit', async () => {
  const owner = crypto.randomUUID(),
    { transport, remote } = memoryTransport(),
    original = transport.push;
  await persistData(owner, fixture());
  transport.push = vi.fn(async (uid: string, collection: EntityCollection, entry: SyncEntry) => {
    await original(uid, collection, entry);
    throw Error('response lost');
  });
  await expect(synchronize(owner, transport)).rejects.toThrow('response lost');
  expect((await loadData(owner)).sync!.entries['projects/p'].status).toBe('pending');
  expect(remote.size).toBe(1);
  transport.push = original;
  await synchronize(owner, transport);
  expect(remote.size).toBe(3);
  expect((await loadData(owner)).trips[0].syncStatus).toBe('synced');
});
it('does not acknowledge a newer local edit with an older in-flight response', () => {
  const original = prepareSync(fixture(), fixture()),
    sent = original.sync!.entries['projects/p'];
  const changed = prepareSync(original, { ...original, projects: [{ ...project, name: 'newer' }] });
  const next = acknowledge(changed, 'projects', sent, sent.desired);
  expect(next.projects[0].name).toBe('newer');
  expect(next.sync!.entries['projects/p'].status).toBe('pending');
  expect(next.sync!.entries['projects/p'].base).toEqual(sent.desired);
  expect(next.sync!.entries['projects/p'].desired.revision).toBe(2);
});
it('persists exponential retry timing and rejects a mismatched server acknowledgement', async () => {
  const owner = crypto.randomUUID(),
    { transport } = memoryTransport();
  await persistData(owner, fixture());
  transport.push = vi.fn(async () => {
    throw Error('temporary outage');
  });
  await expect(synchronize(owner, transport)).rejects.toThrow('temporary outage');
  let entry = (await loadData(owner)).sync!.entries['projects/p'];
  expect(entry.attempts).toBe(1);
  expect(entry.retryAt).toBeGreaterThan(Date.now());
  const firstTime = entry.retryAt!;
  await expect(synchronize(owner, transport)).rejects.toThrow('temporary outage');
  entry = (await loadData(owner)).sync!.entries['projects/p'];
  expect(entry.attempts).toBe(2);
  expect(entry.retryAt).toBeGreaterThan(firstTime);
  const prepared = prepareSync(fixture(), fixture());
  expect(() =>
    acknowledge(prepared, 'projects', prepared.sync!.entries['projects/p'], {
      ...cloudProject(),
      payload: { ...project, name: 'wrong server response' },
    }),
  ).toThrow('ไม่ตรง');
});
it('blocks unauthenticated sync and stops safely on account changes', async () => {
  const owner = crypto.randomUUID(),
    { transport } = memoryTransport();
  await persistData(owner, fixture());
  vi.mocked(transport.authorize).mockRejectedValueOnce(Error('not admin'));
  await expect(synchronize(owner, transport)).rejects.toThrow('not admin');
  expect(transport.pull).not.toHaveBeenCalled();
  expect(await loadData(owner)).toEqual(fixture());
  let active = true;
  vi.mocked(transport.pull).mockImplementationOnce(async () => {
    active = false;
    return { records: cloudRecords(), cursors: {} };
  });
  await expect(synchronize(owner, transport, () => active)).rejects.toThrow('บัญชี');
  expect((await loadData(owner)).sync!.restoredAt).toBeUndefined();
  expect(transport.push).not.toHaveBeenCalled();
});
it('does not merge unknown cloud schemas, missing references or advance cursors on failed restore', () => {
  const data = prepareSync(emptyData, emptyData);
  expect(() =>
    mergeCloud(data, {
      records: [
        { collection: 'projects', record: { ...cloudProject(), schemaVersion: 99 } as never },
      ],
      cursors: {},
    }),
  ).toThrow('Schema');
  expect(() =>
    mergeCloud(data, {
      records: cloudRecords().filter((row) => row.collection === 'trips'),
      cursors: { trips: { seconds: 123, nanoseconds: 0 } },
    }),
  ).toThrow('ไม่พบ');
  expect(data).toEqual(prepareSync(emptyData, emptyData));
});
it('soft deletes every entity without erasing history and restores tombstones', async () => {
  const owner = crypto.randomUUID(),
    { transport, remote } = memoryTransport();
  await persistData(owner, fixture());
  await synchronize(owner, transport);
  await updateData(owner, (data) => deleteRecord(data, 'trip', trip.id, owner));
  await synchronize(owner, transport);
  expect(remote.get('trips/trip')!.deletedAt).toBeTruthy();
  expect((await loadData(owner)).deletedTrips).toHaveLength(1);
  const restored = crypto.randomUUID();
  await synchronize(restored, transport);
  expect((await loadData(restored)).trips).toEqual([]);
  expect((await loadData(restored)).deletedTrips).toHaveLength(1);
  const noTrips = { ...emptyData, projects: [project], masters: [truck] };
  for (const [type, id, field] of [
    ['project', 'p', 'deletedProjects'],
    ['master', 'truck', 'deletedMasters'],
  ] as const) {
    const deleted = deleteRecord(noTrips, type, id, owner);
    expect(deleted[field]).toHaveLength(1);
    expect(
      prepareSync(noTrips, deleted).sync!.entries[
        `${type === 'project' ? 'projects' : 'masters'}/${id}`
      ].desired.deletedAt,
    ).toBeTruthy();
  }
});
it('keeps a stale manual decision as a conflict and supports local or cloud resolution with audit', async () => {
  const owner = crypto.randomUUID(),
    { transport, remote } = memoryTransport();
  await persistData(owner, fixture());
  let record = { ...cloudProject(), payload: { ...project, name: 'cloud' } };
  remote.set('projects/p', record);
  await synchronize(owner, transport);
  record = { ...record, revision: 2, operationId: 'changed-again' };
  remote.set('projects/p', record);
  await expect(resolveConflict(owner, 'projects/p', 'remote', transport)).rejects.toThrow(
    'อีกครั้ง',
  );
  expect((await loadData(owner)).projects[0].name).toBe('Site');
  await resolveConflict(owner, 'projects/p', 'local', transport);
  expect((await loadData(owner)).sync!.entries['projects/p'].desired.revision).toBe(3);
  await synchronize(owner, transport);
  expect((remote.get('projects/p')!.payload as typeof project).name).toBe('Site');
  await updateSyncData(owner, (data) => {
    const entry = data.sync!.entries['projects/p'];
    entry.status = 'conflict';
    entry.conflict = { remote: record, detectedAt: 'now' };
    return data;
  });
  remote.set('projects/p', record);
  await resolveConflict(owner, 'projects/p', 'remote', transport);
  expect((await loadData(owner)).projects[0].name).toBe('cloud');
  expect((await loadData(owner)).audit.filter((a) => a.action.startsWith('resolve-'))).toHaveLength(
    2,
  );
});
it('decodes legacy trips without changing IDs and rejects malformed cloud records', () => {
  const decoded = decodeCloudRecord('trips', trip.id, {
    ...trip,
    syncStatus: 'synced',
    serverUpdatedAt: {},
  });
  expect(decoded.id).toBe(trip.id);
  expect(decoded.operationId).toContain('legacy-');
  expect(decoded.payload).not.toHaveProperty('syncStatus');
  expect(() =>
    decodeCloudRecord('projects', 'wrong', cloudProject() as unknown as Record<string, unknown>),
  ).toThrow('ID');
  expect(() => decodeCloudRecord('trips', 'trip', { ...trip, time: '99:99' })).toThrow();
  expect(canonical({ z: 1, a: 2 })).toBe(canonical({ a: 2, z: 1 }));
});
it('serializes overlapping sync requests and retains partial successes for the next retry', async () => {
  const owner = crypto.randomUUID(),
    { transport } = memoryTransport();
  await persistData(owner, fixture());
  const original = transport.push;
  transport.push = vi.fn(async (uid: string, kind: EntityCollection, entry: SyncEntry) => {
    if (kind === 'masters') throw Error('offline');
    return original(uid, kind, entry);
  });
  const result = await Promise.allSettled([
    synchronize(owner, transport),
    synchronize(owner, transport),
  ]);
  expect(result.filter((r) => r.status === 'rejected')).toHaveLength(1);
  const data = await loadData(owner);
  expect(data.sync!.entries['projects/p'].status).toBe('synced');
  expect(data.sync!.entries['masters/truck'].status).toBe('pending');
  transport.push = original;
  await synchronize(owner, transport);
  expect((await loadData(owner)).trips[0].syncStatus).toBe('synced');
});

it('preserves partial acknowledgements and the durable queue when authentication expires mid-sync, then resumes idempotently', async () => {
  const owner = crypto.randomUUID();
  const { transport, remote } = memoryTransport();
  await persistData(owner, fixture());
  const push = transport.push;
  let expired = true;
  transport.push = vi.fn(async (uid, collection, entry) => {
    if (collection === 'masters' && expired)
      throw Object.assign(Error('authentication expired'), { code: 'unauthenticated' });
    return push(uid, collection, entry);
  });
  const status = vi.fn();
  await expect(synchronize(owner, transport, () => true, status)).rejects.toThrow(
    'authentication expired',
  );
  const interrupted = await loadData(owner);
  expect(interrupted.sync!.entries['projects/p'].status).toBe('synced');
  expect(interrupted.sync!.entries['masters/truck'].status).toBe('pending');
  expect(interrupted.sync!.entries['trips/trip'].status).toBe('pending');
  expect(interrupted.trips[0].syncStatus).toBe('pending');
  expect(status).not.toHaveBeenCalledWith('ตรวจสอบกับ Cloud แล้ว ข้อมูลซิงก์ครบ');
  const operation = interrupted.sync!.entries['masters/truck'].desired.operationId;
  expired = false;
  await synchronize(owner, transport);
  expect(transport.authorize).toHaveBeenCalledTimes(2);
  expect(remote.size).toBe(3);
  expect(remote.get('masters/truck')!.operationId).toBe(operation);
  expect((await loadData(owner)).trips[0].syncStatus).toBe('synced');
});
