import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { connectionMessage } from './async';

/** The one confirmation step used by every delete in the app. */
export default function ConfirmDialog({
  title,
  message,
  blockers = [],
  confirmLabel = 'ยืนยันลบรายการ',
  cancelLabel = 'ยกเลิกการลบ',
  disabled = false,
  alternative,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  message: string;
  blockers?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  disabled?: boolean;
  alternative?: { label: string; run: () => Promise<void> };
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    return () => previous?.focus?.();
  }, []);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(connectionMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const blocked = blockers.length > 0;
  return (
    <div
      className="modal-backdrop confirm-backdrop"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) onCancel();
      }}
    >
      <section
        className="modal confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>{title}</h2>
        <p>{blocked ? 'ลบไม่ได้ เพราะข้อมูลนี้ยังถูกใช้งานอยู่' : message}</p>
        {blocked && (
          <ul>
            {blockers.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {children}
        {busy && <p role="status">กำลังดำเนินการ…</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="confirm-actions">
          <button
            ref={cancel}
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          {blocked && alternative && (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void run(alternative.run)}
            >
              {alternative.label}
            </button>
          )}
          {!blocked && (
            <button
              type="button"
              className="danger"
              disabled={busy || disabled}
              onClick={() => void run(onConfirm)}
            >
              <Trash2 size={16} aria-hidden="true" /> {confirmLabel}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
