import { validateWorkbookArchive } from '../workbookSafety';
import { readBlobBytes } from '../files';
import { readTruckWorkbook, createTruckWorkbook } from '../truckExcel';
import { readSurveyImport } from '../surveyImport';
import { gridPoints } from '../surveying';
import { File as NodeFile } from 'node:buffer';

async function workbook() {
  return readBlobBytes(await createTruckWorkbook([], []));
}
function central(input: ArrayBuffer) {
  const view = new DataView(input);
  for (let at = input.byteLength - 22; at >= 0; at--)
    if (view.getUint32(at, true) === 0x06054b50)
      return { view, end: at, entry: view.getUint32(at + 16, true) };
  throw Error('test fixture has no ZIP directory');
}
it('accepts a real exported XLSX and rejects malformed headers and missing directory before parsing', async () => {
  const input = await workbook();
  expect(() => validateWorkbookArchive(input)).not.toThrow();
  expect(() => validateWorkbookArchive(new ArrayBuffer(8))).toThrow('โครงสร้าง');
  expect(() => validateWorkbookArchive(input.slice(0, -22))).toThrow('โครงสร้าง');
});
it('rejects declared expansion bombs before the truck or survey parser allocates their contents', async () => {
  const input = await workbook(),
    { view, entry } = central(input);
  view.setUint32(entry + 24, 1024 * 1024 * 1024, true);
  expect(() => validateWorkbookArchive(input)).toThrow('หลังแตกไฟล์');
  await expect(readTruckWorkbook(input)).rejects.toThrow('หลังแตกไฟล์');
  const body = {
    benchmark: 'BM',
    elevation: 0,
    datum: 'test',
    notes: '',
    observations: [],
    width: 10,
    length: 10,
    spacingX: 10,
    spacingY: 10,
    design: 'uniform' as const,
    designLevel: 1,
    slopeX: 0,
    slopeY: 0,
    allowance: 30,
    cutSwell: 0,
    points: gridPoints(10, 10, 10, 10, 0),
  };
  await expect(
    readSurveyImport(new NodeFile([input], 'bomb.xlsx') as unknown as File, body),
  ).rejects.toThrow('หลังแตกไฟล์');
});
it('fails closed on encrypted, multi-disk, ZIP64 and excessive entry declarations', async () => {
  const original = await workbook();
  for (const mutate of [
    ({ view, entry }: ReturnType<typeof central>) =>
      view.setUint16(entry + 8, view.getUint16(entry + 8, true) | 1, true),
    ({ view, end }: ReturnType<typeof central>) => view.setUint16(end + 4, 1, true),
    ({ view, end }: ReturnType<typeof central>) => {
      view.setUint16(end + 8, 65535, true);
      view.setUint16(end + 10, 65535, true);
    },
    ({ view, end }: ReturnType<typeof central>) => {
      view.setUint16(end + 8, 257, true);
      view.setUint16(end + 10, 257, true);
    },
  ]) {
    const copy = original.slice(0);
    mutate(central(copy));
    expect(() => validateWorkbookArchive(copy)).toThrow();
  }
});
