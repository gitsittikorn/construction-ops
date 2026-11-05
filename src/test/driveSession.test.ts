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
