import { render, screen, act, waitFor } from '@testing-library/react';
import App from '../App';
import type { CloudBatch } from '../cloudSync';
import { emptyData } from '../models';
import { loadData, persistData, updateData } from '../storage';
import { firestoreTransport } from '../cloudFirestore';
import { fixture } from './syncFixtures';
import userEvent from '@testing-library/user-event';
import { logout } from '../firebase';
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
  logout: vi.fn().mockResolvedValue(undefined),
  syncTrip: vi.fn(),
  getSessionIdentity: () => ({ uid: 'test-owner', email: 'test@company.com' }),
  resolveDriveFolders: vi.fn(),
  saveDocumentMetadata: vi.fn(),
}));
beforeEach(() => {
  authMock.initiallySignedIn = true;
  authMock.login.mockReset();
  vi.mocked(logout).mockClear();
  vi.mocked(firestoreTransport.pull).mockReset().mockResolvedValue({ records: [], cursors: {} });
});
it('offers logout in the workspace header without relying on the desktop-only profile', async () => {
  await persistData('test-owner', fixture());
  render(<App />);
  await screen.findByText('Site', { exact: true });
  const button = screen.getByRole('button', { name: 'ออกจากระบบ' });
  expect(button.closest('header')).not.toBeNull();
  expect(button.closest('.sidebar-bottom')).toBeNull();
  await userEvent.click(button);
  expect(logout).toHaveBeenCalledOnce();
  expect((await loadData('test-owner')).projects[0].name).toBe('Site');
});
it.each(['permission-denied', 'unauthenticated'])(
  'closes the workspace when %s occurs after authorization without losing pending data',
  async (code) => {
    await persistData('test-owner', fixture());
    await updateData('test-owner', (data) => data);
    vi.mocked(firestoreTransport.pull).mockRejectedValue(
      Object.assign(new Error('access revoked during restore'), { code }),
    );
    render(<App />);
    await screen.findByRole('heading', { name: 'ไม่สามารถตรวจสอบสิทธิ์ Admin ได้' });
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ลองตรวจสอบสิทธิ์ใหม่' })).toBeEnabled();
    const stored = await loadData('test-owner');
    expect(stored.projects[0].name).toBe('Site');
    expect(stored.sync!.entries['projects/p'].status).toBe('pending');
  },
);
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

it('P1-13/18 hides the previous account on sign-out and restores only the returning account', async () => {
  await persistData('test-owner', fixture());
  await persistData('second-owner', {
    ...fixture(),
    projects: [{ ...fixture().projects[0], name: 'Second account site' }],
  });
  render(<App />);
  await screen.findByText('Site', { exact: true });
  await act(async () => authMock.callback?.(null));
  await screen.findByRole('button', { name: 'เข้าสู่ระบบด้วย Google' });
  expect(screen.queryByText('Site', { exact: true })).not.toBeInTheDocument();
  await act(async () => authMock.callback?.({ uid: 'second-owner' }));
  await screen.findByText('Second account site', { exact: true });
  expect(screen.queryByText('Site', { exact: true })).not.toBeInTheDocument();
  await act(async () => authMock.callback?.({ uid: 'test-owner' }));
  await screen.findByText('Site', { exact: true });
  expect(screen.queryByText('Second account site', { exact: true })).not.toBeInTheDocument();
  expect((await loadData('second-owner')).projects[0].name).toBe('Second account site');
  await userEvent.click(screen.getByRole('button', { name: 'ซิงก์และสำรองข้อมูล' }));
  await screen.findByText('ตรวจสอบกับ Cloud แล้ว ข้อมูลซิงก์ครบ');
});

it('stops in-flight synchronization after unmount without pushing pending data or updating the removed workspace', async () => {
  await persistData('test-owner', fixture());
  let finish: ((value: CloudBatch) => void) | undefined;
  vi.mocked(firestoreTransport.push).mockClear();
  vi.mocked(firestoreTransport.pull).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<App />);
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  view.unmount();
  await act(async () => {
    finish!({ records: [], cursors: {} });
  });
  expect(firestoreTransport.push).not.toHaveBeenCalled();
  const stored = await loadData('test-owner');
  expect(stored.trips[0].syncStatus).toBe('pending');
  expect(stored.sync!.entries['trips/trip'].status).toBe('pending');
});

it('keeps a restore failure in the sync menu across navigation and clears the indicator after a successful retry', async () => {
  await persistData('test-owner', fixture());
  const failure = 'กู้คืนไม่สำเร็จ: เที่ยวรถ orphan: ไม่พบโครงการ missing';
  vi.mocked(firestoreTransport.pull).mockRejectedValue(new Error(failure));
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('status', { name: 'มีปัญหาการซิงก์หรือข้อมูลที่ต้องตรวจสอบ' });
  expect(screen.queryByText(failure)).not.toBeInTheDocument();
  expect((await loadData('test-owner')).trips[0].syncStatus).toBe('pending');
  await user.click(screen.getByRole('button', { name: 'ซิงก์และสำรองข้อมูล' }));
  expect(await screen.findByText(failure)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'โครงการ' }));
  expect(screen.queryByText(failure)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'ซิงก์และสำรองข้อมูล' }));
  expect(await screen.findByText(failure)).toBeInTheDocument();
  vi.mocked(firestoreTransport.pull).mockResolvedValue({ records: [], cursors: {} });
  await user.click(screen.getByRole('button', { name: 'ซิงก์และกู้คืนจาก Cloud' }));
  await waitFor(async () =>
    expect((await loadData('test-owner')).trips[0].syncStatus).toBe('synced'),
  );
  expect(
    screen.queryByRole('status', { name: 'มีปัญหาการซิงก์หรือข้อมูลที่ต้องตรวจสอบ' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(failure)).not.toBeInTheDocument();
});
