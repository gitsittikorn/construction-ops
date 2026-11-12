import { authorizeCloud, pullCloud, pushCloudRecord } from '../cloudFirestore';
import { CloudConflict } from '../cloudSync';
import { cloudProject, cloudRecords, fixture, project } from './syncFixtures';
import { prepareSync } from '../syncModel';

const sdk = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  owner: vi.fn(() => ({})),
}));
vi.mock('../firebase', () => ({ ownerDatabase: sdk.owner }));
vi.mock('firebase/firestore', async (original) => ({
  ...(await original<typeof import('firebase/firestore')>()),
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
  documentId: () => '__name__',
  query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
  where: (...args: unknown[]) => ({ where: args }),
  orderBy: (field: string) => ({ orderBy: field }),
  startAfter: (snapshot: unknown) => ({ startAfter: snapshot }),
  limit: (count: number) => ({ limit: count }),
  serverTimestamp: () => 'server-time',
  getDocFromServer: sdk.getDoc,
  getDocsFromServer: sdk.getDocs,
  runTransaction: async (_db: unknown, callback: (tx: unknown) => unknown) =>
    callback({ get: sdk.get, set: sdk.set }),
}));
const missing = () => ({ exists: () => false });
const found = (record: unknown) => ({ exists: () => true, data: () => record });
beforeEach(() => {
  vi.clearAllMocks();
  sdk.owner.mockImplementation(() => ({}));
  sdk.get.mockResolvedValue(missing());
  sdk.getDoc.mockResolvedValue(found({ enabled: true }));
  sdk.getDocs.mockResolvedValue({ docs: [], size: 0 });
});
it('requires an enabled admin and never treats a cached snapshot as server authorization', async () => {
  await authorizeCloud('admin');
  expect(sdk.getDoc).toHaveBeenCalledWith('admins/admin');
  sdk.getDoc.mockResolvedValue(found({ enabled: false }));
  await expect(authorizeCloud('admin')).rejects.toThrow('Admin');
  sdk.getDoc.mockResolvedValue(missing());
  await expect(authorizeCloud('admin')).rejects.toThrow('Admin');
  sdk.owner.mockImplementation(() => {
    throw Error('wrong account');
  });
  await expect(authorizeCloud('other')).rejects.toThrow('wrong account');
});
it('writes a stable ID and audit together, then reuses an acknowledged replay', async () => {
  const entry = prepareSync(fixture(), fixture()).sync!.entries['projects/p'];
  expect(await pushCloudRecord('admin', 'projects', entry)).toEqual(entry.desired);
  expect(sdk.set).toHaveBeenCalledWith('users/admin/projects/p', {
    ...entry.desired,
    serverUpdatedAt: 'server-time',
  });
  expect(sdk.set).toHaveBeenCalledWith(
    `users/admin/audit/${entry.desired.operationId}`,
    expect.objectContaining({ actor: 'admin' }),
  );
  sdk.set.mockClear();
  sdk.get.mockResolvedValue(found(entry.desired));
  await pushCloudRecord('admin', 'projects', entry);
  expect(sdk.set).not.toHaveBeenCalled();
});
it('compares exact base versions and rejects conflicts even when the local edit counter is higher', async () => {
  const base = cloudProject(),
    entry = {
      base,
      desired: {
        ...base,
        revision: 2,
        operationId: 'local',
        payload: { ...project, name: 'local edit' },
      },
      status: 'pending' as const,
    };
  const remote = {
    ...base,
    revision: 2,
    operationId: 'remote',
    payload: { ...project, name: 'remote edit' },
  };
  sdk.get.mockResolvedValue(found(remote));
  await expect(pushCloudRecord('admin', 'projects', entry)).rejects.toBeInstanceOf(CloudConflict);
  expect(sdk.set).not.toHaveBeenCalled();
  sdk.get.mockResolvedValue(found(base));
  await pushCloudRecord('admin', 'projects', entry);
  expect(sdk.set).toHaveBeenCalledWith(
    'users/admin/projects/p',
    expect.objectContaining({ revision: 2 }),
  );
});
it('uses transactional uniqueness claims to reject duplicate truck plates across devices', async () => {
  const entry = prepareSync(fixture(), fixture()).sync!.entries['masters/truck'];
  sdk.get.mockImplementation(async (ref: string) =>
    ref.includes('/uniqueKeys/') ? found({ entityId: 'another-truck', active: true }) : missing(),
  );
  await expect(pushCloudRecord('admin', 'masters', entry)).rejects.toThrow('ซ้ำ');
  expect(sdk.set).not.toHaveBeenCalled();
  sdk.get.mockResolvedValue(missing());
  await pushCloudRecord('admin', 'masters', entry);
  expect(sdk.set).toHaveBeenCalledWith(expect.stringContaining('/uniqueKeys/'), {
    entityId: 'truck',
    active: true,
  });
});
it('claims a driver atomically with a plate and refuses an already assigned driver before any writes', async () => {
  const data = fixture();
  data.masters[0] = { ...data.masters[0], driverId: 'driver' };
  const entry = prepareSync(data, data).sync!.entries['masters/truck'];
  sdk.get.mockImplementation(async (ref: string) =>
    ref.endsWith('/driver-driver') ? found({ entityId: 'another-truck', active: true }) : missing(),
  );
  await expect(pushCloudRecord('admin', 'masters', entry)).rejects.toThrow('มีรถประจำ');
  expect(sdk.set).not.toHaveBeenCalled();
  sdk.get.mockResolvedValue(missing());
  await pushCloudRecord('admin', 'masters', entry);
  expect(sdk.set).toHaveBeenCalledWith('users/admin/uniqueKeys/driver-driver', {
    entityId: 'truck',
    active: true,
  });
});
it('paginates initial restore and uses a conservative timestamp before switching to incremental queries', async () => {
  const rows = Array.from({ length: 200 }, (_, i) => {
    const id = `p-${i}`,
      record = {
        ...cloudProject(),
        id,
        payload: { ...project, id },
        serverUpdatedAt: { seconds: 10 + i, nanoseconds: 0 },
      };
    return { id, data: () => record };
  });
  sdk.getDocs
    .mockResolvedValueOnce({ docs: rows, size: 200 })
    .mockResolvedValueOnce({ docs: [], size: 0 });
  const result = await pullCloud('admin', {});
  expect(result.records).toHaveLength(200);
  expect(result.cursors.projects).toEqual({ seconds: 0, nanoseconds: 0 });
  expect(sdk.getDocs.mock.calls[1][0].constraints).toContainEqual({ startAfter: rows[199] });
  sdk.getDocs.mockClear();
  await pullCloud('admin', result.cursors);
  expect(sdk.getDocs.mock.calls[0][0].constraints).toContainEqual({
    where: ['serverUpdatedAt', '>=', expect.objectContaining({ seconds: 0 })],
  });
  expect(sdk.getDocs.mock.calls[0][0].constraints).toContainEqual({ orderBy: '__name__' });
});
it('refuses unknown schemas or partial download failures instead of returning a successful batch', async () => {
  sdk.getDocs.mockResolvedValueOnce({
    docs: [{ id: 'p', data: () => ({ ...cloudProject(), schemaVersion: 2 }) }],
    size: 1,
  });
  await expect(pullCloud('admin', {})).rejects.toThrow('Schema');
  sdk.getDocs
    .mockResolvedValueOnce({
      docs: cloudRecords()
        .filter((row) => row.collection === 'projects')
        .map((row) => ({ id: row.record.id, data: () => row.record })),
      size: 1,
    })
    .mockRejectedValueOnce(Error('permission-denied'));
  await expect(pullCloud('admin', {})).rejects.toThrow('permission-denied');
});
it('bounds slow server requests and retains network errors for safe retry', async () => {
  vi.useFakeTimers();
  try {
    sdk.getDoc.mockImplementation(() => new Promise(() => {}));
    const pending = authorizeCloud('admin');
    const check = expect(pending).rejects.toThrow('ข้อมูลยังอยู่ในเครื่อง');
    await vi.advanceTimersByTimeAsync(25001);
    await check;
  } finally {
    vi.useRealTimers();
  }
  sdk.get.mockRejectedValueOnce(Error('permission-denied'));
  await expect(
    pushCloudRecord(
      'admin',
      'projects',
      prepareSync(fixture(), fixture()).sync!.entries['projects/p'],
    ),
  ).rejects.toThrow('permission-denied');
  expect(sdk.set).not.toHaveBeenCalled();
});
