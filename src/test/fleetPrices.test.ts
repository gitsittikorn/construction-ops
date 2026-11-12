import { assignedDriver, saveMaster, saveTruckWithDriver } from '../masterData';
import { priceHistory, saveSoilPrice } from '../soilPrices';
import { validateCloudRecord } from '../cloudValidation';
import { deleteRecord } from '../deletion';
import { integrityIssues, prepareSync } from '../syncModel';
import { fixture, truck } from './syncFixtures';
import type { Data, Master } from '../models';
const master = (id: string, kind: Master['kind']): Master => ({ ...truck, id, name: id, kind });
function data(): Data {
  return {
    ...fixture(),
    masters: [
      truck,
      master('driver', 'driver'),
      master('source1', 'source'),
      master('source2', 'source'),
      master('soil', 'soilType'),
    ],
  };
}
const input = {
  soilId: 'soil',
  sourceId: 'source1',
  amount: '120.50',
  unit: 'm3',
  note: 'Initial price',
};

it('creates the driver and truck together and prevents duplicate, missing or inactive assignments without modifying input', () => {
  const original = data();
  const next = saveTruckWithDriver(
    original,
    { ...truck, phone: '0812345678', nickname: 'ชาย' },
    'local',
    'สมชาย',
  );
  const saved = next.masters.find((item) => item.id === truck.id)!;
  const driver = next.masters.find((item) => item.id === saved.driverId)!;
  expect(driver).toMatchObject({
    name: 'สมชาย',
    phone: '0812345678',
    nickname: 'ชาย',
    kind: 'driver',
  });
  expect(assignedDriver(next.masters, truck.id)).toBe(driver.id);
  expect(original).toEqual(data());
  expect(() =>
    saveMaster(next, { ...truck, id: 'other', name: '99-9999', driverId: driver.id }, 'local'),
  ).toThrow('มีรถประจำแล้ว');
  expect(() => saveMaster(original, { ...truck, driverId: 'missing' }, 'local')).toThrow(
    'เปิดใช้งาน',
  );
  expect(() =>
    saveTruckWithDriver(original, { ...truck, driverId: 'driver' }, 'local', 'ใหม่'),
  ).toThrow('อย่างใดอย่างหนึ่ง');
  expect(() => saveTruckWithDriver(original, { ...truck, phone: 'bad' }, 'local', 'ใหม่')).toThrow(
    'เบอร์โทร',
  );
  expect(original).toEqual(data());
});

it('retains links on ordinary edits/imports, allows explicit reassignment, protects references and keeps trip history unchanged', () => {
  const original = data();
  const linked = saveMaster(original, { ...truck, driverId: 'driver' }, 'local');
  const edited = saveMaster(linked, { ...truck, nickname: 'รถใหญ่' }, 'local');
  expect(edited.masters.find((item) => item.id === truck.id)?.driverId).toBe('driver');
  expect(edited.trips).toEqual(original.trips);
  expect(() => deleteRecord(edited, 'master', 'driver', 'local')).toThrow('อ้างอิง');
  const free = saveMaster(edited, { ...truck, driverId: '' }, 'local');
  const reassigned = saveMaster(
    free,
    { ...truck, id: 't2', name: '99-9999', driverId: 'driver' },
    'local',
  );
  expect(assignedDriver(reassigned.masters, 't2')).toBe('driver');
  expect(
    assignedDriver(
      reassigned.masters.map((item) => (item.id === 'driver' ? { ...item, active: false } : item)),
      't2',
    ),
  ).toBe('');
  expect(
    integrityIssues({
      ...reassigned,
      masters: reassigned.masters.filter((item) => item.id !== 'driver'),
    }),
  ).toContain('รถ t2: ไม่พบคนขับประจำรถ');
});

it('stores independent source prices in exact satang, newest first with ordinal numbers and immutable name snapshots', () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-11-12T01:00:00.000Z'));
    const original = data();
    const first = saveSoilPrice(original, input, 'local');
    vi.setSystemTime(new Date('2026-11-12T02:00:00.000Z'));
    const other = saveSoilPrice(
      first,
      { ...input, sourceId: 'source2', amount: '85.25', unit: 'trip' },
      'local',
    );
    vi.setSystemTime(new Date('2026-11-12T03:00:00.000Z'));
    const next = saveSoilPrice(other, { ...input, amount: '130.10' }, 'local');
    const soil = next.masters.find((item) => item.id === 'soil')!;
    expect(
      priceHistory(next, soil, 'source1').map((entry) => [entry.sequence, entry.satang]),
    ).toEqual([
      [2, 13010],
      [1, 12050],
    ]);
    expect(priceHistory(next, soil, 'source2')[0]).toMatchObject({ satang: 8525, unit: 'trip' });
    expect(priceHistory(next, soil).map((entry) => entry.sequence)).toEqual([3, 2, 1]);
    const renamed = saveMaster(next, { ...soil, name: 'renamed' }, 'local');
    expect(priceHistory(renamed, soil)[0].soilName).toBe('soil');
    expect(original).toEqual(data());
    expect(next.trips).toEqual(original.trips);
    const price = next.masters.find((item) => item.kind === 'soilPrice')!;
    expect(() => saveMaster(next, { ...price, name: 'overwrite' }, 'local')).toThrow(
      'แก้ไขหรือลบไม่ได้',
    );
    expect(() => deleteRecord(next, 'master', price.id, 'local')).toThrow('อ้างอิง');
    expect(() => deleteRecord(next, 'master', 'source1', 'local')).toThrow('อ้างอิง');
    const prepared = prepareSync(original, next);
    const pending = Object.values(prepared.sync!.entries).filter(
      (entry) => 'kind' in entry.desired.payload && entry.desired.payload.kind === 'soilPrice',
    );
    expect(pending).toHaveLength(3);
    for (const entry of pending) {
      expect(entry.status).toBe('pending');
      expect(() => validateCloudRecord('masters', entry.desired)).not.toThrow();
    }
  } finally {
    vi.useRealTimers();
  }
});

it.each(['', '-1', '1.234', 'NaN', 'Infinity', '1e3', '10000000001', '1,000'])(
  'rejects invalid price %s without adding a history event',
  (amount) => {
    const original = data();
    expect(() => saveSoilPrice(original, { ...input, amount }, 'local')).toThrow();
    expect(original).toEqual(data());
  },
);

it('rejects unavailable references, invalid units and malformed cloud prices; supports zero', () => {
  const original = data();
  for (const patch of [{ sourceId: 'missing' }, { soilId: 'missing' }, { unit: 'tonne' }])
    expect(() => saveSoilPrice(original, { ...input, ...patch }, 'local')).toThrow();
  const next = saveSoilPrice(original, { ...input, amount: '0' }, 'local');
  const prepared = prepareSync(original, next);
  const record = Object.values(prepared.sync!.entries).find(
    (entry) => 'kind' in entry.desired.payload && entry.desired.payload.kind === 'soilPrice',
  )!.desired;
  const payload = record.payload as Master;
  for (const satang of [-1, 1.2, Infinity, '10'])
    expect(() =>
      validateCloudRecord('masters', {
        ...record,
        payload: { ...payload, soilPrice: { ...payload.soilPrice, satang } },
      }),
    ).toThrow();
  expect(() => validateCloudRecord('masters', { ...record, deletedAt: 'now' })).toThrow();
  expect(
    integrityIssues({ ...next, masters: next.masters.filter((item) => item.id !== 'soil') }),
  ).toContain(`ราคาดิน ${payload.id}: ไม่พบแหล่งดินหรือชนิดดิน`);
});
