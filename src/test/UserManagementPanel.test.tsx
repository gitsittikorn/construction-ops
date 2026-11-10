import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserManagementPanel from '../UserManagementPanel';
import type { AccessUser } from '../accessBackend';
const api = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), audit: vi.fn() }));
vi.mock('../accessBackend', async (original) => ({
  ...(await original<typeof import('../accessBackend')>()),
  listAccessUsers: api.list,
  saveAccessUser: api.save,
  listAccessAudit: api.audit,
}));
const scope = {
  actorUid: 'company',
  companyId: 'company',
  role: 'owner' as const,
  accessPolicy: 'allowlist-v1' as const,
};
const root: AccessUser = {
  uid: 'company',
  email: 'root@example.com',
  name: 'Root',
  role: 'super_admin',
  status: 'enabled',
  revision: 1,
  createdAt: '2026-11-10T00:00:00Z',
  updatedAt: '2026-11-10T00:00:00Z',
  lastLoginAt: null,
  createdBy: 'company',
  updatedBy: 'company',
};
beforeEach(() => {
  api.list.mockReset().mockResolvedValue({ users: [root], next: null });
  api.audit.mockReset().mockResolvedValue({ events: [] });
  api.save.mockReset().mockResolvedValue({ user: root, sessionRevocationPending: false });
});
it('invites an email before first login without supplying a UID and searches through the trusted API', async () => {
  const user = userEvent.setup();
  render(<UserManagementPanel scope={scope} online />);
  await screen.findByRole('button', { name: 'แก้สิทธิ์ root@example.com' });
  await user.type(screen.getByLabelText('อีเมล Google ที่อนุญาต'), 'New@Example.com');
  await user.type(screen.getByLabelText('ชื่อทีมงาน'), 'New user');
  await user.selectOptions(screen.getByLabelText('บทบาทผู้ใช้งาน'), 'viewer');
  await user.click(screen.getByRole('button', { name: 'บันทึกสิทธิ์ผู้ใช้งาน' }));
  await waitFor(() =>
    expect(api.save).toHaveBeenCalledWith('company', {
      email: 'New@Example.com',
      name: 'New user',
      role: 'viewer',
      status: 'enabled',
      expectedRevision: null,
    }),
  );
  await screen.findByText(/บันทึกสิทธิ์แล้ว/);
  await user.type(screen.getByLabelText('ค้นหาอีเมลผู้ใช้งาน'), 'root');
  await user.click(screen.getByRole('button', { name: 'ค้นหา / โหลดรายชื่อใหม่' }));
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith('company', 'root', ''));
});
it('keeps the original record when the server rejects disabling the last super admin', async () => {
  const user = userEvent.setup();
  api.save.mockRejectedValue(Error('ต้องเหลือผู้ดูแลสูงสุดที่เข้าระบบได้อย่างน้อย 1 คน'));
  render(<UserManagementPanel scope={scope} online />);
  await user.click(await screen.findByRole('button', { name: 'แก้สิทธิ์ root@example.com' }));
  expect(screen.getByLabelText('อีเมล Google ที่อนุญาต')).toHaveAttribute('readonly');
  await user.selectOptions(screen.getByLabelText('สถานะบัญชีผู้ใช้งาน'), 'disabled');
  await user.click(screen.getByRole('button', { name: 'บันทึกสิทธิ์ผู้ใช้งาน' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('อย่างน้อย 1 คน');
  expect(screen.getByRole('button', { name: 'แก้สิทธิ์ root@example.com' })).toBeVisible();
  expect(api.save.mock.calls[0][1].expectedRevision).toBe(1);
});
it('admin/staff/viewer cannot enter the super-admin back office or trigger list requests', () => {
  for (const role of ['manager', 'operator', 'viewer'] as const) {
    const view = render(<UserManagementPanel scope={{ ...scope, role }} online />);
    expect(screen.getByRole('alert')).toHaveTextContent('เฉพาะผู้ดูแลสูงสุด');
    view.unmount();
  }
  expect(api.list).not.toHaveBeenCalled();
  expect(api.save).not.toHaveBeenCalled();
});
it('disables administrative writes offline without deleting loaded records', async () => {
  render(<UserManagementPanel scope={scope} online={false} />);
  await screen.findByRole('button', { name: 'แก้สิทธิ์ root@example.com' });
  expect(screen.getByRole('button', { name: 'บันทึกสิทธิ์ผู้ใช้งาน' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'แก้สิทธิ์ root@example.com' })).toBeDisabled();
});
