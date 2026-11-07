import { useRef, useState } from 'react';

export default function SignaturePad({
  onSave,
  disabled,
}: {
  onSave: (file: File) => Promise<void>;
  disabled: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    marks = useRef(0),
    lastPoint = useRef<number[]>([0, 0]),
    lock = useRef(false);
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - bounds.left) * 800) / bounds.width,
      ((event.clientY - bounds.top) * 240) / bounds.height,
    ];
  };
  async function save() {
    if (disabled || lock.current) return;
    lock.current = true;
    setSaving(true);
    setError('');
    try {
      if (marks.current < 2) throw Error('กรุณาลงลายเซ็นก่อนบันทึก');
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.current!.toBlob(
          (value) => (value ? resolve(value) : reject(Error('บันทึกลายเซ็นไม่สำเร็จ'))),
          'image/png',
        ),
      );
      await onSave(new File([blob], 'signature.png', { type: 'image/png' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกลายเซ็นไม่สำเร็จ');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  return (
    <section>
      <h3>ลายเซ็นคนขับ</h3>
      <canvas
        aria-label="พื้นที่ลงลายเซ็น"
        width={800}
        height={240}
        ref={canvas}
        style={{
          width: '100%',
          maxWidth: 800,
          border: '1px solid #888',
          touchAction: 'none',
          background: 'white',
        }}
        onPointerDown={(event) => {
          if (disabled || lock.current) return;
          drawing.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          const [x, y] = point(event),
            ctx = canvas.current!.getContext('2d')!;
          ctx.beginPath();
          ctx.moveTo(x, y);
          lastPoint.current = [x, y];
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#102c25';
        }}
        onPointerMove={(event) => {
          if (!drawing.current || disabled || lock.current) return;
          const [x, y] = point(event),
            ctx = canvas.current!.getContext('2d')!;
          if (Math.hypot(x - lastPoint.current[0], y - lastPoint.current[1]) < 1) return;
          lastPoint.current = [x, y];
          ctx.lineTo(x, y);
          ctx.stroke();
          marks.current++;
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
        onLostPointerCapture={() => {
          drawing.current = false;
        }}
      />
      <button
        disabled={disabled || saving}
        type="button"
        onClick={() => {
          canvas.current!.getContext('2d')!.clearRect(0, 0, 800, 240);
          marks.current = 0;
          drawing.current = false;
          setError('');
        }}
      >
        ล้างลายเซ็น / ลงใหม่
      </button>
      <button disabled={disabled || saving} type="button" onClick={() => void save()}>
        บันทึกลายเซ็น
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
