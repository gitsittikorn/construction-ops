import { emptyReportFilter, reportRows, reportTotals } from '../reports';
import { gridPoints, calculateSurvey } from '../surveying';
import { fixture, trip } from './syncFixtures';
it('aggregates 10,000 saved trips without losing records and calculates a near-limit grid within bounded time', () => {
  const data = fixture();
  data.trips = Array.from({ length: 10000 }, (_, index) => ({
    ...trip,
    id: `trip-${index}`,
    capacityPerTrip: 12,
  }));
  const started = performance.now();
  const totals = reportTotals(reportRows(data, emptyReportFilter));
  expect(totals.trips).toBe(10000);
  expect(totals.volume).toBe(120000);
  expect(totals.verifiedTrips).toBe(0);
  const body = {
    benchmark: 'BM',
    elevation: 0,
    datum: 'project',
    notes: '',
    observations: [],
    width: 48,
    length: 48,
    spacingX: 1,
    spacingY: 1,
    design: 'uniform' as const,
    designLevel: 1,
    slopeX: 0,
    slopeY: 0,
    allowance: 30,
    cutSwell: 0,
    points: gridPoints(48, 48, 1, 1, 0),
  };
  expect(calculateSurvey(body).fill).toBeCloseTo(2304);
  expect(performance.now() - started).toBeLessThan(5000);
});

it('indexes evidence references for 5,000 daily records without dropping totals or crossing row fingerprints', async () => {
  const { rowFingerprint } = await import('../daily');
  const data = fixture();
  data.trips = [];
  data.workspaces = [];
  for (let index = 0; index < 5000; index++) {
    const daily = {
      id: `daily-${index}`,
      projectId: 'p',
      recordType: 'daily' as const,
      name: 'daily',
      createdAt: '2026-11-08T00:00:00Z',
      updatedAt: '2026-11-08T00:00:00Z',
      body: {
        date: '2026-11-08',
        version: 1,
        state: 'open' as const,
        reason: '',
        closures: [],
        verifications: {},
        rows: [
          {
            id: 'row',
            truckId: 'truck',
            driverId: '',
            sourceId: '',
            teamId: '',
            soilType: '',
            tripCount: 1,
            capacity: 12,
            reportedTrips: null,
            notes: '',
          },
        ],
      },
    };
    data.workspaces.push(daily, {
      id: `evidence-${index}`,
      projectId: 'p',
      recordType: 'evidence',
      name: 'proof',
      createdAt: daily.createdAt,
      updatedAt: daily.updatedAt,
      body: {
        sessionId: daily.id,
        rowId: 'row',
        date: daily.body.date,
        truckId: 'truck',
        driverId: '',
        fingerprint: rowFingerprint(daily, daily.body.rows[0]),
        files: [],
      },
    });
  }
  const started = performance.now();
  const rows = reportRows(data, emptyReportFilter);
  expect(reportTotals(rows).volume).toBe(60000);
  expect(rows).toHaveLength(5000);
  expect(rows.every((row) => row.evidenceRefs?.length === 1)).toBe(true);
  expect(rows.find((row) => row.id.startsWith('daily-4999:'))?.evidenceRefs).toEqual([
    'Evidence: evidence-4999',
  ]);
  expect(performance.now() - started).toBeLessThan(5000);
});
