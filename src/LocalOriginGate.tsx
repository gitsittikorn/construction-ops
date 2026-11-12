import { useEffect, useState, type ReactNode } from 'react';
import { configured, getSessionIdentity, login, observeAuth } from './firebase';
import { exportLocalBackup } from './backup';
import { canonicalLocalUrl, legacyOriginHasData, legacyRecoveryOwners } from './localOrigin';
import { actorUid } from './workspaceIdentity';
const replaceLocation = (target: string) => location.replace(target);

export default function LocalOriginGate({
  children,
  url = location.href,
  navigate = replaceLocation,
}: {
  children: ReactNode;
  url?: string;
  navigate?: (target: string) => void;
}) {
  const target = canonicalLocalUrl(url);
  const [state, setState] = useState<'checking' | 'recovery' | 'blocked'>('checking');
  const [error, setError] = useState('');
  const [owners, setOwners] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!target) return;
    let active = true;
    void legacyOriginHasData()
      .then((hasData) => {
        if (!active) return;
        if (hasData) setState('recovery');
        else navigate(target);
      })
      .catch(() => {
        if (active) {
          setState('blocked');
          setError('ตรวจข้อมูลเดิมไม่สำเร็จ จึงยังไม่เปลี่ยนหน้า ข้อมูลเว็บไซต์ไม่ได้ถูกล้าง');
        }
      });
    return () => {
      active = false;
    };
  }, [target, navigate]);
  useEffect(() => {
    if (!target || state !== 'recovery') return;
    let generation = 0,
      active = true;
    const refresh = (uid: string | null) => {
      const current = ++generation;
      setOwners([]);
      void legacyRecoveryOwners(uid)
        .then((values) => {
          if (active && current === generation) setOwners(values);
        })
        .catch(() => {
          if (active) setError('อ่านรายการสำรองไม่สำเร็จ กรุณาลองใหม่');
        });
    };
    refresh(getSessionIdentity()?.uid ?? null);
    const unsubscribe = observeAuth((user) => refresh(user?.uid ?? null));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [target, state]);
  if (!target) return children;
  async function download(owner: string) {
    setBusy(true);
    setError('');
    const uid = getSessionIdentity()?.uid;
    try {
      if (owner !== 'local' && (!uid || actorUid(owner) !== uid))
        throw Error('กรุณาเข้าสู่บัญชีเดิมก่อนสำรอง');
      const blob = await exportLocalBackup(owner);
      if (owner !== 'local' && getSessionIdentity()?.uid !== uid)
        throw Error('บัญชีเปลี่ยนแล้ว กรุณาลองใหม่');
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'construction-ops-localhost-backup.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'สำรองไม่สำเร็จ ข้อมูลเดิมยังอยู่');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="panel padded content-stack" aria-label="ข้อมูลจากที่อยู่เว็บเดิม">
      <h1>ใช้ 127.0.0.1 เป็นที่อยู่หลัก</h1>
      {state === 'checking' ? (
        <p role="status">กำลังตรวจข้อมูลเดิมก่อนเปลี่ยนที่อยู่…</p>
      ) : state === 'blocked' ? (
        <button className="secondary" onClick={() => location.reload()}>
          ตรวจข้อมูลเดิมอีกครั้ง
        </button>
      ) : (
        <>
          <p>
            พบข้อมูลเดิมใน localhost ซึ่งแยกจาก 127.0.0.1 ข้อมูลเดิมยังอยู่ครบในที่เก็บเดิม
            หน้านี้ใช้สำรองข้อมูลก่อนย้ายไปที่อยู่หลัก
          </p>
          <p>
            ดาวน์โหลดสำรอง แล้วเข้าสู่บัญชีและบริษัทเดิมที่ 127.0.0.1
            เปิดซิงก์และสำรองข้อมูลเพื่อตรวจรายการก่อนนำเข้า
            ข้อมูลที่ยังรอซิงก์จะไม่ถูกนับว่ายืนยันจาก Cloud
          </p>
          {configured && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void login().catch(() => setError('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'))
              }
            >
              เข้าสู่บัญชีเดิมเพื่อสำรองข้อมูล
            </button>
          )}
          {owners.map((owner, index) => (
            <button
              className="secondary"
              disabled={busy}
              key={owner}
              onClick={() => void download(owner)}
            >
              {owner === 'local'
                ? 'ดาวน์โหลดข้อมูลก่อนล็อกอิน'
                : `ดาวน์โหลดสำรองพื้นที่ทำงาน ${index + 1}`}
            </button>
          ))}
          <a className="button primary" href={target}>
            เปิดที่อยู่หลัก 127.0.0.1
          </a>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
