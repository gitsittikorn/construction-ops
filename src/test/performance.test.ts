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
