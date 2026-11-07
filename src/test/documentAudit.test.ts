import { auditDriveDocuments } from '../documentAudit';
import { listOwnedDriveFiles } from '../drive';
import type { UploadRecord } from '../uploads';
const record: UploadRecord = {
  id: 'operation',
  owner: 'owner',
  driveId: 'file',
  folderId: 'folder',
  status: 'synced',
  name: 'proof.png',
  projectId: 'p',
  tripId: '',
  size: 3,
  mimeType: 'image/png',
  createdAt: 'now',
  error: '',
};
const file = {
  id: 'file',
  name: 'proof.png',
  size: '3',
  mimeType: 'image/png',
  parents: ['folder'],
  appProperties: { owner: 'owner', operationId: 'operation' },
};
it('reports missing, mismatched and unreferenced candidates without changing pending files or records', async () => {
  const pending = {
    ...record,
    id: 'pending',
    driveId: 'pending-file',
    status: 'metadata-pending' as const,
  };
  const records = [record, pending];
  const before = structuredClone(records);
  const transport = {
    active: () => true,
    list: vi.fn(async () => [
      file,
      { ...file, id: 'pending-file', appProperties: { owner: 'owner', operationId: 'pending' } },
      {
        ...file,
        id: 'unmapped',
        name: 'other-device.png',
        appProperties: { owner: 'owner', operationId: 'unknown' },
      },
    ]),
    get: vi.fn(async () => file),
  };
  expect(await auditDriveDocuments('owner', records, transport)).toEqual({
    checked: 1,
    issues: [{ id: 'unmapped', name: 'other-device.png', kind: 'unmapped' }],
  });
  transport.get.mockResolvedValueOnce(null as never);
  expect((await auditDriveDocuments('owner', records, transport)).issues[0].kind).toBe('missing');
  transport.get.mockResolvedValueOnce({ ...file, size: '2' });
  expect((await auditDriveDocuments('owner', records, transport)).issues[0].kind).toBe('mismatch');
  expect(records).toEqual(before);
  expect(transport.get).toHaveBeenCalledTimes(3);
});
it('aborts on account changes and propagates unavailable credentials instead of claiming a successful scan', async () => {
  const transport = {
    active: () => true,
    list: vi.fn(async () => [file]),
    get: vi.fn(async () => file),
  };
  await expect(auditDriveDocuments('foreign', [record], transport)).rejects.toThrow('บัญชี');
  transport.list.mockImplementationOnce(async () => {
    transport.active = () => false;
    return [file];
  });
  await expect(auditDriveDocuments('owner', [record], transport)).rejects.toThrow('บัญชี');
  expect(transport.get).not.toHaveBeenCalled();
  transport.active = () => true;
  transport.list.mockRejectedValueOnce(Error('expired credentials'));
  await expect(auditDriveDocuments('owner', [record], transport)).rejects.toThrow('expired');
});
it('paginates owner-scoped inventory using GET only and refuses repeated or incomplete pages', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ files: [file], nextPageToken: 'next' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ files: [] })));
  vi.stubGlobal('fetch', fetch);
  expect(await listOwnedDriveFiles('synthetic', 'owner')).toEqual([file]);
  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.searchParams.get('q')).toContain("value='owner'");
  expect(new URL(fetch.mock.calls[1][0]).searchParams.get('pageToken')).toBe('next');
  expect(fetch.mock.calls.every((call) => !call[1].method || call[1].method === 'GET')).toBe(true);
  fetch
    .mockReset()
    .mockImplementation(
      async () => new Response(JSON.stringify({ files: [], nextPageToken: 'repeat' })),
    );
  await expect(listOwnedDriveFiles('synthetic', 'owner')).rejects.toThrow('ซ้ำ');
  fetch
    .mockReset()
    .mockResolvedValueOnce(new Response(JSON.stringify({ files: [], incompleteSearch: true })));
  await expect(listOwnedDriveFiles('synthetic', 'owner')).rejects.toThrow('ไม่ครบ');
  vi.unstubAllGlobals();
});
