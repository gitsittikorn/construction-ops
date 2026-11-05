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
import { configured, observeAuth, login, logout, syncTrip } from './firebase';
import { companyName, companyLogo } from './branding';
import LoginPage from './LoginPage';
import DrivePanel from './DrivePanel';
import ProjectPicker from './ProjectPicker';
import SoilTypePicker from './SoilTypePicker';
import ProjectCoordinates from './ProjectCoordinates';
import { clearDriveSessions, clearDriveSessionsExcept } from './driveSession';
import { saveMaster, matchesMaster, tagNames, truckTypes } from './masterData';
import TagFields from './TagFields';
import TruckExcelPanel from './TruckExcelPanel';
const pages = [
  ['overview', 'ภาพรวม', LayoutDashboard],
  ['projects', 'โครงการ', FolderOpen],
  ['trips', 'บันทึกเที่ยวรถ', Truck],
  ['masters', 'ข้อมูลพื้นฐาน', Database],
  ['reports', 'รายงาน', BarChart3],
  ['survey', 'สำรวจและคำนวณ', Calculator],
  ['settings', 'การตั้งค่า', Settings],
] as const;
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
export default function App() {
  const [data, setData] = useState<Data>(emptyData),
    [page, setPage] = useState('overview'),
    [owner, setOwner] = useState(configured ? '' : 'local'),
    [ready, setReady] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState(''),
    [date, setDate] = useState(workDate()),
    [modal, setModal] = useState<'project' | 'master' | 'trip' | null>(null),
    [editing, setEditing] = useState<Project | Master | Trip | null>(null),
    [busy, setBusy] = useState(false),
    [kind, setKind] = useState<Master['kind']>('truck');
  const [tripProject, setTripProject] = useState('');
  const [tripSoilType, setTripSoilType] = useState('');
  const [masterTagFilter, setMasterTagFilter] = useState('');
  const [truckTypeFilter, setTruckTypeFilter] = useState('');
  const current = useRef(data),
    writeLock = useRef(false),
    syncLock = useRef(false),
    account = useRef(owner),
    loadEpoch = useRef(0);
  current.current = data;
  useEffect(
    () =>
      observeAuth((user) => {
        const nextOwner = user?.uid ?? '';
        if (nextOwner) clearDriveSessionsExcept(nextOwner);
        else clearDriveSessions();
        if (nextOwner === account.current) return;
        account.current = nextOwner;
        loadEpoch.current++;
        setOwner(nextOwner);
        setReady(false);
        setData(emptyData);
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
          .catch((e) => setError(message(e)));
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
      const next = await updateData(owner, make);
      loadEpoch.current++;
      current.current = next;
      setData(next);
    } finally {
      writeLock.current = false;
    }
  }
  async function sync() {
    if (syncLock.current || !ready || !configured || !online || !owner) return;
    syncLock.current = true;
    setBusy(true);
    try {
      for (const trip of current.current.trips.filter((t) => t.syncStatus !== 'synced')) {
        await syncTrip(owner, trip);
        await change((old) => ({
          ...old,
          trips: old.trips.map((t) =>
            t.id === trip.id && t.revision === trip.revision ? { ...t, syncStatus: 'synced' } : t,
          ),
        }));
      }
      setNotice('ซิงก์เที่ยวรถสำเร็จ');
    } catch (e) {
      setError(message(e));
    } finally {
      syncLock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (online && ready && configured) void sync();
  }, [online, ready, owner]);
  function message(e: unknown) {
    return e instanceof Error ? e.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่';
  }
  function open(type: typeof modal, record: typeof editing = null) {
    if (type === 'trip') setTripSoilType(record && 'soilType' in record ? record.soilType : '');
    if (type === 'trip')
      setTripProject(record && 'projectId' in record ? record.projectId : (active[0]?.id ?? ''));
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
              actor: owner,
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
                truckType: (get('truckType') || undefined) as Master['truckType'],
              }
            : {}),
        };
        await change((old) => saveMaster(old, record, owner));
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
      setModal(null);
      setNotice('บันทึกในเครื่องเรียบร้อย');
    } catch (e) {
      setError(message(e));
    }
  }
  const todayTrips = data.trips.filter((t) => t.date === workDate()),
    pending = data.trips.filter((t) => t.syncStatus !== 'synced').length,
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
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="company-logo" src={companyLogo} alt={companyName} />
        </div>
        <span className="nav-caption">พื้นที่ทำงาน</span>
        <nav>
          {pages.map(([id, title, Icon]) => (
            <button
              key={id}
              className={page === id ? 'selected' : ''}
              onClick={() => {
                setPage(id);
                setQuery('');
              }}
            >
              <Icon size={19} />
              {title}
              {id === 'trips' && pending > 0 && <span className="nav-count">{pending}</span>}
            </button>
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
              <b>เจ้าของกิจการ</b>
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
        <header>
          <div>
            <span className="breadcrumb">พื้นที่ทำงาน</span>
            <span className="slash">/</span>
            <b>{pages.find((p) => p[0] === page)?.[1]}</b>
          </div>
          <div className="header-right">
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
        <main>
          <div className="page-title">
            <div>
              <span className="eyebrow">CONSTRUCTION WORKSPACE</span>
              <h1>
                {page === 'overview' ? 'ภาพรวมการทำงาน' : pages.find((p) => p[0] === page)?.[1]}
              </h1>
              <p>
                {page === 'overview'
                  ? 'ทุกความคืบหน้าหน้างาน ในพื้นที่เดียว'
                  : 'จัดการข้อมูลอย่างเป็นระบบ พร้อมสำหรับการทำงานหน้างาน'}
              </p>
            </div>
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
          </div>
          {!configured && (
            <div className="local-banner">
              <span>
                <span className="live-dot amber" /> โหมดในเครื่อง · ข้อมูลบันทึกในอุปกรณ์นี้
                ยังไม่ได้เชื่อมต่อ Firebase
              </span>
              <button onClick={() => setPage('settings')}>
                ตั้งค่าการเชื่อมต่อ <ArrowUpRight size={14} />
              </button>
            </div>
          )}
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
              {page === 'overview' && (
                <>
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
                        ['เที่ยวรถวันนี้', todayTrips.length, 'เที่ยว', Truck],
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
                  <div className="dashboard-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <div>
                          <h2>โครงการที่กำลังดำเนินการ</h2>
                          <p>ติดตามงานที่คุณดูแล</p>
                        </div>
                        <button className="text-button" onClick={() => setPage('projects')}>
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
                            <span className="badge">
                              {data.trips.filter((t) => t.projectId === p.id).length} เที่ยว
                            </span>
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
                        <button key={String(title)} onClick={() => setPage(String(target))}>
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
                            <b>{data.trips.filter((t) => t.projectId === p.id).length} เที่ยวรถ</b>
                            <button className="text-button" onClick={() => open('project', p)}>
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
                  <div className="tabs">
                    {Object.entries(labels).map(([id, title]) => (
                      <button
                        className={kind === id ? 'active' : ''}
                        key={id}
                        onClick={() => {
                          setKind(id as Master['kind']);
                          setQuery('');
                        }}
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                  <div className="toolbar wrap">
                    <Search size={17} />
                    <input
                      aria-label="ค้นหาข้อมูลพื้นฐาน"
                      placeholder="ค้นหาทะเบียน จังหวัด เบอร์โทร หรือแท็ก"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    {kind !== 'tag' && (
                      <select
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
                      </select>
                    )}
                    {kind === 'truck' && (
                      <select
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
                      </select>
                    )}
                  </div>
                  {kind === 'truck' && (
                    <TruckExcelPanel
                      data={data}
                      visibleTrucks={visibleMasters}
                      actor={owner}
                      onChange={change}
                    />
                  )}
                  <div className="panel list">
                    {visibleMasters.map((m) => (
                      <button className="project-row" key={m.id} onClick={() => open('master', m)}>
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
                            {m.truckType ? ` · ${truckTypes[m.truckType]}` : ''}
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
                </>
              )}
              {(page === 'trips' || page === 'reports') && (
                <>
                  {page === 'reports' && (
                    <div className="report-meta">
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
                  )}
                  <div className="toolbar wrap">
                    <Search size={17} />
                    <input
                      placeholder="ค้นหาทะเบียนรถ / หมายเหตุ"
                      aria-label="ค้นหาเที่ยวรถ"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <input
                      aria-label="วันที่รายงาน"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                    <select
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
                    </select>
                    {page === 'reports' && (
                      <>
                        <button className="secondary" onClick={exportCSV}>
                          <Download size={16} /> CSV
                        </button>
                        <button className="secondary" onClick={() => window.print()}>
                          พิมพ์ / PDF
                        </button>
                      </>
                    )}
                  </div>
                  <div className="panel">
                    <div className="section-heading">
                      <h2>
                        {page === 'reports' ? 'รายงานเที่ยวรถ' : 'รายการเที่ยวรถ'}{' '}
                        <span className="badge">{tripRows.length} เที่ยว</span>
                      </h2>
                      <button
                        className="text-button"
                        disabled={busy || !configured || !online}
                        onClick={() => void sync()}
                      >
                        <RefreshCw size={15} />
                        {busy ? 'กำลังซิงก์…' : 'ซิงก์รายการ'}
                      </button>
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
                    <h2>การเชื่อมต่อและข้อมูล</h2>
                    <p>
                      Firebase:{' '}
                      <span className="badge">
                        {configured ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ตั้งค่า'}
                      </span>
                    </p>
                    <p>Google Drive: จัดการการเชื่อมต่อและคิวเอกสารด้านล่าง</p>
                    <p>
                      โครงการและข้อมูลพื้นฐานเก็บใน IndexedDB เท่านั้น
                      รุ่นนี้ซิงก์เฉพาะเที่ยวรถเมื่อเข้าสู่ระบบแล้ว
                    </p>
                    <p>
                      กำหนดค่าในไฟล์ .env.local ตาม .env.example และเผยแพร่ Firestore Rules
                      ก่อนใช้งานระบบคลาวด์
                    </p>
                    <p>
                      ข้อมูลในเครื่องอาจสูญหายเมื่อผู้ใช้ล้างข้อมูลเว็บไซต์ ควรส่งออก CSV สม่ำเสมอ
                    </p>
                    <button
                      className="secondary"
                      onClick={() => {
                        setPage('reports');
                        setDate('');
                      }}
                    >
                      <Download size={16} /> เปิดรายงานเพื่อส่งออกข้อมูล
                    </button>
                  </section>
                  <DrivePanel
                    key={owner}
                    owner={owner}
                    projects={data.projects}
                    trips={data.trips}
                    online={online}
                  />
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
                      <select
                        name="status"
                        defaultValue={editing && 'status' in editing ? editing.status : 'active'}
                      >
                        {Object.entries(statusText).map(([key, title]) => (
                          <option key={key} value={key}>
                            {title}
                          </option>
                        ))}
                      </select>
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
                    {kind === 'truck' && (
                      <>
                        {input('province', 'จังหวัดทะเบียน')}
                        {input('phone', 'เบอร์โทร', 'tel')}
                        <Field label="ประเภทรถ">
                          <select
                            name="truckType"
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
                          </select>
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
                      <select
                        name="active"
                        defaultValue={
                          editing && 'active' in editing ? String(editing.active) : 'true'
                        }
                      >
                        <option value="true">ใช้งาน</option>
                        <option value="false">ปิดใช้งาน</option>
                      </select>
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
                        setPage('projects');
                        if (!data.projects.length) open('project');
                      }}
                    />
                    {(['truck', 'driver', 'source'] as const).map((type) => (
                      <Field key={type} label={labels[type] + (type === 'truck' ? ' *' : '')}>
                        <select
                          aria-label={labels[type] + (type === 'truck' ? ' *' : '')}
                          name={type + 'Id'}
                          required={type === 'truck'}
                          defaultValue={
                            editing
                              ? String(
                                  (editing as unknown as Record<string, unknown>)[type + 'Id'] ??
                                    '',
                                )
                              : ''
                          }
                        >
                          <option value="">เลือก{labels[type]}</option>
                          {data.masters
                            .filter((m) => m.kind === type && m.active)
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                        </select>
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
