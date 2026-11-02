import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SoilTypePicker from '../SoilTypePicker';
import type { Master } from '../models';
const soil: Master = {
  id: 'soil',
  createdAt: 'now',
  updatedAt: 'now',
  kind: 'soilType',
  name: 'ดินลูกรัง',
  detail: '',
  capacity: 0,
  active: true,
};
it('offers active soil types and excludes trucks and disabled soil types', async () => {
  const change = vi.fn();
  render(
    <SoilTypePicker
      masters={[
        soil,
        { ...soil, id: 'disabled', name: 'ดินปิดใช้', active: false },
        { ...soil, id: 'truck', kind: 'truck', name: '81-1111' },
      ]}
      value=""
      onChange={change}
    />,
  );
  expect(screen.queryByRole('option', { name: 'ดินปิดใช้' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '81-1111' })).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'ชนิดดิน' }), 'ดินลูกรัง');
  expect(change).toHaveBeenCalledWith('ดินลูกรัง');
});
it('retains historical soil names when editing an older trip', () => {
  render(
    <SoilTypePicker masters={[]} value="ดินเดิม" previousValue="ดินเดิม" onChange={vi.fn()} />,
  );
  expect(screen.getByRole('combobox')).toHaveValue('ดินเดิม');
  expect(screen.getByRole('option', { name: 'ดินเดิม (ข้อมูลเดิม)' })).toBeInTheDocument();
});
it('supports an unspecified soil type when no master data has been created', () => {
  render(<SoilTypePicker masters={[]} value="" onChange={vi.fn()} />);
  expect(screen.getByRole('combobox')).toHaveValue('');
  expect(screen.getByText(/เพิ่มชนิดดินได้ที่/)).toBeInTheDocument();
});
