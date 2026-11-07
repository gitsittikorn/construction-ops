import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SignaturePad from '../SignaturePad';

const context = {
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  clearRect: vi.fn(),
};
beforeEach(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 800,
    height: 240,
  } as DOMRect);
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function stroke() {
  const canvas = screen.getByLabelText('พื้นที่ลงลายเซ็น');
  fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20 });
  fireEvent.pointerMove(canvas, { clientX: 40, clientY: 30 });
  fireEvent.pointerMove(canvas, { clientX: 60, clientY: 40 });
  fireEvent.pointerUp(canvas);
}
it('rejects blank, stationary pointer events and cleared signatures', async () => {
  const onSave = vi.fn();
  render(<SignaturePad disabled={false} onSave={onSave} />);
  const save = screen.getByRole('button', { name: 'บันทึกลายเซ็น' });
  fireEvent.click(save);
  expect(await screen.findByRole('alert')).toHaveTextContent('ลงลายเซ็น');
  const canvas = screen.getByLabelText('พื้นที่ลงลายเซ็น');
  fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20 });
  fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20 });
  fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20 });
  fireEvent.pointerUp(canvas);
  fireEvent.click(save);
  expect(onSave).not.toHaveBeenCalled();
  stroke();
  fireEvent.click(screen.getByRole('button', { name: 'ล้างลายเซ็น / ลงใหม่' }));
  fireEvent.click(save);
  expect(await screen.findByRole('alert')).toHaveTextContent('ลงลายเซ็น');
  expect(onSave).not.toHaveBeenCalled();
});
it('saves a drawn PNG once during concurrent clicks and permits retry after storage failure', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['signature'], { type: 'image/png' })),
  );
  const onSave = vi.fn().mockRejectedValueOnce(Error('storage full')).mockResolvedValue(undefined);
  render(<SignaturePad disabled={false} onSave={onSave} />);
  stroke();
  const button = screen.getByRole('button', { name: 'บันทึกลายเซ็น' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('storage full');
  expect(onSave).toHaveBeenCalledTimes(1);
  fireEvent.click(button);
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  expect(onSave.mock.calls[1][0]).toMatchObject({ name: 'signature.png', type: 'image/png' });
});
