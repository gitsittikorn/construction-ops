import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { Data } from '../models';
import SoilPricesPanel from '../SoilPricesPanel';
import { fixture, truck } from './syncFixtures';

const initial = (): Data => ({
  ...fixture(),
  masters: [
    truck,
    { ...truck, id: 'soil', name: 'ดินถม', kind: 'soilType' },
    { ...truck, id: 'source', name: 'แหล่งหนึ่ง', kind: 'source' },
  ],
});
function Panel({ fail = false }: { fail?: boolean }) {
  const [data, setData] = useState(initial);
  return (
    <SoilPricesPanel
      data={data}
      actor="local"
      canManage
      onChange={async (mutate) => {
        if (fail) throw Error('พื้นที่เก็บข้อมูลเต็ม');
        setData(mutate(data));
      }}
    />
  );
}

it('records a source price and exposes the latest amount/time and history count; validation errors preserve all original entries', async () => {
  const user = userEvent.setup();
  render(<Panel />);
  await user.selectOptions(screen.getByLabelText('ชนิดดินสำหรับราคา'), 'soil');
  await user.selectOptions(screen.getByLabelText('แหล่งดินสำหรับราคา'), 'source');
  await user.type(screen.getByLabelText('ราคาดิน (บาท)'), '120.50');
  await user.click(screen.getByRole('button', { name: 'บันทึกราคาดินใหม่' }));
  expect(screen.getByRole('status')).toHaveTextContent('ในเครื่อง');
  expect(screen.getByRole('table')).toHaveTextContent('120.50');
  expect(screen.getByText(/อัปเดตล่าสุด/)).toHaveTextContent('แหล่งหนึ่ง');
  expect(screen.getByText(/บันทึกราคาทั้งหมด/)).toHaveTextContent('1 ครั้ง');
  await user.type(screen.getByLabelText('ราคาดิน (บาท)'), '-1');
  await user.click(screen.getByRole('button', { name: 'บันทึกราคาดินใหม่' }));
  expect(screen.getByRole('alert')).toHaveTextContent('ตั้งแต่ศูนย์');
  expect(screen.getByRole('table')).toHaveTextContent('120.50');
  expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(1);
  expect(screen.getByLabelText('ราคาดิน (บาท)')).toHaveValue('-1');
});

it('keeps price and note after a persistence failure and gives a visible error', async () => {
  const user = userEvent.setup();
  render(<Panel fail />);
  await user.selectOptions(screen.getByLabelText('ชนิดดินสำหรับราคา'), 'soil');
  await user.selectOptions(screen.getByLabelText('แหล่งดินสำหรับราคา'), 'source');
  await user.type(screen.getByLabelText('ราคาดิน (บาท)'), '99.25');
  await user.type(screen.getByLabelText('หมายเหตุราคา'), 'รอบใหม่');
  await user.click(screen.getByRole('button', { name: 'บันทึกราคาดินใหม่' }));
  expect(screen.getByRole('alert')).toHaveTextContent('พื้นที่เก็บข้อมูลเต็ม');
  expect(screen.getByLabelText('ราคาดิน (บาท)')).toHaveValue('99.25');
  expect(screen.getByLabelText('หมายเหตุราคา')).toHaveValue('รอบใหม่');
  expect(screen.getByText(/บันทึกราคาทั้งหมด/)).toHaveTextContent('0 ครั้ง');
});

it('does not offer price mutations to operators', () => {
  render(<SoilPricesPanel data={initial()} actor="local" canManage={false} onChange={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'บันทึกราคาดินใหม่' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('ราคาดิน (บาท)')).not.toBeInTheDocument();
});
