import { useEffect, useRef, useState } from 'react';
import { applyLocalRestore, previewLocalRestore, type RestorePreview } from './backupRestore';
import { connectionMessage } from './async';

export default function BackupRestorePanel({ owner }: { owner: string }) {
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(false),
    locked = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function select(file?: File) {
    if (!file || locked.current) return;
    locked.current = true;
    setBusy(true);
    setPreview(null);
    setError('');
    setNotice('');
    try {
      const result = await previewLocalRestore(owner, file);
      if (active.current) setPreview(result);
    } catch (error) {
      if (active.current) setError(connectionMessage(error));
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function confirm() {
    if (!preview || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await applyLocalRestore(owner, preview, () => active.current);
      if (active.current) {
        setPreview(null);
        setNotice(
          'เพิ่มข้อมูลที่ขาดแล้ว เก็บฉบับปัจจุบันและไฟล์เดิมไว้ ข้อมูลนำเข้ายังต้องซิงก์และตรวจ Cloud อีกครั้ง',
        );
      }
    } catch (error) {
      if (active.current) setError(connectionMessage(error));
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <section className="panel padded" aria-label="กู้คืนไฟล์สำรอง JSON">
      <h2>กู้คืนไฟล์สำรอง JSON</h2>
      <p>
        ใช้ไฟล์สำรองของบัญชีเดิม ขนาดไม่เกิน 150 MB ระบบแสดงตัวอย่างก่อนเพิ่มเฉพาะรายการที่ขาด
        รายการ ID เดิมและรายการที่ลบไว้จะไม่ถูกเขียนทับหรือคืนกลับ
      </p>
      <p>
        เก็บการตั้งค่า Drive ร่างงาน และประวัติปัจจุบันไว้ ไม่ใช้สิทธิ์หรือโฟลเดอร์จากไฟล์สำรอง
        การยืนยัน Cloud และไฟล์ที่นำเข้าต้องตรวจใหม่เมื่อเชื่อมต่อ กรุณาเก็บไฟล์สำรองต้นฉบับไว้ด้วย
      </p>
      <label className="field">
        เลือกไฟล์สำรอง JSON
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            void select(file);
          }}
        />
      </label>
      {busy && <p role="status">กำลังตรวจหรือบันทึกข้อมูลสำรอง…</p>}
      {preview && (
        <section aria-label="ตัวอย่างกู้คืนข้อมูลสำรอง">
          <h3>ตัวอย่างก่อนกู้คืน</h3>
          <p>
            วันทำงานที่ต้องเปิดตรวจใหม่ {preview.daysToRecheck} วัน · เก็บ Snapshot
            ปิดวันและข้อมูลก่อนเปิดตรวจไว้ในประวัติ แต่การยืนยันปัจจุบันต้องตรวจหลักฐานใหม่
          </p>
          <p>สำรองเมื่อ {preview.exportedAt}</p>
          <p>
            เพิ่ม {preview.added} รายการ · ข้อมูลตรงกัน {preview.identical} รายการ · ID ขัดแย้ง
            เก็บฉบับปัจจุบัน {preview.conflicts.length} รายการ
          </p>
          <p>
            เพิ่มไฟล์ {preview.filesAdded} ไฟล์ · เก็บไฟล์ปัจจุบัน {preview.filesKept} ไฟล์ ·
            ข้ามรายการที่ลบในสำรอง {preview.deletedSkipped} รายการ
          </p>
          {!!preview.conflicts.length && (
            <details>
              <summary>ดู ID ที่เก็บฉบับปัจจุบัน</summary>
              {preview.conflicts.map((key) => (
                <p key={key}>{key}</p>
              ))}
            </details>
          )}
          <p>
            หากต้องการเปลี่ยนฉบับที่ขัดแย้ง กรุณาตรวจและแก้จากหน้ารายการหลังสำรองข้อมูลปัจจุบัน
            การกู้คืนนี้ไม่เปลี่ยนรายการเหล่านั้น
          </p>
          <button disabled={busy} onClick={() => void confirm()}>
            ยืนยันเพิ่มเฉพาะข้อมูลที่ขาด
          </button>
          <button
            disabled={busy}
            onClick={() => {
              setPreview(null);
              setError('');
            }}
          >
            ยกเลิกกู้คืน
          </button>
        </section>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
