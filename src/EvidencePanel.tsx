import { useEffect, useRef, useState } from 'react';
import type { Data } from './models';
import type { DailySession, DailyRow, EvidenceCategory } from './workspaceModels';
import { evidenceFor, verificationState, dailyRowVolume } from './daily';
import { saveEvidence, evidenceStatus, storageWarning } from './evidence';
import { listUploads, type UploadRecord } from './uploads';
import SignaturePad from './SignaturePad';
import { connectionMessage } from './async';
import { evidenceLabels } from './workspaceLabels';
import { readCachedOriginal } from './documentCache';

function Preview({ file, name }: { file: Blob; name: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return <img className="evidence-preview" src={url} alt={name} />;
}
export default function EvidencePanel({
  owner,
  data,
  session,
  row,
}: {
  owner: string;
  data: Data;
  session: DailySession;
  row: DailyRow;
}) {
  const lock = useRef(false);
  const [selected, setSelected] = useState<File[]>([]),
    [category, setCategory] = useState<EvidenceCategory>('driver-photo'),
    [uploads, setUploads] = useState<UploadRecord[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [warning, setWarning] = useState('');
  const [originals, setOriginals] = useState<{ owner: string; files: Record<string, Blob> }>({
    owner,
    files: {},
  });
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void listUploads(owner)
        .then(async (files) => {
          const cached = await Promise.all(
            files.map(async (file) => [file.id, await readCachedOriginal(owner, file)] as const),
          );
          if (alive) {
            setUploads(files);
            setOriginals({
              owner,
              files: Object.fromEntries(
                cached.filter((entry): entry is readonly [string, Blob] => entry[1] !== null),
              ),
            });
          }
        })
        .catch((error) => {
          if (alive) setError(connectionMessage(error));
        });
    };
    refresh();
    window.addEventListener('construction-uploads-changed', refresh);
    const timer = setInterval(refresh, 3000);
    void storageWarning()
      .then(setWarning)
      .catch(() => {});
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('construction-uploads-changed', refresh);
    };
  }, [owner, data]);
  const current = evidenceFor(data, session, row).at(-1);
  const files =
    current?.recordType === 'evidence'
      ? current.body.files
          .map((f) => uploads.find((u) => u.id === f.uploadId))
          .filter((u): u is UploadRecord => !!u)
      : [];
  async function save(files: File[], role = category) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await saveEvidence(owner, session.id, row.id, role, files);
      setSelected([]);
      setNotice('เก็บต้นฉบับไว้ในเครื่องแล้ว ใช้ส่วน Google Drive ด้านล่างเพื่ออัปโหลด');
    } catch (e) {
      setError(connectionMessage(e));
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="panel padded content-stack" aria-label="หลักฐานประจำรถ">
      <h2>หลักฐานคนขับและใบเที่ยว</h2>
      <p>
        สถานะหลักฐาน:{' '}
        {evidenceLabels[evidenceStatus(files, verificationState(session, row) === 'VERIFIED')]}
      </p>
      <p>หลักฐานผูกกับวันที่ รถ คนขับ และยอดปัจจุบัน การแก้ยอดต้องเก็บหลักฐานชุดใหม่</p>
      <p>
        ข้อมูลก่อนลงลายเซ็น: {data.masters.find((m) => m.id === row.driverId)?.name ?? row.driverId}{' '}
        ·{data.masters.find((m) => m.id === row.truckId)?.name} · {session.body.date} ·
        {row.tripCount} เที่ยว · {dailyRowVolume(row)} m³
      </p>
      <ul aria-label="รายการตรวจหลักฐาน">
        {(['driver-photo', 'trip-slip', 'signature'] as const).map((role) => {
          const selected = files.filter((f) => f.category === role);
          return (
            <li key={role}>
              {role === 'driver-photo' ? 'รูปคนขับ' : role === 'trip-slip' ? 'ใบเที่ยว' : 'ลายเซ็น'}
              :{' '}
              {!selected.length
                ? 'ยังไม่มี'
                : selected.every((f) => f.status === 'synced' && f.driveId)
                  ? 'ตรวจการอัปโหลด Cloud แล้ว'
                  : 'บันทึกในเครื่อง รออัปโหลด'}
            </li>
          );
        })}
      </ul>
      {warning && <p role="alert">{warning}</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <label>
        ประเภทภาพ
        <select
          aria-label="ประเภทภาพหลักฐาน"
          disabled={busy || session.body.state === 'closed'}
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as EvidenceCategory);
            setSelected([]);
          }}
        >
          <option value="driver-photo">รูปคนขับ</option>
          <option value="trip-slip">ภาพใบเที่ยว</option>
        </select>
      </label>
      <label>
        ถ่ายภาพ / เลือกภาพ
        <input
          key={category}
          aria-label="ภาพหลักฐาน"
          type="file"
          accept="image/*"
          capture={category === 'driver-photo' ? 'user' : 'environment'}
          multiple={category === 'trip-slip'}
          disabled={busy || session.body.state === 'closed'}
          onChange={(e) => setSelected(Array.from(e.target.files ?? []))}
        />
      </label>
      <label>
        เลือกจากแกลเลอรี
        <input
          aria-label="เลือกหลักฐานจากแกลเลอรี"
          type="file"
          accept="image/*"
          multiple={category === 'trip-slip'}
          disabled={busy || session.body.state === 'closed'}
          onChange={(e) => setSelected(Array.from(e.target.files ?? []))}
        />
      </label>
      {selected.map((file, i) => (
        <div key={`${file.name}-${i}`}>
          <Preview file={file} name={file.name} />
          <button onClick={() => setSelected((files) => files.filter((_, index) => index !== i))}>
            เอาภาพ {file.name} ออกก่อนบันทึก
          </button>
        </div>
      ))}
      <button
        disabled={busy || !selected.length || session.body.state === 'closed'}
        onClick={() => void save(selected).catch(() => {})}
      >
        บันทึกภาพต้นฉบับ
      </button>
      <SignaturePad
        disabled={busy || session.body.state === 'closed'}
        onSave={(file) => save([file], 'signature')}
      />
      {current?.recordType === 'evidence' && current.body.signature && (
        <p>
          ผู้ลงลายเซ็น: {current.body.signature.signerName} · {current.body.signature.signedAt}
        </p>
      )}
      {files.map((f) => (
        <div key={f.id}>
          {(f.blob || (originals.owner === owner && originals.files[f.id])) && (
            <Preview file={f.blob ?? originals.files[f.id]} name={`ภาพที่บันทึก ${f.name}`} />
          )}
          <p>
            {f.name} ·{' '}
            {f.status === 'synced'
              ? 'อัปโหลดแล้ว — ยังไม่ใช่การตรวจยอด'
              : f.status === 'error'
                ? f.error
                : 'อยู่ในคิวอัปโหลด'}{' '}
            {f.status === 'synced' && (
              <a
                href={`https://drive.google.com/file/d/${encodeURIComponent(f.driveId)}/view`}
                target="_blank"
                rel="noopener noreferrer"
              >
                เปิดต้นฉบับส่วนตัว
              </a>
            )}
          </p>
        </div>
      ))}
    </section>
  );
}
