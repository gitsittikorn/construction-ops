import {
  getDriveSession,
  saveDriveSession,
  clearDriveSession,
  clearDriveSessions,
} from '../driveSession';
afterEach(() => {
  clearDriveSessions();
  vi.useRealTimers();
});
it('retains a connection across component remounts but isolates accounts', () => {
  saveDriveSession('owner-a', { token: 'test-token', expiresAt: Date.now() + 60000 });
  expect(getDriveSession('owner-a')?.token).toBe('test-token');
  expect(getDriveSession('owner-b')).toBeNull();
});
it('expires credentials rather than pretending the connection lasts forever', () => {
  vi.useFakeTimers();
  saveDriveSession('owner', { token: 'test-token', expiresAt: Date.now() + 1000 });
  vi.advanceTimersByTime(1001);
  expect(getDriveSession('owner')).toBeNull();
});
it('forgets credentials on disconnect or account logout', () => {
  saveDriveSession('a', { token: 'a', expiresAt: Date.now() + 10000 });
  saveDriveSession('b', { token: 'b', expiresAt: Date.now() + 10000 });
  clearDriveSession('a');
  expect(getDriveSession('a')).toBeNull();
  expect(getDriveSession('b')).not.toBeNull();
  clearDriveSessions();
  expect(getDriveSession('b')).toBeNull();
});
it('restores credentials after a page reload and keeps only the signed-in account', async () => {
  const { clearDriveSessionsExcept } = await import('../driveSession');
  saveDriveSession('a', { token: 'reload-token', expiresAt: Date.now() + 60000 });
  vi.resetModules();
  const reloaded = await import('../driveSession');
  clearDriveSessionsExcept('a');
  expect(reloaded.getDriveSession('a')?.token).toBe('reload-token');
  reloaded.clearDriveSessionsExcept('b');
  expect(reloaded.getDriveSession('a')).toBeNull();
  reloaded.clearDriveSessions();
});
it('rejects malformed and expired stored credentials', () => {
  sessionStorage.setItem('construction-ops.drive-session', '{broken');
  expect(getDriveSession('a')).toBeNull();
  sessionStorage.setItem(
    'construction-ops.drive-session',
    JSON.stringify({
      owner: 'a',
      session: { token: 'expired', expiresAt: Date.now() - 1 },
    }),
  );
  expect(getDriveSession('a')).toBeNull();
  expect(sessionStorage.getItem('construction-ops.drive-session')).toBeNull();
});
it('continues in memory when session storage is blocked', () => {
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Blocked', 'SecurityError');
  });
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('Blocked', 'SecurityError');
  });
  try {
    saveDriveSession('blocked', { token: 'memory', expiresAt: Date.now() + 60000 });
    expect(getDriveSession('blocked')?.token).toBe('memory');
    clearDriveSession('blocked');
    expect(getDriveSession('blocked')).toBeNull();
  } finally {
    write.mockRestore();
    read.mockRestore();
  }
});

it('requires fresh authorization after switching OAuth clients without deleting the old connection', async () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'config-test-company.apps.googleusercontent.com');
  vi.resetModules();
  const company = await import('../driveSession');
  company.saveDriveSession('owner', { token: 'company-token', expiresAt: Date.now() + 60000 });
  try {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'config-test-personal.apps.googleusercontent.com');
    vi.resetModules();
    const personal = await import('../driveSession');
    expect(personal.getDriveSession('owner')).toBeNull();
    personal.saveDriveSession('owner', { token: 'personal-token', expiresAt: Date.now() + 60000 });
    expect(personal.getDriveSession('owner')?.token).toBe('personal-token');
    vi.resetModules();
    const reloadedPersonal = await import('../driveSession');
    expect(reloadedPersonal.getDriveSession('owner')?.token).toBe('personal-token');
    reloadedPersonal.clearDriveSessions();
    personal.clearDriveSessions();
    expect(company.getDriveSession('owner')?.token).toBe('company-token');
  } finally {
    company.clearDriveSessions();
    vi.unstubAllEnvs();
    vi.resetModules();
  }
});

it('separates direct and backend tokens for the same OAuth client while retaining the previous context', async () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'config-test-transport.apps.googleusercontent.com');
  vi.stubEnv('VITE_DRIVE_BACKEND_URL', 'https://backend.example');
  vi.resetModules();
  const backend = await import('../driveSession');
  backend.saveDriveSession('owner', { token: 'backend-token', expiresAt: Date.now() + 60000 });
  try {
    vi.stubEnv('VITE_DRIVE_BACKEND_URL', '');
    vi.resetModules();
    const direct = await import('../driveSession');
    expect(direct.getDriveSession('owner')).toBeNull();
    expect(backend.getDriveSession('owner')?.token).toBe('backend-token');
    direct.clearDriveSessions();
  } finally {
    backend.clearDriveSessions();
    vi.unstubAllEnvs();
    vi.resetModules();
  }
});

it('does not trust an unbound legacy token when an OAuth client is configured', async () => {
  const legacy = JSON.stringify({
    owner: 'owner',
    session: { token: 'legacy-token', expiresAt: Date.now() + 60000 },
  });
  sessionStorage.setItem('construction-ops.drive-session', legacy);
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'config-test-legacy.apps.googleusercontent.com');
  vi.resetModules();
  const current = await import('../driveSession');
  try {
    expect(current.getDriveSession('owner')).toBeNull();
    expect(sessionStorage.getItem('construction-ops.drive-session')).toBe(legacy);
  } finally {
    current.clearDriveSessions();
    sessionStorage.removeItem('construction-ops.drive-session');
    vi.unstubAllEnvs();
    vi.resetModules();
  }
});
