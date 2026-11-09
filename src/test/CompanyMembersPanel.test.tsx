import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CompanyMember } from '../companyAccess';
const api = vi.hoisted(() => ({ list: vi.fn(), profile: vi.fn(), save: vi.fn() }));
vi.mock('../companyAccess', () => ({
  listCompanyMembers: api.list,
  saveCompanyProfile: api.profile,
  saveCompanyMember: api.save,
}));
import CompanyMembersPanel from '../CompanyMembersPanel';
const scope = { actorUid: 'owner', companyId: 'owner', role: 'owner' as const };
beforeEach(() => {
  api.list.mockReset().mockResolvedValue([]);
  api.profile.mockReset().mockResolvedValue(undefined);
  api.save.mockReset().mockResolvedValue(undefined);
});
it('adds a member and explicitly disables membership without deleting history', async () => {
  const user = userEvent.setup(),
    member: CompanyMember = {
      uid: 'worker',
      name: 'Somchai',
      role: 'operator',
      enabled: true,
      updatedAt: '2026-11-08T00:00:00Z',
    };
  render(<CompanyMembersPanel scope={scope} />);
  await waitFor(() => expect(api.list).toHaveBeenCalled());
  api.list.mockResolvedValue([member]);
  await user.type(screen.getByLabelText('รหัสผู้ใช้สมาชิก'), 'worker');
  await user.type(screen.getByLabelText('ชื่อสมาชิก'), 'Somchai');
  await user.click(screen.getByRole('button', { name: 'เพิ่มหรือเปิดสิทธิ์สมาชิก' }));
  await screen.findByRole('button', { name: 'ปิดสิทธิ์ Somchai' });
  expect(api.save).toHaveBeenCalledWith(scope, {
    uid: 'worker',
    name: 'Somchai',
    role: 'operator',
    enabled: true,
  });
  api.list.mockResolvedValue([{ ...member, enabled: false }]);
  await user.click(screen.getByRole('button', { name: 'ปิดสิทธิ์ Somchai' }));
  await screen.findByRole('button', { name: 'เปิดสิทธิ์ Somchai' });
  expect(api.save).toHaveBeenLastCalledWith(
    scope,
    expect.objectContaining({ uid: 'worker', enabled: false }),
  );
});
it('reports a failed membership write and permits a safe retry with the same input', async () => {
  const user = userEvent.setup();
  api.save.mockRejectedValueOnce(
    Object.assign(Error('membership denied'), { code: 'permission-denied' }),
  );
  render(<CompanyMembersPanel scope={scope} />);
  await user.type(screen.getByLabelText('รหัสผู้ใช้สมาชิก'), 'worker');
  await user.type(screen.getByLabelText('ชื่อสมาชิก'), 'Somchai');
  await user.click(screen.getByRole('button', { name: 'เพิ่มหรือเปิดสิทธิ์สมาชิก' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('รหัสผู้ใช้สมาชิก')).toHaveValue('worker');
  await user.click(screen.getByRole('button', { name: 'เพิ่มหรือเปิดสิทธิ์สมาชิก' }));
  await screen.findByText(/บันทึกสิทธิ์บริษัทแล้ว/);
  expect(api.save).toHaveBeenCalledTimes(2);
});
