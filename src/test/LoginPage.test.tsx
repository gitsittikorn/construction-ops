import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../LoginPage';
import { totpChallenge } from '../firebaseMfa';
vi.mock('../firebaseMfa', () => ({
  totpChallenge: vi.fn(),
  mfaErrorMessage: () => 'รหัสไม่ถูกต้อง กรุณาลองใหม่',
}));

it('uses the supplied artwork and invokes the login handler from the real button', async () => {
  const onLogin = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  const { container } = render(<LoginPage onLogin={onLogin} online />);
  expect(container.querySelector('.login-artwork')).toHaveAttribute('src', '/login-earthwork.png');
  expect(
    screen.getByRole('heading', { name: 'Khok Kloi Backhoe Engineering' }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' }));
  expect(onLogin).toHaveBeenCalledOnce();
});
it('prevents repeated login requests while the Google popup is pending', async () => {
  let finish!: () => void;
  const onLogin = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  render(<LoginPage onLogin={onLogin} online />);
  await user.dblClick(screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' }));
  const button = screen.getByRole('button', { name: 'กำลังเข้าสู่ระบบ…' });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-busy', 'true');
  expect(onLogin).toHaveBeenCalledOnce();
  await act(async () => finish());
  expect(screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' })).toBeEnabled();
});
it.each([
  ['auth/unauthorized-domain', 'เพิ่มโดเมนใน Firebase Authentication'],
  ['auth/popup-blocked', 'อนุญาตหน้าต่างป๊อปอัป'],
  ['auth/popup-closed-by-user', 'กดปุ่มเพื่อลองใหม่ได้'],
  ['auth/network-request-failed', 'ตรวจอินเทอร์เน็ตแล้วลองใหม่'],
])('explains %s and allows the user to retry', async (code, message) => {
  const onLogin = vi.fn().mockRejectedValueOnce({ code }).mockResolvedValueOnce(undefined);
  const user = userEvent.setup();
  render(<LoginPage onLogin={onLogin} online />);
  await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' }));
  expect(onLogin).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('disables Google login offline and enables it when connectivity returns', async () => {
  const onLogin = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  const view = render(<LoginPage onLogin={onLogin} online={false} />);
  const button = screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' });
  expect(button).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('กรุณาเชื่อมต่ออินเทอร์เน็ต');
  await user.click(button);
  expect(onLogin).not.toHaveBeenCalled();
  view.rerender(<LoginPage onLogin={onLogin} online />);
  await user.click(button);
  expect(onLogin).toHaveBeenCalledOnce();
});
it('completes a TOTP challenge without repeating Google login and clears the code on retry', async () => {
  const verify = vi
      .fn()
      .mockRejectedValueOnce({ code: 'auth/invalid-verification-code' })
      .mockResolvedValue(undefined),
    onLogin = vi.fn().mockRejectedValue({ code: 'auth/multi-factor-auth-required' }),
    user = userEvent.setup();
  vi.mocked(totpChallenge).mockReturnValue({
    factors: [{ uid: 'factor', name: 'Authenticator' }],
    verify,
  });
  render(<LoginPage onLogin={onLogin} online />);
  await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' }));
  await screen.findByRole('dialog');
  await user.type(screen.getByLabelText('รหัสยืนยันเข้าสู่ระบบ 6 หลัก'), '012345');
  await user.click(screen.getByRole('button', { name: 'ยืนยันเข้าสู่ระบบ' }));
  expect(await screen.findByText('รหัสไม่ถูกต้อง กรุณาลองใหม่')).toBeInTheDocument();
  expect(screen.getByLabelText('รหัสยืนยันเข้าสู่ระบบ 6 หลัก')).toHaveValue('');
  await user.type(screen.getByLabelText('รหัสยืนยันเข้าสู่ระบบ 6 หลัก'), '123456');
  await user.click(screen.getByRole('button', { name: 'ยืนยันเข้าสู่ระบบ' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(onLogin).toHaveBeenCalledOnce();
  expect(verify.mock.calls).toEqual([
    ['factor', '012345'],
    ['factor', '123456'],
  ]);
});
