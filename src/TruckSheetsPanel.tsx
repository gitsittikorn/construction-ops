import { workspaceMatches } from './workspaceIdentity';
import { useEffect, useRef, useState } from 'react';
import { getSessionIdentity } from './firebase';
import { loadGoogleIdentity } from './drive';
import { requestSheetsToken, verifySheetsAccount } from './googleSheetsAuth';
import {
  loadTruckSheetSelection,
  saveTruckSheet,
  spreadsheetSelection,
  spreadsheetUrl,
  readTruckSheetSource,
  sheetsReadScope,
  sheetsWriteScope,
  defaultTruckSheetId,
  prepareTruckSheet,
} from './truckSheets';
import type { TruckImportRow } from './truckImport';

export default function TruckSheetsPanel({
  owner,
  disabled,
  onRows,
  onBusy,
}: {
  owner: string;
  disabled: boolean;
  onRows: (rows: TruckImportRow[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [link, setLink] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setLink('');
    setSaved('');
    setError('');
    void loadTruckSheetSelection(owner)
      .then(({ id, sheetId }) => {
        if (generation.current === current) {
          const url = spreadsheetUrl(id || defaultTruckSheetId, sheetId);
          setSaved(url);
          setLink(url);
        }
      })
      .catch((e: Error) => {
        if (generation.current === current) setError(e.message);
      });
    return () => {
      generation.current++;
    };
  }, [owner]);
  async function importSheet(prepare = false) {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    onBusy(true);
    const current = generation.current;
    try {
      const { id, sheetId } = spreadsheetSelection(link);
      const user = getSessionIdentity();
      if (!user || !workspaceMatches(owner, user.uid))
        throw Error('กรุณาเข้าสู่ระบบ Google ก่อนนำเข้าจากชีต');
      await loadGoogleIdentity();
      if (generation.current !== current || !workspaceMatches(owner, getSessionIdentity()?.uid))
        return;
      const auth = await requestSheetsToken(
        user.email,
        prepare ? sheetsWriteScope : sheetsReadScope,
      );
      if (generation.current !== current || !workspaceMatches(owner, getSessionIdentity()?.uid))
        return;
      await verifySheetsAccount(auth.token, user.email);
      if (generation.current !== current || !workspaceMatches(owner, getSessionIdentity()?.uid))
        return;
      if (prepare) {
        await prepareTruckSheet(auth.token, id);
        if (generation.current !== current || !workspaceMatches(owner, getSessionIdentity()?.uid))
          return;
        await saveTruckSheet(owner, id);
        if (generation.current !== current) return;
        setSaved(spreadsheetUrl(id));
        setNotice('เตรียมชีต Trucks และหัวคอลัมน์ครบแล้ว กดเปิดชีตข้อมูลรถเพื่อกรอกข้อมูล');
        return;
      }
      const source = await readTruckSheetSource(auth.token, id, sheetId);
      if (generation.current !== current || !workspaceMatches(owner, getSessionIdentity()?.uid))
        return;
      await saveTruckSheet(owner, id, source.sheetId);
      if (generation.current !== current || !workspaceMatches(owner, getSessionIdentity()?.uid))
        return;
      setSaved(spreadsheetUrl(id, source.sheetId));
      setNotice(
        `อ่านจากแท็บ “${source.title}” จำนวน ${source.rows.length} รายการ กรุณาตรวจรายการก่อนยืนยัน`,
      );
      onRows(source.rows);
    } catch (e) {
      if (generation.current === current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (generation.current === current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  return (
    <div className="panel sheet-import-panel content-stack">
      <h3>นำเข้าจาก Google Sheets</h3>
      <label className="field">
        <span>ลิงก์ Google Sheets สำหรับข้อมูลรถ</span>
        <input
          type="url"
          value={link}
          disabled={busy || disabled}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/…/edit"
        />
      </label>
      <p>
        อ่านจากไฟล์ในช่องลิงก์ ระบบค้นหาแท็บที่มีหัวคอลัมน์ข้อมูลรถโดยไม่บังคับชื่อ Trucks
        หากมีหลายแท็บ ให้เปิดแท็บที่ต้องการแล้วคัดลอกลิงก์ที่มี gid มาวาง รองรับหัวคอลัมน์ 10
        ช่องรวมชื่อเล่น และไฟล์เดิม 9 ช่อง ตั้งทะเบียนและเบอร์โทรเป็นข้อความธรรมดา
        และบันทึกข้อมูลรถเมื่อยืนยันรายการเท่านั้น
      </p>
      <div className="drive-actions">
        <button
          className="secondary"
          disabled={busy || disabled || !link.trim()}
          onClick={() => void importSheet(true)}
        >
          สร้างหัวคอลัมน์ในชีต
        </button>
        <button
          className="primary"
          disabled={busy || disabled || !link.trim()}
          onClick={() => void importSheet()}
        >
          นำเข้าจาก Google Sheets
        </button>
        {saved && (
          <a href={saved} target="_blank" rel="noopener noreferrer">
            เปิดชีตข้อมูลรถ
          </a>
        )}
      </div>
      <small>
        ใช้บัญชีเดียวกับที่เข้าสู่ระบบ ปุ่มสร้างหัวคอลัมน์ขอสิทธิ์แก้ไขเพื่อเตรียมชีต Trucks
        ส่วนการนำเข้าจะอ่านข้อมูลเท่านั้น
      </small>
      {busy && <p role="status">กำลังเชื่อมต่อและอ่าน Google Sheets…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <details>
        <summary>แก้ปัญหาเชื่อมต่อ Google</summary>
        <p>
          หาก Google แจ้ง Error 400: origin_mismatch ให้ผู้ดูแลเปิด Google Cloud Console → Google
          Auth Platform → Clients → Web client ที่แอปใช้ แล้วเพิ่ม URL นี้ใน Authorized JavaScript
          origins: <code>{window.location.origin}</code>
        </p>
        <p>
          OAuth Client ID ของแอป:{' '}
          <code>{import.meta.env.VITE_GOOGLE_CLIENT_ID || 'ยังไม่ได้ตั้งค่า'}</code>
        </p>
        <p>
          บันทึกแล้วลองเชื่อมต่อใหม่ ไม่ต้องแก้หัวคอลัมน์หรือเผยแพร่ชีตเป็นสาธารณะเพื่อแก้
          origin_mismatch
        </p>
      </details>
    </div>
  );
}
