import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Upload, RefreshCw, Link, Download, Unplug } from 'lucide-react';
import type { Project, Trip } from './models';
import {
  driveConfigured,
  loadGoogleIdentity,
  requestDriveToken,
  verifyDriveAccount,
  generateDriveIds,
  ensureDriveFolder,
  uploadOriginal,
  downloadOriginal,
  DriveError,
} from './drive';
import {
  getFolders,
  putFolders,
  listUploads,
  putUpload,
  queueFiles,
  processUpload,
  withUploadLock,
  type UploadRecord,
} from './uploads';
import { getSessionIdentity, resolveDriveFolders, saveDocumentMetadata } from './firebase';
import ProjectPicker from './ProjectPicker';
import { getDriveSession, saveDriveSession, clearDriveSession } from './driveSession';
const statusLabels = {
  pending: 'รออัปโหลด',
  preparing: 'กำลังเตรียมโฟลเดอร์และตรวจสิทธิ์',
  uploading: 'กำลังอัปโหลด / ตรวจสอบไฟล์',
  'metadata-pending': 'รอบันทึกข้อมูลคลาวด์',
  synced: 'อัปโหลดและบันทึกข้อมูลแล้ว',
  error: 'ไม่สำเร็จ · ลองใหม่ได้',
};
export default function DrivePanel({
  owner,
  projects,
  trips,
  online,
}: {
  owner: string;
  projects: Project[];
  trips: Trip[];
  online: boolean;
}) {
  const [items, setItems] = useState<UploadRecord[]>([]),
    [identityReady, setIdentityReady] = useState(false),
    [connected, setConnected] = useState(() => Boolean(getDriveSession(owner))),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [progress, setProgress] = useState<Record<string, number>>({}),
    [project, setProject] = useState(() => {
      const active = projects.filter((p) => p.status === 'active');
      return active.length === 1 ? active[0].id : '';
    });
  const [selectedFiles, setSelectedFiles] = useState<{ name: string; size: number }[]>([]);
  const [folderLinks, setFolderLinks] = useState<
    Record<string, { rootId: string; projectId: string; documentsId: string }>
  >({});
  const credentials = useRef(getDriveSession(owner)),
    lock = useRef(false),
    alive = useRef(true);
  const session = () => {
    const user = getSessionIdentity();
    if (!user || user.uid !== owner) throw Error('กรุณาเข้าสู่ระบบ Firebase ก่อนเชื่อม Drive');
    return user;
  };
  const token = () => {
    session();
    const value = credentials.current;
    if (!value || value.expiresAt <= Date.now()) {
      credentials.current = null;
      clearDriveSession(owner);
      setConnected(false);
      throw Error('กรุณากดเชื่อมต่อ Google Drive อีกครั้ง');
    }
    return value.token;
  };
  async function refresh() {
    const result = await listUploads(owner);
    if (alive.current) setItems(result);
  }
  useEffect(() => {
    alive.current = true;
    void refresh().catch(() => setError('อ่านคิวอัปโหลดไม่สำเร็จ'));
    if (driveConfigured)
      void loadGoogleIdentity()
        .then(() => {
          if (alive.current) setIdentityReady(true);
        })
        .catch((e) => {
          if (alive.current) setError(e.message);
        });
    return () => {
      alive.current = false;
    };
  }, [owner]);
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => {
      if (credentials.current && credentials.current.expiresAt <= Date.now()) {
        credentials.current = null;
        clearDriveSession(owner);
        setConnected(false);
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [connected]);
  async function connect() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const user = session();
      const auth = await requestDriveToken(user.email);
      await verifyDriveAccount(auth.token, user.email);
      if (!alive.current) return;
      credentials.current = auth;
      saveDriveSession(owner, auth);
      setConnected(true);
      setNotice('เชื่อม Google Drive แล้ว ใช้บัญชีเดียวกับ Firebase');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function ensureProjectFolders(projectId: string) {
    const selectedProject = projects.find((project) => project.id === projectId);
    if (!selectedProject?.name.trim())
      throw Error('ไม่พบชื่อโครงการในเครื่อง กรุณาตรวจข้อมูลโครงการก่อนสร้างโฟลเดอร์');
    const access = token();
    let folders = await getFolders(owner);
    if (!folders) {
      const ids = await generateDriveIds(access, 2);
      const shared = await resolveDriveFolders(owner, 'root', {
        rootId: ids[0],
        projectsId: ids[1],
      });
      folders = { rootId: shared.rootId, projectsId: shared.projectsId, projects: {} };
      await putFolders(owner, folders);
    }
    await ensureDriveFolder(access, folders.rootId, 'Khok Kloi Construction Management');
    await ensureDriveFolder(access, folders.projectsId, 'Projects', folders.rootId);
    let projectFolders = folders.projects[projectId];
    if (!projectFolders) {
      const ids = await generateDriveIds(access, 2);
      const shared = await resolveDriveFolders(owner, projectId, {
        projectId: ids[0],
        documentsId: ids[1],
      });
      projectFolders = { projectId: shared.projectId, documentsId: shared.documentsId };
      folders = {
        ...folders,
        projects: { ...folders.projects, [projectId]: projectFolders },
      };
      await putFolders(owner, folders);
    }
    await ensureDriveFolder(
      access,
      projectFolders.projectId,
      selectedProject.name.trim(),
      folders.projectsId,
      true,
    );
    await ensureDriveFolder(
      access,
      projectFolders.documentsId,
      'Documents',
      projectFolders.projectId,
    );
    if (alive.current)
      setFolderLinks((old) => ({
        ...old,
        [projectId]: { rootId: folders.rootId, ...projectFolders },
      }));
    return projectFolders;
  }
  async function prepare(record: UploadRecord): Promise<UploadRecord> {
    const projectFolders = await ensureProjectFolders(record.projectId);
    const driveId = record.driveId || (await generateDriveIds(token(), 1))[0];
    return { ...record, driveId, folderId: projectFolders.documentsId };
  }
  async function createProjectFolders() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!projects.some((item) => item.id === project && item.status === 'active'))
        throw Error('กรุณาเลือกโครงการที่กำลังดำเนินการ');
      await withUploadLock(owner, async () => {
        await ensureProjectFolders(project);
      });
      setNotice(
        selectedFiles.length
          ? 'เตรียมโฟลเดอร์แล้ว แต่ภาพที่เลือกยังไม่ได้อัปโหลด กรุณากด อัปโหลดไฟล์ที่เลือก'
          : 'เตรียมโฟลเดอร์ตามชื่อโครงการแล้ว กดเปิดโฟลเดอร์ได้ด้านล่าง',
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function runQueue() {
    if (lock.current || !online) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await withUploadLock(owner, async () => {
        token();
        const folders = await getFolders(owner);
        for (const knownProject of projects.filter((project) => folders?.projects[project.id])) {
          if (!alive.current) break;
          await ensureProjectFolders(knownProject.id);
        }
        const work = await listUploads(owner);
        let failures = 0;
        for (const item of work.filter((item) => item.status !== 'synced')) {
          if (!alive.current) break;
          try {
            await processUpload(
              item,
              {
                prepare,
                upload: (record, update) => uploadOriginal(token(), record, update),
                metadata: (record) => {
                  session();
                  return saveDocumentMetadata(owner, record);
                },
                save: async (record) => {
                  await putUpload(record);
                  await refresh();
                },
              },
              (percent) => {
                if (alive.current) setProgress((old) => ({ ...old, [item.id]: percent }));
              },
            );
          } catch (e) {
            failures++;
            if (e instanceof DriveError && e.status === 401) {
              credentials.current = null;
              clearDriveSession(owner);
              setConnected(false);
              throw e;
            }
            setError((e as Error).message);
          }
          await refresh();
        }
        if (!failures) setNotice('ประมวลผลคิวอัปโหลดเรียบร้อย');
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const runRef = useRef(runQueue);
  runRef.current = runQueue;
  useEffect(() => {
    if (online && connected) void runRef.current();
  }, [online, connected]);
  async function enqueue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const form = event.currentTarget;
    let queued = false;
    try {
      const fields = new FormData(form);
      const projectId = String(fields.get('projectId') ?? '');
      const tripId = String(fields.get('tripId') ?? '');
      if (!projects.some((p) => p.id === projectId && p.status === 'active'))
        throw Error('กรุณาเลือกโครงการที่กำลังดำเนินการ');
      if (tripId && !trips.some((t) => t.id === tripId && t.projectId === projectId))
        throw Error('เที่ยวรถไม่ตรงกับโครงการ');
      const input = form.elements.namedItem('files') as HTMLInputElement;
      const files = Array.from(input.files ?? []);
      if (!files.length) throw Error('กรุณาเลือกไฟล์');
      await queueFiles(owner, projectId, tripId, files);
      queued = true;
      input.value = '';
      setSelectedFiles([]);
      setNotice(
        connected && online
          ? 'เก็บต้นฉบับแล้ว กำลังเริ่มอัปโหลด'
          : 'เก็บต้นฉบับในอุปกรณ์แล้ว ยังไม่ได้อัปโหลด กรุณาเชื่อมต่อ Drive เมื่อออนไลน์',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      try {
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        lock.current = false;
        setBusy(false);
      }
    }
    if (queued && connected && online && alive.current) void runRef.current();
  }
  async function download(item: UploadRecord) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const blob = await downloadOriginal(token(), item.driveId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = item.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="panel padded drive-panel">
      <h2>Google Drive · รูปภาพและเอกสาร</h2>
      <p>
        เก็บต้นฉบับโดยไม่ลดความละเอียด · ไฟล์เป็นส่วนตัว · รองรับรูปภาพและ PDF ไม่เกิน 100 MB
        ต่อไฟล์
      </p>
      <div className="drive-actions">
        <span className="badge">
          {connected
            ? 'เชื่อมต่อแล้ว'
            : driveConfigured
              ? 'พร้อมตั้งค่าการเชื่อมต่อ'
              : 'ยังไม่มี Google Client ID'}
        </span>
        <button
          className="primary"
          disabled={!driveConfigured || !identityReady || !online || busy || owner === 'local'}
          onClick={() => void connect()}
        >
          <Link size={16} />
          {connected ? 'ต่ออายุสิทธิ์ Drive' : 'เชื่อมต่อ Google Drive'}
        </button>
        {connected && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              credentials.current = null;
              clearDriveSession(owner);
              setConnected(false);
              setNotice('ตัดการเชื่อมต่อในแอปแล้ว');
            }}
          >
            <Unplug size={16} />
            ตัดการเชื่อมต่อ
          </button>
        )}
      </div>
      <p>
        บัญชี Drive: {getSessionIdentity()?.email || 'ยังไม่ได้เข้าสู่ระบบ'} ·{' '}
        {connected
          ? 'พร้อมอัปโหลดเมื่อกดปุ่มส่งไฟล์'
          : 'ยังไม่เชื่อมต่อ ไฟล์จะเก็บรอไว้ในเครื่องก่อน'}
      </p>
      {!identityReady && driveConfigured && (
        <button
          className="text-button"
          onClick={() => {
            setError('');
            void loadGoogleIdentity()
              .then(() => setIdentityReady(true))
              .catch((e) => setError(e.message));
          }}
        >
          โหลดการเชื่อมต่อ Google อีกครั้ง
        </button>
      )}
      {owner === 'local' && <p>บันทึกไฟล์ในเครื่องได้ แต่ต้องเข้าสู่ระบบ Firebase เพื่ออัปโหลด</p>}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}
      <form onSubmit={enqueue} noValidate>
        <h3>อัปโหลดภาพและเอกสารโครงการ</h3>
        <div className="form-grid">
          <ProjectPicker
            projects={projects}
            value={project}
            onChange={setProject}
            label="โครงการสำหรับเอกสาร *"
          />
          <label className="field">
            <span>ผูกกับเที่ยวรถ (ไม่บังคับ)</span>
            <select name="tripId" key={project}>
              <option value="">เอกสารระดับโครงการ</option>
              {trips
                .filter((t) => t.projectId === project)
                .map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.date} {t.time} · {t.id.slice(0, 8)}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>เลือกรูปภาพ / PDF *</span>
            <input
              name="files"
              type="file"
              multiple
              required
              accept="image/*,application/pdf"
              onChange={(event) =>
                setSelectedFiles(
                  Array.from(event.target.files ?? []).map((file) => ({
                    name: file.name,
                    size: file.size,
                  })),
                )
              }
            />
          </label>
        </div>
        {selectedFiles.length > 0 && (
          <p role="status">
            เลือกแล้ว {selectedFiles.length} ไฟล์ — ยังไม่ได้ส่ง กรุณากดอัปโหลดไฟล์ที่เลือก
          </p>
        )}
        <button className="primary" type="submit" disabled={busy}>
          <Upload size={16} />
          อัปโหลดไฟล์ที่เลือก
        </button>
        {!connected && (
          <p>
            หากยังไม่เชื่อม Drive ปุ่มนี้จะเก็บต้นฉบับไว้รอในเครื่อง
            จากนั้นกดเชื่อมต่อเพื่อเริ่มส่งไฟล์
          </p>
        )}
      </form>
      <div className="drive-actions">
        <button
          type="button"
          className="secondary"
          disabled={!project || !connected || !online || busy}
          onClick={() => void createProjectFolders()}
        >
          เตรียมโฟลเดอร์โครงการใน Drive
        </button>
        <small>สร้างเฉพาะโฟลเดอร์ ปุ่มนี้ไม่อัปโหลดภาพ</small>
      </div>
      {Object.entries(folderLinks).map(([id, folders]) => (
        <div className="drive-actions" key={id}>
          <b>{projects.find((project) => project.id === id)?.name ?? id}</b>
          <a
            className="secondary"
            href={`https://drive.google.com/drive/folders/${encodeURIComponent(folders.projectId)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            เปิดโฟลเดอร์โครงการ
          </a>
          <a
            className="text-button"
            href={`https://drive.google.com/drive/folders/${encodeURIComponent(folders.documentsId)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            เปิด Documents
          </a>
          <a
            className="text-button"
            href={`https://drive.google.com/drive/folders/${encodeURIComponent(folders.rootId)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            เปิดโฟลเดอร์หลัก
          </a>
        </div>
      ))}
      <div className="section-heading">
        <h3>
          คิวเอกสาร · {items.filter((item) => item.status !== 'synced').length} รายการรอดำเนินการ
        </h3>
        <button
          className="secondary"
          disabled={!connected || !online || busy}
          onClick={() => void runQueue()}
        >
          <RefreshCw size={16} />
          {busy ? 'กำลังทำงาน…' : 'อัปโหลด / ลองใหม่'}
        </button>
      </div>
      {items.length === 0 ? (
        <p>ยังไม่มีเอกสารในอุปกรณ์นี้</p>
      ) : (
        items.map((item) => (
          <article className="upload-row" key={item.id}>
            <b>{item.name}</b>
            <small>
              {projects.find((p) => p.id === item.projectId)?.name ?? item.projectId} ·{' '}
              {(item.size / 1024 / 1024).toFixed(2)} MB
            </small>
            <span className={'badge ' + (item.status === 'synced' ? '' : 'pending')}>
              {statusLabels[item.status]}
            </span>
            {progress[item.id] !== undefined && item.status !== 'synced' && (
              <progress
                aria-label={`ความคืบหน้า ${item.name}`}
                max={100}
                value={progress[item.id]}
              />
            )}{' '}
            {item.error && <p>{item.error}</p>}
            {item.status === 'synced' && (
              <>
                <a
                  className="text-button"
                  href={`https://drive.google.com/file/d/${encodeURIComponent(item.driveId)}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  เปิดไฟล์นี้ใน Google Drive
                </a>
                <button
                  className="text-button"
                  disabled={!connected || busy || !online}
                  onClick={() => void download(item)}
                >
                  <Download size={14} />
                  ดาวน์โหลดต้นฉบับ
                </button>
              </>
            )}
          </article>
        ))
      )}
      <p className="table-note">
        {items.some((item) => item.status !== 'synced') &&
          !connected &&
          'มีไฟล์รออยู่ในเครื่อง กรุณากดเชื่อมต่อ Google Drive เพื่อเริ่มอัปโหลด · '}
        ไฟล์รออัปโหลดอยู่ในอุปกรณ์นี้ อย่าล้างข้อมูลเว็บไซต์จนกว่าจะซิงก์สำเร็จ สิทธิ์ Drive
        ต้องเชื่อมใหม่หลังเปิดแอปใหม่หรือหมดอายุ การอัปโหลดยังไม่ใช่การตรวจสอบหลักฐาน
      </p>
    </section>
  );
}
