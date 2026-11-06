import { useEffect, useRef, useState } from 'react';
export default function PwaUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const activating = useRef(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let alive = true;
    const refresh = () => {
      void navigator.serviceWorker.getRegistration().then((registration) => {
        if (!registration || !alive) return;
        setWaiting(registration.waiting);
        registration.addEventListener('updatefound', () => {
          registration.installing?.addEventListener('statechange', () => {
            if (alive && registration.waiting) setWaiting(registration.waiting);
          });
        });
      });
    };
    refresh();
    void navigator.serviceWorker.ready.then(refresh);
    const reload = () => {
      if (activating.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', reload);
    return () => {
      alive = false;
      navigator.serviceWorker.removeEventListener('controllerchange', reload);
    };
  }, []);
  return waiting ? (
    <aside className="pwa-update">
      <p>มีแอปรุ่นใหม่ กรุณาบันทึกฟอร์มก่อนอัปเดต ข้อมูลที่บันทึกและคิวออฟไลน์จะยังอยู่</p>
      <button
        onClick={() => {
          activating.current = true;
          waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
        }}
      >
        อัปเดตแอปและโหลดใหม่
      </button>
    </aside>
  ) : null;
}
