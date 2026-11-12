import SearchableSelect from './SearchableSelect';
import { assertCompanyMutation } from './companyPermissions';
import { actorUid, cacheOwner, companyRole, type CompanyScope } from './workspaceIdentity';
import CompanyMembersPanel from './CompanyMembersPanel';
import { useProjectPreference } from './useProjectPreference';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  LayoutDashboard,
  FolderOpen,
  Truck,
  Database,
  BarChart3,
  Calculator,
  Settings,
  Plus,
  ArrowUpRight,
  Search,
  Wifi,
  WifiOff,
  RefreshCw,
  Mountain,
  Check,
  Download,
  X,
  LogOut,
} from 'lucide-react';
import type { Data, Project, Master, Trip } from './models';
import { emptyData } from './models';
import {
  workDate,
  saveTrip,
  validateMaster,
  validateProject,
  survey,
  volume,
  csv,
  parseCoordinateInput,
} from './domain';
import { loadData, updateData, subscribeDataChanges } from './storage';
import { configured, observeAuth, login, logout } from './firebase';
import { synchronize, resolveConflict } from './cloudSync';
import { canonical, integrityIssues, payloadOf } from './syncModel';
import { deleteRecord } from './deletion';
import { listUploads } from './uploads';
import CloudSyncPanel from './CloudSyncPanel';
import OperationsDashboard from './OperationsDashboard';
import { reportRows, reportTotals, emptyReportFilter } from './reports';
import { connectionMessage } from './async';
import { lazy, Suspense } from 'react';
const DailyPanel = lazy(() => import('./DailyPanel'));
const ReportsPanel = lazy(() => import('./ReportsPanel'));
const SurveyPanel = lazy(() => import('./SurveyPanel'));
const FinancePanel = lazy(() => import('./FinancePanel'));
import { companyName, companyLogo } from './branding';
import LoginPage from './LoginPage';
import DrivePanel from './DrivePanel';
import DuplicateReviewPanel from './DuplicateReviewPanel';
import BackupRestorePanel from './BackupRestorePanel';
import ProjectPicker from './ProjectPicker';
import SoilTypePicker from './SoilTypePicker';
import ProjectCoordinates from './ProjectCoordinates';
import { clearDriveSessions, clearDriveSessionsExcept } from './driveSession';
import {
  saveTruckWithDriver,
  assignedDriver,
  matchesMaster,
  tagNames,
  truckTypes,
} from './masterData';
import SoilPricesPanel from './SoilPricesPanel';
import TagFields from './TagFields';
import TruckExcelPanel from './TruckExcelPanel';
import PageGuide, { pageDescription } from './PageGuide';
import { addDemoProject, demoProjectId } from './demoProject';
const pages = [
  ['overview', 'ภาพรวม', LayoutDashboard],
  ['daily', 'งานรายวันและตรวจยอด', Truck],
  ['trips', 'บันทึกเที่ยวรถ', Truck],
  ['projects', 'โครงการ', FolderOpen],
  ['masters', 'ข้อมูลพื้นฐาน', Database],
  ['reports', 'รายงาน', BarChart3],
  ['finance', 'การเงินโครงการ', BarChart3],
  ['survey', 'สำรวจและคำนวณ', Calculator],
  ['sync', 'ซิงก์และสำรองข้อมูล', RefreshCw],
  ['settings', 'การตั้งค่า', Settings],
] as const;
const navGroups: Record<string, string> = {
  overview: 'งานประจำวัน',
  projects: 'เตรียมข้อมูล',
  reports: 'ตรวจงานและสรุป',
  sync: 'ดูแลข้อมูลและบัญชี',
};
const statusText = {
  active: 'กำลังดำเนินการ',
  draft: 'ฉบับร่าง',
  completed: 'เสร็จสิ้น',
  archived: 'จัดเก็บแล้ว',
};
const labels = {
  truck: 'รถบรรทุก',
  driver: 'คนขับรถ',
  source: 'แหล่งดิน',
  customer: 'ลูกค้า',
  soilType: 'ชนิดดิน',
  tag: 'แท็กทีม',
  soilPrice: 'ประวัติราคาดิน',
};
const number = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 3 });
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export default function App({
  workspace,
  onSwitchCompany,
}: { workspace?: CompanyScope & { name?: string }; onSwitchCompany?: () => void } = {}) {
  const [data, setData] = useState<Data>(emptyData),
    [page, setPage] = useState('overview'),
    [tripView, setTripView] = useState('records'),
    [owner, setOwner] = useState(configured ? '' : workspace ? cacheOwner(workspace) : 'local'),
    [ready, setReady] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [cloudStatus, setCloudStatus] = useState(''),
    [cloudError, setCloudError] = useState(''),
    [cloudAccess, setCloudAccess] = useState<'checking' | 'allowed' | 'denied'>('checking'),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState(''),
    [date, setDate] = useState(workDate()),
    [modal, setModal] = useState<'project' | 'master' | 'trip' | null>(null),
    [editing, setEditing] = useState<Project | Master | Trip | null>(null),
    [confirmDelete, setConfirmDelete] = useState(false),
    [busy, setBusy] = useState(false),
    [kind, setKind] = useState<Master['kind']>('truck');
  const projectPreference = useProjectPreference(owner, data.projects);
  const canManage = companyRole(owner) !== 'operator';
  const roleLabel =
    companyRole(owner) === 'owner'
      ? 'เจ้าของกิจการ'
      : companyRole(owner) === 'manager'
        ? 'ผู้จัดการ'
        : 'พนักงานบันทึกข้อมูล';
  const [tripProject, setTripProject] = useState('');
  const [tripSoilType, setTripSoilType] = useState('');
  const [tripTruck, setTripTruck] = useState('');
  const [tripDriver, setTripDriver] = useState('');
  const [tripSource, setTripSource] = useState('');
  const [masterTagFilter, setMasterTagFilter] = useState('');
  const [reportProject, setReportProject] = useState('');
  const [demoBusy, setDemoBusy] = useState(false);
  const [truckTypeFilter, setTruckTypeFilter] = useState('');
  const current = useRef(data),
    writeLock = useRef(false),
    syncLock = useRef(false),
    account = useRef(owner),
    loadEpoch = useRef(0),
    alive = useRef(false);
  current.current = data;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(
    () =>
      observeAuth((user) => {
        if (!alive.current) return;
        const nextOwner = user
          ? workspace
            ? workspace.actorUid === user.uid
              ? cacheOwner(workspace)
              : ''
            : user.uid
          : '';
        if (nextOwner) clearDriveSessionsExcept(nextOwner);
        else clearDriveSessions();
        if (nextOwner === account.current) return;
        account.current = nextOwner;
        loadEpoch.current++;
        setOwner(nextOwner);
        setReady(false);
        setCloudAccess('checking');
        setCloudStatus('');
        setCloudError('');
        setData(emptyData);
        setReportProject('');
        setDemoBusy(false);
        setModal(null);
      }),
    [],
  );
  useEffect(() => {
    let active = true;
    const reload = () => {
      const epoch = ++loadEpoch.current;
      if (owner)
        void loadData(owner)
          .then((value) => {
            if (active && epoch === loadEpoch.current) {
              current.current = value;
              setData(value);
              setReady(true);
            }
          })
          .catch((e) => {
            if (active) setError(message(e));
          });
    };
    reload();
    const unsubscribe = subscribeDataChanges(owner, reload);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [owner]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  async function change(make: (old: Data) => Data) {
    if (writeLock.current) throw Error('กำลังบันทึก กรุณาลองใหม่');
    writeLock.current = true;
    try {
      const next = await updateData(owner, (old) => {
        if (!alive.current || account.current !== owner)
          throw Error('บัญชีเปลี่ยนแล้ว กรุณาเปิดรายการใหม่');
        if (editing && modal) {
          const records =
            modal === 'project' ? old.projects : modal === 'master' ? old.masters : old.trips;
          const latest = records.find((record) => record.id === editing.id);
          if (!latest || canonical(payloadOf(latest)) !== canonical(payloadOf(editing)))
            throw Error('ข้อมูลเปลี่ยนแปลงแล้ว กรุณาปิดฟอร์มและเปิดรายการใหม่');
        }
        const next = make(old);
        assertCompanyMutation(old, next, owner);
        return next;
      });
      if (!alive.current || account.current !== owner) return;
      loadEpoch.current++;
      current.current = next;
      setData(next);
    } finally {
      writeLock.current = false;
    }
  }
  async function sync(force = true) {
    if (!alive.current || syncLock.current || !ready || !configured || !online || !owner) return;
    syncLock.current = true;
    setBusy(true);
    setCloudError('');
    setCloudStatus('กำลังตรวจสอบสิทธิ์และข้อมูล Cloud');
    try {
      const { firestoreTransport } = await import('./cloudFirestore');
      await synchronize(
        owner,
        {
          ...firestoreTransport,
          authorize: async (uid) => {
            try {
              await firestoreTransport.authorize(uid);
              if (alive.current && account.current === uid) setCloudAccess('allowed');
            } catch (e) {
              const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
              if (alive.current && account.current === uid)
                setCloudAccess(
                  !['permission-denied', 'unauthenticated'].includes(code) &&
                    current.current.sync?.adminVerifiedAt
                    ? 'allowed'
                    : 'denied',
                );
              throw e;
            }
          },
        },
        () => alive.current && account.current === owner && navigator.onLine,
        (status) => {
          if (alive.current && account.current === owner) setCloudStatus(status);
        },
        force,
      );
    } catch (e) {
      if (alive.current && account.current === owner) {
        const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
        if (['permission-denied', 'unauthenticated'].includes(code)) {
          setCloudAccess('denied');
          setModal(null);
        }
        setCloudError(message(e));
        setCloudStatus('ซิงก์ไม่สำเร็จ ข้อมูลและคิวที่ค้างยังอยู่ในเครื่อง');
      }
    } finally {
      syncLock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (online && ready && configured) void sync(false);
  }, [online, ready, owner]);
  useEffect(() => {
    if (!configured || !online || !ready) return;
    const timer = window.setInterval(() => void sync(false), 30000);
    return () => window.clearInterval(timer);
  }, [owner, online, ready]);
  const localOperations = Object.values(data.sync?.entries ?? {})
    .map((entry) => entry.desired.operationId)
    .join('|');
  const syncNeedsAttention =
    !!cloudError ||
    Object.values(data.sync?.entries ?? {}).some(
      (entry) => entry.status === 'conflict' || !!entry.error,
    ) ||
    integrityIssues(data).length > 0;
  useEffect(() => {
    if (!configured || !online || !ready) return;
    const timer = window.setTimeout(() => void sync(false), 500);
    return () => window.clearTimeout(timer);
  }, [localOperations, owner, online, ready]);
  async function resolve(key: string, choice: 'local' | 'remote') {
    if (!alive.current || syncLock.current || !owner || !online) return;
    syncLock.current = true;
    setBusy(true);
    try {
      const { firestoreTransport } = await import('./cloudFirestore');
      await resolveConflict(
        owner,
        key,
        choice,
        firestoreTransport,
        () => alive.current && account.current === owner,
      );
    } catch (e) {
      if (alive.current && account.current === owner) setCloudError(message(e));
    } finally {
      syncLock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function message(e: unknown) {
    return connectionMessage(e);
  }
  function navigate(nextPage: string) {
    setPage(nextPage);
    setQuery('');
    if (ready) setError('');
    setNotice('');
    document.documentElement.scrollTop = 0;
  }
  async function createDemo() {
    if (demoBusy || writeLock.current) return;
    setDemoBusy(true);
    try {
      await change((old) => addDemoProject(old, owner));
      if (!alive.current || account.current !== owner) return;
      setReportProject(demoProjectId);
      navigate('reports');
      setNotice(
        'เปิดรายงานโครงการ DEMO แล้ว ข้อมูลสมมติแสดงตามรายการปัจจุบัน ยังไม่ยืนยันหลักฐานจริง',
      );
    } catch (error) {
      setError(message(error));
    } finally {
      if (alive.current && account.current === owner) setDemoBusy(false);
    }
  }
  function open(type: typeof modal, record: typeof editing = null) {
    if (!canManage && type !== 'trip') {
      setError('พนักงานดูข้อมูลนี้ได้ การแก้ไขต้องให้ผู้จัดการดำเนินการ');
      return;
    }
    setConfirmDelete(false);
    if (type === 'trip') setTripSoilType(record && 'soilType' in record ? record.soilType : '');
    if (type === 'trip') {
      setTripTruck(record && 'truckId' in record ? record.truckId : '');
      setTripDriver(record && 'driverId' in record ? (record.driverId ?? '') : '');
      setTripSource(record && 'sourceId' in record ? record.sourceId : '');
    }
    if (type === 'trip')
      setTripProject(
        record && 'projectId' in record
          ? record.projectId
          : projectPreference.id || active[0]?.id || '',
      );
    setEditing(record);
    setModal(type);
    setError('');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (writeLock.current) return;
    const form = new FormData(event.currentTarget),
      get = (key: string) => String(form.get(key) ?? '').trim(),
      now = new Date().toISOString(),
      base = {
        id: editing?.id ?? crypto.randomUUID(),
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
      };
    try {
      if (modal === 'project') {
        const record: Project = {
          ...base,
          name: get('name'),
          customer: get('customer'),
          location: get('location'),
          ...parseCoordinateInput(get('coordinates')),
          startDate: get('startDate'),
          endDate: get('endDate'),
          description: get('description'),
          status: get('status') as Project['status'],
        };
        validateProject(record);
        await change((old) => ({
          ...old,
          projects: [...old.projects.filter((p) => p.id !== record.id), record],
          audit: [
            ...old.audit,
            {
              id: crypto.randomUUID(),
              entityId: record.id,
              action: editing ? 'update' : 'create',
              at: now,
              actor: actorUid(owner),
              before: editing,
              after: record,
            },
          ],
        }));
      } else if (modal === 'master') {
        const record: Master = {
          ...base,
          kind,
          name: get('name'),
          detail: get('detail'),
          capacity: Number(get('capacity') || 0),
          active: get('active') === 'true',
          tagIds: kind === 'tag' ? [] : form.getAll('tagIds').map(String),
          ...(kind === 'truck'
            ? {
                province: get('province'),
                phone: get('phone'),
                nickname: get('nickname'),
                truckType: (get('truckType') || undefined) as Master['truckType'],
                driverId: get('driverId'),
              }
            : {}),
          ...(kind === 'driver' ? { phone: get('phone'), nickname: get('nickname') } : {}),
        };
        await change((old) => saveTruckWithDriver(old, record, owner, get('newDriverName')));
      } else {
        const record: Trip = {
          ...base,
          projectId: get('projectId'),
          truckId: get('truckId'),
          driverId: get('driverId'),
          sourceId: get('sourceId'),
          date: get('date'),
          time: get('time'),
          soilType: get('soilType'),
          notes: get('notes'),
          syncStatus: 'pending',
          revision: editing && 'revision' in editing ? editing.revision + 1 : 1,
        };
        await change((old) => saveTrip(old, record, owner));
      }
      if (!alive.current || account.current !== owner) return;
      setModal(null);
      setNotice('บันทึกในเครื่องเรียบร้อย');
    } catch (e) {
      setError(message(e));
    }
  }
  async function remove() {
    if (!canManage || !editing || !modal || writeLock.current) return;
    try {
      const uploads = await listUploads(owner);
      await change((old) => deleteRecord(old, modal, editing.id, owner, uploads));
      if (!alive.current || account.current !== owner) return;
      setModal(null);
      setConfirmDelete(false);
      setNotice('ลบออกจากรายการใช้งานแล้ว โดยเก็บข้อมูลและประวัติไว้');
    } catch (e) {
      setError(message(e));
    }
  }
  const todayTrips = data.trips.filter((t) => t.date === workDate()),
    pending = data.sync
      ? Object.values(data.sync.entries).filter((entry) => entry.status !== 'synced').length
      : data.trips.filter((t) => t.syncStatus !== 'synced').length,
    active = data.projects.filter((p) => p.status === 'active'),
    trucks = data.masters.filter((m) => m.kind === 'truck');
  const tripRows = data.trips
    .filter(
      (t) =>
        (!date || t.date === date) &&
        (!filter || t.projectId === filter) &&
        (!query ||
          [data.masters.find((m) => m.id === t.truckId)?.name, t.notes, t.soilType]
            .join(' ')
            .includes(query)),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  const projectTripCounts = new Map<string, number>();
  if (page === 'projects' || page === 'overview')
    for (const row of reportRows(data, emptyReportFilter))
      projectTripCounts.set(row.project, (projectTripCounts.get(row.project) ?? 0) + row.trips);
  const masterName = (id: string) => data.masters.find((m) => m.id === id)?.name ?? '—';
  const visibleMasters = data.masters.filter(
    (master) =>
      master.kind === kind &&
      matchesMaster(master, data.masters, query, kind === 'tag' ? '' : masterTagFilter) &&
      (kind !== 'truck' || !truckTypeFilter || master.truckType === truckTypeFilter),
  );
  function exportCSV() {
    const content = csv([
      ['วันที่', 'เวลา', 'โครงการ', 'ทะเบียนรถ', 'คนขับ', 'แหล่งดิน', 'ชนิดดิน', 'สถานะ'],
      ...tripRows.map((t) => [
        t.date,
        t.time,
        data.projects.find((p) => p.id === t.projectId)?.name ?? '',
        masterName(t.truckId),
        masterName(t.driverId),
        masterName(t.sourceId),
        t.soilType,
        t.syncStatus === 'synced' ? 'ซิงก์แล้ว' : 'รอซิงก์',
      ]),
    ]);
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `trip-report-${workDate()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  const input = (name: string, label: string, type = 'text', required = false) => (
    <Field label={label}>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={
          editing
            ? String((editing as unknown as Record<string, unknown>)[name] ?? '')
            : type === 'date' && name !== 'endDate'
              ? workDate()
              : ''
        }
      />
    </Field>
  );
  if (configured && !owner) return <LoginPage onLogin={login} online={online} />;
  if (
    configured &&
    owner &&
    cloudAccess !== 'allowed' &&
    !(cloudAccess !== 'denied' && !online && data.sync?.adminVerifiedAt)
  )
    return (
      <main>
        <h1>
          {cloudAccess === 'denied'
            ? workspace
              ? 'ไม่สามารถตรวจสอบสิทธิ์บริษัทได้'
              : 'ไม่สามารถตรวจสอบสิทธิ์ Admin ได้'
            : workspace
              ? 'กำลังตรวจสอบสิทธิ์บริษัท'
              : 'กำลังตรวจสอบสิทธิ์ Admin'}
        </h1>
        <p role="alert">
          {cloudError ||
            error ||
            (!online
              ? 'ต้องออนไลน์เพื่อตรวจสอบสิทธิ์ครั้งแรก ข้อมูลในเครื่องยังถูกเก็บไว้'
              : 'กำลังติดต่อ Cloud')}
        </p>
        <button disabled={busy || !online || !ready} onClick={() => void sync()}>
          ลองตรวจสอบสิทธิ์ใหม่
        </button>
        <button onClick={() => void logout().catch((e) => setError(message(e)))}>ออกจากระบบ</button>
      </main>
    );
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        ข้ามไปเนื้อหาหลัก
      </a>
      <aside className="sidebar">
        <div className="brand">
          <img className="company-logo" src={companyLogo} alt={companyName} />
        </div>
        <span className="nav-caption">พื้นที่ทำงาน</span>
        <nav>
          {pages
            .filter(([id]) => canManage || id !== 'finance')
            .map(([id, title, Icon]) => (
              <div className="nav-item" key={id}>
                {navGroups[id] && <span className="nav-group-title">{navGroups[id]}</span>}
                <button
                  aria-label={title}
                  aria-current={page === id ? 'page' : undefined}
                  aria-describedby={
                    id === 'sync' && syncNeedsAttention ? 'sync-attention' : undefined
                  }
                  className={page === id ? 'selected' : ''}
                  onClick={() => navigate(id)}
                >
                  <Icon size={19} aria-hidden="true" />
                  <span className="nav-label">{title}</span>
                  {id === 'trips' && pending > 0 && <span className="nav-count">{pending}</span>}
                  {id === 'sync' && syncNeedsAttention && (
                    <span
                      id="sync-attention"
                      className="nav-error-dot"
                      role="status"
                      aria-label="มีปัญหาการซิงก์หรือข้อมูลที่ต้องตรวจสอบ"
                      title="มีปัญหาการซิงก์หรือข้อมูลที่ต้องตรวจสอบ"
                    />
                  )}
                </button>
              </div>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="site-note">
            <span className="live-dot" /> พร้อมสำหรับงานภาคสนาม
            <small>ข้อมูลสำคัญ อยู่ใกล้คุณเสมอ</small>
          </div>
          <div className="profile">
            <span>AD</span>
            <div>
              <b>
                {companyRole(owner) === 'owner'
                  ? 'เจ้าของกิจการ'
                  : companyRole(owner) === 'manager'
                    ? 'ผู้จัดการ'
                    : 'พนักงานบันทึกข้อมูล'}
              </b>
              <small>{configured ? 'บัญชี Google' : 'พื้นที่ทำงานในเครื่อง'}</small>
            </div>
            {configured && (
              <button
                aria-label="ออกจากระบบ"
                onClick={() => logout().catch((e) => setError(message(e)))}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className={workspace ? 'company-header' : undefined}>
          <div>
            <span className="breadcrumb">พื้นที่ทำงาน</span>
            <span className="slash">/</span>
            <b>{pages.find((p) => p[0] === page)?.[1]}</b>
            {workspace && (
              <span className="workspace-identity" aria-label="สิทธิ์บริษัทปัจจุบัน">
                {workspace.name || 'บริษัท'} · {roleLabel}
              </span>
            )}
          </div>
          <div className="header-right">
            {!configured && <span className="badge pending">โหมดในเครื่อง</span>}
            <span className={online ? 'online' : 'offline'}>
              {online ? <Wifi size={14} /> : <WifiOff size={14} />} {online ? 'ออนไลน์' : 'ออฟไลน์'}
            </span>
            <span className="header-date">
              {new Intl.DateTimeFormat('th-TH', {
                dateStyle: 'long',
                timeZone: 'Asia/Bangkok',
              }).format(new Date())}
            </span>
          </div>
        </header>
        <main className="workspace-main" id="main-content" tabIndex={-1}>
          <div className="page-title">
            <div>
              <span className="eyebrow">พื้นที่ทำงานของคุณ</span>
              <h1>
                {page === 'overview' ? 'ภาพรวมการทำงาน' : pages.find((p) => p[0] === page)?.[1]}
              </h1>
              <p>{pageDescription(page)}</p>
            </div>
            {['projects', 'masters', 'trips'].includes(page) &&
              (page !== 'trips' || tripView === 'records') &&
              (canManage || !['projects', 'masters'].includes(page)) && (
                <button
                  className="primary"
                  onClick={() =>
                    open(page === 'projects' ? 'project' : page === 'masters' ? 'master' : 'trip')
                  }
                >
                  <Plus size={18} />
                  {page === 'projects'
                    ? 'เพิ่มโครงการ'
                    : page === 'masters'
                      ? 'เพิ่มข้อมูล'
                      : 'บันทึกเที่ยวรถ'}
                </button>
              )}
          </div>
          <PageGuide page={page} />
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button aria-label="ปิดข้อผิดพลาด" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert" role="status">
              <Check size={16} />
              {notice}
              <button aria-label="ปิดข้อความ" onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {!ready ? (
            <p>กำลังเปิดข้อมูลในเครื่อง…</p>
          ) : (
            <>
              {page === 'sync' && (
                <>
                  <CloudSyncPanel
                    owner={owner}
                    data={data}
                    configured={configured}
                    online={online}
                    busy={busy}
                    status={cloudStatus}
                    failure={cloudError}
                    onSync={sync}
                    onResolve={resolve}
                  />
                  {canManage && <BackupRestorePanel key={`restore:${owner}`} owner={owner} />}
                </>
              )}
              {page === 'overview' && (
                <>
                  {canManage && (
                    <section
                      className="demo-project-card"
                      aria-label="ข้อมูลตัวอย่างสำหรับทดลองใช้งาน"
                    >
                      <div>
                        <span className="demo-tag">DEMO · ข้อมูลสมมติ</span>
                        <h2>ลองดูหน้าจอและรายงานด้วยข้อมูลตัวอย่าง</h2>
                        <p>
                          ชุดข้อมูลเริ่มต้น: รถ 2 คัน · งาน 5 วัน · 80 เที่ยว · 1,200 m³ พร้อมราคา
                          ค่าใช้จ่าย และงานสำรวจ แยกเป็นโครงการ DEMO
                          เปลี่ยนเป็นฉบับร่างได้ที่เมนูโครงการ
                        </p>
                        <p className="demo-note">
                          สร้างในพื้นที่ข้อมูลที่คุณใช้อยู่ และรอซิงก์ตามปกติ
                          ไม่ใช่ยอดงานจริงหรือหลักฐานที่ยืนยันแล้ว
                        </p>
                      </div>
                      <button
                        className="secondary"
                        disabled={busy || demoBusy}
                        onClick={() => void createDemo()}
                      >
                        {demoBusy
                          ? 'กำลังเตรียมข้อมูลตัวอย่าง…'
                          : data.projects.some((p) => p.id === demoProjectId)
                            ? 'เปิดรายงาน DEMO'
                            : 'สร้างโครงการ DEMO และดูรายงาน'}
                      </button>
                    </section>
                  )}
                  <section className="hero">
                    <div>
                      <span className="hero-tag">
                        <span className="live-dot" /> FIELD OPERATIONS
                      </span>
                      <h2>
                        เริ่มต้นวันทำงาน
                        <br />
                        ด้วยข้อมูลที่พร้อมกว่า
                      </h2>
                      <p>ติดตามโครงการ บันทึกเที่ยวรถ และดูความคืบหน้าของวันนี้</p>
                      <button onClick={() => open('trip')}>
                        บันทึกเที่ยวรถแรกของวัน <ArrowUpRight size={17} />
                      </button>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <div className="sun" />
                      <Mountain size={250} strokeWidth={0.8} />
                      <Truck size={100} strokeWidth={1.2} />
                      <span>BUILD ON SOLID GROUND.</span>
                    </div>
                  </section>
                  <section className="stats">
                    {(
                      [
                        [
                          'เที่ยวรถวันนี้',
                          reportTotals(
                            reportRows(data, {
                              ...emptyReportFilter,
                              from: workDate(),
                              to: workDate(),
                            }),
                          ).trips,
                          'เที่ยว',
                          Truck,
                        ],
                        ['โครงการที่ดำเนินการ', active.length, 'โครงการ', FolderOpen],
                        [
                          'รถบรรทุกพร้อมใช้งาน',
                          trucks.filter((t) => t.active).length,
                          'คัน',
                          Database,
                        ],
                        ['รายการรอซิงก์', pending, 'รายการ', RefreshCw],
                      ] as const
                    ).map(([title, value, unit, Icon], i) => (
                      <article key={String(title)}>
                        <div className="stat-top">
                          <span>{String(title)}</span>
                          <span className={'stat-icon tone-' + i}>
                            <Icon size={19} />
                          </span>
                        </div>
                        <div className="stat-value">
                          {String(value)} <small>{String(unit)}</small>
                        </div>
                        <small className="muted">
                          {i === 3
                            ? 'เก็บอยู่ในอุปกรณ์นี้'
                            : i === 0
                              ? 'นับตามวันที่ทำงาน ประเทศไทย'
                              : 'ข้อมูลจากพื้นที่ทำงานของคุณ'}
                        </small>
                      </article>
                    ))}
                  </section>
                  <OperationsDashboard
                    owner={owner}
                    data={data}
                    onDaily={() => navigate('daily')}
                  />
                  <div className="dashboard-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <div>
                          <h2>โครงการที่กำลังดำเนินการ</h2>
                          <p>ติดตามงานที่คุณดูแล</p>
                        </div>
                        <button className="text-button" onClick={() => navigate('projects')}>
                          ดูทั้งหมด <ArrowUpRight size={15} />
                        </button>
                      </div>
                      {active.length ? (
                        active.slice(0, 4).map((p) => (
                          <button
                            className="project-row"
                            key={p.id}
                            onClick={() => open('project', p)}
                          >
                            <span className="project-symbol">
                              <FolderOpen size={22} />
                            </span>
                            <span>
                              <b>{p.name}</b>
                              <small>{p.location || 'ยังไม่ระบุสถานที่'}</small>
                            </span>
                            <span className="badge">{projectTripCounts.get(p.id) ?? 0} เที่ยว</span>
                            <ArrowUpRight size={16} />
                          </button>
                        ))
                      ) : (
                        <div className="empty">
                          <FolderOpen size={34} />
                          <h3>เริ่มต้นโครงการแรก</h3>
                          <p>เพิ่มโครงการเพื่อเริ่มบันทึกการทำงาน</p>
                          <button className="secondary" onClick={() => open('project')}>
                            <Plus size={16} /> เพิ่มโครงการ
                          </button>
                        </div>
                      )}
                    </section>
                    <section className="panel checklist">
                      <span className="eyebrow">GETTING STARTED</span>
                      <h2>เตรียมพร้อมก่อนออกหน้างาน</h2>
                      <p>ตั้งค่าครั้งเดียว ใช้งานได้ทุกวัน</p>
                      {[
                        [data.projects.length > 0, 'เพิ่มโครงการแรก', 'projects'],
                        [trucks.length > 0, 'เพิ่มรถบรรทุก', 'masters'],
                        [data.trips.length > 0, 'บันทึกเที่ยวรถ', 'trips'],
                        [configured, 'เชื่อมต่อระบบคลาวด์', 'settings'],
                      ].map(([done, title, target], i) => (
                        <button key={String(title)} onClick={() => navigate(String(target))}>
                          <span className={done ? 'step done' : 'step'}>
                            {done ? <Check size={14} /> : i + 1}
                          </span>
                          <span>{String(title)}</span>
                          <ArrowUpRight size={15} />
                        </button>
                      ))}
                    </section>
                  </div>
                </>
              )}
              {page === 'daily' && projectPreference.ready && (
                <Suspense fallback={<p>กำลังเปิดงานรายวัน…</p>}>
                  <DailyPanel
                    key={owner}
                    owner={owner}
                    defaultProject={projectPreference.id}
                    data={data}
                    onChange={change}
                    online={online}
                  />
                </Suspense>
              )}
              {page === 'reports' && (
                <Suspense fallback={<p>กำลังเปิดรายงาน…</p>}>
                  <ReportsPanel
                    key={`${owner}:${reportProject}`}
                    data={data}
                    initialProject={reportProject}
                  />
                </Suspense>
              )}
              {page === 'finance' && canManage && projectPreference.ready && (
                <Suspense fallback={<p>กำลังเปิดการเงิน…</p>}>
                  <FinancePanel
                    key={owner}
                    owner={owner}
                    data={data}
                    defaultProject={projectPreference.id}
                    onChange={change}
                  />
                </Suspense>
              )}
              {page === 'survey' && projectPreference.ready && (
                <Suspense fallback={<p>กำลังเปิดงานสำรวจ…</p>}>
                  <SurveyPanel
                    key={owner}
                    data={data}
                    owner={owner}
                    defaultProject={projectPreference.id}
                    onChange={change}
                  />
                </Suspense>
              )}
              {page === 'projects' && (
                <>
                  <div className="toolbar">
                    <Search size={17} />
                    <input
                      placeholder="ค้นหาโครงการหรือลูกค้า"
                      aria-label="ค้นหาโครงการ"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <div className="project-grid">
                    {data.projects
                      .filter((p) => [p.name, p.customer, p.location].join(' ').includes(query))
                      .map((p) => (
                        <article className="panel project-card" key={p.id}>
                          <span className={'badge ' + p.status}>{statusText[p.status]}</span>
                          <FolderOpen className="card-folder" size={30} />
                          <h2>{p.name}</h2>
                          <p>
                            {p.customer || 'ยังไม่ระบุลูกค้า'} · {p.location || 'ยังไม่ระบุสถานที่'}
                          </p>
                          <ProjectCoordinates latitude={p.latitude} longitude={p.longitude} />
                          <p>
                            {p.startDate || '—'} → {p.endDate || 'ยังไม่กำหนด'}
                          </p>
                          <div className="card-foot">
                            <b>{projectTripCounts.get(p.id) ?? 0} เที่ยวรถ</b>
                            <button
                              disabled={!canManage}
                              className="text-button"
                              onClick={() => open('project', p)}
                            >
                              ดู / แก้ไข <ArrowUpRight size={16} />
                            </button>
                          </div>
                        </article>
                      ))}
                  </div>
                  {!data.projects.length && (
                    <Empty text="ยังไม่มีโครงการ" action={() => open('project')} />
                  )}
                </>
              )}
              {page === 'masters' && (
                <>
                  {(kind === 'truck' || kind === 'driver') && (
                    <div className="panel padded">
                      <h2>รถและคนขับ</h2>
                      <p>
                        จัดการรถและคนขับในที่เดียว ผูกคนขับประจำได้หนึ่งคนต่อหนึ่งคันที่หน้ารถ
                        เลือกทะเบียนในเที่ยวรถเพื่อเติมคนขับให้อัตโนมัติ
                        การเปลี่ยนรถประจำไม่แก้ประวัติเที่ยวรถเก่า
                      </p>
                      <div className="form-actions">
                        <button
                          type="button"
                          className={kind === 'truck' ? 'primary' : ''}
                          onClick={() => {
                            setKind('truck');
                            setQuery('');
                          }}
                        >
                          รถบรรทุก
                        </button>
                        <button
                          type="button"
                          className={kind === 'driver' ? 'primary' : ''}
                          onClick={() => {
                            setKind('driver');
                            setQuery('');
                          }}
                        >
                          คนขับรถ
                        </button>
                        <button
                          type="button"
                          disabled={!canManage}
                          onClick={() => {
                            setKind('truck');
                            open('master');
                          }}
                        >
                          เพิ่มรถพร้อมคนขับ
                        </button>
                        <button
                          type="button"
                          disabled={!canManage}
                          onClick={() => {
                            setKind('driver');
                            open('master');
                          }}
                        >
                          เพิ่มคนขับรถ
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="tabs">
                    {Object.entries(labels)
                      .filter(([id]) => id !== 'soilPrice' && id !== 'driver')
                      .map(([id, title]) => (
                        <button
                          className={
                            kind === id || (id === 'truck' && kind === 'driver') ? 'active' : ''
                          }
                          key={id}
                          onClick={() => {
                            setKind(id as Master['kind']);
                            setQuery('');
                          }}
                        >
                          {id === 'truck' ? 'รถและคนขับ' : title}
                        </button>
                      ))}
                  </div>
                  <div className="toolbar wrap">
                    <Search size={17} />
                    <input
                      aria-label="ค้นหาข้อมูลพื้นฐาน"
                      placeholder="ค้นหาทะเบียน จังหวัด เบอร์โทร ชื่อเล่น หรือแท็ก"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    {kind !== 'tag' && (
                      <SearchableSelect
                        aria-label="กรองแท็กทีม"
                        value={masterTagFilter}
                        onChange={(event) => setMasterTagFilter(event.target.value)}
                      >
                        <option value="">ทุกแท็กทีม</option>
                        {data.masters
                          .filter((item) => item.kind === 'tag')
                          .map((tag) => (
                            <option value={tag.id} key={tag.id}>
                              {tag.name}
                              {!tag.active ? ' (ปิดใช้งาน)' : ''}
                            </option>
                          ))}
                      </SearchableSelect>
                    )}
                    {kind === 'truck' && (
                      <SearchableSelect
                        aria-label="กรองประเภทรถ"
                        value={truckTypeFilter}
                        onChange={(event) => setTruckTypeFilter(event.target.value)}
                      >
                        <option value="">ทุกประเภทรถ</option>
                        {Object.entries(truckTypes).map(([id, title]) => (
                          <option key={id} value={id}>
                            {title}
                          </option>
                        ))}
                      </SearchableSelect>
                    )}
                  </div>
                  {kind === 'truck' && canManage && (
                    <TruckExcelPanel
                      data={data}
                      visibleTrucks={visibleMasters}
                      actor={owner}
                      onChange={change}
                    />
                  )}
                  <div className="panel list">
                    {visibleMasters.map((m) => (
                      <button
                        disabled={!canManage}
                        className="project-row"
                        key={m.id}
                        onClick={() => open('master', m)}
                      >
                        <span className="project-symbol">
                          <Truck size={20} />
                        </span>
                        <span>
                          <b>{m.name}</b>
                          <small>
                            {m.detail || 'ไม่มีรายละเอียดเพิ่มเติม'}
                            {m.kind === 'truck' ? ` · ${number(m.capacity)} m³` : ''}
                            {m.kind === 'truck' && m.province ? ` · ${m.province}` : ''}
                            {m.phone ? ` · ${m.phone}` : ''}
                            {m.nickname ? ` · ${m.nickname}` : ''}
                            {m.truckType ? ` · ${truckTypes[m.truckType]}` : ''}
                            {m.kind === 'truck' && m.driverId
                              ? ` · คนขับประจำ: ${masterName(m.driverId)}`
                              : ''}
                            {m.kind === 'driver'
                              ? ` · รถประจำ: ${data.masters.find((truck) => truck.kind === 'truck' && truck.driverId === m.id)?.name ?? 'ยังไม่ผูกกับรถ'}`
                              : ''}
                          </small>
                          <span className="tag-badges">
                            {tagNames(m, data.masters).map((name, index) => (
                              <span className="badge" key={index}>
                                {name}
                              </span>
                            ))}
                          </span>
                        </span>
                        <span className={'badge ' + (!m.active ? 'archived' : '')}>
                          {m.active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                        </span>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  </div>
                  {data.masters.some((m) => m.kind === kind) && !visibleMasters.length && (
                    <p className="empty">ไม่พบข้อมูลตามตัวกรองที่เลือก</p>
                  )}
                  {!data.masters.some((m) => m.kind === kind) && (
                    <Empty text={`ยังไม่มีข้อมูล${labels[kind]}`} action={() => open('master')} />
                  )}
                  {kind === 'soilType' && (
                    <SoilPricesPanel
                      data={data}
                      actor={owner}
                      canManage={canManage}
                      onChange={change}
                    />
                  )}
                </>
              )}
              {page === 'trips' && (
                <div className="toolbar view-selector">
                  <label>
                    มุมมองเที่ยวรถ
                    <SearchableSelect
                      aria-label="มุมมองเที่ยวรถ"
                      value={tripView}
                      onChange={(event) => setTripView(event.target.value)}
                    >
                      <option value="records">รายการเที่ยวรถ</option>
                      <option value="duplicates">ตรวจเที่ยวที่อาจซ้ำ</option>
                    </SearchableSelect>
                  </label>
                </div>
              )}
              {page === 'trips' && tripView === 'duplicates' && (
                <DuplicateReviewPanel
                  key={`duplicates:${owner}`}
                  owner={owner}
                  data={data}
                  onOpen={(id) => {
                    const trip = data.trips.find((trip) => trip.id === id);
                    if (trip) open('trip', trip);
                  }}
                />
              )}
              {page === 'trips' && tripView === 'records' && (
                <>
                  <div className="report-meta print-only">
                    <h2>
                      รายงานเที่ยวรถ ·{' '}
                      {filter ? data.projects.find((p) => p.id === filter)?.name : 'ทุกโครงการ'}
                    </h2>
                    <p>
                      วันที่ทำงาน: {date || 'ทุกวัน'} · ออกรายงาน: {workDate()} · รวม{' '}
                      {tripRows.length} เที่ยว · รอซิงก์{' '}
                      {tripRows.filter((t) => t.syncStatus !== 'synced').length} เที่ยว
                    </p>
                  </div>
                  <div className="toolbar wrap">
                    <Search size={17} />
                    <input
                      placeholder="ค้นหาทะเบียนรถ / หมายเหตุ"
                      aria-label="ค้นหาเที่ยวรถ"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <label className="all-dates-filter">
                      <input
                        type="checkbox"
                        checked={!date}
                        onChange={(e) => setDate(e.target.checked ? '' : workDate())}
                      />
                      ทุกวันที่
                    </label>
                    <input
                      aria-label="วันที่เที่ยวรถ"
                      type="date"
                      value={date}
                      disabled={!date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                    <SearchableSelect
                      aria-label="กรองโครงการ"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="">ทุกโครงการ</option>
                      {data.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </SearchableSelect>
                    <button className="secondary" onClick={exportCSV}>
                      <Download size={16} /> CSV
                    </button>
                    <button className="secondary" onClick={() => window.print()}>
                      พิมพ์ / PDF
                    </button>
                  </div>
                  <div className="panel">
                    <div className="section-heading trip-list-heading">
                      <h2>
                        รายการเที่ยวรถ <span className="badge">{tripRows.length} เที่ยว</span>
                      </h2>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>วันที่ / เวลา</th>
                            <th>ทะเบียนรถ</th>
                            <th>โครงการ</th>
                            <th>แหล่งดิน</th>
                            <th>สถานะ</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {tripRows.map((t) => (
                            <tr key={t.id}>
                              <td>
                                {t.date}
                                <small>{t.time}</small>
                              </td>
                              <td>
                                <b>{masterName(t.truckId)}</b>
                                <small>{masterName(t.driverId)}</small>
                              </td>
                              <td>{data.projects.find((p) => p.id === t.projectId)?.name}</td>
                              <td>{masterName(t.sourceId)}</td>
                              <td>
                                <span
                                  className={
                                    'badge ' + (t.syncStatus !== 'synced' ? 'pending' : '')
                                  }
                                >
                                  {t.syncStatus === 'synced' ? 'ซิงก์แล้ว' : 'รอซิงก์'}
                                </span>
                              </td>
                              <td>
                                <button
                                  className="text-button"
                                  aria-label={`แก้ไขเที่ยวรถ ${t.time}`}
                                  onClick={() => open('trip', t)}
                                >
                                  แก้ไข
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!tripRows.length && (
                      <Empty
                        text="ยังไม่มีเที่ยวรถตามเงื่อนไขที่เลือก"
                        action={() => open('trip')}
                      />
                    )}
                    <div className="table-note">
                      รายการรอซิงก์ยังไม่ใช่ข้อมูลยืนยัน · การซิงก์ไม่เท่ากับการตรวจสอบหลักฐานรายวัน
                    </div>
                  </div>
                </>
              )}
              {page === 'survey' && <Calculation />}
              {page === 'settings' && (
                <div className="settings-grid">
                  <section className="panel padded">
                    <h2>การเชื่อมต่อ</h2>
                    <p>
                      Firebase:{' '}
                      <span className="badge">
                        {configured ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ตั้งค่า'}
                      </span>
                    </p>
                    <p>Google Drive: จัดการการเชื่อมต่อและคิวเอกสารด้านล่าง</p>
                    <p>
                      หากยังไม่ได้เชื่อมบริการ
                      กรุณาติดต่อผู้ดูแลเพื่อตั้งค่าบัญชีและสิทธิ์ใช้งานคลาวด์
                    </p>
                  </section>
                  <section className="panel padded" aria-label="โครงการเริ่มต้น">
                    <h2>โครงการเริ่มต้น</h2>
                    <p>ใช้เริ่มกรอกงานใหม่ในบัญชีและ browser นี้ ไม่เปลี่ยนงานหรือแบบร่างเดิม</p>
                    <label>
                      เลือกโครงการเริ่มต้น
                      <SearchableSelect
                        aria-label="เลือกโครงการเริ่มต้น"
                        value={projectPreference.id}
                        disabled={!projectPreference.ready || projectPreference.saving}
                        onChange={(event) => void projectPreference.save(event.target.value)}
                      >
                        <option value="">ไม่กำหนด</option>
                        {data.projects
                          .filter((project) => project.status === 'active')
                          .map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                      </SearchableSelect>
                    </label>
                    {projectPreference.saving && <p role="status">กำลังบันทึกการตั้งค่า…</p>}
                    {projectPreference.error && <p role="alert">{projectPreference.error}</p>}
                  </section>
                  {projectPreference.ready && (
                    <DrivePanel
                      defaultProject={projectPreference.id}
                      key={owner}
                      owner={owner}
                      projects={data.projects}
                      trips={data.trips}
                      online={online}
                    />
                  )}
                  {workspace?.role === 'owner' && <CompanyMembersPanel scope={workspace} />}
                  {onSwitchCompany && <button onClick={onSwitchCompany}>เปลี่ยนบริษัท</button>}
                  <section className="panel padded audit-panel">
                    <h2>ประวัติการเปลี่ยนแปลง</h2>
                    <p>{data.audit.length} เหตุการณ์ในเครื่อง</p>
                    <div
                      className="audit-scroll"
                      role="region"
                      aria-label="รายการประวัติการเปลี่ยนแปลง"
                      tabIndex={0}
                    >
                      {data.audit
                        .slice()
                        .reverse()
                        .map((a) => (
                          <div className="audit-row" key={a.id}>
                            <b>{a.action}</b>
                            <small>
                              {new Date(a.at).toLocaleString('th-TH')} · {a.entityId.slice(0, 8)}
                            </small>
                          </div>
                        ))}
                      {!data.audit.length && <p>ยังไม่มีประวัติการเปลี่ยนแปลง</p>}
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
          <footer>
            <span>{companyName}</span>
            <span>ออกแบบเพื่อทุกวันของงานก่อสร้าง</span>
          </footer>
        </main>
      </div>
      {modal && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="section-heading">
              <div>
                <span className="eyebrow">WORKSPACE RECORD</span>
                <h2 id="modal-title">
                  {editing ? 'แก้ไข' : 'เพิ่ม'}
                  {modal === 'project' ? 'โครงการ' : modal === 'master' ? labels[kind] : 'เที่ยวรถ'}
                </h2>
              </div>
              <button aria-label="ปิดฟอร์ม" onClick={() => setModal(null)}>
                <X />
              </button>
            </div>
            <form onSubmit={submit}>
              {editing && canManage && (
                <div>
                  <button type="button" onClick={() => setConfirmDelete(true)}>
                    ลบรายการโดยเก็บประวัติ
                  </button>
                  {confirmDelete && (
                    <div>
                      <p>รายการจะถูกซ่อนจากการใช้งาน โดยเก็บข้อมูลและประวัติไว้</p>
                      <button type="button" onClick={() => void remove()}>
                        ยืนยันลบรายการ
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(false)}>
                        ยกเลิกการลบ
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="form-grid">
                {modal === 'project' ? (
                  <>
                    {input('name', 'ชื่อโครงการ', 'text', true)}
                    {input('customer', 'ชื่อลูกค้า')}
                    {input('location', 'สถานที่')}
                    <Field label="พิกัด (Lat, Lng)">
                      <input
                        name="coordinates"
                        aria-label="พิกัด (Lat, Lng)"
                        type="text"
                        placeholder="เช่น 13.7563, 100.5018"
                        defaultValue={
                          editing &&
                          'latitude' in editing &&
                          editing.latitude !== undefined &&
                          editing.longitude !== undefined
                            ? `${editing.latitude}, ${editing.longitude}`
                            : ''
                        }
                      />
                      <small>ละติจูด, ลองจิจูด คั่นด้วยเครื่องหมาย ,</small>
                    </Field>
                    {input('startDate', 'วันเริ่มต้น', 'date')}
                    {input('endDate', 'วันสิ้นสุด', 'date')}
                    <Field label="สถานะ">
                      <SearchableSelect
                        name="status"
                        aria-label="สถานะโครงการ"
                        defaultValue={editing && 'status' in editing ? editing.status : 'active'}
                      >
                        {Object.entries(statusText).map(([key, title]) => (
                          <option key={key} value={key}>
                            {title}
                          </option>
                        ))}
                      </SearchableSelect>
                    </Field>
                    {input('description', 'รายละเอียด')}
                  </>
                ) : modal === 'master' ? (
                  <>
                    {input(
                      'name',
                      kind === 'truck'
                        ? 'ทะเบียนรถ'
                        : kind === 'soilType'
                          ? 'ชื่อชนิดดิน'
                          : kind === 'tag'
                            ? 'ชื่อแท็ก / ทีม'
                            : 'ชื่อ',
                      'text',
                      true,
                    )}
                    {input(
                      'detail',
                      kind === 'driver' ? 'เบอร์โทร / รถที่รับผิดชอบ' : 'รายละเอียด',
                    )}
                    {kind === 'truck' && input('capacity', 'ความจุ (m³)', 'number')}
                    {kind === 'driver' && (
                      <>
                        {input('phone', 'เบอร์โทร', 'tel')}
                        {input('nickname', 'ชื่อเล่น')}
                        <p>
                          รถประจำ:{' '}
                          {data.masters.find(
                            (truck) => truck.kind === 'truck' && truck.driverId === editing?.id,
                          )?.name ?? 'ยังไม่ผูกกับรถ'}{' '}
                          · ผูกหรือยกเลิกได้จากการแก้ไขรถบรรทุก
                        </p>
                      </>
                    )}
                    {kind === 'truck' && (
                      <>
                        {input('province', 'จังหวัดทะเบียน')}
                        {input('phone', 'เบอร์โทร', 'tel')}
                        {input('nickname', 'ชื่อเล่น')}
                        <Field label="คนขับประจำรถ">
                          <SearchableSelect
                            name="driverId"
                            aria-label="คนขับประจำรถ"
                            defaultValue={
                              editing && 'kind' in editing ? (editing.driverId ?? '') : ''
                            }
                          >
                            <option value="">ยังไม่ผูกคนขับ / เพิ่มคนขับใหม่ด้านล่าง</option>
                            {data.masters
                              .filter(
                                (item) =>
                                  item.kind === 'driver' &&
                                  (item.active ||
                                    (editing && 'kind' in editing && editing.driverId === item.id)),
                              )
                              .map((driver) => {
                                const assigned = data.masters.find(
                                  (truck) =>
                                    truck.kind === 'truck' &&
                                    truck.id !== editing?.id &&
                                    truck.driverId === driver.id,
                                );
                                return (
                                  <option
                                    key={driver.id}
                                    value={driver.id}
                                    disabled={Boolean(assigned)}
                                    data-search={[
                                      driver.nickname,
                                      driver.phone,
                                      driver.detail,
                                    ].join(' ')}
                                  >
                                    {driver.name}
                                    {assigned
                                      ? ` (รถ ${assigned.name} · ต้องยกเลิกการผูกเดิมก่อน)`
                                      : ''}
                                    {driver.active ? '' : ' (ปิดใช้งาน)'}
                                  </option>
                                );
                              })}
                          </SearchableSelect>
                        </Field>
                        <Field label="ชื่อคนขับใหม่ (ถ้ายังไม่มีรายชื่อ)">
                          <input
                            name="newDriverName"
                            aria-label="ชื่อคนขับใหม่ (ถ้ายังไม่มีรายชื่อ)"
                            maxLength={200}
                          />
                          <small>
                            เลือกคนขับเดิมหรือกรอกชื่อใหม่อย่างใดอย่างหนึ่ง
                            ชื่อใหม่จะใช้ชื่อเล่นและเบอร์โทรที่กรอกในรถนี้เป็นข้อมูลเริ่มต้น
                            บันทึกพร้อมรถในครั้งเดียว
                          </small>
                        </Field>
                        <Field label="ประเภทรถ">
                          <SearchableSelect
                            name="truckType"
                            aria-label="ประเภทรถ"
                            defaultValue={
                              editing && 'kind' in editing ? (editing.truckType ?? '') : ''
                            }
                          >
                            <option value="">ไม่ระบุ</option>
                            {Object.entries(truckTypes).map(([id, title]) => (
                              <option value={id} key={id}>
                                {title}
                              </option>
                            ))}
                          </SearchableSelect>
                        </Field>
                      </>
                    )}
                    {kind !== 'tag' && (
                      <TagFields
                        masters={data.masters}
                        record={editing && 'kind' in editing ? editing : null}
                      />
                    )}
                    <Field label="สถานะ">
                      <SearchableSelect
                        name="active"
                        defaultValue={
                          editing && 'active' in editing ? String(editing.active) : 'true'
                        }
                      >
                        <option value="true">ใช้งาน</option>
                        <option value="false">ปิดใช้งาน</option>
                      </SearchableSelect>
                    </Field>
                  </>
                ) : (
                  <>
                    <ProjectPicker
                      projects={data.projects}
                      value={tripProject}
                      onChange={setTripProject}
                      onManage={() => {
                        setModal(null);
                        navigate('projects');
                        if (!data.projects.length) open('project');
                      }}
                    />
                    {(['truck', 'driver', 'source'] as const).map((type) => (
                      <Field key={type} label={labels[type] + (type === 'truck' ? ' *' : '')}>
                        <SearchableSelect
                          aria-label={labels[type] + (type === 'truck' ? ' *' : '')}
                          name={type + 'Id'}
                          required={type === 'truck'}
                          value={
                            type === 'truck'
                              ? tripTruck
                              : type === 'driver'
                                ? tripDriver
                                : tripSource
                          }
                          onChange={(event) => {
                            const id = event.target.value;
                            if (type === 'truck') {
                              setTripTruck(id);
                              setTripDriver(assignedDriver(data.masters, id));
                            }
                            if (type === 'driver') {
                              setTripDriver(id);
                              const truck = data.masters.find(
                                (item) =>
                                  item.kind === 'truck' &&
                                  item.active &&
                                  item.driverId === id &&
                                  id,
                              );
                              if (truck) setTripTruck(truck.id);
                            }
                            if (type === 'source') setTripSource(id);
                          }}
                        >
                          <option value="">เลือก{labels[type]}</option>
                          {data.masters
                            .filter((m) => m.kind === type && m.active)
                            .map((m) => (
                              <option
                                key={m.id}
                                value={m.id}
                                data-search={[
                                  m.nickname,
                                  m.phone,
                                  m.province,
                                  m.detail,
                                  m.kind === 'driver'
                                    ? data.masters.find((truck) => truck.driverId === m.id)?.name
                                    : masterName(m.driverId ?? ''),
                                ].join(' ')}
                              >
                                {m.name}
                              </option>
                            ))}
                        </SearchableSelect>
                        {!data.masters.some((m) => m.kind === type && m.active) && (
                          <small>
                            {data.masters.some((m) => m.kind === type)
                              ? `ข้อมูล${labels[type]}ถูกปิดใช้งาน เปิดใช้งานที่หน้าข้อมูลพื้นฐานก่อนเลือก`
                              : `ยังไม่มี${labels[type]}ในบัญชีและที่อยู่เว็บนี้ เพิ่มที่หน้าข้อมูลพื้นฐาน`}
                          </small>
                        )}
                      </Field>
                    ))}
                    {input('date', 'วันที่ทำงาน', 'date', true)}
                    <Field label="เวลา *">
                      <input
                        name="time"
                        type="time"
                        required
                        defaultValue={
                          editing && 'time' in editing
                            ? editing.time
                            : new Intl.DateTimeFormat('en-GB', {
                                timeZone: 'Asia/Bangkok',
                                hour: '2-digit',
                                minute: '2-digit',
                              }).format(new Date())
                        }
                      />
                    </Field>
                    <SoilTypePicker
                      masters={data.masters}
                      value={tripSoilType}
                      onChange={setTripSoilType}
                      sourceId={tripSource}
                      previousValue={
                        editing && 'soilType' in editing ? editing.soilType : undefined
                      }
                    />
                    {input('notes', 'หมายเหตุ')}
                  </>
                )}
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <span>บันทึกลงอุปกรณ์ก่อนซิงก์</span>
                <button type="button" className="secondary" onClick={() => setModal(null)}>
                  ยกเลิก
                </button>
                <button className="primary" type="submit">
                  <Check size={17} />
                  บันทึกข้อมูล
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function Empty({ text, action }: { text: string; action: () => void }) {
  return (
    <div className="empty">
      <Truck size={34} />
      <h3>{text}</h3>
      <p>เพิ่มข้อมูลเพื่อเริ่มต้นใช้งาน</p>
      <button className="secondary" onClick={action}>
        <Plus size={16} /> เพิ่มรายการ
      </button>
    </div>
  );
}
function Calculation() {
  const [result, setResult] = useState(''),
    [error, setError] = useState('');
  function calculate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget),
      n = (key: string) => Number(form.get(key));
    try {
      if (form.get('mode') === 'level') {
        const r = survey(n('bm'), n('bs'), n('reading'), n('target'));
        setResult(
          `HI ${number(r.hi)} m · RL ${number(r.rl)} m · ถม ${number(r.fill)} m · ตัด ${number(r.cut)} m`,
        );
      } else {
        const r = volume(n('area'), n('height'), n('factor'), n('settlement'), n('capacity'));
        setResult(
          `ดินบดอัด ${number(r.compacted)} m³ · เผื่อทรุดตัว ${number(r.allowance)} m³ · ดินหลวม ${number(r.loose)} m³ · ประมาณ ${number(r.trips)} เที่ยว`,
        );
      }
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="settings-grid">
        {['level', 'volume'].map((mode) => (
          <form className="panel padded" key={mode} onSubmit={calculate}>
            <h2>{mode === 'level' ? 'คำนวณระดับดิน' : 'ประมาณปริมาตรดินถม'}</h2>
            <p>
              {mode === 'level'
                ? 'จุดตั้งกล้องเดียว · อ้างอิง Datum เดียวกัน'
                : 'กรณีพื้นที่และความสูงถมสม่ำเสมอ'}
            </p>
            <input type="hidden" name="mode" value={mode} />
            {(mode === 'level'
              ? [
                  ['bm', 'Benchmark RL (m)'],
                  ['bs', 'Backsight (m)'],
                  ['reading', 'Staff reading (m)'],
                  ['target', 'Target RL (m)'],
                ]
              : [
                  ['area', 'พื้นที่ (m²)'],
                  ['height', 'ความสูงถม (m)'],
                  ['factor', 'ตัวคูณดินหลวม / ดินบดอัด'],
                  ['settlement', 'เผื่อทรุดตัว (%)'],
                  ['capacity', 'ความจุรถ (m³/เที่ยว)'],
                ]
            ).map(([key, label]) => (
              <Field label={label} key={key}>
                <input name={key} type="number" step="any" required />
              </Field>
            ))}
            {mode === 'volume' && (
              <Field label="ที่มาของสมมติฐาน">
                <input
                  name="assumptions"
                  required
                  placeholder="เช่น ผลทดสอบดิน / ข้อมูลผู้รับเหมา"
                />
              </Field>
            )}
            <button className="primary" type="submit">
              คำนวณ
            </button>
          </form>
        ))}
      </div>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {result && (
        <div role="status" className="result">
          {result}
          <p>ผลคำนวณชั่วคราว ยังไม่บันทึกเป็นรายงานสำรวจ</p>
        </div>
      )}
    </>
  );
}
