import { truckHeaders, legacyTruckHeaders, parseTruckRows, applyTruckImport } from '../truckImport';
import { matchesMaster } from '../masterData';
import { validateCloudRecord } from '../cloudValidation';
import { cloudRecords, fixture, truck } from './syncFixtures';

const headers = [
  'รหัสรถ',
  'ทะเบียนรถ',
  'จังหวัดทะเบียน',
  'ประเภทรถ',
  'เบอร์โทร',
  'ชื่อเล่น',
  'แท็กทีม',
  'ความจุ (m³)',
  'รายละเอียด',
  'สถานะ',
];
const row = [
  '',
  '81-0001',
  'ภูเก็ต',
  'หกล้อ',
  '0812345678',
  'เสี่ยเล็ก',
  'ทีม A',
  6,
  'รถประจำ',
  'ใช้งาน',
];

it('imports the exact ten-column user layout and reordered columns without shifting phone, nickname or volume', () => {
  expect(truckHeaders).toEqual(headers);
  const parsed = parseTruckRows([headers, row]);
  expect(parsed[0]).toMatchObject({
    phone: '0812345678',
    nickname: 'เสี่ยเล็ก',
    truckType: 'six-wheel',
    tags: ['ทีม A'],
    capacity: 6,
    errors: [],
  });
  const data = applyTruckImport(
    { ...fixture(), masters: [], trips: [] },
    parsed,
    false,
    'owner',
    [],
  );
  const saved = data.masters.find((master) => master.kind === 'truck')!;
  expect(saved.nickname).toBe('เสี่ยเล็ก');
  expect(matchesMaster(saved, data.masters, 'เสี่ยเล็ก', '')).toBe(true);
  expect(parseTruckRows([[...headers].reverse(), [...row].reverse()])[0]).toEqual(parsed[0]);
});

it('preserves nicknames on legacy nine-column updates and clears them only with an explicit new-column blank', () => {
  const saved = { ...truck, nickname: 'ชื่อเดิม', name: '81-0001' };
  const data = { ...fixture(), masters: [saved] };
  const oldRow = [saved.id, saved.name, '', '', 'หกล้อ', 6, '', '', 'ใช้งาน'];
  const parsed = parseTruckRows([legacyTruckHeaders, oldRow]);
  expect(parsed[0].nickname).toBeUndefined();
  expect(applyTruckImport(data, parsed, true, 'owner', data.masters).masters[0].nickname).toBe(
    'ชื่อเดิม',
  );
  const blank = [...row];
  blank[0] = saved.id;
  blank[5] = '';
  blank[6] = '';
  expect(
    applyTruckImport(data, parseTruckRows([headers, blank]), true, 'owner', data.masters).masters[0]
      .nickname,
  ).toBe('');
  expect(data.masters[0].nickname).toBe('ชื่อเดิม');
});

it('rejects oversized nicknames locally and malformed cloud nicknames without losing the original data', () => {
  const bad = [...row];
  bad[5] = 'x'.repeat(101);
  const data = fixture();
  expect(() =>
    applyTruckImport(data, parseTruckRows([headers, bad]), false, 'owner', data.masters),
  ).toThrow();
  expect(data).toEqual(fixture());
  const record = cloudRecords().find((item) => item.collection === 'masters')!.record;
  expect(() =>
    validateCloudRecord('masters', {
      ...record,
      payload: { ...record.payload, nickname: 'รถเล็ก' },
    }),
  ).not.toThrow();
  for (const nickname of [123, 'x'.repeat(101)])
    expect(() =>
      validateCloudRecord('masters', { ...record, payload: { ...record.payload, nickname } }),
    ).toThrow('ข้อมูลรถ');
});
