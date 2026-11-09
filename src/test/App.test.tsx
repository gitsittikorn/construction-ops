import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { persistData } from '../storage';
import { emptyData } from '../models';
import { companyName, companyLogo } from '../branding';
beforeEach(async () => {
  await persistData('local', structuredClone(emptyData));
});
it('shows the supplied company logo and company name without the old brand', async () => {
  render(<App />);
  await screen.findByText('เริ่มต้นโครงการแรก');
  expect(screen.getByRole('img', { name: companyName })).toHaveAttribute('src', companyLogo);
  expect(screen.getByText(companyName)).toBeInTheDocument();
  expect(screen.queryByText(/ดินดี/)).not.toBeInTheDocument();
});
it('creates a project, a truck and a trip through the UI and restores it on reload', async () => {
  const user = userEvent.setup();
  const view = render(<App />);
  await screen.findByText('เริ่มต้นโครงการแรก');
  await user.click(screen.getByRole('button', { name: 'เพิ่มโครงการ' }));
  await user.type(screen.getByLabelText('ชื่อโครงการ'), 'โครงการทดสอบ');
  await user.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
  await screen.findByText('โครงการทดสอบ');
  await user.click(screen.getByRole('button', { name: 'ข้อมูลพื้นฐาน' }));
  await user.click(screen.getByRole('button', { name: 'เพิ่มข้อมูล' }));
  await user.type(screen.getByLabelText('ทะเบียนรถ'), '81-1234');
  await user.type(screen.getByLabelText('ความจุ (m³)'), '12');
  await user.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
  await screen.findByText('81-1234');
  await user.click(screen.getByRole('button', { name: 'บันทึกเที่ยวรถ' }));
  await user.click(screen.getAllByRole('button', { name: 'บันทึกเที่ยวรถ' })[1]);
  await user.selectOptions(
    screen.getByLabelText('รถบรรทุก *'),
    screen.getByRole('option', { name: '81-1234' }),
  );
  await user.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
  await screen.findByText('รอซิงก์');
  expect(screen.getByText('81-1234')).toBeInTheDocument();
  view.unmount();
  render(<App />);
  await screen.findByText('โครงการทดสอบ');
  await user.click(screen.getAllByRole('button', { name: /^บันทึกเที่ยวรถ/ })[0]);
  await waitFor(() => expect(screen.getByText('81-1234')).toBeInTheDocument());
});
it('creates and deactivates each kind of master data', async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText('เริ่มต้นโครงการแรก');
  await user.click(
    within(screen.getByRole('navigation')).getByRole('button', { name: 'ข้อมูลพื้นฐาน' }),
  );
  for (const [kind, name] of [
    ['คนขับรถ', 'สมชาย'],
    ['แหล่งดิน', 'บ่อดิน A'],
    ['ลูกค้า', 'ลูกค้า A'],
  ]) {
    await user.click(screen.getByRole('button', { name: kind }));
    await user.click(screen.getByRole('button', { name: 'เพิ่มข้อมูล' }));
    await user.type(screen.getByLabelText('ชื่อ'), name);
    await user.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    await user.click(await screen.findByRole('button', { name: new RegExp(name) }));
    await user.selectOptions(screen.getByLabelText('สถานะ'), 'false');
    await user.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    await screen.findByText('ปิดใช้งาน');
  }
});
it('edits and archives projects and filters search results', async () => {
  const project = {
    id: 'p',
    name: 'Original',
    customer: 'Owner',
    location: 'Bangkok',
    startDate: '2026-11-02',
    endDate: '',
    status: 'active' as const,
    description: '',
    createdAt: 'now',
    updatedAt: 'now',
  };
  await persistData('local', { ...emptyData, projects: [project] });
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText('Original');
  await user.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'โครงการ' }));
  await user.click(screen.getByRole('button', { name: /ดู \/ แก้ไข/ }));
  await user.clear(screen.getByLabelText('ชื่อโครงการ'));
  await user.type(screen.getByLabelText('ชื่อโครงการ'), 'Changed');
  await user.selectOptions(screen.getByLabelText('สถานะ'), 'archived');
  await user.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
  await screen.findByText('Changed');
  expect(screen.getByText('จัดเก็บแล้ว')).toBeInTheDocument();
  await user.type(screen.getByLabelText('ค้นหาโครงการ'), 'missing');
  expect(screen.queryByText('Changed')).not.toBeInTheDocument();
});
it('calculates both survey and fill volume through forms', async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText('เริ่มต้นโครงการแรก');
  await user.click(
    within(screen.getByRole('navigation')).getByRole('button', { name: 'สำรวจและคำนวณ' }),
  );
  for (const [label, value] of [
    ['Benchmark RL (m)', '100'],
    ['Backsight (m)', '1.5'],
    ['Staff reading (m)', '2'],
    ['Target RL (m)', '101'],
  ])
    await user.type(screen.getByLabelText(label), value);
  await user.click(screen.getAllByRole('button', { name: 'คำนวณ' })[0]);
  expect(screen.getByRole('status')).toHaveTextContent('RL 99.5 m');
  for (const [label, value] of [
    ['พื้นที่ (m²)', '100'],
    ['ความสูงถม (m)', '2'],
    ['ตัวคูณดินหลวม / ดินบดอัด', '1.25'],
    ['เผื่อทรุดตัว (%)', '10'],
    ['ความจุรถ (m³/เที่ยว)', '12'],
    ['ที่มาของสมมติฐาน', 'ผลทดสอบ'],
  ])
    await user.type(screen.getByLabelText(label), value);
  await user.click(screen.getAllByRole('button', { name: 'คำนวณ' })[1]);
  expect(screen.getByRole('status')).toHaveTextContent('23 เที่ยว');
});
it('shows offline mode and prints the original trip list from its own page', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText('เริ่มต้นโครงการแรก');
  window.dispatchEvent(new Event('offline'));
  await user.click(
    within(screen.getByRole('navigation')).getByRole('button', { name: 'บันทึกเที่ยวรถ' }),
  );
  expect(screen.getByText(/รายการรอซิงก์ยังไม่ใช่ข้อมูลยืนยัน/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'พิมพ์ / PDF' }));
  expect(print).toHaveBeenCalledOnce();
});
