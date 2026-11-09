import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ResolvedCompany } from '../companyAccess';
import { getWorkspaceSession, setWorkspaceSession } from '../workspaceIdentity';
const mocks = vi.hoisted(() => ({
  auth: null as null | ((user: { uid: string; email: string } | null) => void),
  watch: null as null | ((next: ResolvedCompany | null) => void),
  resolve: vi.fn(),
  cached: vi.fn(),
  remember: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn(),
}));
vi.mock('../firebase', () => ({
  configured: true,
  observeAuth: (callback: typeof mocks.auth) => {
    mocks.auth = callback;
    queueMicrotask(() => callback?.({ uid: 'worker', email: 'worker@example.com' }));
    return () => {
      mocks.auth = null;
    };
  },
  login: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../companyAccess', () => ({
  resolveCompany: mocks.resolve,
  readCompanySelection: mocks.cached,
  rememberCompany: mocks.remember,
  watchCompany: (_scope: unknown, callback: typeof mocks.watch) => {
    mocks.watch = callback;
    return mocks.unsubscribe;
  },
}));
vi.mock('../App', () => ({
  default: ({
    workspace,
    onSwitchCompany,
  }: {
    workspace?: ResolvedCompany;
    onSwitchCompany?: () => void;
  }) => (
    <div>
      <p>
        Workspace {workspace?.name} {workspace?.role}
      </p>
      <button onClick={onSwitchCompany}>เปลี่ยนบริษัท</button>
    </div>
  ),
}));
import CompanyGate from '../CompanyGate';
const shared: ResolvedCompany = {
  companyId: 'company',
  actorUid: 'worker',
  role: 'operator',
  name: 'Shared site',
};
beforeEach(() => {
  mocks.resolve.mockReset().mockRejectedValue(Error('ยังไม่เลือกบริษัท'));
  mocks.cached.mockReset().mockResolvedValue(null);
  mocks.remember.mockClear();
  mocks.watch = null;
  setWorkspaceSession(null);
});
afterEach(() => setWorkspaceSession(null));
it('opens an explicitly selected company with server-returned role, and ignores stale listeners after switch', async () => {
  const user = userEvent.setup();
  render(<CompanyGate />);
  await screen.findByText('ยังไม่เลือกบริษัท');
  expect(screen.getByText('worker', { exact: true })).toBeVisible();
  mocks.resolve.mockResolvedValueOnce(shared);
  await user.type(screen.getByLabelText('รหัสบริษัท', { exact: true }), 'company');
  await user.click(screen.getByRole('button', { name: 'เปิดบริษัท' }));
  await screen.findByText('Workspace Shared site operator');
  expect(mocks.resolve).toHaveBeenLastCalledWith('worker', 'company');
  expect(getWorkspaceSession()).toEqual(shared);
  const stale = mocks.watch;
  await user.click(screen.getByRole('button', { name: 'เปลี่ยนบริษัท' }));
  await act(async () => stale?.({ ...shared, role: 'manager' }));
  expect(screen.queryByText('Workspace Shared site manager')).not.toBeInTheDocument();
  expect(getWorkspaceSession()).toBeNull();
});
it('closes the workspace on revocation and partitions roles when a live membership changes', async () => {
  mocks.cached.mockResolvedValue({ ...shared, verifiedAt: new Date().toISOString() });
  mocks.resolve.mockResolvedValue({ ...shared, role: 'manager' });
  render(<CompanyGate />);
  await screen.findByText('Workspace Shared site manager');
  await act(async () => mocks.watch?.(shared));
  await screen.findByText('Workspace Shared site operator');
  await act(async () => mocks.watch?.(null));
  await screen.findByText(/สิทธิ์บริษัทถูกปิด/);
  expect(screen.queryByText('Workspace Shared site operator')).not.toBeInTheDocument();
  expect(getWorkspaceSession()).toBeNull();
});
it('stops late company resolution after unmount', async () => {
  let finish: ((scope: ResolvedCompany) => void) | undefined;
  mocks.resolve.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<CompanyGate />);
  await waitFor(() => expect(mocks.resolve).toHaveBeenCalled());
  view.unmount();
  await act(async () => finish?.(shared));
  expect(getWorkspaceSession()).toBeNull();
  expect(mocks.remember).not.toHaveBeenCalled();
});
