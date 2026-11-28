import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import SelectableList from '../SelectableList';
import { bulkDelete, bulkDeleteDailyRows } from '../bulkDelete';
import { createDaily, dailySessions, saveDailyRow } from '../daily';
import { assertCompanyMutation } from '../companyPermissions';
import { cacheOwner } from '../workspaceIdentity';
import { emptyData, type Data, type Master } from '../models';

const uploads = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../uploads', async (original) => ({
  ...(await original<typeof import('../uploads')>()),
  listUploads: uploads.list,
}));
beforeEach(() => uploads.list.mockResolvedValue([]));

const base = { detail: '', capacity: 6, active: true, createdAt: 'x', updatedAt: 'x' };
const source = (id: number): Master => ({
  ...base,
  id: `s${id}`,
  kind: 'source',
  name: `บ่อ ${id}`,
});
const many = (count: number): Data => ({
  ...emptyData,
  masters: Array.from({ length: count }, (_, index) => source(index + 1)),
});
const history: Data = {
  ...many(3),
  trips: [
    {
      id: 't',
      projectId: 'p',
      date: '2026-01-01',
      time: '08:00',
      truckId: 'truck',
      driverId: '',
      sourceId: 's2',
      soilType: '',
      notes: '',
      revision: 1,
      syncStatus: 'pending',
      createdAt: 'x',
      updatedAt: 'x',
    },
  ],
};
const target = (record: Master) => ({ type: 'master' as const, record, label: record.name });

function Harness({
  initial,
  readOnly = false,
  onWrite,
}: {
  initial: Data;
  readOnly?: boolean;
  onWrite?: () => Promise<void>;
}) {
  const [data, setData] = useState(initial),
    [query, setQuery] = useState('');
  return (
    <>
      <input aria-label="filter" value={query} onChange={(e) => setQuery(e.target.value)} />
      <SelectableList
        items={data.masters.filter((item) => item.name.includes(query))}
        scope={query}
        type="master"
        label={(item) => item.name}
        access={
          readOnly
            ? undefined
            : {
                data,
                owner: 'owner',
                onChange: async (change) => {
                  await onWrite?.();
                  setData(change);
                },
              }
        }
      >
        {({ rows, box }) => (
          <ul>
            {rows.map((item) => (
              <li key={item.id}>
                {box(item)}
                {item.name}
              </li>
            ))}
          </ul>
        )}
      </SelectableList>
    </>
  );
}
const check = (name: string) => screen.getByRole('checkbox', { name });
const selectedText = () => screen.queryByText(/^เลือกแล้ว/)?.textContent;
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
async function confirmDelete(count: number) {
  click(`ลบ (${count})`);
  const confirm = within(screen.getByRole('alertdialog')).getByRole('button', {
    name: `ยืนยันการลบ ${count} รายการ`,
  });
  await vi.waitFor(() => expect(confirm).toBeEnabled());
  await act(async () => fireEvent.click(confirm));
}

it('starts empty, selects one or many and shows the indeterminate state', () => {
  render(<Harness initial={many(3)} />);
  const all = check('เลือกทั้งหมดในหน้านี้') as HTMLInputElement;
  expect(selectedText()).toBeUndefined();
  fireEvent.click(check('เลือก บ่อ 1'));
  expect(selectedText()).toBe('เลือกแล้ว 1 รายการ');
  expect(all.indeterminate).toBe(true);
  fireEvent.click(check('เลือก บ่อ 2'));
  expect(selectedText()).toBe('เลือกแล้ว 2 รายการ');
  fireEvent.click(all);
  expect(selectedText()).toBe('เลือกแล้ว 3 รายการ');
  expect(all.indeterminate).toBe(false);
  fireEvent.click(all);
  expect(selectedText()).toBeUndefined();
});

it('keeps the selection across pages and can take every filtered result', () => {
  render(<Harness initial={many(120)} />);
  fireEvent.click(check('เลือกทั้งหมดในหน้านี้'));
  expect(selectedText()).toBe('เลือกแล้ว 50 รายการ');
  click('ถัดไป');
  expect(selectedText()).toBe('เลือกแล้ว 50 รายการ');
  expect(check('เลือก บ่อ 51')).not.toBeChecked();
  click('เลือกทั้งหมด 120 รายการตามตัวกรอง');
  expect(selectedText()).toBe('เลือกแล้ว 120 รายการ');
  click('ยกเลิกการเลือก');
  expect(selectedText()).toBeUndefined();
});

it('clears the selection when the filter changes', () => {
  render(<Harness initial={many(12)} />);
  fireEvent.click(check('เลือกทั้งหมดในหน้านี้'));
  fireEvent.change(screen.getByLabelText('filter'), { target: { value: 'บ่อ 1' } });
  expect(selectedText()).toBeUndefined();
  fireEvent.change(screen.getByLabelText('filter'), { target: { value: '' } });
  expect(selectedText()).toBeUndefined();
});

it('deletes the selection only after confirmation and keeps refused items selected', async () => {
  render(<Harness initial={history} />);
  fireEvent.click(check('เลือกทั้งหมดในหน้านี้'));
  click('ลบ (3)');
  fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  await confirmDelete(3);
  expect(screen.getByText('ลบสำเร็จ 2 รายการ')).toBeInTheDocument();
  expect(screen.getByText(/บ่อ 2: อ้างอิงจากประวัติเที่ยวรถ/)).toBeInTheDocument();
  expect(selectedText()).toBe('เลือกแล้ว 1 รายการ');
  expect(check('เลือก บ่อ 2')).toBeChecked();
});

it('sends one write for repeated confirmation clicks', async () => {
  let release = () => {};
  const write = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
  render(<Harness initial={many(2)} onWrite={write} />);
  fireEvent.click(check('เลือกทั้งหมดในหน้านี้'));
  click('ลบ (2)');
  const confirm = screen.getByRole('button', { name: 'ยืนยันการลบ 2 รายการ' });
  await vi.waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await vi.waitFor(() => expect(write).toHaveBeenCalled());
  expect(confirm).toBeDisabled();
  await act(async () => release());
  expect(write).toHaveBeenCalledOnce();
});

it('offers no selection to read-only users and rejects an operator write', () => {
  render(<Harness initial={many(3)} readOnly />);
  expect(screen.queryByRole('checkbox')).toBeNull();
  const owner = cacheOwner({ companyId: 'c', actorUid: 'u', role: 'operator' });
  const data = many(2);
  const result = bulkDelete(data, data.masters.map(target), owner);
  expect(() => assertCompanyMutation(data, result.data, owner)).toThrow('สิทธิ์');
});

it('keeps history, removes a truck before its team and reports missing records', () => {
  const tag: Master = { ...base, id: 'tag', kind: 'tag', name: 'ทีม' };
  const truck: Master = { ...base, id: 'free', kind: 'truck', name: '80-1', tagIds: ['tag'] };
  const data: Data = { ...history, masters: [...history.masters, tag, truck] };
  const result = bulkDelete(data, [target(tag), target(truck), target(source(99))], 'owner');
  expect(result.deleted).toEqual(['free', 'tag']);
  expect(result.failed[0].reason).toContain('ไม่พบรายการ');
  expect(result.data.trips).toEqual(data.trips);
  expect(result.data.deletedMasters).toHaveLength(2);
});

it('removes several daily trucks with one reason and reports the protected one', () => {
  let data: Data = {
    ...emptyData,
    projects: [
      {
        id: 'p',
        name: 'p',
        customer: '',
        location: '',
        startDate: '',
        endDate: '',
        status: 'active',
        description: '',
        createdAt: 'x',
        updatedAt: 'x',
      },
    ],
    masters: ['a', 'b'].map((id) => ({ ...base, id, kind: 'truck' as const, name: id })),
  };
  data = createDaily(data, 'p', '2026-01-01', 'owner');
  const id = 'daily-p-2026-01-01';
  for (const truckId of ['a', 'b'])
    data = saveDailyRow(
      data,
      id,
      dailySessions(data)[0].body.version,
      {
        id: `row-${truckId}`,
        truckId,
        driverId: '',
        teamId: '',
        sourceId: '',
        soilType: '',
        tripCount: truckId === 'a' ? 0 : 1,
        capacity: 6,
        reportedTrips: null,
        notes: '',
      },
      'owner',
    );
  const targets = [
    { id: 'row-a', label: 'a' },
    { id: 'row-b', label: 'b' },
  ];
  const noReason = bulkDeleteDailyRows(data, id, targets, 'owner', '');
  expect(noReason.deleted).toEqual(['row-a']);
  expect(noReason.failed[0]).toMatchObject({ id: 'row-b' });
  expect(bulkDeleteDailyRows(data, id, targets, 'owner', 'บันทึกผิด').deleted).toHaveLength(2);
});
