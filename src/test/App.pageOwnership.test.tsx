import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { loadData, persistData } from '../storage';
import { fixture } from './syncFixtures';

beforeEach(async () => {
  await persistData('local', fixture());
});

it('owns summaries in one report menu and keeps the original editable list and exports only in trips', async () => {
  const user = userEvent.setup();
  const original = await loadData('local');
  render(<App />);
  await screen.findByText('Site', { exact: true });
  const nav = within(screen.getByRole('navigation'));
  expect(nav.queryByRole('button', { name: 'รายงานธุรกิจ' })).not.toBeInTheDocument();
  expect(nav.getAllByRole('button', { name: 'รายงาน' })).toHaveLength(1);
  await user.click(nav.getByRole('button', { name: 'รายงาน' }));
  await screen.findByLabelText('รูปแบบรายงาน');
  await user.type(screen.getByLabelText('รายงานตั้งแต่วันที่'), '2027-01-01');
  await user.type(screen.getByLabelText('รายงานถึงวันที่'), '2026-01-01');
  expect(screen.getByRole('alert')).toHaveTextContent('ช่วงวันที่รายงานไม่ถูกต้อง');
  expect(screen.getByRole('button', { name: 'ส่งออกรายงาน CSV' })).toBeDisabled();
  const main = within(screen.getByRole('main'));
  expect(main.queryByRole('button', { name: /แก้ไขเที่ยวรถ/ })).not.toBeInTheDocument();
  expect(main.queryByRole('button', { name: 'บันทึกเที่ยวรถ' })).not.toBeInTheDocument();
  expect(main.queryByRole('columnheader', { name: 'วันที่ / เวลา' })).not.toBeInTheDocument();
  await user.click(nav.getByRole('button', { name: 'บันทึกเที่ยวรถ' }));
  await user.click(screen.getByRole('checkbox', { name: 'ทุกวันที่' }));
  expect(screen.getByRole('cell', { name: /2026-11-06/ })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: /AB123/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /แก้ไขเที่ยวรถ/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'CSV' })).toBeEnabled();
  expect(await loadData('local')).toEqual(original);
});

it('owns backup restore only in sync, rejects another account and keeps settings free of operational panels', async () => {
  const user = userEvent.setup();
  const original = await loadData('local');
  render(<App />);
  await screen.findByText('Site', { exact: true });
  const nav = within(screen.getByRole('navigation'));
  await user.click(nav.getByRole('button', { name: 'การตั้งค่า' }));
  expect(screen.queryByRole('region', { name: 'กู้คืนไฟล์สำรอง JSON' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'ตรวจเที่ยวที่อาจซ้ำ' })).not.toBeInTheDocument();
  expect(
    within(screen.getByRole('main')).queryByRole('button', { name: 'บันทึกเที่ยวรถ' }),
  ).not.toBeInTheDocument();
  expect(document.querySelector('.local-banner')).toBeNull();
  expect(screen.getByText('โหมดในเครื่อง')).toBeInTheDocument();
  await user.click(nav.getByRole('button', { name: 'ซิงก์และสำรองข้อมูล' }));
  expect(screen.getByRole('button', { name: 'ดาวน์โหลดข้อมูลสำรองพร้อมไฟล์แนบ' })).toBeEnabled();
  await user.upload(
    screen.getByLabelText('เลือกไฟล์สำรอง JSON'),
    new File(
      [
        JSON.stringify({
          format: 'construction-ops-backup',
          version: 1,
          owner: 'another-account',
          exportedAt: '2026-11-09T00:00:00Z',
          state: fixture(),
          uploads: [],
        }),
      ],
      'backup.json',
      { type: 'application/json' },
    ),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('บัญชีอื่น');
  expect(await loadData('local')).toEqual(original);
});

it('owns duplicate review in trips and clears a completed task notice when navigating away', async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText('Site', { exact: true });
  const nav = within(screen.getByRole('navigation'));
  await user.click(nav.getByRole('button', { name: 'บันทึกเที่ยวรถ' }));
  await user.selectOptions(screen.getByLabelText('มุมมองเที่ยวรถ'), 'duplicates');
  expect(screen.getByRole('region', { name: 'ตรวจเที่ยวที่อาจซ้ำ' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /รายการเที่ยวรถ/ })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('มุมมองเที่ยวรถ'), 'records');
  expect(screen.queryByRole('region', { name: 'ตรวจเที่ยวที่อาจซ้ำ' })).not.toBeInTheDocument();
  await user.click(nav.getByRole('button', { name: 'โครงการ' }));
  await user.click(screen.getByRole('button', { name: /ดู \/ แก้ไข/ }));
  await user.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
  await screen.findByText('บันทึกในเครื่องเรียบร้อย');
  await user.click(nav.getByRole('button', { name: 'รายงาน' }));
  expect(screen.queryByText('บันทึกในเครื่องเรียบร้อย')).not.toBeInTheDocument();
});
