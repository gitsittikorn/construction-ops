import { vi, beforeEach, afterEach, it, expect } from 'vitest';
const mocks = vi.hoisted(() => ({
  uid: 'owner',
  idToken: vi.fn().mockResolvedValue('firebase-id-token'),
}));
vi.mock('../firebase', () => ({
  getSessionIdentity: () => (mocks.uid ? { uid: mocks.uid, email: 'owner@example.com' } : null),
  getFirebaseIdToken: (...args: unknown[]) => mocks.idToken(...args),
}));
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_DRIVE_BACKEND_URL', 'https://backend.example.com');
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test.apps.googleusercontent.com');
  mocks.uid = 'owner';
  mocks.idToken.mockReset().mockResolvedValue('firebase-id-token');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete window.google;
});
it('authenticates session renewal using Firebase, includes CSRF header and sends no static API key', async () => {
  const session = { token: 'access', expiresAt: Date.now() + 3600000 };
  const fetch = vi.fn().mockResolvedValue(response(session));
  vi.stubGlobal('fetch', fetch);
  const { restoreDriveConnection } = await import('../driveBackend');
  await expect(restoreDriveConnection(true)).resolves.toEqual(session);
  expect(fetch).toHaveBeenCalledWith(
    'https://backend.example.com/api/drive/session',
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer firebase-id-token',
        'X-Requested-With': 'XMLHttpRequest',
      }),
      body: JSON.stringify({ force: true }),
      redirect: 'error',
    }),
  );
});
it('uses GIS code flow and exchanges only the authorization code with the backend', async () => {
  let requested = false;
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: () => {
          throw Error('legacy token flow must not be used');
        },
        initCodeClient: (options) => ({
          requestCode: () => {
            requested = true;
            options.callback({ code: 'one-time-code' });
          },
        }),
      },
    },
  };
  const fetch = vi
    .fn()
    .mockResolvedValue(response({ token: 'access', expiresAt: Date.now() + 3600000 }));
  vi.stubGlobal('fetch', fetch);
  const { requestDriveToken } = await import('../drive');
  const pending = requestDriveToken('owner@example.com');
  expect(requested).toBe(true);
  await expect(pending).resolves.toMatchObject({ token: 'access' });
  expect(fetch).toHaveBeenCalledWith(
    'https://backend.example.com/api/drive/exchange',
    expect.objectContaining({ body: JSON.stringify({ code: 'one-time-code' }) }),
  );
});
it('reports missing consent separately from backend failures without exposing provider errors', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response({ error: 'reconnect_required' }, 409))
      .mockResolvedValueOnce(response({ error: 'provider_secret_value' }, 503)),
  );
  const { restoreDriveConnection } = await import('../driveBackend');
  await expect(restoreDriveConnection()).rejects.toMatchObject({ code: 'reconnect_required' });
  await expect(restoreDriveConnection()).rejects.toMatchObject({ code: 'service_unavailable' });
});
it('rejects malformed and expired access tokens rather than claiming a restored connection', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response({ token: 'expired', expiresAt: Date.now() - 1 }))
      .mockResolvedValueOnce(response({ refresh_token: 'should-never-be-returned' })),
  );
  const { restoreDriveConnection } = await import('../driveBackend');
  await expect(restoreDriveConnection()).rejects.toMatchObject({ code: 'invalid_response' });
  await expect(restoreDriveConnection()).rejects.toMatchObject({ code: 'invalid_response' });
});
it('discards a response if the Firebase user changes during the request', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => {
      mocks.uid = 'other';
      return response({ token: 'owner-access', expiresAt: Date.now() + 3600000 });
    }),
  );
  const { restoreDriveConnection } = await import('../driveBackend');
  await expect(restoreDriveConnection()).rejects.toMatchObject({ code: 'unauthorized' });
});
it('refuses to send Firebase credentials to an insecure remote backend', async () => {
  vi.stubEnv('VITE_DRIVE_BACKEND_URL', 'http://remote.example.com');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const { restoreDriveConnection } = await import('../driveBackend');
  await expect(restoreDriveConnection()).rejects.toMatchObject({ code: 'invalid_backend_url' });
  expect(fetch).not.toHaveBeenCalled();
});
it('deletes the backend connection using the same authenticated transport', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetch);
  const { disconnectDriveBackend } = await import('../driveBackend');
  await expect(disconnectDriveBackend()).resolves.toBeNull();
  expect(fetch).toHaveBeenCalledWith(
    'https://backend.example.com/api/drive/connection',
    expect.objectContaining({ method: 'DELETE', body: undefined }),
  );
});
