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
import { createDaily, dailySessions, rowFingerprint, saveDailyRow } from '../daily';
import { readBlobBytes } from '../files';
import { readSheet } from 'read-excel-file/universal';
import type { EvidenceRecord } from '../workspaceModels';

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

it('reconciles mixed capacity snapshots once per truck/day without losing the reported count or fabricating a default capacity', async () => {
  let value = data();
  const session = dailySessions(value)[0];
  value = saveDailyRow(
    value,
    session.id,
    session.body.version,
    { ...session.body.rows[0], tripCount: 6, capacity: 20, reportedTrips: 7 },
    'admin',
    'แก้ยอดรายงานจากใบเที่ยว',
  );
  const rows = reportRows(value, { ...emptyReportFilter, from: '2026-11-06' });
  const table = reportTable(value, rows, 'verification');
  const daily = table.slice(1).filter((row) => row.at(-1) === 'วันทำงาน');
  expect(daily).toHaveLength(1);
  expect(daily[0].slice(6, 12)).toEqual([
    6,
    7,
    -1,
    'หลายความจุ (ใช้ snapshot รายเที่ยว)',
    80,
    'MISMATCHED',
  ]);
  const sheet = await readSheet(
    await readBlobBytes(await reportWorkbook(value, rows, 'verification')),
    'รายงาน',
  );
  expect(
    sheet
      .slice(1)
      .find((row) => row[12] === 'วันทำงาน')
      ?.slice(6, 11),
  ).toEqual([6, 7, -1, 'หลายความจุ (ใช้ snapshot รายเที่ยว)', 80]);
  expect(reportTotals(rows).volume).toBe(80);
});

it('never compares a filtered subset of historical drivers with the full truck reported count', () => {
  let value = data();
  value.masters.push({ ...truck, id: 'driver-new', kind: 'driver', name: 'คนขับใหม่' });
  const session = dailySessions(value)[0];
  value = saveDailyRow(
    value,
    session.id,
    session.body.version,
    {
      ...session.body.rows[0],
      driverId: 'driver-new',
      tripCount: 6,
      capacity: 20,
      reportedTrips: 6,
    },
    'admin',
    'แก้ยอดรายงานจากใบเที่ยว',
  );
  const all = reportTable(value, reportRows(value, emptyReportFilter), 'verification');
  expect(
    all
      .slice(1)
      .find((row) => row[12] === 'วันทำงาน')
      ?.slice(6, 9),
  ).toEqual([6, 6, 0]);
  const subset = reportRows(value, { ...emptyReportFilter, driver: 'driver-new' });
  const table = reportTable(value, subset, 'verification');
  expect(table[1].slice(6, 9)).toEqual([1, '', '']);
  expect(table[1][10]).toBe(20);
  expect(table[1][11]).toContain('ไม่เทียบยอดทั้งคัน');
});

it('groups calendar weeks from Monday across year boundaries and months without changing filtered totals', async () => {
  const { reportPeriod, reportMetadata } = await import('../reports');
  expect(reportPeriod('2027-01-01', 'weekly')).toBe('2026-12-28');
  expect(reportPeriod('2027-01-03', 'weekly')).toBe('2026-12-28');
  expect(reportPeriod('2027-01-04', 'weekly')).toBe('2027-01-04');
  expect(reportPeriod('2028-02-29', 'monthly')).toBe('2028-02');
  expect(() => reportPeriod('2026-02-30', 'monthly')).toThrow('วันที่');
  const value = data();
  const base = reportRows(value, emptyReportFilter).find((row) => row.volume !== null)!;
  const rows = ['2026-12-31', '2027-01-01', '2027-01-04'].map((date, index) => ({
    ...base,
    id: `${index}`,
    date,
    trips: 1,
    volume: 12,
  }));
  const weekly = reportTable(value, rows, 'weekly');
  expect(weekly.slice(1).map((row) => [row[0], row[1], row[4]])).toEqual([
    ['2026-12-28', 2, 24],
    ['2027-01-04', 1, 12],
  ]);
  const monthly = reportTable(value, rows, 'monthly');
  expect(monthly.slice(1).map((row) => [row[0], row[1], row[4]])).toEqual([
    ['2026-12', 1, 12],
    ['2027-01', 2, 24],
  ]);
  const metadata = reportMetadata(
    value,
    'weekly',
    { ...emptyReportFilter, project: 'p', from: '2027-01-01' },
    '2026-12-31T18:00:00Z',
  );
  expect(metadata[1][0]).toContain('Asia/Bangkok');
  expect(metadata[2][1]).toContain('Site');
  expect(reportCsv(weekly, metadata)).toContain('ปริมาตรดินหลวม');
  const workbook = await readBlobBytes(
    await reportWorkbook(value, rows, 'monthly', {
      filter: emptyReportFilter,
      generatedAt: '2026-12-31T18:00:00Z',
    }),
  );
  expect((await readSheet(workbook, 'ข้อมูลรายงาน')).flat()).toContain('สรุปรายเดือน');
});
it('exports optional evidence references without inventing them for legacy data or changing numeric totals', async () => {
  const value = data();
  const rows = reportRows(value, emptyReportFilter);
  rows[0].evidenceRefs = ['Evidence: evidence-test', 'Drive: private-id'];
  const plain = reportTable(value, rows, 'daily');
  const withEvidence = reportTable(value, rows, 'daily', true);
  expect(plain[0]).not.toContain('เลขอ้างอิงหลักฐาน');
  expect(withEvidence[0].at(-1)).toBe('เลขอ้างอิงหลักฐาน');
  expect(withEvidence[1].at(-1)).toContain('private-id');
  expect(withEvidence[2].at(-1)).toBe('');
  expect(withEvidence[1].slice(0, -1)).toEqual(plain[1]);
  const workbook = await readBlobBytes(
    await reportWorkbook(value, rows, 'daily', { includeEvidence: true }),
  );
  expect((await readSheet(workbook, 'รายงาน'))[1].at(-1)).toContain('evidence-test');
  expect(reportTable(value, [], 'weekly')).toHaveLength(1);
});

it('exports only the selected proof or the current reopened generation and excludes stale Drive references', () => {
  const value = data();
  const session = dailySessions(value)[0];
  const row = session.body.rows[0];
  const fingerprint = rowFingerprint(session, row);
  const old: EvidenceRecord = {
    id: 'old-proof',
    recordType: 'evidence',
    projectId: session.projectId,
    name: 'proof',
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    body: {
      sessionId: session.id,
      rowId: row.id,
      date: session.body.date,
      truckId: row.truckId,
      driverId: row.driverId,
      fingerprint,
      files: [],
    },
  };
  value.workspaces!.push(old, {
    ...old,
    id: 'new-proof',
    body: { ...old.body, closureGeneration: 1 },
  });
  session.body.closures.push({
    at: session.updatedAt,
    by: 'admin',
    rows: [row],
    verifications: {},
    trips: 5,
    volume: 60,
  });
  session.body.state = 'reopened';
  const refs = () =>
    reportRows(value, emptyReportFilter).find((r) => r.id.startsWith(`${session.id}:`))!
      .evidenceRefs;
  expect(refs()).toEqual(['Evidence: new-proof']);
  session.body.verifications[row.id] = {
    fingerprint,
    evidenceId: old.id,
    fileIds: ['sealed-drive'],
    by: 'admin',
    at: session.updatedAt,
  };
  expect(refs()).toEqual(['Evidence: old-proof', 'Drive: sealed-drive']);
  session.body.verifications[row.id].fingerprint = 'obsolete';
  expect(refs()).toEqual(['Evidence: new-proof']);
  expect(reportTotals(reportRows(value, emptyReportFilter)).volume).toBe(60);
});
