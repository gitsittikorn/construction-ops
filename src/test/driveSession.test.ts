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
