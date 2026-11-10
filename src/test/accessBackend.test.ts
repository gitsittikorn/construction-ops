import { setWorkspaceSession } from '../workspaceIdentity';
const auth = vi.hoisted(() => ({ uid: 'worker', token: vi.fn() }));
vi.mock('../firebase', () => ({
  getSessionIdentity: () => ({ uid: auth.uid, email: 'worker@example.com' }),
  getFirebaseIdToken: auth.token,
}));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_ACCESS_BACKEND_URL', 'https://access.example.com');
  auth.uid = 'worker';
  auth.token.mockReset().mockResolvedValue('synthetic-id-token');
  setWorkspaceSession(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  setWorkspaceSession(null);
});
const scope = {
  actorUid: 'worker',
  companyId: 'company',
  role: 'operator',
  accessRole: 'staff',
  accessPolicy: 'allowlist-v1',
  name: 'Company',
};
it('uses the Firebase identity and exact company header, validates aliases, and never accepts a forged returned scope', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(scope)));
  vi.stubGlobal('fetch', fetcher);
  const { resolveAccessCompany } = await import('../accessBackend');
  expect(await resolveAccessCompany('worker', 'company')).toMatchObject(scope);
  expect(fetcher.mock.calls[0][1].headers).toMatchObject({
    'X-Company-ID': 'company',
    'X-Requested-With': 'XMLHttpRequest',
    Authorization: 'Bearer synthetic-id-token',
  });
  fetcher.mockResolvedValue(new Response(JSON.stringify({ ...scope, role: 'owner' })));
  await expect(resolveAccessCompany('worker', 'company')).rejects.toThrow('ไม่ถูกต้อง');
  fetcher.mockResolvedValue(new Response(JSON.stringify({ ...scope, actorUid: 'foreign' })));
  await expect(resolveAccessCompany('worker', 'company')).rejects.toThrow('ไม่ถูกต้อง');
});
it('cancels mutations when the actor changes during the token await and suppresses provider details', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  auth.token.mockImplementation(async () => {
    auth.uid = 'other';
    return 'token';
  });
  const { saveAccessUser } = await import('../accessBackend');
  const input = {
    email: 'staff@example.com',
    name: 'Staff',
    role: 'staff' as const,
    status: 'enabled' as const,
    expectedRevision: null,
  };
  await expect(saveAccessUser('company', input)).rejects.toThrow('บัญชีเปลี่ยน');
  expect(fetcher).not.toHaveBeenCalled();
  auth.uid = 'worker';
  auth.token.mockResolvedValue('token');
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ error: 'private_provider_secret' }), { status: 503 }),
  );
  await expect(saveAccessUser('company', input)).rejects.not.toThrow('private_provider_secret');
});
it('maps last-super-admin and disabled-account errors to safe recoverable messages', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'last_super_admin' }), { status: 409 }),
      ),
  );
  const { saveAccessUser } = await import('../accessBackend');
  await expect(
    saveAccessUser('company', {
      email: 'root@example.com',
      name: 'Root',
      role: 'super_admin',
      status: 'disabled',
      expectedRevision: 1,
    }),
  ).rejects.toThrow('อย่างน้อย 1 คน');
});

it('allows only an explicitly unsupported old endpoint to fall back to legacy discovery', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })),
  );
  const { listAccessCompanies } = await import('../accessBackend');
  expect(await listAccessCompanies()).toEqual([]);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'access_denied' }), { status: 403 })),
  );
  await expect(listAccessCompanies()).rejects.toHaveProperty('code', 'permission-denied');
});
