import {
  DriveError,
  generateDriveIds,
  verifyDriveAccount,
  ensureDriveFolder,
  uploadOriginal,
  downloadOriginal,
  downloadVerifiedOriginal,
  validateUploadedFile,
  driveScope,
} from '../drive';
import type { UploadRecord } from '../uploads';
const item: UploadRecord = {
  id: 'operation',
  owner: 'uid',
  projectId: 'project',
  tripId: '',
  name: 'photo.jpg',
  mimeType: 'image/jpeg',
  size: 3,
  createdAt: 'now',
  status: 'pending',
  driveId: 'file-id',
  folderId: 'folder',
  error: '',
  blob: new Blob(['abc']),
};
const remote = {
  id: 'file-id',
  size: '3',
  mimeType: 'image/jpeg',
  parents: ['folder'],
  appProperties: { operationId: 'operation', owner: 'uid' },
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

it('downloads only a matching private original and rejects foreign metadata or truncated media', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const record = { ...item, status: 'synced' as const };
  fetch
    .mockResolvedValueOnce(json(remote))
    .mockResolvedValueOnce(new Response('abc', { headers: { 'Content-Type': 'image/jpeg' } }));
  expect((await downloadVerifiedOriginal('test', record)).size).toBe(3);
  fetch.mockResolvedValueOnce(
    json({ ...remote, appProperties: { ...remote.appProperties, owner: 'other' } }),
  );
  await expect(downloadVerifiedOriginal('test', record)).rejects.toThrow('ไม่ตรง');
  fetch
    .mockResolvedValueOnce(json(remote))
    .mockResolvedValueOnce(new Response('a', { headers: { 'Content-Type': 'image/jpeg' } }));
  await expect(downloadVerifiedOriginal('test', record)).rejects.toThrow('ไม่ตรง');
  fetch.mockResolvedValueOnce(json({}, 404));
  await expect(downloadVerifiedOriginal('test', record)).rejects.toThrow('ไม่พบ');
  await expect(downloadVerifiedOriginal('test', item)).rejects.toThrow('ยืนยัน');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete window.google;
  vi.resetModules();
});
it('times out an OAuth popup that never calls back and allows another attempt', async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test.apps.googleusercontent.com');
  window.google = {
    accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken: vi.fn() }) } },
  };
  const { requestDriveToken } = await import('../drive');
  const result = expect(requestDriveToken('owner@company.com')).rejects.toThrow('นานเกินไป');
  await vi.advanceTimersByTimeAsync(90001);
  await result;
});
it('verifies the connected Drive belongs to the signed in Firebase email', async () => {
  const fetch = vi.fn().mockResolvedValue(json({ user: { emailAddress: 'owner@company.com' } }));
  vi.stubGlobal('fetch', fetch);
  await verifyDriveAccount('token', 'OWNER@company.com');
  await expect(verifyDriveAccount('token', 'someone@company.com')).rejects.toThrow();
});
it('requires every additional OAuth scope and rejects partial consent', async () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test.apps.googleusercontent.com');
  const scope = 'https://www.googleapis.com/auth/spreadsheets.readonly';
  let granted = driveScope;
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (options) => {
          expect(options.scope).toContain(scope);
          return {
            requestAccessToken: () =>
              options.callback({ access_token: 'token', expires_in: 3600, scope: granted }),
          };
        },
      },
    },
  };
  const { requestDriveToken } = await import('../drive');
  await expect(requestDriveToken('owner@company.com', [scope])).rejects.toThrow('ไม่ได้รับสิทธิ์');
  granted = `${driveScope} ${scope}`;
  await expect(requestDriveToken('owner@company.com', [scope])).resolves.toMatchObject({
    token: 'token',
  });
});
it('reports token expiry and permission denial without exposing tokens', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 401)));
  await expect(generateDriveIds('secret-token', 1)).rejects.toMatchObject({ status: 401 });
  expect(new DriveError(403).message).not.toContain('secret-token');
});
it('generates IDs and rejects malformed responses', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(json({ ids: ['a', 'b'] }))
      .mockResolvedValueOnce(json({ ids: [] })),
  );
  expect(await generateDriveIds('token', 2)).toEqual(['a', 'b']);
  await expect(generateDriveIds('token', 1)).rejects.toThrow();
});
it('reuses a verified upload after reload or Firestore failure without creating another file', async () => {
  const fetch = vi.fn().mockResolvedValue(json(remote));
  vi.stubGlobal('fetch', fetch);
  const progress = vi.fn();
  await uploadOriginal('token', item, progress);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][0]).toContain('/files/file-id?');
  expect(progress).toHaveBeenCalledWith(100);
});
it('rejects a remote file with wrong size, owner, operation, parent or trashed status', () => {
  for (const mismatch of [
    { size: '4' },
    { appProperties: { operationId: 'other', owner: 'uid' } },
    { appProperties: { operationId: 'operation', owner: 'other' } },
    { parents: ['other'] },
    { trashed: true },
  ])
    expect(() => validateUploadedFile({ ...remote, ...mismatch }, item)).toThrow();
});
it('creates a private resumable upload using the persisted ID and verifies it afterwards', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(json({}, 404))
    .mockResolvedValueOnce(
      new Response('', {
        status: 200,
        headers: { Location: 'https://www.googleapis.com/upload/session' },
      }),
    )
    .mockResolvedValueOnce(json(remote));
  vi.stubGlobal('fetch', fetch);
  class XHR {
    status = 200;
    timeout = 0;
    upload: {
      onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void;
    } = {};
    onload = () => {};
    onerror = () => {};
    ontimeout = () => {};
    open = vi.fn();
    setRequestHeader = vi.fn();
    send() {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 3, total: 3 });
      this.onload();
    }
  }
  vi.stubGlobal('XMLHttpRequest', XHR);
  const progress = vi.fn();
  await uploadOriginal('token', item, progress);
  const body = JSON.parse(fetch.mock.calls[1][1].body);
  expect(body.id).toBe('file-id');
  expect(body.parents).toEqual(['folder']);
  expect(body.permissions).toBeUndefined();
  expect(progress).toHaveBeenLastCalledWith(100);
});
it('rejects suspicious resumable locations without sending file bytes', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(
        new Response('', { status: 200, headers: { Location: 'https://other.test/upload' } }),
      ),
  );
  await expect(uploadOriginal('token', item, vi.fn())).rejects.toThrow();
});
it('does not duplicate existing folders and refuses a trashed folder', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      json({ id: 'f', mimeType: 'application/vnd.google-apps.folder', parents: ['p'] }),
    )
    .mockResolvedValueOnce(
      json({ id: 'f', mimeType: 'application/vnd.google-apps.folder', trashed: true }),
    );
  vi.stubGlobal('fetch', fetch);
  await ensureDriveFolder('token', 'f', 'Documents', 'p');
  expect(fetch).toHaveBeenCalledOnce();
  await expect(ensureDriveFolder('token', 'f', 'Documents', 'p')).rejects.toThrow();
});
it('renames a legacy project folder by ID without creating or moving it', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      json({
        id: 'legacy',
        name: 'uuid-old-name',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['projects'],
      }),
    )
    .mockResolvedValueOnce(json({ id: 'legacy', name: 'Site A' }));
  vi.stubGlobal('fetch', fetch);
  await ensureDriveFolder('token', 'legacy', 'Site A', 'projects', true);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][0]).toContain('/files/legacy?');
  expect(fetch.mock.calls[1][1].method).toBe('PATCH');
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ name: 'Site A' });
});
it('does not rename an existing project folder when its name is already correct', async () => {
  const fetch = vi.fn().mockResolvedValue(
    json({
      id: 'same-id',
      name: 'Site A',
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['projects'],
    }),
  );
  vi.stubGlobal('fetch', fetch);
  await ensureDriveFolder('token', 'same-id', 'Site A', 'projects', true);
  expect(fetch).toHaveBeenCalledOnce();
});
it('reports rename permission errors without falling back to a duplicate folder', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      json({
        id: 'legacy',
        name: 'old',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['projects'],
      }),
    )
    .mockResolvedValueOnce(json({}, 403));
  vi.stubGlobal('fetch', fetch);
  await expect(
    ensureDriveFolder('token', 'legacy', 'New name', 'projects', true),
  ).rejects.toMatchObject({ status: 403 });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false);
});
it('creates a new project folder with a readable name and stable reserved ID', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(json({}, 404))
    .mockResolvedValueOnce(json({ id: 'new-id' }));
  vi.stubGlobal('fetch', fetch);
  await ensureDriveFolder('token', 'new-id', 'โครงการถมดิน', 'projects', true);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    id: 'new-id',
    name: 'โครงการถมดิน',
    mimeType: 'application/vnd.google-apps.folder',
    parents: ['projects'],
  });
});
it('downloads only on demand with bearer authentication', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('abc'));
  vi.stubGlobal('fetch', fetch);
  expect((await downloadOriginal('token', 'file-id')).size).toBe(3);
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
});
it('requests only drive.file and holds credentials in memory', async () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test.apps.googleusercontent.com');
  const request = vi.fn();
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (options) => {
          setTimeout(
            () => options.callback({ access_token: 'token', expires_in: 3600, scope: driveScope }),
            0,
          );
          return { requestAccessToken: request };
        },
      },
    },
  };
  const { requestDriveToken } = await import('../drive');
  const result = await requestDriveToken('owner@company.com');
  expect(result.token).toBe('token');
  expect(result.expiresAt).toBeGreaterThan(Date.now());
  expect(request).toHaveBeenCalledWith({ prompt: '' });
});
it('rejects missing consent, closed popup and missing setup', async () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test.apps.googleusercontent.com');
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (options) => {
          setTimeout(() => options.callback({ error: 'access_denied' }), 0);
          return { requestAccessToken: vi.fn() };
        },
      },
    },
  };
  const { requestDriveToken } = await import('../drive');
  await expect(requestDriveToken('owner@company.com')).rejects.toThrow();
  window.google.accounts.oauth2.initTokenClient = (options) => {
    setTimeout(() => options.error_callback(), 0);
    return { requestAccessToken: vi.fn() };
  };
  await expect(requestDriveToken('owner@company.com')).rejects.toThrow();
  delete window.google;
  await expect(requestDriveToken('owner@company.com')).rejects.toThrow();
});
