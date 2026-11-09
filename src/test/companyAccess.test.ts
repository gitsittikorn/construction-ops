import { resolveCompany, watchCompany, readCompanySelection } from '../companyAccess';
import { openLocalDatabase, persistData } from '../storage';
import { fixture } from './syncFixtures';
const sdk = vi.hoisted(() => ({
  uid: 'worker',
  get: vi.fn(),
  listeners: new Map<
    string,
    (snapshot: {
      metadata: { fromCache: boolean };
      exists: () => boolean;
      data: () => Record<string, unknown>;
    }) => void
  >(),
}));
vi.mock('../firebase', () => ({
  identityDatabase: () => ({}),
  getSessionIdentity: () => ({ uid: sdk.uid }),
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  getDocFromServer: sdk.get,
  onSnapshot: (ref: string, listener: never) => {
    sdk.listeners.set(ref, listener);
    return () => {};
  },
  collection: vi.fn(),
  getDocsFromServer: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
}));
const found = (data: Record<string, unknown>) => ({
  exists: () => true,
  data: () => data,
  metadata: { fromCache: false },
});
beforeEach(() => {
  sdk.uid = 'worker';
  sdk.get.mockReset();
  sdk.listeners.clear();
});
it('resolves an explicit live membership and refuses disabled or missing membership', async () => {
  sdk.get
    .mockResolvedValueOnce(found({ uid: 'worker', role: 'operator', enabled: true }))
    .mockResolvedValueOnce(found({ ownerUid: 'company', name: 'Site' }));
  expect(await resolveCompany('worker', 'company')).toEqual({
    actorUid: 'worker',
    companyId: 'company',
    role: 'operator',
    name: 'Site',
  });
  sdk.get.mockResolvedValueOnce(found({ uid: 'worker', role: 'manager', enabled: false }));
  await expect(resolveCompany('worker', 'company')).rejects.toHaveProperty(
    'code',
    'permission-denied',
  );
  await expect(resolveCompany('worker', 'a/b')).rejects.toThrow('รหัสบริษัท');
});
it('keeps the latest role during interleaved profile updates and never revives a revoked subscription', () => {
  const changes = vi.fn(),
    stop = watchCompany(
      { actorUid: 'worker', companyId: 'company', role: 'manager', name: 'Site' },
      changes,
      vi.fn(),
    );
  sdk.listeners.get('companies/company/members/worker')!(
    found({ role: 'operator', enabled: true }),
  );
  sdk.listeners.get('companies/company')!(found({ name: 'Renamed' }));
  expect(changes).toHaveBeenLastCalledWith({
    actorUid: 'worker',
    companyId: 'company',
    role: 'operator',
    name: 'Renamed',
  });
  sdk.listeners.get('companies/company/members/worker')!(
    found({ role: 'operator', enabled: false }),
  );
  sdk.listeners.get('companies/company')!(found({ name: 'Another name' }));
  expect(changes).toHaveBeenLastCalledWith(null);
  stop();
});
it('preserves legacy offline grants while rejecting cached entries for a different actor', async () => {
  const uid = crypto.randomUUID(),
    data = fixture();
  data.sync = {
    schemaVersion: 1,
    entries: {},
    cursors: {},
    adminVerifiedAt: new Date().toISOString(),
  };
  await persistData(uid, data);
  expect(await readCompanySelection(uid)).toMatchObject({
    actorUid: uid,
    companyId: uid,
    role: 'owner',
  });
  const db = await openLocalDatabase();
  await db.put(
    'driveSettings',
    {
      actorUid: 'other',
      companyId: 'company',
      role: 'manager',
      verifiedAt: new Date().toISOString(),
    },
    ['company-selection', uid],
  );
  db.close();
  expect(await readCompanySelection(uid)).toBeNull();
});
