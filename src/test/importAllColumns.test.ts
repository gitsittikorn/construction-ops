import {
  applyTruckImport,
  parseTruckRows,
  phoneDigits,
  planTruckImport,
  truckHeaders,
  unmappedHeaders,
} from '../truckImport';
import { assertCompanyMutation } from '../companyPermissions';
import { cacheOwner } from '../workspaceIdentity';
import { integrityIssues } from '../syncModel';
import { saveTrip } from '../domain';
import { emptyData, type Data, type Master } from '../models';

// Fictitious people and numbers only.
const row = (values: Partial<Record<string, string>> = {}) =>
  truckHeaders.map(
    (header) =>
      ({
        ทะเบียนรถ: '80-0001',
        จังหวัดทะเบียน: 'พังงา',
        ประเภทรถ: '6 ล้อ',
        เบอร์โทร: '000-000-0001 ',
        ชื่อเล่น: 'หนึ่ง',
        แท็กทีม: 'ทีมเหนือ',
        'ความจุ (m³)': '7',
        ...values,
      })[header] ?? '',
  );
const sheet = (...rows: string[][]) => parseTruckRows([truckHeaders, ...rows]);
const apply = (data: Data, rows: ReturnType<typeof sheet>, update = false, clear = false) =>
  applyTruckImport(data, rows, update, 'owner', data.masters, true, clear);
const of = (data: Data, kind: Master['kind']) => data.masters.filter((item) => item.kind === kind);

it('stores every column and gives the truck team to its new driver', () => {
  const data = apply(emptyData, sheet(row({ รายละเอียด: 'บรรทุกปาล์ม' })));
  const [truck] = of(data, 'truck'),
    [driver] = of(data, 'driver'),
    [team] = of(data, 'tag');
  expect(truck).toMatchObject({
    name: '80-0001',
    province: 'พังงา',
    truckType: 'six-wheel',
    phone: '000-000-0001',
    nickname: 'หนึ่ง',
    capacity: 7,
    detail: 'บรรทุกปาล์ม',
    active: true,
    tagIds: [team.id],
    driverId: driver.id,
  });
  expect(truck.id).toBeTruthy();
  expect(driver).toMatchObject({ phone: '000-000-0001', tagIds: [team.id] });
  expect(integrityIssues(data)).toEqual([]);
});

it('reads every row, skipping only truly blank ones', () => {
  const rows = Array.from({ length: 1500 }, (_, index) =>
    row({ ทะเบียนรถ: `P-${index}`, เบอร์โทร: '', ชื่อเล่น: '' }),
  );
  const parsed = parseTruckRows([truckHeaders, ...rows, truckHeaders.map(() => '  ')]);
  expect(parsed).toHaveLength(1500);
  expect(planTruckImport(parsed, [], false).creates).toBe(1500);
});

it('keeps rows with missing optional values and reports a missing plate', () => {
  const parsed = sheet(
    row({ จังหวัดทะเบียน: '', เบอร์โทร: '', ชื่อเล่น: '', แท็กทีม: '', 'ความจุ (m³)': '' }),
    row({ ทะเบียนรถ: '' }),
  );
  const plan = planTruckImport(parsed, [], false);
  expect(plan.rows.map((item) => item.action)).toEqual(['create', 'error']);
  expect(plan).toMatchObject({ incomplete: 1, errors: 1 });
  const data = apply(emptyData, [parsed[0]]);
  expect(of(data, 'truck')[0]).toMatchObject({ province: '', capacity: 0, tagIds: [] });
  expect(of(data, 'driver')).toHaveLength(0);
});

it('maps reordered and loosely spaced headers and warns about unknown columns', () => {
  const headers = [...truckHeaders].reverse().map((header) => ` ${header.replace('³', '3')} `);
  const values = [...row()].reverse();
  expect(parseTruckRows([headers, values])[0]).toMatchObject({ plate: '80-0001', capacity: 7 });
  expect(unmappedHeaders([...headers, 'สีรถ'])).toEqual(['สีรถ']);
});

it('keeps stored values for blank cells and clears them only when chosen', () => {
  const data = apply(emptyData, sheet(row({ รายละเอียด: 'เดิม', สถานะ: 'ปิดใช้งาน' })));
  const blank = sheet(
    row({ เบอร์โทร: '', ชื่อเล่น: '', แท็กทีม: '', 'ความจุ (m³)': '', รายละเอียด: '' }),
  );
  expect(planTruckImport(blank, data.masters, true)).toMatchObject({ updates: 0, unchanged: 1 });
  const cleared = apply(data, blank, true, true);
  expect(of(cleared, 'truck')[0]).toMatchObject({
    phone: '',
    detail: '',
    capacity: 0,
    tagIds: [],
    active: true,
  });
});

it('shows old and new values, updates once and never duplicates on re-import', () => {
  const data = apply(emptyData, sheet(row()));
  const next = sheet(row({ 'ความจุ (m³)': '8', แท็กทีม: 'ทีมใต้' }));
  const skipped = planTruckImport(next, data.masters, false);
  expect(skipped).toMatchObject({ skips: 1, unchanged: 0 });
  const plan = planTruckImport(next, data.masters, true);
  expect(plan).toMatchObject({ updates: 1, teamLinks: 1, existingDrivers: 1 });
  expect(plan.rows[0].changes).toEqual([
    { label: 'ความจุ (m³)', before: '7', after: '8' },
    { label: 'แท็กทีม', before: 'ทีมเหนือ', after: 'ทีมใต้' },
  ]);
  const updated = apply(data, next, true);
  const again = apply(updated, next, true);
  expect(again).toEqual(updated);
  expect([of(again, 'truck').length, of(again, 'driver').length, of(again, 'tag').length]).toEqual([
    1, 1, 2,
  ]);
});

it('treats team names that differ only by spacing or case as one team', () => {
  const data = apply(
    emptyData,
    sheet(
      row({ แท็กทีม: 'Team  A' }),
      row({ ทะเบียนรถ: '80-0002', เบอร์โทร: '', ชื่อเล่น: '', แท็กทีม: ' team a ' }),
    ),
  );
  expect(of(data, 'tag')).toHaveLength(1);
});

it('matches phones across formats and sends unclear identities to review', () => {
  expect(phoneDigits('+66 81-000-0001')).toBe('0810000001');
  const driver: Master = {
    id: 'd',
    kind: 'driver',
    name: 'หนึ่ง',
    detail: '',
    capacity: 0,
    active: true,
    createdAt: 'x',
    updatedAt: 'x',
  };
  const nameOnly = planTruckImport(sheet(row()), [driver], false);
  expect(nameOnly).toMatchObject({ reviews: 1, links: 0, newDrivers: 0 });
  const samePhone = planTruckImport(
    sheet(row({ ชื่อเล่น: 'คนอื่น' })),
    [{ ...driver, phone: '0000000001' }],
    false,
  );
  expect(samePhone).toMatchObject({ reviews: 1, newDrivers: 0 });
  const samePerson = planTruckImport(sheet(row()), [{ ...driver, phone: '000 000 0001' }], false);
  expect(samePerson.rows[0].driver).toMatchObject({ id: 'd', isNew: false });
});

it('does not create a second truck when the sheet omits a known province', () => {
  const data = apply(emptyData, sheet(row()));
  const plan = planTruckImport(sheet(row({ จังหวัดทะเบียน: '' })), data.masters, true);
  expect(plan).toMatchObject({ creates: 0, errors: 0 });
  expect(of(apply(data, sheet(row({ จังหวัดทะเบียน: '' })), true), 'truck')[0].province).toBe(
    'พังงา',
  );
});

it('writes nothing when any row fails and leaves recorded trips unchanged', () => {
  const data = apply(emptyData, sheet(row()));
  const [truck] = of(data, 'truck');
  data.projects = [
    {
      id: 'p',
      name: 'โครงการทดสอบ',
      customer: '',
      location: '',
      startDate: '',
      endDate: '',
      status: 'active',
      description: '',
      createdAt: 'x',
      updatedAt: 'x',
    },
  ];
  const recorded = saveTrip(data, {
    id: 't',
    projectId: 'p',
    truckId: truck.id,
    driverId: truck.driverId!,
    sourceId: '',
    soilType: '',
    date: '2026-11-01',
    time: '08:00',
    notes: '',
    revision: 1,
    syncStatus: 'pending',
    createdAt: 'x',
    updatedAt: 'x',
  });
  const before = structuredClone(recorded);
  expect(() =>
    apply(recorded, sheet(row({ 'ความจุ (m³)': '9' }), row({ ทะเบียนรถ: '' })), true),
  ).toThrow('ผิดพลาด');
  expect(recorded).toEqual(before);
  const updated = apply(recorded, sheet(row({ 'ความจุ (m³)': '9' })), true);
  expect(updated.trips).toEqual(before.trips);
  expect(updated.trips[0].capacityPerTrip).toBe(7);
});

it('refuses an import written by an operator account', () => {
  const owner = cacheOwner({ companyId: 'c', actorUid: 'u', role: 'operator' });
  const next = applyTruckImport(emptyData, sheet(row()), false, owner, []);
  expect(() => assertCompanyMutation(emptyData, next, owner)).toThrow('สิทธิ์');
});
