import { describe, it, expect } from 'vitest';
import {
  saveTrip,
  survey,
  volume,
  csv,
  validateProject,
  validateMaster,
  workDate,
  workTimestamp,
} from '../domain';
import { emptyData, type Data, type Trip } from '../models';
import { persistData, loadData } from '../storage';
const base = { id: 'p', createdAt: 'now', updatedAt: 'now' };
const project = {
  ...base,
  name: 'Site',
  customer: '',
  location: '',
  startDate: '2026-11-02',
  endDate: '',
  status: 'active' as const,
  description: '',
};
const master = {
  ...base,
  id: 'truck',
  kind: 'truck' as const,
  name: 'AB123',
  detail: '',
  capacity: 12,
  active: true,
};
const data: Data = { ...emptyData, projects: [project], masters: [master] };
const trip: Trip = {
  ...base,
  id: 'trip-1',
  projectId: 'p',
  date: '2026-11-02',
  time: '09:30',
  truckId: 'truck',
  driverId: '',
  sourceId: '',
  soilType: '',
  notes: '',
  syncStatus: 'pending',
  revision: 1,
};
describe('trip integrity', () => {
  it('allows active soil selections but rejects inactive or missing soil types on a new trip', () => {
    const soil = { ...master, id: 'soil', kind: 'soilType' as const, name: 'ดินถม' };
    expect(
      saveTrip({ ...data, masters: [master, soil] }, { ...trip, soilType: 'ดินถม' }).trips[0]
        .soilType,
    ).toBe('ดินถม');
    expect(() =>
      saveTrip(
        { ...data, masters: [master, { ...soil, active: false }] },
        { ...trip, soilType: 'ดินถม' },
      ),
    ).toThrow();
    expect(() => saveTrip(data, { ...trip, soilType: 'unknown' })).toThrow();
  });
  it('keeps historical soil names editable even after their master record is renamed or disabled', () => {
    const historical = { ...trip, soilType: 'old name' };
    const previous = { ...data, trips: [historical] };
    const updated = saveTrip(previous, { ...historical, revision: 2, notes: 'corrected' });
    expect(updated.trips[0].soilType).toBe('old name');
    expect(updated.audit[0].before).toEqual(historical);
    expect(() =>
      saveTrip(previous, { ...historical, revision: 2, soilType: 'another unknown' }),
    ).toThrow();
  });
  it('records a pending trip and immutable audit event', () => {
    const next = saveTrip(data, trip);
    expect(next.trips).toHaveLength(1);
    expect(next.audit[0].before).toBeNull();
    expect(data.trips).toHaveLength(0);
  });
  it('replaying the same operation never adds a trip or audit event', () => {
    const first = saveTrip(data, trip);
    expect(saveTrip(first, trip)).toBe(first);
  });
  it('rejects conflicting payloads reusing an operation ID and revision', () =>
    expect(() => saveTrip(saveTrip(data, trip), { ...trip, notes: 'different' })).toThrow());
  it('rejects impossible calendar dates', () =>
    expect(() => saveTrip(data, { ...trip, date: '2026-02-30' })).toThrow());
  it('permits the same truck at the same time with a new intentional ID', () =>
    expect(saveTrip(saveTrip(data, trip), { ...trip, id: 'trip-2' }).trips).toHaveLength(2));
  it('records edit history and rejects stale revisions', () => {
    const first = saveTrip(data, trip);
    const second = saveTrip(first, { ...trip, notes: 'changed', revision: 2 });
    expect(second.audit[1].before).toEqual(first.trips[0]);
    expect(first.trips[0].capacityPerTrip).toBe(12);
    expect(second.trips).toHaveLength(1);
    expect(() => saveTrip(second, { ...trip, revision: 4 })).toThrow();
  });
  it('rejects archived projects, inactive trucks, invalid relationships and invalid time', () => {
    expect(() =>
      saveTrip({ ...data, projects: [{ ...project, status: 'archived' }] }, trip),
    ).toThrow();
    expect(() => saveTrip({ ...data, masters: [{ ...master, active: false }] }, trip)).toThrow();
    expect(() => saveTrip(data, { ...trip, driverId: 'missing' })).toThrow();
    expect(() => saveTrip(data, { ...trip, time: '25:00' })).toThrow();
  });
});
describe('input validation', () => {
  it.each([
    ['2026-11-05T16:59:59.999Z', '2026-11-05'],
    ['2026-11-05T17:00:00.000Z', '2026-11-06'],
    ['2026-12-31T17:00:00.000Z', '2027-01-01'],
  ])('P1-16 maps %s to Bangkok work date %s', (instant, expected) => {
    expect(workDate(new Date(instant))).toBe(expected);
  });
  it('formats work timestamps in Bangkok even across the UTC date boundary', () => {
    expect(workTimestamp('2026-11-05T17:30:00Z')).toContain('06/11/2569');
    expect(workTimestamp('legacy')).toBe('legacy');
  });
  it('requires a project name and ordered dates', () => {
    expect(() => validateProject({ ...project, name: ' ' })).toThrow();
    expect(() => validateProject({ ...project, endDate: '2026-01-01' })).toThrow();
  });
  it('rejects negative and invalid capacities', () => {
    expect(() => validateMaster({ ...master, capacity: -1 })).toThrow();
    expect(() => validateMaster({ ...master, capacity: NaN })).toThrow();
  });
  it('uses Bangkok calendar date', () =>
    expect(workDate(new Date('2026-11-01T18:00:00Z'))).toBe('2026-11-02'));
});
describe('calculations', () => {
  it('larger staff readings mean lower ground elevations', () => {
    expect(survey(100, 1.5, 2, 101)).toEqual({ hi: 101.5, rl: 99.5, fill: 1.5, cut: 0 });
    expect(survey(100, 1.5, 3, 101).rl).toBe(98.5);
  });
  it('separates cut and fill', () => expect(survey(100, 2, 1, 100).cut).toBe(1));
  it('separates compacted, settlement and loose volumes', () =>
    expect(volume(100, 2, 1.25, 10, 12)).toEqual({
      compacted: 200,
      allowance: 20,
      loose: 275,
      trips: 23,
    }));
  it('rejects invalid readings and zero truck capacity', () => {
    expect(() => survey(100, -1, 2, 100)).toThrow();
    expect(() => volume(100, 2, 1.2, 0, 0)).toThrow();
  });
});
describe('reports', () => {
  it('escapes CSV and neutralizes spreadsheet formula injection', () => {
    expect(csv([['=SUM(A1)', 'a"b', 'ภาษาไทย']])).toContain('"\'=SUM(A1)","a""b","ภาษาไทย"');
  });
});
describe('offline persistence', () => {
  it('survives reopening without marking pending records synced', async () => {
    const pending = saveTrip(data, trip);
    await persistData('owner-a', pending);
    expect(await loadData('owner-a')).toEqual(pending);
  });
  it('isolates accounts', async () => {
    await persistData('owner-one', data);
    expect((await loadData('owner-two')).projects).toHaveLength(0);
  });
});
