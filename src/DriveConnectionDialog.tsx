import { useEffect, useRef } from 'react';

export default function DriveConnectionDialog({
  expired,
  ready,
  busy,
  error,
  onConnect,
  onDismiss,
}: {
  expired: boolean;
  ready: boolean;
  busy: boolean;
  error: string;
  onConnect: () => void;
  onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal padded drive-connection-dialog"
      aria-labelledby="drive-connection-title"
      aria-describedby="drive-connection-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
    >
      <h2 id="drive-connection-title">
        {expired
          ? 'สิทธิ์ Google Drive หมดอายุหรือใช้ไม่ได้แล้ว'
          : 'เชื่อมต่อ Google Drive ก่อนใช้งาน'}
      </h2>
      <p id="drive-connection-description">
        กรุณากดเชื่อมต่อเพื่อรับสิทธิ์ก่อนอัปโหลด ดาวน์โหลด หรือจัดการโฟลเดอร์ใน Drive
        ไฟล์ที่รออัปโหลดยังอยู่ในเครื่อง และยังไม่ถือว่าบันทึกบนคลาวด์แล้ว
      </p>
      {error && <p role="alert">{error}</p>}
      {!ready && <p>ต้องออนไลน์และโหลดการเชื่อมต่อ Google ให้พร้อมก่อน</p>}
      <div className="drive-actions">
        <button className="primary" autoFocus disabled={!ready || busy} onClick={onConnect}>
          {busy ? 'กำลังเชื่อมต่อ…' : 'ต่ออายุ / เชื่อมต่อ Drive'}
        </button>
        <button className="secondary" disabled={busy} onClick={onDismiss}>
          ใช้งานส่วนอื่นก่อน
        </button>
      </div>
    </dialog>
  );
}
