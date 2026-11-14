import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TruckSheetsPanel from '../TruckSheetsPanel';
import { legacyTruckHeaders as truckHeaders } from '../truckImport';
import { parseTruckRows } from '../truckImport';
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  auth: vi.fn(),
  verify: vi.fn(),
  prepare: vi.fn(),
  load: vi.fn(),
  identity: vi.fn(),
}));
vi.mock('../firebase', () => ({
  getSessionIdentity: mocks.identity,
}));
vi.mock('../drive', () => ({
  loadGoogleIdentity: mocks.load,
  requestDriveToken: mocks.auth,
  verifyDriveAccount: mocks.verify,
}));
vi.mock('../truckSheets', async (original) => ({
  ...(await original<typeof import('../truckSheets')>()),
  loadTruckSheet: async () => '',
  saveTruckSheet: mocks.save,
  readTruckSheet: mocks.read,
  prepareTruckSheet: mocks.prepare,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockReturnValue({ uid: 'owner', email: 'a@example.com' });
  mocks.load.mockResolvedValue(undefined);
  mocks.auth.mockResolvedValue({ token: 'token' });
  mocks.verify.mockResolvedValue(undefined);
  mocks.save.mockResolvedValue(undefined);
  mocks.prepare.mockResolvedValue(undefined);
});
it('requests read scope and sends rows to preview without persisting vehicle data', async () => {
  const rows = parseTruckRows([truckHeaders, ['', '81-0001', '', '0812345678', '', 6, '', '', '']]);
  mocks.read.mockResolvedValue(rows);
  const onRows = vi.fn(),
    onBusy = vi.fn();
  render(<TruckSheetsPanel owner="owner" disabled={false} onRows={onRows} onBusy={onBusy} />);
  await screen.findByRole('link');
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'https://docs.google.com/spreadsheets/d/abc/edit' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'นำเข้าจาก Google Sheets' }));
  await waitFor(() => expect(onRows).toHaveBeenCalledWith(rows));
  expect(mocks.auth).toHaveBeenCalledWith('a@example.com', [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
  ]);
  expect(mocks.save).toHaveBeenCalledWith('owner', 'abc');
  expect(screen.getByRole('link')).toHaveAttribute(
    'href',
    'https://docs.google.com/spreadsheets/d/abc/edit',
  );
  expect(onBusy.mock.calls).toEqual([[true], [false]]);
});
it('shows read errors and never forwards or remembers failed data', async () => {
  mocks.read.mockRejectedValue(Error('ชีตไม่มีสิทธิ์อ่าน'));
  const onRows = vi.fn();
  render(<TruckSheetsPanel owner="owner" disabled={false} onRows={onRows} onBusy={() => {}} />);
  await screen.findByRole('link');
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'https://docs.google.com/spreadsheets/d/abc/edit' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'นำเข้าจาก Google Sheets' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'อ่านข้อมูลรถจาก Google Sheets: ชีตไม่มีสิทธิ์อ่าน',
  );
  expect(onRows).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it('defaults to the user template and prepares headers without importing vehicles', async () => {
  const onRows = vi.fn();
  render(<TruckSheetsPanel owner="owner" disabled={false} onRows={onRows} onBusy={() => {}} />);
  const link = await screen.findByRole('link');
  fireEvent.click(screen.getByText('แก้ปัญหาเชื่อมต่อ Google'));
  expect(screen.getByText(window.location.origin)).toBeInTheDocument();
  expect(screen.getByText(/Authorized JavaScript origins/)).toBeInTheDocument();
  expect(link).toHaveAttribute(
    'href',
    'https://docs.google.com/spreadsheets/d/1_DHAvNEMXyeVbFhc9Am13o8b_gu4AhOSCQljTUq6jzA/edit',
  );
  fireEvent.click(screen.getByRole('button', { name: 'สร้างหัวคอลัมน์ในชีต' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('เตรียมชีต Trucks'));
  expect(mocks.auth).toHaveBeenCalledWith('a@example.com', [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
  expect(mocks.prepare).toHaveBeenCalledWith(
    'token',
    '1_DHAvNEMXyeVbFhc9Am13o8b_gu4AhOSCQljTUq6jzA',
    expect.any(Function),
  );
  expect(onRows).not.toHaveBeenCalled();
});
it('reports failed header preparation without claiming completion', async () => {
  mocks.prepare.mockRejectedValue(Error('ไม่มีสิทธิ์แก้ไข'));
  render(<TruckSheetsPanel owner="owner" disabled={false} onRows={() => {}} onBusy={() => {}} />);
  await screen.findByRole('link');
  fireEvent.click(screen.getByRole('button', { name: 'สร้างหัวคอลัมน์ในชีต' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('ไม่มีสิทธิ์แก้ไข');
  expect(mocks.save).not.toHaveBeenCalled();
});

it('stops before opening consent when the account changes during Google library loading', async () => {
  let loaded!: () => void;
  mocks.load.mockReturnValue(
    new Promise<void>((resolve) => {
      loaded = resolve;
    }),
  );
  const onRows = vi.fn();
  render(<TruckSheetsPanel owner="owner" disabled={false} onRows={onRows} onBusy={() => {}} />);
  await screen.findByRole('link');
  fireEvent.click(screen.getByRole('button', { name: 'นำเข้าจาก Google Sheets' }));
  mocks.identity.mockReturnValue({ uid: 'other', email: 'b@example.com' });
  loaded();
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
  expect(onRows).not.toHaveBeenCalled();
});
it('stops before verifying or reading with a stale consent result', async () => {
  let consent!: (value: { token: string }) => void;
  mocks.auth.mockReturnValue(
    new Promise((resolve) => {
      consent = resolve;
    }),
  );
  render(<TruckSheetsPanel owner="owner" disabled={false} onRows={() => {}} onBusy={() => {}} />);
  await screen.findByRole('link');
  fireEvent.click(screen.getByRole('button', { name: 'นำเข้าจาก Google Sheets' }));
  await waitFor(() => expect(mocks.auth).toHaveBeenCalled());
  mocks.identity.mockReturnValue(null);
  consent({ token: 'stale-token' });
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(mocks.verify).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
