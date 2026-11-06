import { useEffect, useRef, useState } from 'react';
export default function PrivateFileViewer({
  name,
  load,
  onError,
}: {
  name: string;
  load: () => Promise<Blob>;
  onError: (error: unknown) => void;
}) {
  const [url, setUrl] = useState(''),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    active = useRef(true),
    currentUrl = useRef('');
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    };
  }, []);
  async function view() {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const blob = await load();
      if (!active.current) return;
      if (!blob.size) throw Error('ไฟล์ภาพว่างเปล่า');
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = URL.createObjectURL(blob);
      setUrl(currentUrl.current);
    } catch (e) {
      if (active.current) {
        setError(e instanceof Error ? e.message : 'โหลดภาพไม่สำเร็จ');
        onError(e);
      }
    } finally {
      if (active.current) setLoading(false);
    }
  }
  return (
    <div>
      <button disabled={loading} onClick={() => void view()}>
        {error ? 'ลองโหลดภาพอีกครั้ง' : url ? 'โหลดภาพใหม่' : 'ดูภาพต้นฉบับ'}
      </button>
      {loading && <p aria-live="polite">กำลังโหลดภาพ {name}…</p>}
      {error && <p role="alert">{error}</p>}
      {url && (
        <img
          className="document-preview"
          src={url}
          alt={`ต้นฉบับ ${name}`}
          onError={() => {
            setError('แสดงภาพไม่ได้ กรุณาลองใหม่หรือเปิดต้นฉบับใน Drive');
            setUrl('');
          }}
        />
      )}
    </div>
  );
}
