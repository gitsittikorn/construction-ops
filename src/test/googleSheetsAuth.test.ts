import { requestSheetsToken, verifySheetsAccount } from '../googleSheetsAuth';
import { sheetsReadScope, sheetsWriteScope } from '../truckSheets';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  delete window.google;
});

it.each([sheetsReadScope, sheetsWriteScope])(
  'requests %s with Google identity scopes and no Drive dependency',
  async (scope) => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test.apps.googleusercontent.com');
    vi.resetModules();
    const { requestSheetsToken: request } = await import('../googleSheetsAuth');
    const init = vi.fn<NonNullable<Window['google']>['accounts']['oauth2']['initTokenClient']>(
      (options) => ({
        requestAccessToken: () =>
          options.callback({
            access_token: 'test-token',
            expires_in: 3600,
            scope: `openid email ${scope}`,
          }),
      }),
    );
    window.google = { accounts: { oauth2: { initTokenClient: init } } };
    await expect(request('owner@example.com', scope)).resolves.toMatchObject({
      token: 'test-token',
    });
    expect(init.mock.calls[0][0].scope.split(' ')).toEqual([
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      scope,
    ]);
  },
);

it('rejects unsupported scopes before opening OAuth', async () => {
  await expect(
    requestSheetsToken('owner@example.com', 'https://www.googleapis.com/auth/drive'),
  ).rejects.toThrow('ขอบเขตสิทธิ์');
});

it.each([
  'openid email',
  'openid https://www.googleapis.com/auth/spreadsheets.readonly',
  'email https://www.googleapis.com/auth/spreadsheets.readonly',
])('rejects partial consent: %s', async (granted) => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test.apps.googleusercontent.com');
  vi.resetModules();
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (options) => ({
          requestAccessToken: () =>
            options.callback({ access_token: 'test-token', expires_in: 3600, scope: granted }),
        }),
      },
    },
  };
  const { requestSheetsToken: request } = await import('../googleSheetsAuth');
  await expect(request('owner@example.com', sheetsReadScope)).rejects.toThrow(
    'ไม่ได้รับสิทธิ์ Google Sheets ครบ',
  );
});

it('verifies email directly with Google UserInfo without any Drive API request', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        sub: 'google-id',
        email: 'owner@example.com',
        email_verified: true,
      }),
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  await verifySheetsAccount('test-token', 'OWNER@example.com');
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    'https://openidconnect.googleapis.com/v1/userinfo',
    expect.objectContaining({
      headers: { Authorization: 'Bearer test-token' },
    }),
  );
});

it.each([
  { sub: 'other', email: 'other@example.com', email_verified: true },
  { sub: 'same', email: 'owner@example.com', email_verified: false },
  { email: 'owner@example.com', email_verified: true },
  { sub: 'same', email: 123, email_verified: true },
  null,
])('rejects mismatching or unverified Google identity', async (identity) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(identity))));
  await expect(verifySheetsAccount('test-token', 'owner@example.com')).rejects.toThrow(
    'บัญชีเดียวกับที่เข้าสู่ระบบ',
  );
});

it.each([401, 403, 500])('reports UserInfo HTTP %s without leaking its token', async (status) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
  await expect(verifySheetsAccount('secret', 'owner@example.com')).rejects.toThrow(
    status === 401 ? 'หมดอายุ' : 'ตรวจบัญชี',
  );
});

it('reports network and invalid JSON failures', async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(Error('offline'))
    .mockResolvedValueOnce(new Response('invalid'));
  vi.stubGlobal('fetch', fetcher);
  await expect(verifySheetsAccount('test-token', 'owner@example.com')).rejects.toThrow(
    'อินเทอร์เน็ต',
  );
  await expect(verifySheetsAccount('test-token', 'owner@example.com')).rejects.toThrow(
    'ข้อมูลบัญชี',
  );
});
