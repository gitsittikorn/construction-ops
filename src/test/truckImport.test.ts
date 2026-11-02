import { truckHeaders, parseTruckRows, planTruckImport, applyTruckImport } from '../truckImport';
import { saveMaster, matchesMaster } from '../masterData';
import { emptyData, type Master } from '../models';
const truck: Master = {
  id: 'truck',
  kind: 'truck',
  name: '81-1234',
  province: 'ภูเก็ต',
  phone: '0812345678',
  truckType: 'six-wheel',
  capacity: 6,
  detail: 'old',
  active: true,
  createdAt: 'old',
  updatedAt: 'old',
};
const row = (values: unknown[] = []) =>
  ['', '81-1234', 'ภูเก็ต', '0812345678', 'หกล้อ', 6, 'ทีม A', 'new', 'ใช้งาน'].map(
    (value, index) => (values[index] === undefined ? value : values[index]),
  );
const parse = (data: unknown[][]) => parseTruckRows([truckHeaders, ...data]);
it('parses Thai fields, truck types and multiple team tags while retaining phone zeroes', () => {
  const rows = parse([row()]);
  expect(rows[0]).toMatchObject({
    plate: '81-1234',
    province: 'ภูเก็ต',
    phone: '0812345678',
    truckType: 'six-wheel',
    tags: ['ทีม A'],
    errors: [],
  });
  expect(
    parse([row(['', '82-2222', '', '', 'สิบล้อ', 12, 'ทีม A, ทีม B, ทีม A'])])[0].tags,
  ).toEqual(['ทีม A', 'ทีม B']);
});
it('rejects missing/duplicate headers, empty plates, invalid type, negative capacity, invalid phone and numeric phone cells', () => {
  expect(() => parseTruckRows([['wrong']])).toThrow();
  expect(() => parseTruckRows([[...truckHeaders, 'ทะเบียนรถ']])).toThrow();
  for (const bad of [
    row(['', '']),
    row(['', '', '', '08123abc']),
    row(['', '81-1234', 'ภูเก็ต', 812345678]),
    row(['', '81-1234', '', '', 'invalid']),
    row(['', '81-1234', '', '', 'หกล้อ', -1]),
  ])
    expect(parse([bad])[0].errors.length).toBeGreaterThan(0);
});
it('detects duplicate registrations in a file but treats different provinces as distinct trucks', () => {
  expect(planTruckImport(parse([row(), row()]), [], false).errors).toBe(1);
  expect(planTruckImport(parse([row(), row(['', '81-1234', 'พังงา'])]), [], false).creates).toBe(2);
});
it('defaults to skipping existing trucks and requires explicit update mode', () => {
  const rows = parse([row()]);
  expect(planTruckImport(rows, [truck], false).skips).toBe(1);
  expect(planTruckImport(rows, [truck], true).updates).toBe(1);
  expect(
    applyTruckImport({ ...emptyData, masters: [truck] }, rows, false, 'owner', [truck]).masters,
  ).toEqual([truck]);
});
it('creates new team tags and trucks atomically with audit history and stable IDs on update', () => {
  const data = applyTruckImport(emptyData, parse([row()]), false, 'owner', []);
  const saved = data.masters.find((item) => item.kind === 'truck')!;
  const tag = data.masters.find((item) => item.kind === 'tag')!;
  expect(saved.tagIds).toEqual([tag.id]);
  expect(data.audit).toHaveLength(2);
  const rows = parse([row([saved.id, saved.name, saved.province, '0899999999', 'สิบล้อ', 12])]);
  const updated = applyTruckImport(data, rows, true, 'owner', data.masters);
  expect(updated.masters.find((item) => item.kind === 'truck')).toMatchObject({
    id: saved.id,
    createdAt: saved.createdAt,
    phone: '0899999999',
    truckType: 'ten-wheel',
  });
  expect(updated.audit.at(-1)?.before).toEqual(saved);
});
it('rejects stale previews, unknown IDs and conflicting targets without changing original data', () => {
  const rows = parse([row()]);
  expect(() =>
    applyTruckImport({ ...emptyData, masters: [truck] }, rows, true, 'owner', []),
  ).toThrow('เปลี่ยน');
  expect(planTruckImport(parse([row(['unknown'])]), [truck], true).errors).toBe(1);
  const original = { ...emptyData, masters: [truck] };
  expect(() => applyTruckImport(original, parse([row(), row()]), true, 'owner', [truck])).toThrow();
  expect(original.masters).toEqual([truck]);
});
it('matches legacy registrations with no province for review instead of adding duplicates', () => {
  const legacy = { ...truck, province: undefined };
  const plan = planTruckImport(parse([row()]), [legacy], false);
  expect(plan.skips).toBe(1);
  expect(plan.creates).toBe(0);
});
it('filters tags and searches province, phone and type without mixing other tag teams', () => {
  const tag: Master = { ...truck, id: 'team-a', kind: 'tag', name: 'ทีม A' };
  const tagged = { ...truck, tagIds: ['team-a'] };
  expect(matchesMaster(tagged, [tag], '081', 'team-a')).toBeTruthy();
  expect(matchesMaster(tagged, [tag], 'หกล้อ', '')).toBeTruthy();
  expect(matchesMaster(tagged, [tag], '', 'other-team')).toBeFalsy();
  expect(matchesMaster(tagged, [tag], 'ทีม A', '')).toBeTruthy();
});
it('validates tag uniqueness and active references while allowing legacy inactive assignments', () => {
  const tag: Master = { ...truck, id: 'team-a', kind: 'tag', name: 'ทีม A', active: false };
  expect(() =>
    saveMaster(
      { ...emptyData, masters: [tag] },
      { ...tag, id: 'duplicate', name: ' ทีม A ' },
      'owner',
    ),
  ).toThrow();
  expect(() =>
    saveMaster({ ...emptyData, masters: [tag] }, { ...truck, tagIds: [tag.id] }, 'owner'),
  ).toThrow();
  const old = { ...truck, tagIds: [tag.id] };
  expect(() =>
    saveMaster({ ...emptyData, masters: [tag, old] }, { ...old, detail: 'edited' }, 'owner'),
  ).not.toThrow();
});
