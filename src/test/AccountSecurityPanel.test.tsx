import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountSecurityPanel from '../AccountSecurityPanel';
import { beginTotpSetup, totpEnrolled } from '../firebaseMfa';
vi.mock('../firebaseMfa', () => ({
  beginTotpSetup: vi.fn(),
  totpEnrolled: vi.fn(),
  mfaErrorMessage: () => 'รหัสไม่ถูกต้อง กรุณาลองใหม่',
}));
const finish = vi.fn();
beforeEach(() => {
  vi.mocked(totpEnrolled).mockReturnValue(false);
  vi.mocked(beginTotpSetup).mockReset().mockResolvedValue({
    secretKey: 'TEST_ONLY_SETUP_KEY',
    deadline: '2026-11-10T12:00:00Z',
    finish,
  });
  finish.mockReset().mockResolvedValue(undefined);
});
it('requires an explicit online action, clears the code on failure, and permits retry', async () => {
  const user = userEvent.setup();
  render(<AccountSecurityPanel uid="actor" online />);
  expect(beginTotpSetup).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'ตั้งค่าแอปยืนยันตัวตน' }));
  expect(await screen.findByLabelText('คีย์ตั้งค่า Authenticator')).toHaveValue(
    'TEST_ONLY_SETUP_KEY',
  );
  finish.mockRejectedValueOnce({ code: 'auth/invalid-verification-code' });
  await user.type(screen.getByLabelText('รหัสยืนยันตั้งค่า 6 หลัก'), '012345');
  await user.click(screen.getByRole('button', { name: 'ยืนยันและเปิดใช้แอปยืนยันตัวตน' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('รหัสไม่ถูกต้อง');
  expect(screen.getByLabelText('รหัสยืนยันตั้งค่า 6 หลัก')).toHaveValue('');
  await user.type(screen.getByLabelText('รหัสยืนยันตั้งค่า 6 หลัก'), '123456');
  await user.click(screen.getByRole('button', { name: 'ยืนยันและเปิดใช้แอปยืนยันตัวตน' }));
  expect(await screen.findByRole('status')).toHaveTextContent('ออกจากระบบและเข้าใหม่');
  expect(screen.queryByLabelText('คีย์ตั้งค่า Authenticator')).not.toBeInTheDocument();
  expect(finish.mock.calls.map(([code]) => code)).toEqual(['012345', '123456']);
});
it('drops the setup key on cancel and never starts enrollment offline or when already enrolled', async () => {
  const user = userEvent.setup();
  const view = render(<AccountSecurityPanel uid="actor" online />);
  await user.click(screen.getByRole('button', { name: 'ตั้งค่าแอปยืนยันตัวตน' }));
  await screen.findByLabelText('คีย์ตั้งค่า Authenticator');
  await user.click(screen.getByRole('button', { name: 'ยกเลิกการตั้งค่า' }));
  expect(screen.queryByLabelText('คีย์ตั้งค่า Authenticator')).not.toBeInTheDocument();
  expect(finish).not.toHaveBeenCalled();
  view.rerender(<AccountSecurityPanel uid="actor" online={false} />);
  expect(screen.getByRole('button', { name: 'ตั้งค่าแอปยืนยันตัวตน' })).toBeDisabled();
  view.unmount();
  vi.mocked(totpEnrolled).mockReturnValue(true);
  render(<AccountSecurityPanel uid="actor" online />);
  expect(screen.queryByRole('button', { name: 'ตั้งค่าแอปยืนยันตัวตน' })).not.toBeInTheDocument();
});
it('does not display a delayed setup after leaving the account panel', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof beginTotpSetup>>) => void;
  vi.mocked(beginTotpSetup).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = render(<AccountSecurityPanel uid="actor" online />);
  await userEvent.click(screen.getByRole('button', { name: 'ตั้งค่าแอปยืนยันตัวตน' }));
  await waitFor(() => expect(resolve).toBeTypeOf('function'));
  view.unmount();
  await act(async () => resolve({ secretKey: 'TEST_ONLY_SETUP_KEY', deadline: '', finish }));
  expect(screen.queryByLabelText('คีย์ตั้งค่า Authenticator')).not.toBeInTheDocument();
  expect(finish).not.toHaveBeenCalled();
});
