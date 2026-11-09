import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { loadData, persistData } from '../storage';
import { prepareSync } from '../syncModel';
import { cloudProject, fixture } from './syncFixtures';

const menuName = 'ซิงก์และสำรองข้อมูล';
const attention = 'มีปัญหาการซิงก์หรือข้อมูลที่ต้องตรวจสอบ';

it('opens sync and backup only from their menu while keeping normal pending data unverified', async () => {
  await persistData('local', prepareSync(fixture(), fixture()));
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText('Site', { exact: true });
  expect(
    screen.queryByRole('region', { name: 'ความปลอดภัยและซิงก์ข้อมูล' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('status', { name: attention })).not.toBeInTheDocument();
  const nav = within(screen.getByRole('navigation'));
  await user.click(nav.getByRole('button', { name: menuName }));
  expect(nav.getByRole('button', { name: menuName })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('region', { name: 'ความปลอดภัยและซิงก์ข้อมูล' })).toBeInTheDocument();
  expect(screen.getByText('รอซิงก์ 3 รายการ · ขัดแย้ง 0 รายการ')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ดาวน์โหลดข้อมูลสำรองพร้อมไฟล์แนบ' })).toBeEnabled();
  expect(
    within(screen.getByRole('main')).queryByRole('button', { name: 'บันทึกเที่ยวรถ' }),
  ).not.toBeInTheDocument();
  await user.click(nav.getByRole('button', { name: 'โครงการ' }));
  expect(
    screen.queryByRole('region', { name: 'ความปลอดภัยและซิงก์ข้อมูล' }),
  ).not.toBeInTheDocument();
  const stored = await loadData('local');
  expect(stored.trips[0].syncStatus).toBe('pending');
  expect(Object.values(stored.sync!.entries).every((entry) => entry.status === 'pending')).toBe(
    true,
  );
});

it.each(['queue error', 'conflict', 'missing reference'])(
  'keeps a persistent menu indicator for %s and details on the sync page',
  async (problem) => {
    const data = prepareSync(fixture(), fixture());
    if (problem === 'queue error') data.sync!.entries['projects/p'].error = 'Upload failed';
    if (problem === 'conflict') {
      data.sync!.entries['projects/p'].status = 'conflict';
      data.sync!.entries['projects/p'].conflict = { remote: cloudProject(), detectedAt: 'now' };
    }
    if (problem === 'missing reference') data.trips[0].truckId = 'missing-truck';
    await persistData('local', data);
    const original = await loadData('local');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Site', { exact: true });
    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('status', { name: attention })).toHaveClass('nav-error-dot');
    await user.click(nav.getByRole('button', { name: menuName }));
    if (problem === 'queue error')
      expect(screen.getByRole('alert')).toHaveTextContent('Upload failed');
    if (problem === 'conflict')
      expect(screen.getByText('ตรวจสอบข้อมูลขัดแย้ง: Site')).toBeInTheDocument();
    if (problem === 'missing reference')
      expect(screen.getByText(/พบความสัมพันธ์ข้อมูลที่ต้องตรวจสอบ/)).toBeInTheDocument();
    await user.click(nav.getByRole('button', { name: 'ภาพรวม' }));
    expect(nav.getByRole('status', { name: attention })).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'ความปลอดภัยและซิงก์ข้อมูล' }),
    ).not.toBeInTheDocument();
    expect(await loadData('local')).toEqual(original);
  },
);
