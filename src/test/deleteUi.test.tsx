import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { loadData, persistData } from '../storage';
import { emptyData } from '../models';
import { recordUsage } from '../deletion';
import { workDate } from '../domain';
import { fixture, project, truck, trip } from './syncFixtures';

const go = async (user: ReturnType<typeof userEvent.setup>, page: string) => {
  await user.click(
    await within(screen.getByRole('navigation')).findByRole('button', { name: page }),
  );
};
const dialog = () => screen.getByRole('alertdialog');
const ready = () =>
  waitFor(() =>
    expect(within(dialog()).queryByText('กำลังตรวจข้อมูลที่อ้างอิง…')).not.toBeInTheDocument(),
  );
const button = (name: string) => screen.getByRole('button', { name });

it('shows project details and deletes an unused project only after confirmation', async () => {
  await persistData('local', { ...emptyData, projects: [project] });
  const user = userEvent.setup();
  render(<App />);
  await go(user, 'โครงการ');
  await user.click(await screen.findByRole('button', { name: 'ดูรายละเอียด Site' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Historical customer');
  await user.click(button('ปิดรายละเอียด'));

  await user.click(button('ลบ Site'));
  await ready();
  await user.click(button('ยกเลิกการลบ'));
  expect((await loadData('local')).projects).toHaveLength(1);

  await user.click(button('ลบ Site'));
  await ready();
  await user.click(button('ยืนยันลบรายการ'));
  expect(await screen.findByText('ยังไม่มีโครงการ')).toBeInTheDocument();
  expect((await loadData('local')).deletedProjects).toHaveLength(1);
});

it('explains what uses a project and archives it instead of cascading', async () => {
  await persistData('local', fixture());
  const user = userEvent.setup();
  render(<App />);
  await go(user, 'โครงการ');
  await user.click(await screen.findByRole('button', { name: 'ลบ Site' }));
  await ready();
  expect(dialog()).toHaveTextContent('มีประวัติเที่ยวรถ 1 รายการ');
  expect(screen.queryByRole('button', { name: 'ยืนยันลบรายการ' })).not.toBeInTheDocument();
  await user.click(button('จัดเก็บโครงการแทน'));
  await screen.findByText('จัดเก็บแล้ว');
  const data = await loadData('local');
  expect(data.projects[0].status).toBe('archived');
  expect(data.trips).toHaveLength(1);
});

it('deletes master data from its row, unlinking a driver and protecting used trucks', async () => {
  const data = fixture();
  data.masters = [
    { ...truck, name: '80-1111' },
    { ...truck, id: 'free', name: '80-2222', driverId: 'driver' },
    { ...truck, id: 'driver', kind: 'driver', name: 'สมชาย' },
    { ...truck, id: 'source', kind: 'source', name: 'บ่อ A' },
  ];
  await persistData('local', data);
  const user = userEvent.setup();
  render(<App />);
  await go(user, 'ข้อมูลพื้นฐาน');

  await user.click(await screen.findByRole('button', { name: 'ลบ 80-1111' }));
  await ready();
  expect(dialog()).toHaveTextContent('ประวัติเที่ยวรถ');
  await user.click(button('ปิดใช้งานแทน'));
  await screen.findByText('ปิดใช้งาน');

  await user.click(button('ลบ 80-2222'));
  await ready();
  await user.click(screen.getByRole('checkbox', { name: /ลบคนขับ สมชาย ด้วย/ }));
  await user.click(button('ยืนยันลบรายการ'));
  // The success notice still names the truck, so check that its row is gone.
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'ลบ 80-2222' })).not.toBeInTheDocument(),
  );
  expect((await loadData('local')).deletedMasters?.map((item) => item.id).sort()).toEqual([
    'driver',
    'free',
  ]);

  await user.click(button('แหล่งดิน'));
  await user.click(button('ลบ บ่อ A'));
  await ready();
  await user.click(button('ยืนยันลบรายการ'));
  expect(await screen.findByText('ยังไม่มีข้อมูลแหล่งดิน')).toBeInTheDocument();
});

it('deletes a trip from the table', async () => {
  const data = fixture();
  data.trips = [{ ...trip, date: workDate() }];
  await persistData('local', data);
  const user = userEvent.setup();
  render(<App />);
  await go(user, 'บันทึกเที่ยวรถ');
  await user.click(await screen.findByRole('button', { name: 'ลบ เที่ยวรถ 10:00' }));
  await ready();
  await user.click(button('ยืนยันลบรายการ'));
  expect(await screen.findByText('ยังไม่มีเที่ยวรถตามเงื่อนไขที่เลือก')).toBeInTheDocument();
  expect((await loadData('local')).deletedTrips).toHaveLength(1);
});

it('asks for team tags on trucks only', async () => {
  await persistData('local', structuredClone(emptyData));
  const user = userEvent.setup();
  render(<App />);
  await go(user, 'ข้อมูลพื้นฐาน');
  for (const [tab, tagged] of [
    ['แหล่งดิน', false],
    ['ลูกค้า', false],
    ['ชนิดดิน', false],
    ['รถและคนขับ', true],
  ] as const) {
    await user.click(button(tab));
    expect(Boolean(screen.queryByRole('combobox', { name: 'กรองแท็กทีม' }))).toBe(tagged);
    await user.click(screen.getAllByRole('button', { name: /^(เพิ่มรถและคนขับ|เพิ่มข้อมูล)$/ })[0]);
    expect(Boolean(screen.queryByText('แท็กทีม / กลุ่ม'))).toBe(tagged);
    await user.click(button('ปิดฟอร์ม'));
  }
});

it('blocks a referenced team or customer but ignores stale tags on other kinds', () => {
  const data = fixture();
  data.masters = [
    { ...truck, id: 'team', kind: 'tag', name: 'เคน' },
    { ...truck, id: 'source', kind: 'source', name: 'บ่อ', tagIds: ['team'] },
    { ...truck, id: 'customer', kind: 'customer', name: 'Historical customer' },
  ];
  data.trips = [];
  expect(recordUsage(data, 'master', 'team')).toEqual([]);
  expect(recordUsage(data, 'master', 'customer').join()).toContain('โครงการ');
});
