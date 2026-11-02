import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Trip } from '../models';
const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  get: vi.fn(),
  auth: { currentUser: { uid: 'admin' } as { uid: string } | null },
}));
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({
  getAuth: () => mocks.auth,
  GoogleAuthProvider: class {},
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  doc: (_: unknown, ...path: string[]) => path.join('/'),
  serverTimestamp: () => 'server-time',
  runTransaction: async (_: unknown, callback: (tx: unknown) => Promise<void>) =>
    callback({ get: mocks.get, set: mocks.set }),
}));
const trip: Trip = {
  id: 'trip',
  createdAt: 'now',
  updatedAt: 'now',
  projectId: 'p',
  date: '2026-11-02',
  time: '09:00',
  truckId: 't',
  driverId: '',
  sourceId: '',
  soilType: '',
  notes: '',
  revision: 1,
  syncStatus: 'pending',
};
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test');
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test');
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test');
  vi.stubEnv('VITE_FIREBASE_APP_ID', 'test');
  mocks.auth.currentUser = { uid: 'admin' };
  mocks.set.mockReset();
  mocks.get.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
describe('cloud sync adapter (mocked Firebase SDK)', () => {
  it('writes a stable document ID and audit together', async () => {
    mocks.get.mockResolvedValue({ exists: () => false });
    const { syncTrip } = await import('../firebase');
    await syncTrip('admin', trip);
    expect(mocks.set).toHaveBeenCalledWith(
      'users/admin/trips/trip',
      expect.objectContaining({ syncStatus: 'synced', serverUpdatedAt: 'server-time' }),
    );
    expect(mocks.set).toHaveBeenCalledTimes(2);
  });
  it('does not duplicate an acknowledged retry', async () => {
    mocks.get.mockResolvedValue({
      exists: () => true,
      data: () => ({ ...trip, syncStatus: 'synced' }),
    });
    await (await import('../firebase')).syncTrip('admin', trip);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('allows several offline edits before first sync', async () => {
    mocks.get.mockResolvedValue({ exists: () => false });
    await (await import('../firebase')).syncTrip('admin', { ...trip, revision: 3 });
    expect(mocks.set).toHaveBeenCalledWith(
      'users/admin/trips/trip',
      expect.objectContaining({ revision: 3 }),
    );
  });
  it('rejects stale data or conflicting payloads', async () => {
    const { syncTrip } = await import('../firebase');
    mocks.get.mockResolvedValue({ exists: () => true, data: () => ({ ...trip, revision: 2 }) });
    await expect(syncTrip('admin', trip)).rejects.toThrow();
    mocks.get.mockResolvedValue({
      exists: () => true,
      data: () => ({ ...trip, notes: 'conflict' }),
    });
    await expect(syncTrip('admin', trip)).rejects.toThrow();
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('retains errors for callers to retry', async () => {
    mocks.get.mockRejectedValue(Error('permission-denied'));
    await expect((await import('../firebase')).syncTrip('admin', trip)).rejects.toThrow(
      'permission-denied',
    );
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('rejects missing or mismatched authentication', async () => {
    mocks.auth.currentUser = null;
    await expect((await import('../firebase')).syncTrip('admin', trip)).rejects.toThrow();
  });
  it('fails closed when Firebase is unconfigured', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    const { configured, syncTrip, login } = await import('../firebase');
    expect(configured).toBe(false);
    await expect(syncTrip('admin', trip)).rejects.toThrow();
    await expect(login()).rejects.toThrow();
  });
});
