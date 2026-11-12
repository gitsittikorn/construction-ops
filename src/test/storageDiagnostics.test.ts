import { dataCounts, inspectStoredNamespaces } from '../storageDiagnostics';
import { loadData, persistData, updateData } from '../storage';
import { fixture } from './syncFixtures';

it('reports pending versus acknowledged counts without promoting local records', async () => {
  const owner = crypto.randomUUID();
  await persistData(owner, fixture());
  const data = await updateData(owner, (old) => old);
  expect(dataCounts(data)).toMatchObject({
    projects: 1,
    masters: { truck: 1 },
    pending: 3,
    acknowledged: 0,
    restoredAt: null,
  });
  const report = await inspectStoredNamespaces(owner);
  expect(report.some((row) => row.relation === 'current' && row.counts.pending === 3)).toBe(true);
  const text = JSON.stringify(report);
  expect(text).not.toContain(owner);
  expect(text).not.toContain('AB123');
  expect(text).not.toContain('Historical customer');
  expect(await loadData(owner)).toEqual(data);
});
