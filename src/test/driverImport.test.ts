import {
  applyTruckImport,
  driverHeader,
  parseTruckRows,
  planTruckImport,
  truckHeaders,
} from '../truckImport';
import { integrityIssues } from '../syncModel';
import { emptyData, type Data, type Master } from '../models';

// Same columns as the live sheet, which has no driver column: the nickname is the driver.
const sheetHeaders = truckHeaders;
const sheetRow = (plate: string, nickname: string, phone = '') => [
  '',
  plate,
  'พังงา',
  '6 ล้อ',
  phone,
  nickname,
  'เคน',
  '6',
  '',
  '',
];
const sheet = (...rows: string[][]) => parseTruckRows([sheetHeaders, ...rows]);
const run = (data: Data, rows: ReturnType<typeof sheet>, update = false) =>
  applyTruckImport(data, rows, update, 'owner', data.masters);
const kind = (data: Data, value: Master['kind']) =>
  data.masters.filter((item) => item.kind === value);
const driverOf = (data: Data, plate: string) =>
  data.masters.find(
    (item) => item.id === data.masters.find((truck) => truck.name === plate)?.driverId,
  )?.name;

it('creates and links a driver for each truck from the nickname column', () => {
  const rows = sheet(sheetRow('80-1234', 'สมชาย', '000-000-0001 '), sheetRow('81-5678', 'วิชัย'));
  expect(planTruckImport(rows, [], false)).toMatchObject({ creates: 2, links: 2, newDrivers: 2 });
  const data = run(emptyData, rows);
  expect(driverOf(data, '80-1234')).toBe('สมชาย');
  expect(driverOf(data, '81-5678')).toBe('วิชัย');
  expect(integrityIssues(data)).toEqual([]);
});

it('does not duplicate trucks, drivers or teams when the same sheet is synced again', () => {
  const rows = sheet(sheetRow('80-1234', 'สมชาย', '0810000000'), sheetRow('81-5678', 'วิชัย'));
  const first = run(emptyData, rows);
  for (const update of [false, true]) {
    expect(planTruckImport(rows, first.masters, update)).toMatchObject({
      creates: 0,
      links: 0,
      newDrivers: 0,
    });
    const again = run(first, rows, update);
    expect(kind(again, 'truck')).toHaveLength(2);
    expect(kind(again, 'driver')).toHaveLength(2);
    expect(kind(again, 'tag')).toHaveLength(1);
  }
});

it('repairs previously imported trucks without overwriting their other fields', () => {
  const rows = sheet(sheetRow('80-1234', 'สมชาย'));
  const old = applyTruckImport(emptyData, rows, false, 'owner', [], false);
  expect(driverOf(old, '80-1234')).toBeUndefined();
  old.masters = old.masters.map((item) =>
    item.kind === 'truck' ? { ...item, detail: 'แก้ในแอป' } : item,
  );
  expect(planTruckImport(rows, old.masters, false).rows[0].action).toBe('link');
  const fixed = run(old, rows);
  expect(driverOf(fixed, '80-1234')).toBe('สมชาย');
  expect(kind(fixed, 'truck')[0].detail).toBe('แก้ในแอป');
  expect(kind(fixed, 'truck')[0].id).toBe(kind(old, 'truck')[0].id);
});

it('keeps two people with the same nickname apart and never gives one driver two trucks', () => {
  const rows = sheet(
    sheetRow('80-0001', 'โรจน์', '0930000001'),
    sheetRow('80-0002', 'โรจน์'),
    sheetRow('80-0003', 'หมี', '0890000001'),
    sheetRow('80-0004', 'หมี', '089-000-0001'),
  );
  const plan = planTruckImport(rows, [], false);
  expect(plan.rows[1].notes.join()).toContain('ซ้ำ');
  expect(plan.rows[3].driver).toBeUndefined();
  const data = run(emptyData, rows);
  expect(kind(data, 'driver')).toHaveLength(3);
  const links = kind(data, 'truck').flatMap((truck) => (truck.driverId ? [truck.driverId] : []));
  expect(new Set(links).size).toBe(links.length);
});

it('keeps a manually renamed driver unless an updated sheet actually names another', () => {
  const first = run(emptyData, sheet(sheetRow('80-1234', 'ชาย')));
  const renamed: Data = {
    ...first,
    masters: first.masters.map((item) =>
      item.kind === 'driver' ? { ...item, name: 'สมชาย ใจดี', nickname: '' } : item,
    ),
  };
  const same = run(renamed, sheet(sheetRow('80-1234', 'ชาย')), true);
  expect(driverOf(same, '80-1234')).toBe('สมชาย ใจดี');
  const changed = run(renamed, sheet(sheetRow('80-1234', 'วิชัย')), true);
  expect(driverOf(changed, '80-1234')).toBe('วิชัย');
  expect(kind(changed, 'driver')).toHaveLength(2);
});

it('prefers the explicit driver column and leaves the truck unlinked when both are blank', () => {
  const rows = parseTruckRows([
    [...truckHeaders, driverHeader],
    ['', '80-1234', '', '', '', 'ชาย', '', '', '', '', 'สมชาย'],
    ['', '81-5678', '', '', '', '', '', '', '', '', ''],
  ]);
  const data = run(emptyData, rows);
  expect(driverOf(data, '80-1234')).toBe('สมชาย');
  expect(driverOf(data, '81-5678')).toBeUndefined();
});
