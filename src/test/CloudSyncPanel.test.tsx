import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CloudSyncPanel from '../CloudSyncPanel';
import { prepareSync } from '../syncModel';
import { cloudProject, fixture } from './syncFixtures';

it('shows local-only and offline states without claiming cloud success', async () => {
  const data = prepareSync(fixture(), fixture());
  const props = {
    owner: 'owner',
    data,
    configured: false,
    online: false,
    busy: false,
    status: '',
    onSync: vi.fn(),
    onResolve: vi.fn(),
  };
  const view = render(<CloudSyncPanel {...props} />);
  expect(screen.getByText('บันทึกในเครื่อง ยังไม่ได้เชื่อมต่อ Cloud')).toBeInTheDocument();
  expect(screen.getByText('รอซิงก์ 3 รายการ · ขัดแย้ง 0 รายการ')).toBeInTheDocument();
  view.rerender(<CloudSyncPanel {...props} configured />);
  expect(screen.getByRole('button', { name: 'ซิงก์และกู้คืนจาก Cloud' })).toBeDisabled();
  expect(screen.getByText(/ออฟไลน์/)).toBeInTheDocument();
});
it('shows both conflict versions and submits only the explicit user choice', async () => {
  const data = prepareSync(fixture(), fixture()),
    onResolve = vi.fn(),
    user = userEvent.setup();
  data.sync!.entries['projects/p'].status = 'conflict';
  data.sync!.entries['projects/p'].conflict = {
    remote: { ...cloudProject(), payload: { ...fixture().projects[0], name: 'Other device' } },
    detectedAt: 'now',
  };
  render(
    <CloudSyncPanel
      owner="owner"
      data={data}
      configured
      online
      busy={false}
      status="มีข้อมูลต้องตรวจสอบ"
      onSync={vi.fn()}
      onResolve={onResolve}
    />,
  );
  await user.click(screen.getByText('ตรวจสอบข้อมูลขัดแย้ง: Site'));
  expect(screen.getByText(/Other device/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'ใช้ฉบับ Cloud' }));
  expect(onResolve).toHaveBeenCalledWith('projects/p', 'remote');
});
