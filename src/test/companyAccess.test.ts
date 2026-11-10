import {
  resolveCompany,
  watchCompany,
  readCompanySelection,
  rememberCompany,
  invalidateCompanyGrant,
  offlineGrantLifetimeMs,
} from '../companyAccess';
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

it('expires offline grants and never revives a known denial from a legacy admin timestamp', async () => {
  const uid = crypto.randomUUID(),
    data = fixture();
  await persistData(uid, data);
  await rememberCompany({ actorUid: uid, companyId: uid, role: 'owner', name: 'Company' });
  const db = await openLocalDatabase();
  const saved = await db.get('driveSettings', ['company-selection', uid]);
  await db.put(
    'driveSettings',
    { ...saved, verifiedAt: new Date(Date.now() - offlineGrantLifetimeMs - 1000).toISOString() },
    ['company-selection', uid],
  );
  db.close();
  expect(await readCompanySelection(uid)).toBeNull();
  await rememberCompany({ actorUid: uid, companyId: uid, role: 'owner', name: 'Company' });
  expect(await readCompanySelection(uid)).not.toBeNull();
  await invalidateCompanyGrant(uid);
  expect(await readCompanySelection(uid)).toBeNull();
  const { loadData } = await import('../storage');
  expect((await loadData(uid)).trips).toEqual(data.trips);
  await rememberCompany({ actorUid: uid, companyId: uid, role: 'owner', name: 'Company' });
  expect(await readCompanySelection(uid)).not.toBeNull();
});

it('fails closed for a policy company when the trusted backend is not configured', async () => {
  sdk.get
    .mockResolvedValueOnce(found({ uid: 'worker', role: 'operator', enabled: true }))
    .mockResolvedValueOnce(
      found({ ownerUid: 'company', name: 'Policy', accessPolicy: 'allowlist-v1' }),
    );
  await expect(resolveCompany('worker', 'company')).rejects.toHaveProperty(
    'code',
    'permission-denied',
  );
});
