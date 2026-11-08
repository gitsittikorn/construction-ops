import { Blob as NodeBlob } from 'node:buffer';
beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(() => vi.unstubAllGlobals());
import { previewLocalRestore, applyLocalRestore } from '../backupRestore';
import { loadData, openLocalDatabase, persistData, updateData } from '../storage';
import { fixture, project } from './syncFixtures';
import { emptyData, type Data } from '../models';
import { readBlobBytes } from '../files';

function backup(owner: string, state: Data, uploads: unknown[] = [], extras = {}) {
  return new Blob([
    JSON.stringify({
      format: 'construction-ops-backup',
      version: 1,
      owner,
      exportedAt: new Date().toISOString(),
      state,
      uploads,
      ...extras,
    }),
  ]);
}
const attachment = (owner: string) => ({
  id: crypto.randomUUID(),
  owner,
  projectId: 'p',
  tripId: 'trip',
  name: 'slip.pdf',
  mimeType: 'application/pdf',
  size: 4,
  createdAt: new Date().toISOString(),
  status: 'pending',
  driveId: 'existing-operation',
  folderId: 'untrusted-folder',
  error: '',
  blobBase64: btoa('test'),
});
it('previews missing records and restores bytes atomically without importing cloud acknowledgements or folder targets', async () => {
  const owner = crypto.randomUUID(),
    source = fixture(),
    upload = attachment(owner);
  source.sync = {
    schemaVersion: 1,
    entries: {},
    cursors: {},
    adminVerifiedAt: 'untrusted',
    restoredAt: 'untrusted',
  };
  const preview = await previewLocalRestore(
    owner,
    backup(owner, source, [upload], { driveSettings: { rootId: 'untrusted-folder' } }),
  );
  expect(preview.added).toBe(3);
  expect((await loadData(owner)).projects).toHaveLength(0);
  await applyLocalRestore(owner, preview);
  const restored = await loadData(owner);
  expect(restored.projects).toEqual(source.projects);
  expect(restored.trips[0].syncStatus).toBe('pending');
  expect(restored.sync?.adminVerifiedAt).toBeUndefined();
  expect(restored.sync?.restoredAt).toBeUndefined();
  expect(Object.values(restored.sync!.entries).every((entry) => entry.status === 'pending')).toBe(
    true,
  );
  const db = await openLocalDatabase();
  const file = await db.get('uploads', upload.id);
  expect(new TextDecoder().decode(await readBlobBytes(file.blob))).toBe('test');
  expect(file.folderId).toBe('');
  expect(file.status).toBe('error');
  expect(await db.get('driveSettings', owner)).toBeUndefined();
  db.close();
  await expect(applyLocalRestore(owner, preview)).rejects.toThrow('หมดอายุ');
});
it('keeps changed records, current attachments, tombstones and audit history', async () => {
  const owner = crypto.randomUUID(),
    current = fixture();
  current.projects[0].name = 'Current';
  current.deletedProjects = [{ ...project, id: 'deleted', deletedAt: new Date().toISOString() }];
  await persistData(owner, current);
  const upload = attachment(owner),
    db = await openLocalDatabase();
  await db.put('uploads', { ...upload, blobBase64: undefined, blob: new Blob(['live']) });
  db.close();
  const source = fixture();
  source.projects.push({ ...project, id: 'deleted' }, { ...project, id: 'new-project' });
  source.deletedProjects = [
    { ...project, id: 'backup-deleted', deletedAt: new Date().toISOString() },
  ];
  const preview = await previewLocalRestore(owner, backup(owner, source, [upload]));
  expect(preview.conflicts).toEqual(['projects/p', 'projects/deleted']);
  expect(preview.identical).toBe(2);
  expect(preview.deletedSkipped).toBe(1);
  expect(preview.filesKept).toBe(1);
  await applyLocalRestore(owner, preview);
  const result = await loadData(owner);
  expect(result.projects.map((p) => p.name)).toEqual(['Current', 'Site']);
  expect(result.deletedProjects).toEqual(current.deletedProjects);
  expect(result.audit.at(-1)?.action).toBe('restore-missing-only');
  const check = await openLocalDatabase();
  expect(
    new TextDecoder().decode(await readBlobBytes((await check.get('uploads', upload.id)).blob)),
  ).toBe('live');
  check.close();
});
it('rejects wrong accounts, versions, corrupt schemas, broken references and attachment bytes without writing', async () => {
  const owner = crypto.randomUUID();
  for (const file of [
    backup('another', fixture()),
    backup(owner, fixture(), [], { version: 2 }),
    backup(owner, { ...fixture(), projects: [] }),
    backup(owner, { ...fixture(), trips: [{ ...fixture().trips[0], capacityPerTrip: -1 }] }),
    backup(owner, fixture(), [{ ...attachment(owner), blobBase64: 'bad!' }]),
    backup(owner, fixture(), [{ ...attachment(owner), blobBase64: null }]),
    backup(owner, fixture(), [{ ...attachment(owner), projectId: 'missing' }]),
  ])
    await expect(previewLocalRestore(owner, file)).rejects.toThrow();
  expect(await loadData(owner)).toEqual(emptyData);
});
it('rejects a stale preview or an account switch and preserves newer state', async () => {
  const owner = crypto.randomUUID(),
    file = backup(owner, fixture());
  const preview = await previewLocalRestore(owner, file);
  await updateData(owner, (data) => ({ ...data, projects: [{ ...project, name: 'Newer' }] }));
  await expect(applyLocalRestore(owner, preview)).rejects.toThrow('ข้อมูลเปลี่ยน');
  expect((await loadData(owner)).projects[0].name).toBe('Newer');
  const second = await previewLocalRestore(owner, file);
  await expect(applyLocalRestore(owner, second, () => false)).rejects.toThrow('บัญชีเปลี่ยน');
  expect((await loadData(owner)).trips).toEqual([]);
});
it('rolls back added files and records together when storage is full, and allows retry', async () => {
  const owner = crypto.randomUUID(),
    upload = attachment(owner);
  const preview = await previewLocalRestore(owner, backup(owner, fixture(), [upload]));
  const put = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    if (this.name === 'state' && key === owner)
      throw new DOMException('Storage full', 'QuotaExceededError');
    return put.call(this, value, key);
  });
  try {
    await expect(applyLocalRestore(owner, preview)).rejects.toHaveProperty(
      'name',
      'QuotaExceededError',
    );
  } finally {
    spy.mockRestore();
  }
  expect(await loadData(owner)).toEqual(emptyData);
  const db = await openLocalDatabase();
  expect(await db.get('uploads', upload.id)).toBeUndefined();
  expect(await db.get('state', ['phase1-backup', owner])).toBeUndefined();
  db.close();
  await applyLocalRestore(owner, preview);
  expect((await loadData(owner)).trips).toHaveLength(1);
});
it('reopens restored verified days for fresh checks while retaining closure snapshots and the original in audit', async () => {
  const owner = crypto.randomUUID(),
    source = fixture();
  const row = {
    id: 'row',
    truckId: 'truck',
    driverId: '',
    teamId: '',
    sourceId: '',
    soilType: '',
    tripCount: 0,
    capacity: 12,
    reportedTrips: 0,
    notes: '',
  };
  const proof = {
    fingerprint: 'old-proof',
    evidenceId: 'old-evidence',
    fileIds: ['old-file'],
    by: owner,
    at: new Date().toISOString(),
  };
  const closure = {
    at: proof.at,
    by: owner,
    rows: [row],
    verifications: { row: proof },
    trips: 0,
    volume: 0,
  };
  const session = {
    ...project,
    id: 'daily-p-2026-11-06',
    recordType: 'daily' as const,
    projectId: 'p',
    body: {
      date: '2026-11-06',
      version: 1,
      state: 'closed' as const,
      rows: [row],
      verifications: { row: proof },
      closures: [closure],
      reason: '',
    },
  };
  // Workspace records contain only the workspace schema, not project fields.
  source.workspaces = [
    {
      id: session.id,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      name: 'Closed day',
      recordType: 'daily',
      projectId: 'p',
      body: session.body,
    },
  ];
  const preview = await previewLocalRestore(owner, backup(owner, source));
  expect(preview.daysToRecheck).toBe(1);
  await applyLocalRestore(owner, preview);
  const restored = await loadData(owner),
    daily = restored.workspaces![0];
  if (daily.recordType !== 'daily') throw Error('wrong record');
  expect(daily.body.state).toBe('reopened');
  expect(daily.body.verifications).toEqual({});
  expect(daily.body.closures).toEqual([closure]);
  expect(restored.audit.at(-1)?.before).toEqual({ importedDailyStates: source.workspaces });
});
