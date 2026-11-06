import { restoreDocumentMetadata } from '../documentRecovery';
import { listUploads, putUpload } from '../uploads';
const remote = vi.hoisted(() => ({
  get: vi.fn(),
  owner: vi.fn(() => ({})),
  authorize: vi.fn(async () => {}),
}));
vi.mock('../firebase', () => ({ ownerDatabase: remote.owner }));
vi.mock('../cloudFirestore', () => ({ authorizeCloud: remote.authorize }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
  documentId: () => '__name__',
  query: (...parts: unknown[]) => parts,
  orderBy: (value: string) => value,
  limit: (value: number) => value,
  startAfter: (value: unknown) => value,
  getDocsFromServer: remote.get,
}));
function record(owner: string, id: string) {
  return {
    id,
    owner,
    projectId: 'p',
    tripId: '',
    fileId: `drive-${id}`,
    folderId: 'folder',
    name: 'photo.png',
    mimeType: 'image/png',
    size: 10,
    createdAt: 'now',
    status: 'synced',
    uploadedAt: { seconds: 1, nanoseconds: 0 },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  remote.owner.mockImplementation(() => ({}));
  remote.authorize.mockResolvedValue(undefined);
  remote.get.mockResolvedValue({ docs: [], size: 0 });
});
it('restores immutable cloud references and never overwrites pending originals or another account', async () => {
  const owner = crypto.randomUUID();
  await putUpload({
    id: `pending-${owner}`,
    owner,
    blob: new Blob(['local']),
    status: 'pending',
    size: 5,
  } as never);
  const records = [record(owner, `pending-${owner}`), record(owner, `new-${owner}`)];
  remote.get.mockResolvedValue({
    docs: records.map((r) => ({ id: r.id, data: () => r })),
    size: 2,
  });
  expect(await restoreDocumentMetadata(owner)).toBe(2);
  const uploads = await listUploads(owner);
  expect(uploads.find((u) => u.id === `pending-${owner}`)?.status).toBe('pending');
  expect(uploads.find((u) => u.id === `new-${owner}`)).toMatchObject({
    status: 'synced',
    driveId: `drive-new-${owner}`,
  });
  expect(await listUploads(`other-${owner}`)).toEqual([]);
});
it('rejects unauthorized, malformed and partial downloads before adding any records', async () => {
  const owner = crypto.randomUUID();
  remote.authorize.mockRejectedValueOnce(Error('not admin'));
  await expect(restoreDocumentMetadata(owner)).rejects.toThrow('admin');
  expect(remote.get).not.toHaveBeenCalled();
  remote.get.mockResolvedValueOnce({
    docs: [{ id: 'bad', data: () => record('other', 'bad') }],
    size: 1,
  });
  await expect(restoreDocumentMetadata(owner)).rejects.toThrow('Metadata');
  expect(await listUploads(owner)).toEqual([]);
  remote.get.mockRejectedValueOnce(Error('network failed'));
  await expect(restoreDocumentMetadata(owner)).rejects.toThrow('network');
  expect(await listUploads(owner)).toEqual([]);
});
