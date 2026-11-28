import { useEffect, useRef, useState } from 'react';
import { connectionMessage } from './async';
import { loadGoogleIdentity } from './drive';
import { getSessionIdentity } from './firebase';
import { requestSheetsToken, verifySheetsAccount } from './googleSheetsAuth';
import {
  applyNameImport,
  nameSheets,
  planNameImport,
  readNameSheet,
  type NameKind,
  type NameRow,
} from './nameImport';
import {
  defaultTruckSheetId,
  loadTruckSheetSelection,
  sheetsReadScope,
  spreadsheetSelection,
  spreadsheetUrl,
} from './truckSheets';
import { workspaceMatches } from './workspaceIdentity';
import type { Data, Master } from './models';

const actions = { create: 'เพิ่มใหม่', rename: 'เปลี่ยนชื่อ', skip: 'ข้าม', error: 'ผิดพลาด' };

export default function NameImportPanel({
  kind,
  data,
  actor,
  onChange,
}: {
  kind: NameKind;
  data: Data;
  actor: string;
  onChange: (change: (data: Data) => Data) => Promise<void>;
}) {
  const config = nameSheets[kind];
  const [link, setLink] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [rows, setRows] = useState<NameRow[] | null>(null),
    [snapshot, setSnapshot] = useState<Master[]>([]);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    // The same file as the truck sheet; the tab is found by its name.
    void loadTruckSheetSelection(actor)
      .then(({ id }) => {
        if (alive.current) setLink(spreadsheetUrl(id || defaultTruckSheetId));
      })
      .catch(() => {
        if (alive.current) setLink(spreadsheetUrl(defaultTruckSheetId));
      });
    return () => {
      alive.current = false;
    };
  }, [actor]);
  const plan = rows ? planNameImport(kind, rows, data.masters) : [];
  const count = (action: keyof typeof actions) =>
    plan.filter((row) => row.action === action).length;

  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      if (alive.current) setError(connectionMessage(e));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const read = () =>
    run(async () => {
      setRows(null);
      const { id, sheetId } = spreadsheetSelection(link);
      const sameAccount = () => alive.current && workspaceMatches(actor, getSessionIdentity()?.uid);
      const user = getSessionIdentity();
      if (!user || !sameAccount()) throw Error('กรุณาเข้าสู่ระบบ Google ก่อนนำเข้าจากชีต');
      await loadGoogleIdentity();
      const auth = await requestSheetsToken(user.email, sheetsReadScope);
      await verifySheetsAccount(auth.token, user.email);
      const source = await readNameSheet(auth.token, id, kind, sheetId);
      if (!sameAccount()) return;
      setRows(source.rows);
      setSnapshot(structuredClone(data.masters));
      setNotice(`อ่านจากแท็บ “${source.title}” ${source.rows.length} รายการ ตรวจก่อนยืนยัน`);
    });
  const confirm = () =>
    run(async () => {
      const summary = `นำเข้า${config.title}สำเร็จ เพิ่ม ${count('create')} เปลี่ยนชื่อ ${count('rename')} ข้าม ${count('skip')}`;
      await onChange((old) => applyNameImport(old, kind, rows!, actor, snapshot));
      setRows(null);
      setNotice(summary);
    });

  return (
    <details className="panel padded">
      <summary>นำเข้า{config.title}จาก Google Sheets</summary>
      <div className="content-stack">
        <label className="field">
          <span>ลิงก์ Google Sheets ของ{config.title}</span>
          <input
            type="url"
            value={link}
            disabled={busy}
            onChange={(event) => setLink(event.target.value)}
          />
          <small>ระบบอ่านแท็บชื่อ “{config.tab}” อย่างเดียว ไม่แก้ไขชีต</small>
        </label>
        <div className="drive-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy || !link.trim()}
            onClick={() => void read()}
          >
            อ่าน{config.title}จากชีต
          </button>
        </div>
        {busy && <p role="status">กำลังประมวลผล…</p>}
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {rows && (
          <>
            <p>
              เพิ่ม {count('create')} · เปลี่ยนชื่อ {count('rename')} · ข้าม {count('skip')} ·
              ผิดพลาด {count('error')} · คอลัมน์ “ลำดับ” ไม่ถูกเก็บ
            </p>
            <div className="table-wrap preview-table">
              <table>
                <thead>
                  <tr>
                    <th>แถว</th>
                    <th>ชื่อ</th>
                    <th>การดำเนินการ</th>
                    <th>ข้อสังเกต</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((row) => (
                    <tr key={row.row}>
                      <td>{row.row}</td>
                      <td>{row.name}</td>
                      <td>{actions[row.action]}</td>
                      <td>{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="drive-actions">
              <button
                type="button"
                className="primary"
                disabled={busy || count('error') > 0 || count('create') + count('rename') === 0}
                onClick={() => void confirm()}
              >
                ยืนยันนำเข้า{config.title}
              </button>
              <button type="button" className="secondary" onClick={() => setRows(null)}>
                ยกเลิกนำเข้า
              </button>
            </div>
          </>
        )}
      </div>
    </details>
  );
}
