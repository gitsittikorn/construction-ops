import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PrivateFileViewer from '../PrivateFileViewer';
import { connectionMessage } from '../async';
it('loads a private image only on demand, retries errors and releases its object URL', async () => {
  const OriginalURL = URL,
    create = vi.fn(() => 'blob:private'),
    revoke = vi.fn();
  class TestURL extends OriginalURL {
    static createObjectURL = create;
    static revokeObjectURL = revoke;
  }
  vi.stubGlobal('URL', TestURL);
  const load = vi
      .fn()
      .mockRejectedValueOnce(Error('permission revoked'))
      .mockResolvedValueOnce(new Blob(['original'], { type: 'image/png' })),
    onError = vi.fn();
  try {
    const view = render(<PrivateFileViewer name="original.png" load={load} onError={onError} />);
    expect(load).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'ดูภาพต้นฉบับ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('permission revoked');
    expect(onError).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'ลองโหลดภาพอีกครั้ง' }));
    expect(await screen.findByRole('img', { name: 'ต้นฉบับ original.png' })).toHaveAttribute(
      'src',
      'blob:private',
    );
    view.unmount();
    expect(revoke).toHaveBeenCalledWith('blob:private');
  } finally {
    vi.unstubAllGlobals();
  }
});
it('describes quota failures without suggesting deletion of pending data', () => {
  expect(connectionMessage(new DOMException('quota', 'QuotaExceededError'))).toContain(
    'อย่าล้างข้อมูลเว็บไซต์',
  );
});
