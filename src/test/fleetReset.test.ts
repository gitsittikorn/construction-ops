import { analyzeFleet, fleetSnapshot, resetFleet } from '../fleetReset';
import { applyTruckImport, parseTruckRows, truckHeaders } from '../truckImport';
import { integrityIssues } from '../syncModel';
import { fixture, truck } from './syncFixtures';
import type { Data } from '../models';

function fleet(): Data {
  const data = fixture(); // its trip history points at `truck`
  data.masters = [
    { ...truck, name: '80-1111', driverId: 'used-driver' },
    { ...truck, id: 'used-driver', kind: 'driver', name: 'สมชาย' },
    { ...truck, id: 'unused', name: '80-2222', driverId: 'unused-driver' },
    { ...truck, id: 'unused-driver', kind: 'driver', name: 'วิชัย' },
    { ...truck, id: 'team', kind: 'tag', name: 'เคน' },
  ];
  data.trips[0].driverId = 'used-driver';
  return data;
}

it('reports history usage, duplicates and unmapped trucks without changing data', () => {
  const data = fleet();
  data.masters.push({ ...truck, id: 'copy', name: '80 1111' });
  const before = structuredClone(data);
  const report = analyzeFleet(data);
  expect(report.usedTrucks.map((item) => item.id)).toEqual(['truck']);
  expect(report.usedDrivers.map((item) => item.id)).toEqual(['used-driver']);
  expect(report.duplicatePlates).toHaveLength(1);
  expect(report.withoutDriver.map((item) => item.id)).toEqual(['copy']);
  expect(data).toEqual(before);
});

it('soft deletes unused records, keeps referenced IDs and then re-syncs without duplicates', () => {
  const data = fleet();
  const reset = resetFleet(data, 'owner', [], fleetSnapshot(data));
  expect(reset.trips).toEqual(data.trips);
  expect(reset.masters.find((item) => item.id === 'truck')).toMatchObject({
    active: false,
    driverId: '',
  });
  expect(reset.masters.find((item) => item.id === 'used-driver')?.active).toBe(false);
  expect(reset.deletedMasters?.map((item) => item.id).sort()).toEqual(['unused', 'unused-driver']);
  expect(reset.masters.some((item) => item.id === 'team')).toBe(true);
  expect(integrityIssues(reset)).toEqual([]);

  const rows = parseTruckRows([
    truckHeaders,
    ['', '80-1111', '', '', '', 'สมชาย', 'เคน', '6', '', ''],
    ['', '80-2222', '', '', '', 'วิชัย', 'เคน', '6', '', ''],
  ]);
  const synced = applyTruckImport(reset, rows, true, 'owner', reset.masters);
  expect(synced.masters.find((item) => item.id === 'truck')).toMatchObject({
    active: true,
    driverId: 'used-driver',
  });
  expect(synced.masters.filter((item) => item.kind === 'truck')).toHaveLength(2);
  expect(synced.masters.filter((item) => item.kind === 'driver')).toHaveLength(2);
  expect(integrityIssues(synced)).toEqual([]);
});

it('refuses a stale confirmation or an empty fleet', () => {
  const data = fleet();
  const snapshot = fleetSnapshot(data);
  data.masters[0].name = 'changed';
  expect(() => resetFleet(data, 'owner', [], snapshot)).toThrow('เปลี่ยนแล้ว');
  const empty = fixture();
  empty.masters = [];
  expect(() => resetFleet(empty, 'owner', [], fleetSnapshot(empty))).toThrow('ไม่มีข้อมูล');
});
