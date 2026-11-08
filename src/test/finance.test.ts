import {
  addFinanceRate,
  addProjectExpense,
  reverseProjectExpense,
  financeRecords,
  financeVersion,
  financeSummary,
  parseBaht,
  rateAmount,
  baht,
} from '../finance';
import { fixture, truck } from './syncFixtures';
import type { Data } from '../models';
import type { FinanceRate } from '../financeModels';
import { prepareSync, integrityIssues } from '../syncModel';
import { validateCloudRecord } from '../cloudValidation';
import { deleteRecord } from '../deletion';
import { loadData, openLocalDatabase, persistData, updateData } from '../storage';
import { reportRows, emptyReportFilter } from '../reports';
function seed() {
  const data = fixture();
  data.masters.push({ ...truck, id: 'driver', kind: 'driver' });
  data.trips[0] = { ...data.trips[0], capacityPerTrip: 12, driverId: 'driver' };
  return data;
}
function rate(
  data: Data,
  side: FinanceRate['side'],
  satang: number,
  unit: FinanceRate['unit'] = 'trip',
  date = '2026-11-01',
  partyId = '',
) {
  return addFinanceRate(
    data,
    'p',
    financeVersion(data, 'p'),
    { side, satang, unit, effectiveFrom: date, partyId, reason: 'agreed terms' },
    'owner',
  );
}
it('parses money exactly and rounds m³ per trip before summing satang', () => {
  expect(parseBaht('0')).toBe(0);
  expect(parseBaht('0.29')).toBe(29);
  expect(baht(-102)).toBe('-1.02');
  for (const invalid of ['-1', '1.005', 'Infinity', '1e3', '999999999999999', '1,000'])
    expect(() => parseBaht(invalid)).toThrow();
  const data = rate(seed(), 'revenue', 100, 'm3');
  const row = { ...reportRows(data, emptyReportFilter)[0], capacity: 0.335, trips: 3 };
  const record = financeRecords(data, 'p')[0];
  if (record.body.kind !== 'rate') throw Error('wrong kind');
  const entry = record.body.entry;
  expect(rateAmount(entry, row)).toBe(102);
  expect(rateAmount(entry, { ...row, capacity: null })).toBeNull();
  expect(() => rateAmount(entry, { ...row, capacity: 1e308 })).toThrow('ขอบเขต');
});
it('uses dated specific rates, known zero rates and audited corrections without modifying prior terms', () => {
  let data = rate(seed(), 'revenue', 10000);
  data = rate(data, 'truck', 5000);
  data = rate(data, 'driver', 0);
  data = rate(data, 'revenue', 90000, 'trip', '2026-12-01');
  data = rate(data, 'truck', 6000, 'trip', '2026-11-06', 'truck');
  const before = structuredClone(financeRecords(data, 'p'));
  const summary = financeSummary(data, 'p');
  expect(summary.totals).toEqual({ revenue: 10000, truck: 6000, driver: 0 });
  expect(summary.complete).toBe(true);
  expect(summary.verified).toEqual({ revenue: 0, truck: 0, driver: 0 });
  data = rate(data, 'revenue', 11000);
  expect(financeRecords(data, 'p').slice(0, before.length)).toEqual(before);
  expect(financeSummary(data, 'p').totals.revenue).toBe(11000);
  expect(financeRecords(data, 'p').at(-1)?.body).toMatchObject({
    kind: 'rate',
    entry: { revision: 2 },
  });
});
it('keeps missing rates and capacity explicit instead of counting them as zero payable', () => {
  const data = fixture();
  const summary = financeSummary(rate(data, 'revenue', 1000, 'm3'), 'p');
  expect(summary.totals.revenue).toBe(0);
  expect(summary.unknown).toEqual({ revenue: 1, truck: 1, driver: 1 });
  expect(summary.complete).toBe(false);
  expect(summary.parties.truck.get('truck')).toEqual({ known: 0, unknownTrips: 1 });
});
it('records expenses and deterministic reversals, retaining originals and preventing double reversal', () => {
  let data = rate(seed(), 'revenue', 10000);
  data = rate(data, 'truck', 5000);
  data = rate(data, 'driver', 1000);
  data = addProjectExpense(
    data,
    'p',
    financeVersion(data, 'p'),
    { date: '2026-11-06', category: 'fuel', truckId: 'truck', satang: 1000, reason: 'receipt' },
    'owner',
  );
  expect(financeSummary(data, 'p').netKnown).toBe(3000);
  const original = financeRecords(data, 'p').at(-1)!;
  data = reverseProjectExpense(
    data,
    'p',
    financeVersion(data, 'p'),
    original.id,
    'wrong receipt',
    'owner',
  );
  expect(financeSummary(data, 'p').expenseTotal).toBe(0);
  expect(financeSummary(data, 'p').netKnown).toBe(4000);
  expect(financeRecords(data, 'p').find((entry) => entry.id === original.id)).toEqual(original);
  expect(() =>
    reverseProjectExpense(data, 'p', financeVersion(data, 'p'), original.id, 'again', 'owner'),
  ).toThrow('กลับรายการแล้ว');
  expect(() => deleteRecord(data, 'master', 'truck', 'owner')).toThrow('ลบไม่ได้');
  expect(integrityIssues(data)).toEqual([]);
  for (const entry of Object.values(prepareSync(data, data).sync!.entries))
    validateCloudRecord(
      entry.desired.payload.id === original.id
        ? 'workspaces'
        : 'recordType' in entry.desired.payload
          ? 'workspaces'
          : 'kind' in entry.desired.payload
            ? 'masters'
            : 'projectId' in entry.desired.payload
              ? 'trips'
              : 'projects',
      entry.desired,
    );
});
it('rejects stale edits and invalid financial entries without changing saved history', () => {
  const data = seed(),
    version = financeVersion(data, 'p'),
    next = rate(data, 'revenue', 1000);
  expect(() =>
    addFinanceRate(
      next,
      'p',
      version,
      {
        side: 'truck',
        partyId: '',
        unit: 'trip',
        satang: 100,
        effectiveFrom: '2026-11-06',
        reason: 'stale',
      },
      'owner',
    ),
  ).toThrow('ข้อมูลการเงินเปลี่ยน');
  expect(() => rate(data, 'revenue', -1)).toThrow();
  expect(() => rate(data, 'revenue', 1, 'm3', '2026-02-30')).toThrow();
  expect(() =>
    addProjectExpense(
      data,
      'p',
      version,
      { date: '2026-11-06', category: 'fuel', truckId: '', satang: 0, reason: 'zero' },
      'owner',
    ),
  ).toThrow();
  expect(financeRecords(data, 'p')).toEqual([]);
});
it('surfaces concurrent rate revisions and resolves them only through an explicit higher revision', () => {
  const first = rate(seed(), 'revenue', 1000),
    second = rate(seed(), 'revenue', 2000);
  const data = { ...first, workspaces: [...first.workspaces!, ...second.workspaces!] };
  expect(() => financeSummary(data, 'p')).toThrow('ขัดแย้ง');
  const resolved = rate(data, 'revenue', 1500);
  expect(financeSummary(resolved, 'p').totals.revenue).toBe(1500);
  expect(financeRecords(resolved, 'p')).toHaveLength(3);
});
it('preserves the prior finance history and pending outbox when IndexedDB is full, and retries safely', async () => {
  const owner = crypto.randomUUID(),
    data = rate(seed(), 'revenue', 1000);
  await persistData(owner, data);
  const put = IDBObjectStore.prototype.put,
    spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'state' && key === owner)
        throw new DOMException('Full', 'QuotaExceededError');
      return put.call(this, value, key);
    });
  try {
    await expect(
      updateData(owner, (previous) => rate(previous, 'truck', 500)),
    ).rejects.toHaveProperty('name', 'QuotaExceededError');
  } finally {
    spy.mockRestore();
  }
  expect(await loadData(owner)).toEqual(data);
  await updateData(owner, (previous) => rate(previous, 'truck', 500));
  expect(financeRecords(await loadData(owner), 'p')).toHaveLength(2);
  const db = await openLocalDatabase();
  expect(await db.get('state', ['phase1-backup', owner])).toEqual(data);
  db.close();
});
