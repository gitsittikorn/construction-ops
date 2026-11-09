import { useEffect, useRef, useState } from 'react';
import App from './App';
import LoginPage from './LoginPage';
import { configured, observeAuth, login, logout } from './firebase';
import {
  resolveCompany,
  rememberCompany,
  readCompanySelection,
  watchCompany,
  type ResolvedCompany,
} from './companyAccess';
import { cacheOwner, setWorkspaceSession } from './workspaceIdentity';
import { connectionMessage } from './async';
export default function CompanyGate() {
  const [user, setUser] = useState<{ uid: string; email: string } | null>(null),
    [scope, setScope] = useState<ResolvedCompany | null>(null),
    [busy, setBusy] = useState(configured),
    [error, setError] = useState(''),
    [offline, setOffline] = useState(false);
  const generation = useRef(0),
    currentUid = useRef(''),
    alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function activate(next: ResolvedCompany, cached = false) {
    if (!alive.current) return;
    setWorkspaceSession(next);
    setScope(next);
    setOffline(cached);
    if (!cached)
      void rememberCompany(next).catch((error) => {
        if (alive.current) setError(connectionMessage(error));
      });
  }
  useEffect(() => {
    if (!configured) return;
    let active = true;
    const unsubscribe = observeAuth((identity) => {
      if (!active) return;
      const uid = identity?.uid ?? '';
      if (uid === currentUid.current && uid) return;
      currentUid.current = uid;
      const epoch = ++generation.current;
      setWorkspaceSession(null);
      setScope(null);
      setUser(identity ? { uid, email: identity.email ?? '' } : null);
      setError('');
      if (!uid) {
        setBusy(false);
        return;
      }
      setBusy(true);
      void readCompanySelection(uid)
        .then(async (cached) => {
          try {
            const next = await resolveCompany(uid, cached?.companyId ?? uid);
            if (active && epoch === generation.current) activate(next);
          } catch (error) {
            const code =
              error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
            if (active && epoch === generation.current) {
              if (cached && (!navigator.onLine || code === 'unavailable')) activate(cached, true);
              else setError(connectionMessage(error));
            }
          }
        })
        .catch((error) => {
          if (active && epoch === generation.current) setError(connectionMessage(error));
        })
        .finally(() => {
          if (active && epoch === generation.current) setBusy(false);
        });
    });
    return () => {
      active = false;
      generation.current++;
      setWorkspaceSession(null);
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!scope) return;
    let active = true;
    const unsubscribe = watchCompany(
      scope,
      (next) => {
        if (!active || currentUid.current !== scope.actorUid) return;
        if (next) activate(next);
        else {
          generation.current++;
          setWorkspaceSession(null);
          setScope(null);
          setError('สิทธิ์บริษัทถูกปิด กรุณาติดต่อเจ้าของ ข้อมูลที่ค้างยังเก็บไว้ในเครื่อง');
        }
      },
      (error) => {
        if (active && currentUid.current === scope.actorUid) {
          const code =
            error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
          if (code === 'permission-denied') {
            setWorkspaceSession(null);
            setScope(null);
          }
          setError(connectionMessage(error));
        }
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [scope]);
  if (!configured) return <App />;
  if (!user && !busy) return <LoginPage onLogin={login} online={navigator.onLine} />;
  if (scope)
    return (
      <>
        {offline && (
          <p role="status">ออฟไลน์ ใช้สิทธิ์ที่ตรวจล่าสุด ต้องตรวจซ้ำเมื่อกลับมาออนไลน์</p>
        )}
        {error && <p role="alert">{error}</p>}
        <App
          key={cacheOwner(scope)}
          workspace={scope}
          onSwitchCompany={() => {
            generation.current++;
            setWorkspaceSession(null);
            setScope(null);
            setError('');
          }}
        />
      </>
    );
  return (
    <main className="panel padded" aria-label="เลือกบริษัท">
      <h1>เลือกบริษัทที่ทำงานร่วมกัน</h1>
      {user && (
        <>
          <p>บัญชี Google: {user.email}</p>
          <p>
            รหัสผู้ใช้ของคุณ: <strong>{user.uid}</strong>
          </p>
          <p>
            ส่งรหัสผู้ใช้นี้ให้เจ้าของเพิ่มเป็นสมาชิก
            แล้วนำรหัสบริษัทจากเจ้าของมาเปิดข้อมูลชุดเดียวกัน
          </p>
        </>
      )}
      {busy && <p role="status">กำลังตรวจสิทธิ์บริษัท…</p>}
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!user || busy) return;
          const company = String(new FormData(event.currentTarget).get('company') ?? '').trim(),
            uid = user.uid,
            epoch = ++generation.current;
          setBusy(true);
          setError('');
          void resolveCompany(uid, company)
            .then((next) => {
              if (epoch === generation.current && currentUid.current === uid) activate(next);
            })
            .catch((error) => {
              if (epoch === generation.current) setError(connectionMessage(error));
            })
            .finally(() => {
              if (epoch === generation.current) setBusy(false);
            });
        }}
      >
        <label className="field">
          รหัสบริษัท
          <input name="company" aria-label="รหัสบริษัท" required maxLength={128} disabled={busy} />
        </label>
        <button disabled={busy || !user}>เปิดบริษัท</button>
      </form>
      {user && (
        <button
          disabled={busy}
          onClick={() => void logout().catch((error) => setError(connectionMessage(error)))}
        >
          ออกจากบัญชี Google
        </button>
      )}
    </main>
  );
}
