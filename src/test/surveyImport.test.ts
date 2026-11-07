import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { parseSurveyCsv, surveyPointsFromRows, readSurveyImport, surveyCsv } from '../surveyImport';
import { gridPoints, calculateSurvey } from '../surveying';
import { readBlobBytes } from '../files';
import type { SurveyBody } from '../workspaceModels';
const body = (): SurveyBody => ({
  benchmark: 'BM',
  elevation: 0,
  datum: 'test',
  notes: '',
  observations: [],
  width: 10,
  length: 10,
  spacingX: 10,
  spacingY: 10,
  design: 'custom',
  designLevel: 0,
  slopeX: 0,
  slopeY: 0,
  allowance: 30,
  cutSwell: 20,
  points: gridPoints(10, 10, 10, 10, 0).map((point) => ({
    ...point,
    existing: -1,
    customDesign: 1,
  })),
});
it('roundtrips UTF-8 CSV including negative levels without losing units, orientation or volumes', async () => {
  const original = body(),
    csv = surveyCsv(original);
  expect(csv.startsWith('\uFEFF')).toBe(true);
  const rows = parseSurveyCsv(csv);
  const points = surveyPointsFromRows(rows, original);
  expect(points).toEqual(original.points);
  expect(calculateSurvey({ ...original, points }).fill).toBeCloseTo(200);
  const file = new NodeFile([csv], 'grid.csv', { type: 'text/csv' }) as unknown as File;
  expect(await readSurveyImport(file, original)).toEqual(points);
  expect(parseSurveyCsv('a,b\r\n"a,b","line1\nline2"\r\n"a""b",c')).toEqual([
    ['a', 'b'],
    ['a,b', 'line1\nline2'],
    ['a"b', 'c'],
  ]);
});
it('validates imported XLSX points from the named grid sheet', async () => {
  const value = body();
  const { default: write } = await import('write-excel-file/universal');
  const rows = parseSurveyCsv(surveyCsv(value));
  const blob = await write([
    { sheet: 'กริด', data: rows.map((row) => row.map((cell) => ({ value: cell, type: String }))) },
  ]).toBlob();
  const file = new NodeFile([await readBlobBytes(blob)], 'grid.xlsx') as unknown as File;
  expect(await readSurveyImport(file, value)).toEqual(value.points);
});
it('rejects malformed CSV, missing/duplicate/wrong coordinates and formula cells without changing the current survey', () => {
  const original = body(),
    before = structuredClone(original);
  expect(() => parseSurveyCsv('"unclosed')).toThrow('ไม่ครบ');
  expect(() => parseSurveyCsv('"a"b,c')).toThrow('ไม่ถูกต้อง');
  const rows = parseSurveyCsv(surveyCsv(original));
  for (const change of [
    (copy: string[][]) => copy.pop(),
    (copy: string[][]) => {
      copy[1][1] = '999';
    },
    (copy: string[][]) => {
      copy[1][3] = '=1+1';
    },
    (copy: string[][]) => {
      copy[2][0] = copy[1][0];
    },
  ]) {
    const copy = structuredClone(rows);
    change(copy);
    expect(() => surveyPointsFromRows(copy, original)).toThrow();
    expect(original).toEqual(before);
  }
  expect(() => surveyPointsFromRows([['wrong header']], original)).toThrow('หัวตาราง');
});
it('refuses unsupported or oversized input without parsing or mutating the draft', async () => {
  await expect(
    readSurveyImport(new NodeFile(['data'], 'grid.txt') as unknown as File, body()),
  ).rejects.toThrow('รองรับ');
  const file = new NodeBlob(['x']);
  Object.defineProperties(file, { size: { value: 6 * 1024 * 1024 }, name: { value: 'grid.csv' } });
  await expect(readSurveyImport(file as unknown as File, body())).rejects.toThrow('5 MB');
});
