import { vi, describe, it, expect, beforeEach } from 'vitest';
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
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe('cloud sync adapter (mocked Firebase SDK)', () => {
  it('fails visibly instead of waiting forever for Firestore folder transactions', async () => {
    vi.useFakeTimers();
    mocks.get.mockImplementation(() => new Promise(() => {}));
    const { resolveDriveFolders } = await import('../firebase');
    const operation = resolveDriveFolders('admin', 'root', {
      rootId: 'root',
      projectsId: 'projects',
    });
    const result = expect(operation).rejects.toThrow('Firestore');
    await vi.advanceTimersByTimeAsync(20001);
    await result;
  });
  it('reports missing Firestore permissions in actionable language', async () => {
    mocks.get.mockRejectedValue({ code: 'permission-denied' });
    const { resolveDriveFolders } = await import('../firebase');
    await expect(
      resolveDriveFolders('admin', 'root', { rootId: 'r', projectsId: 'p' }),
    ).rejects.toThrow('สิทธิ์กับเจ้าของ');
  });
  it('stores only document metadata and an audit event, never a Blob', async () => {
    mocks.get.mockResolvedValue({ exists: () => false });
    const { saveDocumentMetadata } = await import('../firebase');
    const record = {
      id: 'operation',
      owner: 'admin',
      projectId: 'p',
      tripId: '',
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 3,
      createdAt: 'now',
      status: 'metadata-pending' as const,
      driveId: 'file-id',
      folderId: 'folder-id',
      error: '',
      blob: new Blob(['abc']),
    };
    await saveDocumentMetadata('admin', record);
    expect(mocks.set).toHaveBeenCalledWith(
      'users/admin/documents/operation',
      expect.objectContaining({ fileId: 'file-id', status: 'synced' }),
    );
    expect(mocks.set.mock.calls[0][1]).not.toHaveProperty('blob');
    expect(mocks.set).toHaveBeenCalledTimes(2);
  });
  it('reuses immutable folder mappings across devices', async () => {
    mocks.get.mockResolvedValue({
      exists: () => true,
      data: () => ({ rootId: 'existing', projectsId: 'existing-projects' }),
    });
    const result = await (
      await import('../firebase')
    ).resolveDriveFolders('admin', 'root', { rootId: 'new', projectsId: 'new-projects' });
    expect(result.rootId).toBe('existing');
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('refuses conflicting existing document metadata', async () => {
    mocks.get.mockResolvedValue({ exists: () => true, data: () => ({ id: 'different' }) });
    const record = {
      id: 'operation',
      owner: 'admin',
      projectId: 'p',
      tripId: '',
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 3,
      createdAt: 'now',
      status: 'metadata-pending' as const,
      driveId: 'file-id',
      folderId: 'folder-id',
      error: '',
    };
    await expect(
      (await import('../firebase')).saveDocumentMetadata('admin', record),
    ).rejects.toThrow();
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('rejects missing or mismatched authentication', async () => {
    mocks.auth.currentUser = null;
    await expect((await import('../firebase')).getFirebaseIdToken('admin')).rejects.toThrow();
  });
  it('fails closed when Firebase is unconfigured', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    const { configured, getFirebaseIdToken, login } = await import('../firebase');
    expect(configured).toBe(false);
    await expect(getFirebaseIdToken('admin')).rejects.toThrow();
    await expect(login()).rejects.toThrow();
  });
});
