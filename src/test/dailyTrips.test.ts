import {
  createDaily,
  dailySessions,
  saveDailyRow,
  summarizeDaily,
  duplicateNextDay,
  duplicatePreview,
  nextWorkDate,
  correctDailyTrip,
} from '../daily';
import {
  activeDailyTrips,
  defaultTripCapacity,
  deliveredVolume,
  validateDailyTrips,
} from '../dailyTrips';
import { fixture, truck } from './syncFixtures';
import { reportRows, reportTotals, emptyReportFilter } from '../reports';
import { prepareSync } from '../syncModel';
import { validateCloudRecord } from '../cloudValidation';
import type { DailyRow } from '../workspaceModels';

function start(count = 0) {
  let data = fixture();
  data.trips = [];
  data.masters = [
    { ...truck, capacity: 6, truckType: 'six-wheel' },
    { ...truck, id: 'driver', kind: 'driver' },
    { ...truck, id: 'driver2', kind: 'driver' },
    { ...truck, id: 'truck2', capacity: 10 },
  ];
  data = createDaily(data, 'p', '2026-12-31', 'admin');
  const row: DailyRow = {
    id: 'assignment',
    truckId: 'truck',
    driverId: 'driver',
    teamId: '',
    sourceId: '',
    soilType: '',
    tripCount: count,
    capacity: 6,
    reportedTrips: null,
    notes: '',
  };
  data = saveDailyRow(data, dailySessions(data)[0].id, 1, row, 'admin');
  return data;
}
it('P2-01/02/03/04/05 creates assignments with unique trips and sums actual loose capacity', () => {
  let data = start(10),
    s = dailySessions(data)[0];
  expect(deliveredVolume(s.body.rows[0])).toBe(60);
  data = saveDailyRow(
    data,
    s.id,
    s.body.version,
    {
      ...s.body.rows[0],
      id: 'second',
      truckId: 'truck2',
      driverId: 'driver2',
      tripCount: 2,
      capacity: 10,
    },
    'admin',
  );
  s = dailySessions(data)[0];
  const trips = s.body.rows.flatMap(activeDailyTrips);
  expect(new Set(trips.map((t) => t.id)).size).toBe(12);
  expect(summarizeDaily(s).byTruck.map((g) => g.volume)).toEqual([60, 20]);
  expect(reportTotals(reportRows(data, emptyReportFilter)).volume).toBe(80);
  expect(defaultTripCapacity({ ...truck, truckType: 'six-wheel', capacity: 0 })).toBe(6);
  expect(defaultTripCapacity({ ...truck, truckType: 'ten-wheel', capacity: 0 })).toBeUndefined();
});
it('P2-06 snapshots capacities and drivers; corrections void trips with an audit rather than rewriting history', () => {
  let data = start(3),
    s = dailySessions(data)[0];
  const initial = structuredClone(s.body.rows[0].transactions);
  data.masters[0].capacity = 99;
  data = saveDailyRow(
    data,
    s.id,
    s.body.version,
    { ...s.body.rows[0], driverId: 'driver2', capacity: 8 },
    'admin',
  );
  s = dailySessions(data)[0];
  expect(deliveredVolume(s.body.rows[0])).toBe(18);
  data = saveDailyRow(data, s.id, s.body.version, { ...s.body.rows[0], tripCount: 4 }, 'admin');
  s = dailySessions(data)[0];
  expect(deliveredVolume(s.body.rows[0])).toBe(26);
  expect(summarizeDaily(s).byDriver).toEqual([
    { id: 'driver', trips: 3, volume: 18 },
    { id: 'driver2', trips: 1, volume: 8 },
  ]);
  expect(reportTotals(reportRows(data, { ...emptyReportFilter, driver: 'driver' })).volume).toBe(
    18,
  );
  data = saveDailyRow(data, s.id, s.body.version, { ...s.body.rows[0], tripCount: 3 }, 'admin');
  s = dailySessions(data)[0];
  expect(deliveredVolume(s.body.rows[0])).toBe(18);
  expect(s.body.rows[0].transactions!.slice(0, 3)).toEqual(initial);
  expect(s.body.rows[0].transactions!.at(-1)!.voidedAt).toBeTruthy();
  expect(s.body.history!.at(-1)!.changes[0].before!.tripCount).toBe(4);
});
it('P2-07/08/09/12 copies new assignment IDs at Bangkok calendar year boundary without changing source history', () => {
  const data = start(10),
    source = structuredClone(dailySessions(data)[0]);
  const copied = duplicateNextDay(data, source.id, 'admin', source.body.version);
  const target = dailySessions(copied).find((s) => s.body.date === '2027-01-01')!;
  expect(target.body.rows[0].id).not.toBe(source.body.rows[0].id);
  expect(target.body.rows[0]).toMatchObject({
    tripCount: 0,
    reportedTrips: null,
    transactions: [],
    capacity: 6,
  });
  expect(target.body.verifications).toEqual({});
  expect(target.body.closures).toEqual([]);
  expect(dailySessions(copied).find((s) => s.id === source.id)).toEqual(source);
  expect(() => duplicateNextDay(copied, source.id, 'admin')).toThrow('มีอยู่แล้ว');
  expect(() => duplicateNextDay(data, source.id, 'admin', 1)).toThrow('เปลี่ยน');
  expect(nextWorkDate('2028-02-28')).toBe('2028-02-29');
  expect(() => nextWorkDate('2026-02-30')).toThrow('วันที่');
});
it('P2-13 warns and skips inactive trucks, clears inactive drivers, and blocks adding trips to inactive assignments', () => {
  const data = start(1),
    s = dailySessions(data)[0];
  data.masters.find((m) => m.id === 'driver')!.active = false;
  let preview = duplicatePreview(data, s.id);
  expect(preview.rows[0].driverId).toBe('');
  expect(preview.warnings.join(' ')).toContain('ปิดใช้งาน');
  expect(() =>
    saveDailyRow(data, s.id, s.body.version, { ...s.body.rows[0], tripCount: 2 }, 'admin'),
  ).toThrow('ปิดใช้งาน');
  data.masters[0].active = false;
  preview = duplicatePreview(data, s.id);
  expect(preview.rows).toEqual([]);
});
it('P2-11/14 rejects stale/replayed changes and malformed transaction IDs/counts before cloud restore', () => {
  const data = start(1),
    s = dailySessions(data)[0],
    row = s.body.rows[0];
  expect(() => saveDailyRow(data, s.id, 1, { ...row, tripCount: 2 }, 'admin')).toThrow('เปลี่ยน');
  expect(() =>
    saveDailyRow(data, s.id, s.body.version, { ...row, tripCount: -1 }, 'admin'),
  ).toThrow();
  expect(() =>
    saveDailyRow(data, s.id, s.body.version, { ...row, capacity: NaN }, 'admin'),
  ).toThrow();
  expect(() =>
    validateDailyTrips({ ...row, transactions: [row.transactions![0], row.transactions![0]] }),
  ).toThrow('ซ้ำ');
  expect(() => validateDailyTrips({ ...row, tripCount: 2 })).toThrow('จำนวนเที่ยว');
  const prepared = prepareSync(data, data),
    record = prepared.sync!.entries[`workspaces/${s.id}`].desired;
  validateCloudRecord('workspaces', record);
  const broken = structuredClone(record);
  if ('body' in broken.payload && 'rows' in broken.payload.body)
    broken.payload.body.rows[0].tripCount = 99;
  expect(() => validateCloudRecord('workspaces', broken)).toThrow('จำนวนเที่ยว');
});
it('legacy count-only rows remain readable and gain deterministic legacy snapshots only upon an explicit edit', () => {
  const data = start(2),
    s = dailySessions(data)[0];
  delete s.body.rows[0].transactions;
  const before = structuredClone(data);
  expect(deliveredVolume(s.body.rows[0])).toBe(12);
  expect(data).toEqual(before);
  const next = saveDailyRow(
    data,
    s.id,
    s.body.version,
    { ...s.body.rows[0], tripCount: 3, capacity: 8 },
    'admin',
  );
  expect(deliveredVolume(dailySessions(next)[0].body.rows[0])).toBe(20);
  expect(dailySessions(next)[0].body.rows[0].transactions![0].id).toBe(
    `legacy-${s.id}-assignment-1`,
  );
  expect(data).toEqual(before);
});

it('corrects an individual snapshot only with a reason and current revision, keeps its ID and audits both versions', () => {
  const data = start(2),
    s = dailySessions(data)[0],
    row = s.body.rows[0],
    trip = row.transactions![0];
  const change = { capacity: 8, driverId: 'driver2', sourceId: '', soilType: '' };
  expect(() =>
    correctDailyTrip(data, s.id, s.body.version, row.id, trip.id, change, 'admin', ''),
  ).toThrow('เหตุผล');
  expect(() =>
    correctDailyTrip(
      data,
      s.id,
      s.body.version - 1,
      row.id,
      trip.id,
      change,
      'admin',
      'correct slip',
    ),
  ).toThrow('เปลี่ยน');
  expect(() =>
    correctDailyTrip(
      data,
      s.id,
      s.body.version,
      row.id,
      trip.id,
      { ...change, capacity: -1 },
      'admin',
      'correct slip',
    ),
  ).toThrow();
  const next = correctDailyTrip(
    data,
    s.id,
    s.body.version,
    row.id,
    trip.id,
    change,
    'admin',
    'correct slip',
  );
  const corrected = dailySessions(next)[0].body.rows[0];
  expect(corrected.tripCount).toBe(2);
  expect(corrected.transactions![0].id).toBe(trip.id);
  expect(deliveredVolume(corrected)).toBe(14);
  expect(next.audit.at(-1)!.action).toBe('daily-correct-trip');
  expect(dailySessions(data)[0].body.rows[0].transactions![0].capacity).toBe(6);
});
