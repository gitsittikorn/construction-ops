import { reportRows, reportTable, reportWorkbook, emptyReportFilter } from '../reports';
import { addFinanceRate, financeVersion } from '../finance';
import { assignedTeam } from '../masterData';
import { createDaily, dailySessions, saveDailyRow } from '../daily';
import { fixture, truck, project } from './syncFixtures';
import { readBlobBytes } from '../files';
import { readSheet } from 'read-excel-file/universal';
import type { Data, Master } from '../models';
import type { FinanceRecord } from '../financeModels';

const tag = (id: string, name: string): Master => ({ ...truck, id, name, kind: 'tag' });
function day(data: Data, date: string, teamId: string, tripCount: number) {
  const next = createDaily(data, project.id, date, 'admin');
  const session = dailySessions(next).find((item) => item.body.date === date)!;
  const row = { id: date, truckId: truck.id, driverId: '', teamId, sourceId: '' };
  return saveDailyRow(
    next,
    session.id,
    1,
    { ...row, soilType: '', tripCount, capacity: 12, reportedTrips: null, notes: '' },
    'admin',
  );
}
function base() {
  const data = fixture();
  data.trips = [];
  data.masters.push(tag('a', 'ทีม A'), tag('b', 'ทีม B'));
  return data;
}
const twoDays = () => day(day(base(), '2026-11-01', 'a', 3), '2026-11-02', 'b', 2);
const priced = (data: Data) =>
  addFinanceRate(
    data,
    project.id,
    financeVersion(data, project.id),
    {
      side: 'truck',
      partyId: '',
      effectiveFrom: '2026-11-01',
      unit: 'trip',
      satang: 15050,
      reason: 'ค่าเที่ยว',
    },
    'admin',
  );
const table = (data: Data, money = true) =>
  reportTable(data, reportRows(data, emptyReportFilter), 'team', false, money);

it('counts trips per truck per day under the team recorded that day, with totals and pay', () => {
  const [header, ...rows] = table(priced(twoDays()));
  expect(header.slice(0, 5)).toEqual(['ทีม', 'ทะเบียนรถ', '2026-11-01', '2026-11-02', 'รวมเที่ยว']);
  expect(rows).toEqual([
    ['ทีม A', 'AB123', 3, 0, 3, 451.5, 0],
    ['รวม ทีม A', '1 คัน', 3, 0, 3, 451.5, 0],
    ['ทีม B', 'AB123', 0, 2, 2, 301, 0],
    ['รวม ทีม B', '1 คัน', 0, 2, 2, 301, 0],
    ['รวมทั้งหมด', '', 3, 2, 5, 752.5, 0],
  ]);
});
it('reports unpriced trips instead of guessing and omits money when not permitted', () => {
  expect(table(twoDays()).at(-1)).toEqual(['รวมทั้งหมด', '', 3, 2, 5, 0, 5]);
  expect(table(priced(twoDays()), false).at(-1)).toEqual(['รวมทั้งหมด', '', 3, 2, 5]);
  expect(table(base())).toHaveLength(1);
});
it('uses a single truck tag only for trips saved without a team', () => {
  const data = day(base(), '2026-11-01', '', 1);
  expect(table(data, false)[1][0]).toBe('ไม่ระบุทีม');
  data.masters.find((item) => item.id === truck.id)!.tagIds = ['a'];
  expect(table(data, false)[1][0]).toBe('ทีม A');
});
it('refuses to total pay when two devices recorded conflicting rates', () => {
  const data = priced(twoDays());
  const record = data.workspaces!.find((item) => item.recordType === 'finance') as FinanceRecord;
  const copy = structuredClone(record);
  copy.id = 'other';
  if (copy.body.kind === 'rate') copy.body.entry.id = 'other';
  data.workspaces!.push(copy);
  expect(() => table(data)).toThrow('ขัดแย้ง');
});
it('exports the team table to Excel without a second total row', async () => {
  const data = priced(twoDays());
  const blob = await reportWorkbook(data, reportRows(data, emptyReportFilter), 'team', {
    money: true,
  });
  const sheet = await readSheet((await readBlobBytes(blob)) as ArrayBuffer, 'รายงาน');
  expect(sheet).toHaveLength(6);
  expect(sheet.at(-1)![0]).toBe('รวมทั้งหมด');
});
it('suggests the latest team in the project, then the only tag, otherwise nothing', () => {
  const data = twoDays();
  expect(assignedTeam(data, project.id, truck.id, '2026-11-03')).toBe('b');
  expect(assignedTeam(data, project.id, truck.id, '2026-11-01')).toBe('a');
  const item = data.masters.find((master) => master.id === truck.id)!;
  item.tagIds = ['a'];
  expect(assignedTeam(data, 'new-project', truck.id, '2026-11-03')).toBe('a');
  item.tagIds = ['a', 'b'];
  expect(assignedTeam(data, 'new-project', truck.id, '2026-11-03')).toBe('');
});
