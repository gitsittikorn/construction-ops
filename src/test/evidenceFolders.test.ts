import { webcrypto } from 'node:crypto';
import { ensureEvidenceFolder } from '../evidenceFolders';
const mock = vi.hoisted(() => ({ generate: vi.fn(), folder: vi.fn(), resolve: vi.fn() }));
vi.mock('../drive', () => ({ generateDriveIds: mock.generate, ensureDriveFolder: mock.folder }));
vi.mock('../firebase', () => ({ resolveEvidenceFolder: mock.resolve }));
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  let index = 0;
  mock.generate.mockImplementation(async () => [`candidate-${index++}`]);
  mock.folder.mockResolvedValue(undefined);
  mock.resolve.mockImplementation(async (_owner, _key, candidate) => candidate);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it('creates date/person/category hierarchy by stable mapping IDs rather than folder names', async () => {
  const record = {
    owner: 'admin',
    evidenceId: 'e',
    driverId: 'driver',
    truckId: 'truck',
    driverName: 'สมชาย',
    truckName: '00123',
    workDate: '2026-11-06',
    category: 'driver-photo',
  } as never;
  expect(await ensureEvidenceFolder('token', record, 'documents')).toBe('candidate-2');
  expect(mock.folder).toHaveBeenNthCalledWith(1, 'token', 'candidate-0', '2026-11-06', 'documents');
  expect(mock.folder).toHaveBeenNthCalledWith(
    2,
    'token',
    'candidate-1',
    'สมชาย - 00123',
    'candidate-0',
  );
  expect(mock.folder).toHaveBeenNthCalledWith(
    3,
    'token',
    'candidate-2',
    'Driver Evidence',
    'candidate-1',
  );
  expect(mock.resolve.mock.calls.every((call) => call[1].length === 64)).toBe(true);
});
it('reuses winning IDs across retries and retains the generic document path for older files', async () => {
  expect(await ensureEvidenceFolder('token', {} as never, 'documents')).toBe('documents');
  expect(mock.resolve).not.toHaveBeenCalled();
  mock.resolve.mockImplementation(async (_owner, _key, candidate) => ({
    ...candidate,
    id: `stable-${candidate.name}`,
  }));
  const record = {
    owner: 'admin',
    evidenceId: 'e',
    driverId: 'd',
    truckId: 't',
    workDate: '2026-11-06',
    category: 'trip-slip',
  } as never;
  expect(await ensureEvidenceFolder('token', record, 'documents')).toBe('stable-Trip Slips');
  mock.resolve.mockRejectedValueOnce(Error('permission-denied'));
  await expect(ensureEvidenceFolder('token', record, 'documents')).rejects.toThrow(
    'permission-denied',
  );
});
