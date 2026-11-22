import { useEffect, useRef, useState } from 'react';
import RecordDialog from './RecordDialog';
import { mfaErrorMessage, type TotpChallenge } from './firebaseMfa';

export default function TotpChallengeDialog({
  challenge,
  online,
  onComplete,
  onDismiss,
}: {
  challenge: TotpChallenge;
  online: boolean;
  onComplete: () => void;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef(false),
    alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <RecordDialog
      onDismiss={() => {
        if (!pending.current) onDismiss();
      }}
    >
      <form
        className="content-stack mfa-challenge"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending.current || !online) return;
          const fields = event.currentTarget.elements,
            input = fields.namedItem('code') as HTMLInputElement,
            factor = fields.namedItem('factor') as HTMLSelectElement,
            value = input.value;
          input.value = '';
          pending.current = true;
          setBusy(true);
          setError('');
          void challenge
            .verify(factor.value, value)
            .then(() => {
              if (alive.current) onComplete();
            })
            .catch((error) => {
              if (alive.current) setError(mfaErrorMessage(error));
            })
            .finally(() => {
              pending.current = false;
              if (alive.current) setBusy(false);
            });
        }}
      >
        <h2 id="modal-title">ยืนยันการเข้าสู่ระบบ</h2>
        <p>
          เปิดแอป Authenticator แล้วกรอกรหัส 6 หลัก Google ยืนยันแล้วแต่ยังไม่ครบขั้นตอนเข้าสู่ระบบ
        </p>
        <label className="field">
          แอปยืนยันตัวตน
          <select name="factor" aria-label="แอปยืนยันตัวตน" disabled={busy}>
            {challenge.factors.map((factor) => (
              <option key={factor.uid} value={factor.uid}>
                {factor.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          รหัส 6 หลัก
          <input
            name="code"
            aria-label="รหัสยืนยันเข้าสู่ระบบ 6 หลัก"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            autoFocus
            required
            disabled={busy || !online}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        {!online && <p role="alert">ต้องออนไลน์เพื่อยืนยันการเข้าสู่ระบบ</p>}
        <div className="operations-actions">
          <button className="primary" disabled={busy || !online}>
            {busy ? 'กำลังยืนยัน…' : 'ยืนยันเข้าสู่ระบบ'}
          </button>
          <button type="button" disabled={busy} onClick={onDismiss}>
            ยกเลิกการยืนยัน
          </button>
        </div>
      </form>
    </RecordDialog>
  );
}
