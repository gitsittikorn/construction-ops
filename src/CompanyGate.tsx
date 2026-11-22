import { useEffect, useRef, useState } from 'react';
import App from './App';
import LoginPage from './LoginPage';
import { configured, observeAuth, login, logout } from './firebase';
import {
  resolveCompany,
  rememberCompany,
  readCompanySelection,
  watchCompany,
  invalidateCompanyGrant,
  type ResolvedCompany,
} from './companyAccess';
import { cacheOwner, setWorkspaceSession } from './workspaceIdentity';
import { connectionMessage } from './async';
import { accessBackendConfigured, listAccessCompanies } from './accessBackend';
export default function CompanyGate() {
  const [user, setUser] = useState<{ uid: string; email: string } | null>(null),
    [scope, setScope] = useState<ResolvedCompany | null>(null),
    [busy, setBusy] = useState(configured),
    [error, setError] = useState(''),
    [offline, setOffline] = useState(false);
  const [companies, setCompanies] = useState<{ companyId: string; name: string }[]>([]);
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
      setCompanies([]);
      if (!uid) {
        setBusy(false);
        return;
      }
      setBusy(true);
      void readCompanySelection(uid)
        .then(async (cached) => {
          try {
            let company = cached?.companyId ?? uid;
            if (!cached && accessBackendConfigured) {
              const available = await listAccessCompanies();
              if (!active || epoch !== generation.current) return;
              setCompanies(available);
              if (available.length > 1) return;
              if (available.length === 1) company = available[0].companyId;
            }
            const next = await resolveCompany(uid, company);
            if (active && epoch === generation.current) activate(next);
          } catch (error) {
            const code =
              error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
            if (active && epoch === generation.current) {
              if (cached && (!navigator.onLine || code === 'unavailable')) activate(cached, true);
              else {
                if (cached && code === 'permission-denied')
                  void invalidateCompanyGrant(uid).catch(() => {});
                setError(connectionMessage(error));
              }
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
          setBusy(false);
          void invalidateCompanyGrant(scope.actorUid).catch(() => {});
          setError('สิทธิ์บริษัทถูกปิด กรุณาติดต่อเจ้าของ ข้อมูลที่ค้างยังเก็บไว้ในเครื่อง');
        }
      },
      (error) => {
        if (active && currentUid.current === scope.actorUid) {
          const code =
            error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
          if (code === 'permission-denied') {
            generation.current++;
            void invalidateCompanyGrant(scope.actorUid).catch(() => {});
            setWorkspaceSession(null);
            setScope(null);
            setBusy(false);
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
  useEffect(() => {
    if (!scope) return;
    let active = true;
    const reconnect = () => {
      const uid = scope.actorUid,
        epoch = ++generation.current;
      setBusy(true);
      void resolveCompany(uid, scope.companyId)
        .then((next) => {
          if (active && currentUid.current === uid && epoch === generation.current) {
            activate(next);
            setError('');
          }
        })
        .catch((error) => {
          if (!active || epoch !== generation.current) return;
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'permission-denied'
          ) {
            void invalidateCompanyGrant(uid).catch(() => {});
            setWorkspaceSession(null);
            setScope(null);
          }
          setError(connectionMessage(error));
        })
        .finally(() => {
          if (active && epoch === generation.current) setBusy(false);
        });
    };
    const expire = setInterval(() => {
      if (!navigator.onLine)
        void readCompanySelection(scope.actorUid)
          .then((cached) => {
            if (active && !cached) {
              setWorkspaceSession(null);
              setScope(null);
              setError('สิทธิ์ออฟไลน์หมดอายุ กรุณาเชื่อมต่อเพื่อตรวจสิทธิ์ใหม่ ข้อมูลค้างยังอยู่');
            }
          })
          .catch(() => {});
    }, 60000);
    window.addEventListener('online', reconnect);
    return () => {
      active = false;
      clearInterval(expire);
      window.removeEventListener('online', reconnect);
    };
  }, [scope]);
  if (!configured)
    return import.meta.env.PROD && import.meta.env.VITE_ALLOW_LOCAL_DEMO !== 'true' ? (
      <main className="panel padded" role="alert">
        <h1>ยังไม่ได้ตั้งค่าการเข้าสู่ระบบ</h1>
        <p>กรุณาให้ผู้ดูแลตั้งค่า Firebase และ Google ก่อนเปิดใช้งานระบบ ข้อมูลเดิมยังถูกเก็บไว้</p>
      </main>
    ) : (
      <App />
    );
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
            {accessBackendConfigured
              ? 'ผู้ดูแลสูงสุดต้องเพิ่มอีเมล Google ของคุณในรายการอนุญาตก่อนเข้าใช้งาน หากมีหลายบริษัทให้เลือกบริษัทด้านล่าง'
              : 'ให้เจ้าของตรวจสิทธิ์และรหัสบริษัทสำหรับบัญชี Google นี้'}
          </p>
        </>
      )}
      {busy && <p role="status">กำลังตรวจสิทธิ์บริษัท…</p>}
      {error && <p role="alert">{error}</p>}
      {companies.map((company) => (
        <button
          key={company.companyId}
          disabled={busy}
          onClick={() => {
            if (!user) return;
            const uid = user.uid,
              epoch = ++generation.current;
            setBusy(true);
            setError('');
            void resolveCompany(uid, company.companyId)
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
          เปิดบริษัท {company.name}
        </button>
      ))}
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
