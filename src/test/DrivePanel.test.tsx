import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DrivePanel from '../DrivePanel';
import { listUploads, putFolders } from '../uploads';
import { requestDriveToken, DriveError } from '../drive';
import { getDriveSession, saveDriveSession } from '../driveSession';
const mocks = vi.hoisted(() => ({
  owner: '',
  metadata: vi.fn(),
  upload: vi.fn(),
  verify: vi.fn(),
  folder: vi.fn(),
  backend: false,
  restore: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock('../driveBackend', async (original) => ({
  ...(await original<typeof import('../driveBackend')>()),
  get driveBackendConfigured() {
    return mocks.backend;
  },
  restoreDriveConnection: (...args: unknown[]) => mocks.restore(...args),
  disconnectDriveBackend: (...args: unknown[]) => mocks.disconnect(...args),
}));
vi.mock('../firebase', () => ({
  getSessionIdentity: () => ({ uid: mocks.owner, email: 'owner@company.com' }),
  resolveDriveFolders: async (_: string, __: string, candidate: unknown) => candidate,
  saveDocumentMetadata: (...args: unknown[]) => mocks.metadata(...args),
}));
vi.mock('../drive', async (original) => {
  const actual = await original<typeof import('../drive')>();
  return {
    ...actual,
    driveConfigured: true,
    loadGoogleIdentity: vi.fn().mockResolvedValue(undefined),
    requestDriveToken: vi
      .fn()
      .mockResolvedValue({ token: 'test-token', expiresAt: Date.now() + 3600000 }),
    verifyDriveAccount: (...args: unknown[]) => mocks.verify(...args),
    generateDriveIds: vi.fn(async (_: string, count: number) =>
      Array.from({ length: count }, () => crypto.randomUUID()),
    ),
    ensureDriveFolder: (...args: unknown[]) => mocks.folder(...args),
    uploadOriginal: (...args: unknown[]) => mocks.upload(...args),
  };
});
beforeEach(() => {
  mocks.backend = false;
  mocks.restore
    .mockReset()
    .mockResolvedValue({ token: 'backend-token', expiresAt: Date.now() + 3600000 });
  mocks.disconnect.mockReset().mockResolvedValue(null);
  vi.mocked(requestDriveToken).mockClear();
  mocks.owner = crypto.randomUUID();
  mocks.metadata.mockReset().mockResolvedValue(undefined);
  mocks.upload.mockReset().mockResolvedValue(undefined);
  mocks.verify.mockReset().mockResolvedValue(undefined);
  mocks.folder.mockReset().mockResolvedValue(undefined);
});
it('distinguishes preparing a folder from actually uploading selected images', async () => {
  const user = userEvent.setup();
  render(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'เชื่อมต่อ Google Drive' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'เชื่อมต่อ Google Drive' }));
  await screen.findByText('ประมวลผลคิวอัปโหลดเรียบร้อย');
  await user.upload(
    screen.getByLabelText('เลือกรูปภาพ / PDF *'),
    new File(['image'], 'selected.jpg', { type: 'image/jpeg' }),
  );
  expect(screen.getByText(/เลือกแล้ว 1 ไฟล์/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'เตรียมโฟลเดอร์โครงการใน Drive' }));
  await screen.findByText(/แต่ภาพที่เลือกยังไม่ได้อัปโหลด/);
  expect(await listUploads(mocks.owner)).toEqual([]);
  expect(mocks.upload).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'อัปโหลดไฟล์ที่เลือก' }));
  await screen.findByText('อัปโหลดและบันทึกข้อมูลแล้ว');
  const uploaded = (await listUploads(mocks.owner))[0];
  expect(screen.getByRole('link', { name: 'เปิดไฟล์นี้ใน Google Drive' })).toHaveAttribute(
    'href',
    `https://drive.google.com/file/d/${uploaded.driveId}/view`,
  );
});
it('shows validation errors for missing images instead of silently skipping the upload', async () => {
  const user = userEvent.setup();
  render(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  await user.click(screen.getByRole('button', { name: 'อัปโหลดไฟล์ที่เลือก' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('กรุณาเลือกไฟล์');
  expect(await listUploads(mocks.owner)).toEqual([]);
});
it('keeps an unexpired Drive connection when returning to the upload page', async () => {
  const user = userEvent.setup();
  const first = render(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'เชื่อมต่อ Google Drive' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'เชื่อมต่อ Google Drive' }));
  await screen.findByText('ประมวลผลคิวอัปโหลดเรียบร้อย');
  first.unmount();
  render(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  await screen.findByRole('button', { name: 'ต่ออายุสิทธิ์ Drive' });
  expect(requestDriveToken).toHaveBeenCalledOnce();
});
it('syncs existing folder names and exposes a direct project link without uploading again', async () => {
  await putFolders(mocks.owner, {
    rootId: 'root',
    projectsId: 'projects',
    projects: { p: { projectId: 'legacy-project-id', documentsId: 'documents' } },
  });
  const user = userEvent.setup();
  render(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'เชื่อมต่อ Google Drive' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'เชื่อมต่อ Google Drive' }));
  const link = await screen.findByRole('link', { name: 'เปิดโฟลเดอร์โครงการ' });
  expect(link).toHaveAttribute('href', 'https://drive.google.com/drive/folders/legacy-project-id');
  expect(mocks.folder).toHaveBeenCalledWith(
    'test-token',
    'legacy-project-id',
    'Project A',
    'projects',
    true,
  );
  expect(mocks.upload).not.toHaveBeenCalled();
});
it('creates named project folders without requiring a dummy upload', async () => {
  const user = userEvent.setup();
  render(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'เชื่อมต่อ Google Drive' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'เชื่อมต่อ Google Drive' }));
  await screen.findByText('ประมวลผลคิวอัปโหลดเรียบร้อย');
  await user.selectOptions(screen.getByRole('combobox', { name: 'โครงการสำหรับเอกสาร *' }), 'p');
  await user.click(screen.getByRole('button', { name: 'เตรียมโฟลเดอร์โครงการใน Drive' }));
  await screen.findByRole('link', { name: 'เปิดโฟลเดอร์โครงการ' });
  expect(mocks.folder).toHaveBeenCalledWith(
    'test-token',
    expect.any(String),
    'Project A',
    expect.any(String),
    true,
  );
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(await listUploads(mocks.owner)).toEqual([]);
});
const project = {
  id: 'p',
  createdAt: 'now',
  updatedAt: 'now',
  name: 'Project A',
  customer: '',
  location: '',
  startDate: '',
  endDate: '',
  status: 'active' as const,
  description: '',
};
it('saves files offline, then uploads and retains bytes until metadata succeeds', async () => {
  const user = userEvent.setup();
  const view = render(
    <DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online={false} />,
  );
  await user.selectOptions(screen.getByLabelText('โครงการสำหรับเอกสาร *'), 'p');
  await user.upload(
    screen.getByLabelText('เลือกรูปภาพ / PDF *'),
    new File(['original'], 'photo.jpg', { type: 'image/jpeg' }),
  );
  expect((screen.getByLabelText('โครงการสำหรับเอกสาร *') as HTMLSelectElement).value).toBe('p');
  expect((screen.getByLabelText('เลือกรูปภาพ / PDF *') as HTMLInputElement).files).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'อัปโหลดไฟล์ที่เลือก' }));
  await screen.findByText('photo.jpg');
  expect((await listUploads(mocks.owner))[0].status).toBe('pending');
  expect(mocks.upload).not.toHaveBeenCalled();
  view.rerender(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  mocks.metadata.mockRejectedValueOnce(Error('permission-denied'));
  await user.click(screen.getByRole('button', { name: 'เชื่อมต่อ Google Drive' }));
  await screen.findAllByText('permission-denied');
  const failed = (await listUploads(mocks.owner))[0];
  expect(failed.blob).toBeDefined();
  expect(failed.driveId).not.toBe('');
  await user.click(screen.getByRole('button', { name: 'อัปโหลด / ลองใหม่' }));
  await screen.findByText('อัปโหลดและบันทึกข้อมูลแล้ว');
  const success = (await listUploads(mocks.owner))[0];
  expect(success.driveId).toBe(failed.driveId);
  expect(success.blob).toBeUndefined();
  await user.click(screen.getByRole('button', { name: 'ตัดการเชื่อมต่อ' }));
  expect(screen.getByRole('button', { name: 'อัปโหลด / ลองใหม่' })).toBeDisabled();
});
it('reports the wrong account without uploading files', async () => {
  mocks.verify.mockRejectedValueOnce(Error('wrong-account'));
  const user = userEvent.setup();
  render(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'เชื่อมต่อ Google Drive' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'เชื่อมต่อ Google Drive' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('wrong-account');
  expect(mocks.upload).not.toHaveBeenCalled();
});
it('automatically uploads a newly queued file and shows its metadata stage while waiting', async () => {
  const user = userEvent.setup();
  render(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'เชื่อมต่อ Google Drive' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'เชื่อมต่อ Google Drive' }));
  await screen.findByText('ประมวลผลคิวอัปโหลดเรียบร้อย');
  let finish!: () => void;
  mocks.metadata.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await user.selectOptions(screen.getByLabelText('โครงการสำหรับเอกสาร *'), 'p');
  await user.upload(
    screen.getByLabelText('เลือกรูปภาพ / PDF *'),
    new File(['original'], 'auto.jpg', { type: 'image/jpeg' }),
  );
  await user.click(screen.getByRole('button', { name: 'อัปโหลดไฟล์ที่เลือก' }));
  await screen.findByText('รอบันทึกข้อมูลคลาวด์');
  expect((await listUploads(mocks.owner))[0].blob).toBeDefined();
  finish();
  await screen.findByText('อัปโหลดและบันทึกข้อมูลแล้ว');
  expect(mocks.upload).toHaveBeenCalledOnce();
});
it('requires a connection in the dialog and closes it only after account verification', async () => {
  const user = userEvent.setup();
  render(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  const dialog = await screen.findByRole('dialog');
  const renew = within(dialog).getByRole('button', { name: 'ต่ออายุ / เชื่อมต่อ Drive' });
  await waitFor(() => expect(renew).toBeEnabled());
  mocks.verify.mockRejectedValueOnce(Error('wrong-account'));
  await user.click(renew);
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('wrong-account');
  expect(getDriveSession(mocks.owner)).toBeNull();
  expect(mocks.upload).not.toHaveBeenCalled();
  await user.click(renew);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(getDriveSession(mocks.owner)?.token).toBe('test-token');
});
it('prompts on expiry when returning to a suspended tab and renews before resuming', async () => {
  const expiresAt = Date.now() + 60000;
  saveDriveSession(mocks.owner, { token: 'old-token', expiresAt });
  const user = userEvent.setup();
  render(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  await screen.findByText('ประมวลผลคิวอัปโหลดเรียบร้อย');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const now = vi.spyOn(Date, 'now').mockReturnValue(expiresAt + 1);
  try {
    act(() => window.dispatchEvent(new Event('focus')));
    const dialog = await screen.findByRole('dialog', {
      name: 'สิทธิ์ Google Drive หมดอายุหรือใช้ไม่ได้แล้ว',
    });
    expect(getDriveSession(mocks.owner)).toBeNull();
    expect(screen.getByRole('button', { name: 'อัปโหลด / ลองใหม่' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'ต่ออายุ / เชื่อมต่อ Drive' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(getDriveSession(mocks.owner)?.token).toBe('test-token');
  } finally {
    now.mockRestore();
  }
});
it('invalidates a rejected token and opens the renewal dialog on a Drive 401', async () => {
  saveDriveSession(mocks.owner, { token: 'revoked', expiresAt: Date.now() + 60000 });
  await putFolders(mocks.owner, {
    rootId: 'root',
    projectsId: 'projects',
    projects: { p: { projectId: 'project', documentsId: 'docs' } },
  });
  mocks.folder.mockRejectedValueOnce(new DriveError(401));
  render(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  const dialog = await screen.findByRole('dialog', {
    name: 'สิทธิ์ Google Drive หมดอายุหรือใช้ไม่ได้แล้ว',
  });
  expect(within(dialog).getByRole('alert')).toHaveTextContent('สิทธิ์ Drive หมดอายุ');
  expect(getDriveSession(mocks.owner)).toBeNull();
  expect(mocks.upload).not.toHaveBeenCalled();
});
it('allows offline work without attempting OAuth until the user is online', async () => {
  const user = userEvent.setup();
  render(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online={false} />);
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('button', { name: 'ต่ออายุ / เชื่อมต่อ Drive' })).toBeDisabled();
  await user.click(within(dialog).getByRole('button', { name: 'ใช้งานส่วนอื่นก่อน' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(requestDriveToken).not.toHaveBeenCalled();
});
it('restores a backend connection automatically without an OAuth popup', async () => {
  mocks.backend = true;
  render(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  await screen.findByRole('button', { name: 'ต่ออายุสิทธิ์ Drive' });
  expect(mocks.restore).toHaveBeenCalledOnce();
  expect(requestDriveToken).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(getDriveSession(mocks.owner)?.token).toBe('backend-token');
});
it('renews an expiring backend session silently when the tab regains focus', async () => {
  mocks.backend = true;
  render(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  await screen.findByText('ประมวลผลคิวอัปโหลดเรียบร้อย');
  const expiresAt = getDriveSession(mocks.owner)!.expiresAt;
  const now = vi.spyOn(Date, 'now').mockReturnValue(expiresAt + 1);
  mocks.restore.mockResolvedValueOnce({ token: 'renewed', expiresAt: expiresAt + 3600000 });
  try {
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(getDriveSession(mocks.owner)?.token).toBe('renewed'));
    expect(requestDriveToken).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  } finally {
    now.mockRestore();
  }
});
it('shows reconnect only when the backend says consent is missing, not on a network error', async () => {
  const { DriveBackendError } = await import('../driveBackend');
  mocks.backend = true;
  mocks.restore.mockRejectedValueOnce(new DriveBackendError('service_unavailable'));
  const view = render(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  await screen.findByRole('alert');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  mocks.restore.mockRejectedValueOnce(new DriveBackendError('reconnect_required'));
  view.rerender(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online={false} />);
  view.rerender(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  await screen.findByRole('dialog', { name: 'สิทธิ์ Google Drive หมดอายุหรือใช้ไม่ได้แล้ว' });
});
it('removes backend credentials on disconnect so a reload cannot silently reconnect', async () => {
  mocks.backend = true;
  const user = userEvent.setup();
  render(<DrivePanel owner={mocks.owner} projects={[project]} trips={[]} online />);
  await screen.findByText('ประมวลผลคิวอัปโหลดเรียบร้อย');
  await user.click(screen.getByRole('button', { name: 'ตัดการเชื่อมต่อ' }));
  await screen.findByText('ตัดการเชื่อมต่อในแอปแล้ว');
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect(getDriveSession(mocks.owner)).toBeNull();
});
