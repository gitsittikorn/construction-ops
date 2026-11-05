import { render, screen, act } from '@testing-library/react';
import App from '../App';
import { emptyData } from '../models';
import { persistData } from '../storage';
import userEvent from '@testing-library/user-event';
const authMock = vi.hoisted(() => ({
  callback: null as null | ((user: { uid: string } | null) => void),
  initiallySignedIn: true,
  login: vi.fn(),
}));
vi.mock('../cloudFirestore', () => ({
  firestoreTransport: {
    authorize: vi.fn().mockResolvedValue(undefined),
    pull: vi.fn().mockResolvedValue({ records: [], cursors: {} }),
    push: vi.fn(async (_owner, _collection, entry) => entry.desired),
    read: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('../firebase', () => ({
  configured: true,
  observeAuth: (callback: (user: { uid: string } | null) => void) => {
    authMock.callback = callback;
    queueMicrotask(() => callback(authMock.initiallySignedIn ? { uid: 'test-owner' } : null));
    return () => {
      authMock.callback = null;
    };
  },
  login: authMock.login,
  logout: vi.fn(),
  syncTrip: vi.fn(),
  getSessionIdentity: () => ({ uid: 'test-owner', email: 'test@company.com' }),
  resolveDriveFolders: vi.fn(),
  saveDocumentMetadata: vi.fn(),
}));
beforeEach(() => {
  authMock.initiallySignedIn = true;
  authMock.login.mockReset();
});
it('keeps existing data visible when Firebase repeats the same signed-in account event', async () => {
  await persistData('test-owner', {
    ...emptyData,
    projects: [
      {
        id: 'p',
        createdAt: 'now',
        updatedAt: 'now',
        name: 'Existing project',
        customer: '',
        location: '',
        startDate: '',
        endDate: '',
        status: 'active',
        description: '',
      },
    ],
  });
  render(<App />);
  await screen.findByText('Existing project');
  await act(async () => authMock.callback?.({ uid: 'test-owner' }));
  expect(screen.getByText('Existing project')).toBeInTheDocument();
  expect(screen.queryByText('กำลังเปิดข้อมูลในเครื่อง…')).not.toBeInTheDocument();
});
it('opens Firebase login from the artwork page and enters the workspace after authentication', async () => {
  authMock.initiallySignedIn = false;
  authMock.login.mockImplementation(async () => authMock.callback?.({ uid: 'test-owner' }));
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' }));
  expect(authMock.login).toHaveBeenCalledOnce();
  await screen.findByRole('heading', { name: 'ภาพรวมการทำงาน' });
  expect(screen.queryByRole('button', { name: 'เข้าสู่ระบบด้วย Google' })).not.toBeInTheDocument();
});
it('keeps the login page usable when Firebase rejects the domain', async () => {
  authMock.initiallySignedIn = false;
  authMock.login.mockRejectedValueOnce({ code: 'auth/unauthorized-domain' });
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'เพิ่มโดเมนใน Firebase Authentication',
  );
  expect(screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' })).toBeEnabled();
});
