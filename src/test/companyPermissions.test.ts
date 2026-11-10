import { assertCompanyMutation } from '../companyPermissions';
import { cacheOwner, actorUid } from '../workspaceIdentity';
import { createDaily, dailySessions, saveDailyRow } from '../daily';
import { fixture } from './syncFixtures';
import { addFinanceRate, financeVersion } from '../finance';
import { persistData, loadData } from '../storage';
const operator = cacheOwner({ actorUid: 'worker', companyId: 'company', role: 'operator' }),
  manager = cacheOwner({ actorUid: 'worker', companyId: 'company', role: 'manager' });
it('allows operational entry with actual actor history but blocks manager-only mutations', () => {
  const original = fixture(),
    next = createDaily(original, 'p', '2026-11-08', operator);
  expect(() => assertCompanyMutation(original, next, operator)).not.toThrow();
  const daily = dailySessions(next)[0];
  const entered = saveDailyRow(
    next,
    daily.id,
    daily.body.version,
    {
      id: 'r',
      truckId: 'truck',
      driverId: '',
      teamId: '',
      sourceId: '',
      soilType: '',
      tripCount: 1,
      capacity: 12,
      reportedTrips: null,
      notes: '',
    },
    operator,
  );
  expect(() => assertCompanyMutation(next, entered, operator)).not.toThrow();
  expect(entered.audit.at(-1)?.actor).toBe(actorUid(operator));
  expect(() => assertCompanyMutation(entered, { ...entered, projects: [] }, operator)).toThrow(
    'สิทธิ์',
  );
  expect(() => assertCompanyMutation(entered, { ...entered, trips: [] }, operator)).toThrow(
    'สิทธิ์',
  );
  const financial = addFinanceRate(
    entered,
    'p',
    financeVersion(entered, 'p'),
    {
      side: 'revenue',
      partyId: '',
      satang: 1000,
      unit: 'trip',
      effectiveFrom: '2026-11-01',
      reason: 'agreed',
    },
    manager,
  );
  expect(() => assertCompanyMutation(entered, financial, operator)).toThrow('สิทธิ์');
  expect(() => assertCompanyMutation(entered, financial, manager)).not.toThrow();
  expect(
    financial.workspaces?.find((record) => record.recordType === 'finance')?.body,
  ).toMatchObject({ entry: { by: 'worker' } });
});
it('blocks forged verification/state changes and retains data from a previous higher-role cache', async () => {
  const original = createDaily(fixture(), 'p', '2026-11-08', operator),
    daily = dailySessions(original)[0];
  const forged = {
    ...original,
    workspaces: [{ ...daily, body: { ...daily.body, state: 'closed' as const } }],
  };
  expect(() => assertCompanyMutation(original, forged, operator)).toThrow('สิทธิ์');
  await persistData(manager, {
    ...fixture(),
    projects: [{ ...fixture().projects[0], name: 'Manager pending' }],
  });
  expect((await loadData(operator)).projects).toEqual([]);
  expect((await loadData(manager)).projects[0].name).toBe('Manager pending');
});

it('viewer reads never grant domain edits, demo creation, evidence writes or conflict resolution', async () => {
  const viewer = cacheOwner({ actorUid: 'reader', companyId: 'company', role: 'viewer' }),
    data = fixture();
  expect(() => assertCompanyMutation(data, data, viewer)).not.toThrow();
  for (const key of ['projects', 'masters', 'trips'] as const)
    expect(() => assertCompanyMutation(data, { ...data, [key]: [] }, viewer)).toThrow('ดูข้อมูล');
  const { addDemoProject } = await import('../demoProject');
  expect(() => addDemoProject(data, viewer)).toThrow('ผู้จัดการ');
  const { saveEvidence } = await import('../evidence');
  await expect(saveEvidence(viewer, 'day', 'row', 'driver-photo', [])).rejects.toThrow('ดูข้อมูล');
});
