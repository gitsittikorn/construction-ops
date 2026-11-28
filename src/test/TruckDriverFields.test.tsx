import { fireEvent, render, screen } from '@testing-library/react';
import TruckDriverFields from '../TruckDriverFields';
import type { Master } from '../models';

const base = { detail: '', capacity: 6, active: true, createdAt: 'x', updatedAt: 'x' };
const masters: Master[] = [
  { ...base, id: 'd1', kind: 'driver', name: 'หนึ่ง', nickname: 'หนึ่ง', phone: '0000000001' },
  { ...base, id: 'd2', kind: 'driver', name: 'โรจน์', phone: '0000000002' },
  { ...base, id: 'd3', kind: 'driver', name: 'ประจำอยู่' },
  { ...base, id: 't1', kind: 'truck', name: '80-0001', driverId: 'd1' },
  { ...base, id: 't2', kind: 'truck', name: '80-0002', driverId: 'd3' },
];
function setup(truck: Master | null = masters[3]) {
  const view = render(
    <form>
      <TruckDriverFields masters={masters} truck={truck} />
    </form>,
  );
  return () =>
    Object.fromEntries(new FormData(view.container.querySelector('form')!)) as Record<
      string,
      string
    >;
}
const name = () => screen.getByLabelText('ชื่อคนขับ');
const type = (value: string) => fireEvent.change(name(), { target: { value } });

it('shows one name field and keeps the linked driver while editing details', () => {
  const values = setup();
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.getAllByDisplayValue('หนึ่ง')).toHaveLength(2);
  expect(values()).toMatchObject({ driverId: 'd1', driverName: 'หนึ่ง', nickname: 'หนึ่ง' });
});

it('renames the same person by default and moves the matching nickname with it', () => {
  const values = setup();
  type('หนึ่ง ใจดี');
  expect(values()).toMatchObject({
    driverId: 'd1',
    driverName: 'หนึ่ง ใจดี',
    nickname: 'หนึ่ง ใจดี',
  });
});

it('adds another person only when chosen, leaving the old driver untouched', () => {
  const values = setup();
  type('คนใหม่');
  fireEvent.click(screen.getByLabelText('เป็นคนละคน (เพิ่มคนขับใหม่)'));
  expect(values()).toMatchObject({ driverId: '', newDriverName: 'คนใหม่' });
});

it('links an offered free driver with their own phone and unlinks on an empty name', () => {
  const values = setup();
  type('โรจ');
  fireEvent.click(screen.getByRole('button', { name: /ใช้คนขับเดิม: โรจน์ · 0000000002/ }));
  expect(values()).toMatchObject({ driverId: 'd2', driverName: 'โรจน์', phone: '0000000002' });
  type('');
  expect(values()).toMatchObject({ driverId: '', newDriverName: '' });
});

it('explains a driver who already has a truck instead of offering them', () => {
  setup(null);
  type('ประจำอยู่');
  expect(screen.getByRole('note')).toHaveTextContent('80-0002');
  expect(screen.queryByRole('button', { name: /ใช้คนขับเดิม/ })).toBeNull();
});
