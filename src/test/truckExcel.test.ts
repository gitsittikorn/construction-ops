import { readFileSync } from 'node:fs';
import { createTruckWorkbook, readTruckWorkbook } from '../truckExcel';
import { readBlobBytes } from '../files';
import type { Master } from '../models';
const truck: Master = {
  id: 'stable-id',
  kind: 'truck',
  name: '81-0001',
  province: 'ภูเก็ต',
  phone: '0812345678',
  nickname: '=ชื่อเล่น',
  truckType: 'ten-wheel',
  tagIds: ['tag'],
  detail: '=HYPERLINK("example")',
  capacity: 12,
  active: true,
  createdAt: 'now',
  updatedAt: 'now',
};
const tag: Master = { ...truck, id: 'tag', kind: 'tag', name: 'ทีม A' };
it('exports and reads real XLSX files without stripping leading zeros or treating strings as formulas', async () => {
  const bytes = await readBlobBytes(await createTruckWorkbook([truck], [truck, tag]));
  expect(new Uint8Array(bytes).slice(0, 2)).toEqual(new Uint8Array([80, 75]));
  const rows = await readTruckWorkbook(bytes);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: 'stable-id',
    plate: '81-0001',
    phone: '0812345678',
    nickname: '=ชื่อเล่น',
    truckType: 'ten-wheel',
    tags: ['ทีม A'],
    detail: '=HYPERLINK("example")',
    errors: [],
  });
});
it('generates a blank template that never imports the separate Examples sheet', async () => {
  expect(
    await readTruckWorkbook(await readBlobBytes(await createTruckWorkbook([], [], true))),
  ).toEqual([]);
});
it('ships a valid downloadable template with the same schema as the UI', async () => {
  const file = readFileSync('public/templates/trucks-import-template.xlsx');
  expect(await readTruckWorkbook(new Uint8Array(file).buffer)).toEqual([]);
});
it('rejects corrupt workbooks', async () => {
  await expect(readTruckWorkbook(new TextEncoder().encode('not an xlsx').buffer)).rejects.toThrow(
    'อ่านไฟล์',
  );
});
