import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import QuickRecordPanel from '../QuickRecordPanel';
import {
  daySummary,
  dayTrips,
  findSession,
  noTeam,
  recordTrip,
  removeTrips,
  truckCards,
  type QuickTrip,
} from '../quickRecord';
import { correctDailyTrip } from '../daily';
import { assertCompanyMutation } from '../companyPermissions';
import { cacheOwner } from '../workspaceIdentity';
import { reportRows, reportTotals, reportTable, emptyReportFilter } from '../reports';
import { workDate } from '../domain';
import { emptyData, type Data, type Master, type Project } from '../models';

const stamp = { createdAt: 'x', updatedAt: 'x' };
const master = (id: string, kind: Master['kind'], name: string, extra: Partial<Master> = {}) => ({
  ...stamp,
  id,
  kind,
  name,
  detail: '',
  capacity: 0,
  active: true,
  ...extra,
});
const project: Project = {
  ...stamp,
  id: 'p',
  name: 'โครงการทดสอบ',
  customer: '',
  location: '',
  startDate: '',
  endDate: '',
  status: 'active',
  description: '',
};
const base: Data = {
  ...emptyData,
  projects: [project],
  masters: [
    master('a', 'tag', 'ทีมเอ'),
    master('b', 'tag', 'ทีมบี'),
    master('d1', 'driver', 'หนึ่ง', { phone: '000-1' }),
    master('d2', 'driver', 'สอง', { tagIds: ['b'] }),
    master('s1', 'source', 'บ่อหนึ่ง'),
    master('s2', 'source', 'บ่อสอง'),
    master('t1', 'truck', '80-0001', { capacity: 7, driverId: 'd1', tagIds: ['a', 'b'] }),
    master('t2', 'truck', '80-0002', { capacity: 12, driverId: 'd2', province: 'พังงา' }),
    master('t3', 'truck', '80-0003', { capacity: 6 }),
  ],
};
const date = '2026-11-02';
const trip = (extra: Partial<QuickTrip> = {}): QuickTrip => ({
  projectId: 'p',
  date,
  truckId: 't1',
  tripId: crypto.randomUUID(),
  driverId: 'd1',
  sourceId: 's1',
  soilType: '',
  ...extra,
});
const session = (data: Data) => findSession(data, 'p', date)!;
const total = (data: Data) => reportTotals(reportRows(data, emptyReportFilter)).trips;

describe('quick trip domain', () => {
  it('creates the day and row once, then appends one counted trip per call', () => {
    let data = recordTrip(base, trip(), 'owner');
    data = recordTrip(data, trip(), 'owner');
    data = recordTrip(data, trip({ truckId: 't2', driverId: 'd2' }), 'owner');
    expect(session(data).body.rows.map((row) => row.tripCount)).toEqual([2, 1]);
    expect(dayTrips(session(data))).toHaveLength(3);
    expect(data.trips).toEqual([]);
    expect(total(data)).toBe(3);
  });

  it('does not add a second trip when the same operation is retried', () => {
    const input = trip({ tripId: 'same' });
    const once = recordTrip(base, input, 'owner');
    expect(recordTrip(once, input, 'owner')).toBe(once);
    expect(total(once)).toBe(1);
  });

  it('keeps earlier snapshots when driver, source or truck capacity change later', () => {
    let data = recordTrip(base, trip({ tripId: 'first' }), 'owner');
    data = recordTrip(data, trip({ driverId: 'd2', sourceId: 's2', tripId: 'second' }), 'owner');
    data = {
      ...data,
      masters: data.masters.map((m) => (m.id === 't1' ? { ...m, capacity: 99 } : m)),
    };
    const [second, first] = dayTrips(session(data));
    expect(first).toMatchObject({ driverId: 'd1', sourceId: 's1', capacity: 7 });
    expect(second).toMatchObject({ driverId: 'd2', sourceId: 's2', capacity: 7 });
    expect(daySummary(data, session(data), 'driver')).toEqual([
      ['สอง', 1],
      ['หนึ่ง', 1],
    ]);
  });

  it('undoes exactly the named trip and updates every total', () => {
    let data = recordTrip(base, trip({ tripId: 'keep' }), 'owner');
    data = recordTrip(data, trip({ tripId: 'mistake' }), 'owner');
    const row = session(data).body.rows[0];
    data = recordTrip(data, trip({ truckId: 't3', driverId: '', tripId: 'other' }), 'owner');
    const result = removeTrips(
      data,
      'p',
      date,
      [{ id: 'mistake', rowId: row.id, label: 'x' }],
      'owner',
      'กดผิด',
    );
    expect(
      dayTrips(session(result.data))
        .map((t) => t.key)
        .sort(),
    ).toEqual(['keep', 'other']);
    expect(total(result.data)).toBe(2);
    const corrected = correctDailyTrip(
      result.data,
      session(result.data).id,
      session(result.data).body.version,
      row.id,
      'keep',
      { capacity: 8, driverId: 'd1', sourceId: 's2', soilType: '' },
      'owner',
      'แก้แหล่งดิน',
    );
    expect(dayTrips(session(corrected)).find((t) => t.key === 'keep')?.sourceId).toBe('s2');
  });

  it('refuses a closed day, an inactive project and a truck without capacity', () => {
    const data = recordTrip(base, trip(), 'owner');
    const closed: Data = {
      ...data,
      workspaces: data.workspaces!.map((r) =>
        r.recordType === 'daily' ? { ...r, body: { ...r.body, state: 'closed' as const } } : r,
      ),
    };
    expect(() => recordTrip(closed, trip(), 'owner')).toThrow('ปิดวันแล้ว');
    expect(() =>
      recordTrip({ ...base, projects: [{ ...project, status: 'draft' }] }, trip(), 'owner'),
    ).toThrow('กำลังดำเนินการ');
    const bare = { ...base, masters: [...base.masters, master('t4', 'truck', '80-0004')] };
    expect(() => recordTrip(bare, trip({ truckId: 't4', driverId: '' }), 'owner')).toThrow(
      'ความจุ',
    );
    expect(
      total(recordTrip(bare, trip({ truckId: 't4', driverId: '', capacity: 5 }), 'owner')),
    ).toBe(1);
  });

  it('lets an operator record but not write other business data', () => {
    const owner = cacheOwner({ companyId: 'c', actorUid: 'u', role: 'operator' });
    const first = recordTrip(base, trip(), owner);
    expect(() => assertCompanyMutation(base, first, owner)).not.toThrow();
    expect(() =>
      assertCompanyMutation(first, recordTrip(first, trip(), owner), owner),
    ).not.toThrow();
  });

  it('filters by team without duplicating trucks and searches driver, province and phone', () => {
    const ids = (team: string, query = '') =>
      truckCards(base, undefined, query, team).map((card) => card.truck.id);
    expect(ids('')).toEqual(['t1', 't2', 't3']);
    expect(ids('a')).toEqual(['t1']);
    // t2 has no tag of its own and takes its driver's team.
    expect(ids('b')).toEqual(['t1', 't2']);
    expect(ids(noTeam)).toEqual(['t3']);
    expect(ids('b', 'พังงา')).toEqual(['t2']);
    expect(ids('', 'หนึ่ง')).toEqual(['t1']);
    expect(ids('', '000-1')).toEqual(['t1']);
    expect(ids('', '80-0002')).toEqual(['t2']);
  });
});

function Harness({ initial = base, owner = 'owner' }: { initial?: Data; owner?: string }) {
  const [data, setData] = useState(initial);
  return (
    <>
      <output data-testid="data">{JSON.stringify(data)}</output>
      <QuickRecordPanel
        owner={owner}
        data={data}
        online
        onChange={async (change) => setData(change)}
        onReconcile={() => {}}
        onSetup={() => {}}
      />
    </>
  );
}
const stored = () => JSON.parse(screen.getByTestId('data').textContent!) as Data;
const todayTrips = () => dayTrips(findSession(stored(), 'p', workDate()));
const tap = async (plate: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: `บันทึก 1 เที่ยว ${plate}` }));
  });
};

it('records with one tap, defaults to all teams, blocks a double tap and undoes it', async () => {
  render(<Harness initial={structuredClone(base)} owner="ui-one" />);
  await screen.findByRole('button', { name: 'บันทึก 1 เที่ยว 80-0001' });
  expect(screen.getByRole('button', { name: 'ทุกทีม' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('วันที่บันทึก')).toHaveValue(workDate());
  await tap('80-0001');
  expect(screen.queryByRole('dialog')).toBeNull();
  await tap('80-0001');
  expect(screen.getByText(/ซ้ำเร็วเกินไป/)).toBeInTheDocument();
  await tap('80-0003');
  expect(todayTrips()).toHaveLength(2);
  expect(screen.getByLabelText('เที่ยวทั้งหมดของวัน')).toHaveTextContent('2');
  fireEvent.click(screen.getByRole('button', { name: 'ทีมเอ' }));
  expect(screen.getByLabelText('เที่ยวทั้งหมดของวัน')).toHaveTextContent('2');
  expect(screen.getByLabelText('เที่ยวตามตัวกรอง')).toHaveTextContent('1');
  expect(screen.queryByRole('article', { name: 'รถ 80-0003' })).toBeNull();
  expect(stored().masters).toEqual(base.masters);
  fireEvent.click(screen.getByRole('button', { name: 'ทุกทีม' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'เลิกทำ' }));
  });
  expect(todayTrips().map((t) => t.truckId)).toEqual(['t1']);
});

it('applies a changed source only to later trips and shows the truck history', async () => {
  render(<Harness initial={structuredClone(base)} owner="ui-two" />);
  await screen.findByRole('button', { name: 'บันทึก 1 เที่ยว 80-0002' });
  await tap('80-0002');
  fireEvent.click(screen.getByRole('button', { name: 'รายละเอียด 80-0002' }));
  const dialog = within(screen.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText('แหล่งดินเที่ยวถัดไป'), { target: { value: 's2' } });
  fireEvent.click(dialog.getByRole('button', { name: 'ใช้กับเที่ยวถัดไป' }));
  await new Promise((resolve) => setTimeout(resolve, 750));
  await tap('80-0002');
  expect(todayTrips().map((t) => t.sourceId)).toEqual(['s2', '']);
  expect(stored().masters).toEqual(base.masters);
});

it('keeps the local audit small per tap and totals trips by truck type', () => {
  let data = recordTrip(base, trip(), 'owner');
  data = recordTrip(data, trip(), 'owner');
  const audit = data.audit.at(-1)!;
  expect(audit.action).toBe('daily-quick-trip');
  expect(JSON.stringify(audit).length).toBeLessThan(500);
  expect(session(data).body.history!.at(-1)!.tripChanges).toHaveLength(1);
  const typed: Data = {
    ...data,
    masters: data.masters.map((m) =>
      m.id === 't1' ? { ...m, truckType: 'six-wheel' as const } : m,
    ),
  };
  const rows = reportRows(typed, emptyReportFilter);
  expect(reportTable(typed, rows, 'truckType')[1].slice(0, 2)).toEqual(['หกล้อ', 2]);
});
