import { useRef, useState } from 'react';
import { companyName } from './branding';

function loginError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
  if (code === 'auth/unauthorized-domain')
    return 'โดเมนนี้ยังไม่ได้รับอนุญาต กรุณาเพิ่มโดเมนใน Firebase Authentication แล้วลองใหม่';
  if (code === 'auth/popup-closed-by-user')
    return 'ปิดหน้าต่างเข้าสู่ระบบแล้ว กดปุ่มเพื่อลองใหม่ได้';
  if (code === 'auth/popup-blocked') return 'กรุณาอนุญาตหน้าต่างป๊อปอัปของเว็บไซต์ แล้วลองใหม่';
  return 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่';
}

export default function LoginPage({
  onLogin,
  online,
}: {
  onLogin: () => Promise<unknown>;
  online: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  async function signIn() {
    if (pending.current || !online) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await onLogin();
    } catch (error) {
      setError(loginError(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="login-screen" aria-labelledby="login-title">
      <h1 id="login-title" className="visually-hidden">
        {companyName}
      </h1>
      <p className="visually-hidden">ระบบบริหารงานดินและก่อสร้าง</p>
      <div className="login-scene">
        <img
          className="login-artwork"
          src="/login-earthwork.png"
          alt=""
          width={1536}
          height={1024}
          fetchPriority="high"
        />
        <button
          type="button"
          className="google-login-button"
          disabled={busy || !online}
          aria-busy={busy}
          onClick={() => void signIn()}
        >
          <svg className="google-login-icon" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24v7.42h11c-.47 2.4-1.88 4.44-4 5.8v4.82h6.48c3.79-3.49 6.13-8.63 6.13-14.12Z"
            />
            <path
              fill="#34A853"
              d="M24 44c5.4 0 9.92-1.79 13.23-4.84l-6.48-4.82c-1.8 1.2-4.1 1.93-6.75 1.93-5.22 0-9.65-3.52-11.23-8.27H6.09v4.97A20 20 0 0 0 24 44Z"
            />
            <path
              fill="#FBBC05"
              d="M12.77 28a12 12 0 0 1 0-8V15.03H6.09A20 20 0 0 0 4 24c0 3.23.77 6.28 2.09 8.97L12.77 28Z"
            />
            <path
              fill="#EA4335"
              d="M24 11.73c2.94 0 5.57 1.02 7.65 3.02l5.73-5.73A19.2 19.2 0 0 0 24 4 20 20 0 0 0 6.09 15.03L12.77 20c1.58-4.75 6.01-8.27 11.23-8.27Z"
            />
          </svg>
          <span>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบด้วย Google'}</span>
        </button>
        {(error || !online) && (
          <p className="login-feedback" role="alert">
            {!online ? 'กรุณาเชื่อมต่ออินเทอร์เน็ตก่อนเข้าสู่ระบบ' : error}
          </p>
        )}
      </div>
    </main>
  );
}
