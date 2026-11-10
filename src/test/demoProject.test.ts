import { addDemoProject, demoProjectId } from '../demoProject';
import { fixture } from './syncFixtures';
import { dailySessions } from '../daily';
import { reportRows, reportTotals, emptyReportFilter } from '../reports';
import { financeSummary } from '../finance';
import { calculateSurvey } from '../surveying';
import { validateWorkspace } from '../workspaceValidation';
import { integrityIssues } from '../syncModel';
import { cacheOwner } from '../workspaceIdentity';
import { updateData, persistData, loadData } from '../storage';

it('creates a complete, unverified demo with independent report/finance/survey oracles while preserving real data', () => {
  const original = fixture(),
    before = structuredClone(original);
  const data = addDemoProject(original, 'local', '2026-11-09');
  expect(original).toEqual(before);
  expect(data.projects.find((p) => p.id === 'p')).toEqual(before.projects[0]);
  expect(data.trips).toEqual(before.trips);
  expect(data.masters.find((m) => m.id === 'truck')).toEqual(before.masters[0]);
  expect(reportTotals(reportRows(data, { ...emptyReportFilter, project: demoProjectId }))).toEqual({
    trips: 80,
    volume: 1200,
    verifiedTrips: 0,
    verifiedVolume: 0,
    unknownVolumeTrips: 0,
  });
  const sessions = dailySessions(data).filter((s) => s.projectId === demoProjectId);
  expect(sessions).toHaveLength(5);
  expect(
    sessions.every(
      (s) =>
        s.body.state === 'open' &&
        !s.body.closures.length &&
        !Object.keys(s.body.verifications).length,
    ),
  ).toBe(true);
  expect(
    sessions
      .flatMap((s) => s.body.rows)
      .filter((r) => r.reportedTrips !== null && r.reportedTrips !== r.tripCount),
  ).toHaveLength(1);
  expect(data.workspaces!.some((r) => r.recordType === 'evidence')).toBe(false);
  for (const record of data.workspaces!) validateWorkspace(record);
  expect(integrityIssues(data)).toEqual([]);
  const finance = financeSummary(data, demoProjectId, '', '');
  expect(finance.totals).toEqual({ revenue: 9600000, truck: 3200000, driver: 800000 });
  expect(finance.expenseTotal).toBe(680000);
  expect(finance.netKnown).toBe(4920000);
  expect(finance.verified).toEqual({ revenue: 0, truck: 0, driver: 0 });
  const survey = data.workspaces!.find((r) => r.recordType === 'survey')!;
  if (survey.recordType !== 'survey') throw Error('fixture');
  expect(calculateSurvey(survey.body).fill).toBe(100);
  const edited = structuredClone(data);
  edited.projects.find((p) => p.id === demoProjectId)!.status = 'draft';
  expect(addDemoProject(edited, 'local', '2026-11-10')).toBe(edited);
});

it('denies operator creation and refuses collisions/tombstones without altering existing records', () => {
  const data = fixture(),
    before = structuredClone(data);
  expect(() =>
    addDemoProject(
      data,
      cacheOwner({ companyId: 'company', actorUid: 'worker', role: 'operator' }),
    ),
  ).toThrow('ผู้จัดการ');
  expect(() => addDemoProject(data, 'local', '2026-02-30')).toThrow('วันที่');
  const deleted = {
    ...data,
    deletedProjects: [{ ...data.projects[0], id: demoProjectId, deletedAt: '2026-11-01' }],
  };
  expect(() => addDemoProject(deleted, 'local')).toThrow('ไม่ถูกเขียนทับ');
  expect(() =>
    addDemoProject(
      { ...data, masters: [{ ...data.masters[0], id: `${demoProjectId}-truck-a` }] },
      'local',
    ),
  ).toThrow('ไม่ถูกเขียนทับ');
  expect(data).toEqual(before);
});

it('persists the demo through the normal pending outbox and retries without duplicating or changing a real project', async () => {
  const owner = 'demo-persistence-test';
  await persistData(owner, fixture());
  await updateData(owner, (data) => addDemoProject(data, owner, '2026-11-09'));
  const stored = await loadData(owner);
  const entries = Object.values(stored.sync!.entries);
  expect(entries.filter((e) => e.desired.payload.id === demoProjectId)).toHaveLength(1);
  expect(entries.every((e) => e.status === 'pending')).toBe(true);
  await updateData(owner, (data) => addDemoProject(data, owner, '2026-11-10'));
  expect(await loadData(owner)).toEqual(stored);
});
