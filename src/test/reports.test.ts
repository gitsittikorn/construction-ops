import {
  reportRows,
  reportTotals,
  reportTable,
  reportCsv,
  reportWorkbook,
  printableReport,
  emptyReportFilter,
} from '../reports';
import { fixture, truck, project } from './syncFixtures';
import { createDaily, dailySessions, saveDailyRow } from '../daily';
import { readBlobBytes } from '../files';
import { readSheet } from 'read-excel-file/universal';

function data() {
  let value = createDaily(fixture(), project.id, '2026-11-06', 'admin');
  const s = dailySessions(value)[0];
  value = saveDailyRow(
    value,
    s.id,
    1,
    {
      id: 'row',
      truckId: truck.id,
      driverId: '',
      teamId: '',
      sourceId: '',
      soilType: '',
      tripCount: 5,
      capacity: 12,
      reportedTrips: 5,
      notes: '',
    },
    'admin',
  );
  return value;
}
it('computes exact totals from snapshot capacity and never invents historical volume or verification', () => {
  const rows = reportRows(data(), emptyReportFilter),
    totals = reportTotals(rows);
  expect(totals).toEqual({
    trips: 6,
    volume: 60,
    verifiedTrips: 0,
    verifiedVolume: 0,
    unknownVolumeTrips: 1,
  });
  const changed = data();
  changed.masters[0].capacity = 99;
  expect(reportTotals(reportRows(changed, emptyReportFilter)).volume).toBe(60);
  expect(reportRows(data(), { ...emptyReportFilter, verification: 'verified' })).toEqual([]);
  expect(() =>
    reportRows(data(), { ...emptyReportFilter, from: '2026-12-01', to: '2026-01-01' }),
  ).toThrow('วันที่');
});
it('applies combined filters and provides seven report types including cumulative known volume', () => {
  const value = data(),
    rows = reportRows(value, {
      ...emptyReportFilter,
      project: 'p',
      truck: 'truck',
      from: '2026-11-06',
      to: '2026-11-06',
    });
  expect(rows).toHaveLength(2);
  for (const type of [
    'daily',
    'project',
    'truck',
    'driver',
    'source',
    'verification',
    'cumulative',
  ] as const) {
    const table = reportTable(value, rows, type);
    expect(table.length).toBeGreaterThan(1);
  }
  expect(reportRows(value, { ...emptyReportFilter, team: 'missing' })).toEqual([]);
  expect(reportTable(value, rows, 'cumulative')[1].at(-1)).toBe(60);
});
it('exports Thai XLSX with typed editable numeric cells and text plates, plus total sheet', async () => {
  const value = data(),
    rows = reportRows(value, emptyReportFilter),
    blob = await reportWorkbook(value, rows, 'daily');
  const workbook = await readBlobBytes(blob);
  const sheet = await readSheet(workbook, 'รายงาน');
  expect(sheet[0]).toContain('ทะเบียนรถ');
  expect(sheet.slice(1).some((r) => r[6] === 5)).toBe(true);
  const summary = await readSheet(workbook, 'สรุปยอด');
  expect(summary.find((r) => r[0] === 'เที่ยวรวม')?.[1]).toBe(6);
});
it('escapes CSV/HTML injection and keeps Thai BOM and plate text', () => {
  const csv = reportCsv([
    ['ทะเบียนรถ', 'หมายเหตุ'],
    ['00123', '=SUM(1,2)'],
  ]);
  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv).toContain("'00123");
  expect(csv).toContain("'=SUM");
  const html = printableReport('<script>x</script>', [['หัวข้อ'], ['<img onerror=x>']]);
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<img onerror');
  expect(html).toContain('size:A4');
  expect(html).toContain('counter(page)');
});
