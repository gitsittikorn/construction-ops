import { useEffect, useRef, useState } from 'react';
import { beginTotpSetup, totpEnrolled, mfaErrorMessage, type TotpSetup } from './firebaseMfa';

const defaultApi = { beginTotpSetup, totpEnrolled };
export default function AccountSecurityPanel({
  uid,
  online,
  api = defaultApi,
}: {
  uid: string;
  online: boolean;
  api?: typeof defaultApi;
}) {
  const [setup, setSetup] = useState<TotpSetup | null>(null),
    [enrolled, setEnrolled] = useState(() => {
      try {
        return api.totpEnrolled(uid);
      } catch {
        return false;
      }
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const alive = useRef(false),
    epoch = useRef(0),
    lock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function begin() {
    if (!online || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const attempt = ++epoch.current;
    try {
      const next = await api.beginTotpSetup(uid);
      if (alive.current && attempt === epoch.current) setSetup(next);
    } catch (error) {
      if (alive.current && attempt === epoch.current) setError(mfaErrorMessage(error));
    } finally {
      lock.current = false;
      if (alive.current && attempt === epoch.current) setBusy(false);
    }
  }
  async function finish(code: string) {
    if (!setup || !online || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const attempt = epoch.current;
    try {
      await setup.finish(code);
      if (alive.current && attempt === epoch.current) {
        setSetup(null);
        setEnrolled(true);
        setNotice(
          'เพิ่มแอปยืนยันตัวตนแล้ว กรุณาออกจากระบบและเข้าใหม่ด้วย Google และรหัส 6 หลัก ก่อนเปิดการบังคับ MFA ของบริษัท',
        );
      }
    } catch (error) {
      if (alive.current && attempt === epoch.current) setError(mfaErrorMessage(error));
    } finally {
      lock.current = false;
      if (alive.current && attempt === epoch.current) setBusy(false);
    }
  }
  return (
    <section className="panel padded content-stack" aria-label="ความปลอดภัยบัญชี Google">
      <h2>ยืนยันตัวตน 2 ขั้นตอน</h2>
      <p>
        ใช้รหัสจากแอป Authenticator เพิ่มหลังเข้าสู่ระบบด้วย Google ผู้ดูแลต้องเปิด TOTP ใน Firebase
        Authentication with Identity Platform ก่อน การตั้งค่านี้ไม่เพิ่มสิทธิ์บริษัท
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!online && (
        <p role="status">ต้องออนไลน์เพื่อตั้งค่าหรือยืนยัน ข้อมูลรอซิงก์ยังอยู่ในเครื่อง</p>
      )}
      {enrolled ? (
        <p>บัญชีนี้ตั้งค่าแอปยืนยันตัวตนแล้ว เก็บแอปไว้สำหรับการเข้าสู่ระบบครั้งถัดไป</p>
      ) : setup ? (
        <form
          className="content-stack"
          onSubmit={(event) => {
            event.preventDefault();
            const input = event.currentTarget.elements.namedItem('code') as HTMLInputElement;
            const code = input.value;
            input.value = '';
            void finish(code);
          }}
        >
          <p>1. เปิดแอป Authenticator และเลือกเพิ่มบัญชีด้วยคีย์ตั้งค่า</p>
          <label>
            คีย์ตั้งค่า (เก็บเป็นความลับ)
            <input
              aria-label="คีย์ตั้งค่า Authenticator"
              value={setup.secretKey}
              readOnly
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p>
            คีย์นี้ใช้เฉพาะหน้านี้ ไม่บันทึกลงไฟล์สำรองหรือประวัติ ห้ามส่งให้ผู้อื่น
            หากหมดเวลาตั้งค่าให้ยกเลิกแล้วเริ่มใหม่
          </p>
          <label>
            2. กรอกรหัสจากแอป
            <input
              aria-label="รหัสยืนยันตั้งค่า 6 หลัก"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              disabled={busy || !online}
            />
          </label>
          <div className="operations-actions">
            <button className="primary" disabled={busy || !online}>
              ยืนยันและเปิดใช้แอปยืนยันตัวตน
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                epoch.current++;
                setSetup(null);
                setError('');
              }}
            >
              ยกเลิกการตั้งค่า
            </button>
          </div>
        </form>
      ) : (
        <button className="secondary" disabled={busy || !online} onClick={() => void begin()}>
          {busy ? 'กำลังยืนยัน Google…' : 'ตั้งค่าแอปยืนยันตัวตน'}
        </button>
      )}
    </section>
  );
}
