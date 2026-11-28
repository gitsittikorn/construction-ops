import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FleetList, { fleetRows } from '../FleetList';
import { fixture, truck } from './syncFixtures';
import type { Data } from '../models';

function fleet(): Data {
  const data = fixture();
  data.masters = [
    { ...truck, name: '70-1234', driverId: 'd1' },
    { ...truck, id: 'd1', kind: 'driver', name: 'สมชาย' },
    { ...truck, id: 'd2', kind: 'driver', name: 'สมหญิง' },
  ];
  return data;
}

it('finds a pair by plate or by driver name, and lists drivers without a truck', () => {
  const names = (query: string) => {
    const found = fleetRows(fleet(), query, '', '');
    return [found.trucks.map((item) => item.name), found.spareDrivers.map((item) => item.name)];
  };
  expect(names('1234')).toEqual([['70-1234'], []]);
  expect(names('สมชาย')).toEqual([['70-1234'], []]);
  expect(names('สม')).toEqual([['70-1234'], ['สมหญิง']]);
  expect(names('ไม่มี')).toEqual([[], []]);
});

it('shows plate, province and driver together with edit and delete for each', async () => {
  const user = userEvent.setup(),
    onEdit = vi.fn(),
    onDelete = vi.fn();
  const data = fleet();
  data.masters[0] = { ...data.masters[0], province: 'พังงา' };
  const props = { data, query: '', tagId: '', truckType: '', onEdit, onDelete };
  const view = render(<FleetList {...props} canManage />);
  expect(screen.getByText('70-1234 พังงา — สมชาย')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'แก้ไข คนขับ สมชาย' }));
  expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'd1' }));
  await user.click(screen.getByRole('button', { name: 'แก้ไข 70-1234' }));
  expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'truck' }));
  await user.click(screen.getByRole('button', { name: 'ลบ 70-1234' }));
  expect(onDelete).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'truck' }));
  await user.click(screen.getByRole('button', { name: 'ลบ คนขับ สมหญิง' }));
  expect(onDelete).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'd2' }));
  view.rerender(<FleetList {...props} canManage={false} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByText('70-1234 พังงา — สมชาย')).toBeInTheDocument();
});
