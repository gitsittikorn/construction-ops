import { render, screen, act } from '@testing-library/react';
import App from '../App';
import { emptyData } from '../models';
import { persistData } from '../storage';
const authMock = vi.hoisted(() => ({
  callback: null as null | ((user: { uid: string } | null) => void),
}));
vi.mock('../firebase', () => ({
  configured: true,
  observeAuth: (callback: (user: { uid: string } | null) => void) => {
    authMock.callback = callback;
    queueMicrotask(() => callback({ uid: 'test-owner' }));
    return () => {
      authMock.callback = null;
    };
  },
  login: vi.fn(),
  logout: vi.fn(),
  syncTrip: vi.fn(),
  getSessionIdentity: () => ({ uid: 'test-owner', email: 'test@company.com' }),
  resolveDriveFolders: vi.fn(),
  saveDocumentMetadata: vi.fn(),
}));
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
