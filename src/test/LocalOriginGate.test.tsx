import { render, screen, waitFor } from '@testing-library/react';
import LocalOriginGate from '../LocalOriginGate';
import { legacyOriginHasData, legacyRecoveryOwners } from '../localOrigin';
vi.mock('../localOrigin', async (original) => ({
  ...(await original<typeof import('../localOrigin')>()),
  legacyOriginHasData: vi.fn(),
  legacyRecoveryOwners: vi.fn(async () => []),
}));
vi.mock('../firebase', () => ({
  configured: false,
  getSessionIdentity: () => null,
  observeAuth: () => () => {},
  login: vi.fn(),
}));

it('redirects an empty alias before business UI mounts', async () => {
  vi.mocked(legacyOriginHasData).mockResolvedValue(false);
  const navigate = vi.fn();
  render(
    <LocalOriginGate url="http://localhost:5173/" navigate={navigate}>
      <p>Business UI</p>
    </LocalOriginGate>,
  );
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('http://127.0.0.1:5173/'));
  expect(screen.queryByText('Business UI')).not.toBeInTheDocument();
});
it('keeps legacy records reachable for backup without starting business writes on the alias', async () => {
  vi.mocked(legacyOriginHasData).mockResolvedValue(true);
  vi.mocked(legacyRecoveryOwners).mockResolvedValue(['local']);
  const navigate = vi.fn();
  render(
    <LocalOriginGate url="http://localhost:5173/" navigate={navigate}>
      <p>Business UI</p>
    </LocalOriginGate>,
  );
  expect(await screen.findByRole('button', { name: 'ดาวน์โหลดข้อมูลก่อนล็อกอิน' })).toBeVisible();
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.queryByText('Business UI')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'เปิดที่อยู่หลัก 127.0.0.1' })).toHaveAttribute(
    'href',
    'http://127.0.0.1:5173/',
  );
});
it('does not redirect or claim an empty database when storage inspection fails', async () => {
  vi.mocked(legacyOriginHasData).mockRejectedValue(Error('storage unavailable'));
  const navigate = vi.fn();
  render(
    <LocalOriginGate url="http://localhost:5173/" navigate={navigate}>
      <p>Business UI</p>
    </LocalOriginGate>,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('ตรวจข้อมูลเดิมไม่สำเร็จ');
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.queryByText(/พบข้อมูลเดิมใน localhost/)).not.toBeInTheDocument();
});
it('runs normally on the canonical address without touching legacy storage', () => {
  vi.mocked(legacyOriginHasData).mockClear();
  render(
    <LocalOriginGate url="http://127.0.0.1:5173/">
      <p>Business UI</p>
    </LocalOriginGate>,
  );
  expect(screen.getByText('Business UI')).toBeVisible();
  expect(legacyOriginHasData).not.toHaveBeenCalled();
});
