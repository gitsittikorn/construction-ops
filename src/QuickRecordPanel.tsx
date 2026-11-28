import { memo, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  BulkActionToolbar,
  BulkDeleteDialog,
  BulkResultNotice,
  SelectBox,
  useBulkOutcome,
} from './BulkSelect';
import ConfirmDialog from './ConfirmDialog';
import SearchableSelect from './SearchableSelect';
import { connectionMessage } from './async';
import { correctDailyTrip } from './daily';
import { workDate } from './domain';
import {
  daySummary,
  dayTrips,
  findSession,
  nextTripDefaults,
  noTeam,
  recordTrip,
  removeTrips,
  summaryGroups,
  truckCards,
  type DayTrip,
  type SummaryGroup,
} from './quickRecord';
import { useBulkSelection } from './useBulkSelection';
import { useDailyUi } from './useDailyUi';
import { managesBusiness } from './workspaceIdentity';
import type { Data, Master } from './models';

type Override = Partial<{ driverId: string; sourceId: string; soilType: string }>;
const time = (value: string) =>
  new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
// A second tap on the same truck inside this window is treated as an accidental repeat.
const repeatWindow = 700;
const chipLimit = 8;

const VehicleCard = memo(function VehicleCard({
  id,
  plate,
  province,
  driver,
  type,
  teams,
  trips,
  disabled,
  saving,
  onRecord,
  onMore,
}: {
  id: string;
  plate: string;
  province: string;
  driver: string;
  type: string;
  teams: string;
  trips: number;
  disabled: boolean;
  saving: boolean;
  onRecord: (truckId: string) => void;
  onMore: (truckId: string) => void;
}) {
  return (
    <article className="vehicle-card" aria-label={`รถ ${plate}`}>
      <p className="vehicle-meta">
        <span>{type || 'ไม่ระบุประเภท'}</span>
        {teams && <span className="badge">{teams}</span>}
      </p>
      <h3>
        {plate} <small>{province}</small>
      </h3>
      <p>{driver || 'ยังไม่ระบุคนขับ'}</p>
      <p className="vehicle-count">
        <b>{trips}</b> เที่ยว
      </p>
      <button
        type="button"
        className="record-button"
        aria-label={`บันทึก 1 เที่ยว ${plate}`}
        disabled={disabled || saving}
        onClick={() => onRecord(id)}
      >
        {saving ? 'กำลังบันทึก…' : '+ บันทึก 1 เที่ยว'}
      </button>
      <button
        type="button"
        className="secondary"
        aria-label={`รายละเอียด ${plate}`}
        onClick={() => onMore(id)}
      >
        ประวัติ / เปลี่ยนค่า
      </button>
    </article>
  );
});

function Options({ masters, kind }: { masters: Master[]; kind: Master['kind'] }) {
  return (
    <>
      <option value="">ไม่ระบุ</option>
      {masters
        .filter((item) => item.kind === kind && item.active)
        .map((item) => (
          <option key={item.id} value={kind === 'soilType' ? item.name : item.id}>
            {item.name}
          </option>
        ))}
    </>
  );
}

export default function QuickRecordPanel({
  owner,
  data,
  defaultProject = '',
  online,
  onChange,
  onReconcile,
  onSetup,
}: {
  owner: string;
  data: Data;
  defaultProject?: string;
  online: boolean;
  onChange: (change: (data: Data) => Data) => Promise<void>;
  onReconcile: () => void;
  onSetup: (page: 'projects' | 'masters') => void;
}) {
  const active = data.projects.filter((item) => item.status === 'active');
  const ui = useDailyUi(owner, defaultProject || active[0]?.id || '');
  const project =
    active.find((item) => item.id === ui.state.project)?.id ??
    active.find((item) => item.id === defaultProject)?.id ??
    active[0]?.id ??
    '';
  // "auto" means the user never picked a date, so midnight must not be crossed silently.
  const [day, setDay] = useState({ date: workDate(), auto: true });
  const [query, setQuery] = useState(''),
    [team, setTeam] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [reason, setReason] = useState(''),
    [saving, setSaving] = useState<string[]>([]),
    [overrides, setOverrides] = useState<Record<string, Override>>({}),
    [capacities, setCapacities] = useState<Record<string, number>>({}),
    [last, setLast] = useState<{ tripId: string; rowId: string; label: string } | null>(null),
    [openTruck, setOpenTruck] = useState(''),
    [editTrip, setEditTrip] = useState<DayTrip | null>(null),
    [removing, setRemoving] = useState<DayTrip | null>(null),
    [removeReason, setRemoveReason] = useState(''),
    [allTrips, setAllTrips] = useState(false),
    [group, setGroup] = useState<SummaryGroup>('truck'),
    [bulkOpen, setBulkOpen] = useState(false),
    [midnight, setMidnight] = useState(false);
  const canDelete = managesBusiness(owner);
  const date = day.date;
  const session = findSession(data, project, date);
  const state = session?.body.state;
  const cards = truckCards(data, session, query, team);
  const rows = session?.body.rows ?? [];
  const total = rows.reduce((sum, row) => sum + row.tripCount, 0);
  const shown = new Set(cards.map((card) => card.truck.id));
  const filtered = rows
    .filter((row) => shown.has(row.truckId))
    .reduce((sum, row) => sum + row.tripCount, 0);
  const legacy = data.trips.filter((t) => t.projectId === project && t.date === date).length;
  const trips = dayTrips(session);
  const visibleTrips = allTrips ? trips : trips.slice(0, 8);
  const scope = [owner, project, date].join('|');
  const selection = useBulkSelection(
    visibleTrips.map((trip) => trip.key),
    `${scope}|${allTrips}`,
  );
  const bulkResult = useBulkOutcome(scope);
  const name = (id: string) => data.masters.find((item) => item.id === id)?.name ?? '';
  const teams = data.masters.filter(
    (item) =>
      item.kind === 'tag' &&
      (item.active ||
        data.masters.some((other) => other.kind === 'truck' && other.tagIds?.includes(item.id))),
  );
  const context = {
    sourceId: ui.state.sourceId ?? '',
    soilType: ui.state.soilType ?? '',
  };
  const entry = session && data.sync?.entries[`workspaces/${session.id}`];
  const syncText = !online
    ? 'ออฟไลน์ — ยังบันทึกได้'
    : !session
      ? 'ยังไม่มีรายการของวันนี้'
      : entry?.status === 'synced'
        ? 'ซิงก์แล้ว'
        : entry?.status === 'conflict'
          ? 'ข้อมูลขัดแย้ง กรุณาตรวจสอบ'
          : entry?.error
            ? 'ซิงก์ไม่สำเร็จ ข้อมูลอยู่ในเครื่อง'
            : 'บันทึกในเครื่องแล้ว · รอซิงก์';

  // Writes run one after another so quick taps on different trucks are never rejected.
  const queue = useRef(Promise.resolve());
  const tapped = useRef(new Map<string, number>());
  function enqueue(work: () => Promise<void>) {
    queue.current = queue.current.then(async () => {
      try {
        await work();
      } catch (e) {
        setMessage('');
        setError(connectionMessage(e));
      }
    });
  }
  function record(truckId: string) {
    setError('');
    if (day.auto && workDate() !== date) {
      setMidnight(true);
      return;
    }
    const plate = name(truckId);
    const now = Date.now();
    if (now - (tapped.current.get(truckId) ?? 0) < repeatWindow) {
      setMessage(`กด ${plate} ซ้ำเร็วเกินไป ยังไม่ได้เพิ่มเที่ยว หากเป็นเที่ยวใหม่ให้กดอีกครั้ง`);
      return;
    }
    const defaults = nextTripDefaults(data, session, truckId, context, overrides[truckId]);
    const capacity = defaults.capacity ?? capacities[truckId];
    if (!capacity) {
      setOpenTruck(truckId);
      return;
    }
    tapped.current.set(truckId, now);
    const tripId = crypto.randomUUID();
    setSaving((list) => [...list, truckId]);
    enqueue(async () => {
      let rowId = '',
        driver = '';
      try {
        await onChange((old) => {
          const values = nextTripDefaults(
            old,
            findSession(old, project, date),
            truckId,
            context,
            overrides[truckId],
          );
          const next = recordTrip(
            old,
            {
              projectId: project,
              date,
              truckId,
              tripId,
              driverId: values.driverId,
              sourceId: values.sourceId,
              soilType: values.soilType,
              capacity,
              reason,
            },
            owner,
          );
          rowId = findSession(next, project, date)!.body.rows.find(
            (row) => row.truckId === truckId,
          )!.id;
          driver = old.masters.find((item) => item.id === values.driverId)?.name ?? '';
          return next;
        });
        const label = [plate, driver].filter(Boolean).join(' — ');
        setLast({ tripId, rowId, label });
        setMessage(`บันทึก ${label} แล้ว 1 เที่ยว`);
      } finally {
        setSaving((list) => list.filter((id) => id !== truckId));
      }
    });
  }
  // Cards are memoised, so they call through a ref that always sees the current render.
  const handlers = useRef({ record, open: setOpenTruck });
  useEffect(() => {
    handlers.current = { record, open: setOpenTruck };
  });
  const [stable] = useState(() => ({
    record: (id: string) => handlers.current.record(id),
    open: (id: string) => handlers.current.open(id),
  }));

  function undo() {
    if (!last) return;
    const target = last;
    setLast(null);
    // Recording again straight after an undo is deliberate.
    tapped.current.clear();
    enqueue(async () => {
      let failure = '';
      await onChange((old) => {
        const result = removeTrips(
          old,
          project,
          date,
          [{ id: target.tripId, rowId: target.rowId, label: target.label }],
          owner,
          'เลิกทำการบันทึกล่าสุด',
        );
        failure = result.failed[0]?.reason ?? '';
        return result.data;
      });
      if (failure) throw Error(failure);
      setMessage(`เลิกทำ ${target.label} แล้ว`);
    });
  }
  const tripLabel = (trip: DayTrip) => `${name(trip.truckId)} เที่ยวที่ ${trip.sequence}`;
  const card = openTruck ? data.masters.find((item) => item.id === openTruck) : undefined;

  if (!ui.ready) return <p role="status">{ui.error || 'กำลังเปิดหน้าบันทึกเที่ยว…'}</p>;
  if (!active.length || !data.masters.some((item) => item.kind === 'truck'))
    return (
      <div className="panel padded">
        <h2>เตรียมข้อมูลก่อนบันทึกเที่ยว</h2>
        <p>ต้องมีโครงการที่กำลังดำเนินการ และรถอย่างน้อย 1 คัน</p>
        <div className="drive-actions">
          {!active.length && (
            <button className="primary" onClick={() => onSetup('projects')}>
              เพิ่มหรือเปิดโครงการ
            </button>
          )}
          <button className="secondary" onClick={() => onSetup('masters')}>
            เพิ่มรถและคนขับ
          </button>
        </div>
      </div>
    );
  return (
    <section aria-label="บันทึกเที่ยวดิน" className="content-stack quick-record">
      <div className="operations-filters">
        <label>
          โครงการที่กำลังทำงาน
          <SearchableSelect
            aria-label="โครงการที่กำลังทำงาน"
            value={project}
            onChange={(event) => {
              ui.update((s) => ({ ...s, project: event.target.value }));
              setOverrides({});
              setLast(null);
              setMessage('');
            }}
          >
            {active.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SearchableSelect>
        </label>
        <label>
          วันที่บันทึก
          <input
            type="date"
            aria-label="วันที่บันทึก"
            value={date}
            onChange={(event) => {
              if (!event.target.value) return;
              setDay({ date: event.target.value, auto: false });
              setOverrides({});
              setMidnight(false);
              setLast(null);
              setMessage('');
            }}
          />
        </label>
        <label>
          แหล่งดินเริ่มต้น
          <SearchableSelect
            aria-label="แหล่งดินเริ่มต้น"
            value={context.sourceId}
            onChange={(event) => ui.update((s) => ({ ...s, sourceId: event.target.value }))}
          >
            <Options masters={data.masters} kind="source" />
          </SearchableSelect>
        </label>
        <label>
          ชนิดดินเริ่มต้น
          <SearchableSelect
            aria-label="ชนิดดินเริ่มต้น"
            value={context.soilType}
            onChange={(event) => ui.update((s) => ({ ...s, soilType: event.target.value }))}
          >
            <Options masters={data.masters} kind="soilType" />
          </SearchableSelect>
        </label>
      </div>
      {midnight && (
        <div className="alert error" role="alert">
          ข้ามวันแล้ว ยังไม่ได้บันทึกเที่ยว กรุณาเลือกวันที่
          <button
            className="primary"
            onClick={() => {
              setDay({ date: workDate(), auto: true });
              setMidnight(false);
              setLast(null);
            }}
          >
            ใช้วันนี้
          </button>
          <button
            className="secondary"
            onClick={() => {
              setDay({ date, auto: false });
              setMidnight(false);
            }}
          >
            บันทึกวันที่ {date} ต่อ
          </button>
        </div>
      )}
      <div className="quick-summary" aria-label="ยอดของวันที่เลือก">
        <div className="quick-total">
          <span>เที่ยวทั้งหมด</span>
          <strong aria-label="เที่ยวทั้งหมดของวัน">{total}</strong>
        </div>
        <div className="quick-total">
          <span>รถที่มีเที่ยว</span>
          <strong aria-label="รถที่มีเที่ยว">{rows.filter((row) => row.tripCount).length}</strong>
        </div>
        <div className="quick-total">
          <span>เที่ยวตามตัวกรอง</span>
          <strong aria-label="เที่ยวตามตัวกรอง">{filtered}</strong>
        </div>
        <div className="quick-total">
          <span>สถานะ</span>
          <small role="status">{syncText}</small>
        </div>
      </div>
      {legacy > 0 && (
        <p role="note">
          มีเที่ยวแบบบันทึกรายรายการเดิมของวันนี้อีก {legacy} เที่ยว (นับแยก ดูที่ “ประวัติแบบเดิม”)
        </p>
      )}
      {state === 'closed' && (
        <p className="alert" role="note">
          ปิดวันแล้ว บันทึกเพิ่มไม่ได้จนกว่าจะเปิดวันใหม่ที่หน้าตรวจยอดและปิดวัน
        </p>
      )}
      {state === 'reopened' && (
        <label className="field">
          <span>เหตุผลที่แก้ไขวันที่เปิดใหม่ (จำเป็น)</span>
          <input value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
      )}
      <div className="quick-filters">
        <input
          type="search"
          aria-label="ค้นหารถหรือคนขับ"
          placeholder="ค้นหาทะเบียน จังหวัด ชื่อคนขับ ชื่อเล่น หรือเบอร์โทร"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {teams.length > chipLimit ? (
          <SearchableSelect
            aria-label="กรองทีม"
            value={team}
            onChange={(event) => setTeam(event.target.value)}
          >
            <option value="">ทุกทีม</option>
            {teams.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            <option value={noTeam}>ไม่ระบุทีม</option>
          </SearchableSelect>
        ) : (
          <div className="chips" role="group" aria-label="กรองทีม">
            {[{ id: '', name: 'ทุกทีม' }, ...teams, { id: noTeam, name: 'ไม่ระบุทีม' }].map(
              (item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={team === item.id}
                  onClick={() => setTeam(item.id)}
                >
                  {item.name}
                </button>
              ),
            )}
          </div>
        )}
      </div>
      <div className="record-toast" aria-live="polite">
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="alert">
            {message}
            {last && (
              <button type="button" className="secondary" onClick={undo}>
                เลิกทำ
              </button>
            )}
          </p>
        )}
      </div>
      <div className="vehicle-grid">
        {cards.map((item) => (
          <VehicleCard
            key={item.truck.id}
            id={item.truck.id}
            plate={item.truck.name}
            province={item.truck.province ?? ''}
            driver={name(overrides[item.truck.id]?.driverId ?? '') || (item.driver?.name ?? '')}
            type={item.type}
            teams={item.teamNames.join(', ')}
            trips={item.trips}
            disabled={state === 'closed' || !item.truck.active}
            saving={saving.includes(item.truck.id)}
            onRecord={stable.record}
            onMore={stable.open}
          />
        ))}
      </div>
      {!cards.length && <p className="empty">ไม่พบรถตามคำค้นหรือทีมที่เลือก</p>}

      <section className="panel padded" aria-label="ประวัติเที่ยวล่าสุด">
        <h2>{allTrips ? 'เที่ยวทั้งหมดของวัน' : 'เที่ยวล่าสุด'}</h2>
        {bulkResult.outcome && (
          <BulkResultNotice outcome={bulkResult.outcome} onClose={() => bulkResult.set(null)} />
        )}
        {canDelete && state !== 'closed' && (
          <BulkActionToolbar
            selection={selection}
            pageIds={visibleTrips.map((trip) => trip.key)}
            onDelete={() => {
              setRemoveReason('');
              bulkResult.set(null);
              setBulkOpen(true);
            }}
          />
        )}
        <ul className="trip-history">
          {visibleTrips.map((trip) => (
            <li key={trip.key} className={selection.has(trip.key) ? 'selected' : ''}>
              {canDelete && state !== 'closed' && (
                <SelectBox selection={selection} id={trip.key} name={tripLabel(trip)} />
              )}
              <span>
                <b>
                  {time(trip.recordedAt)} · {name(trip.truckId)} · เที่ยวที่ {trip.sequence}
                </b>
                <small>
                  {[name(trip.driverId), name(trip.sourceId), trip.soilType]
                    .filter(Boolean)
                    .join(' · ') || 'ไม่ระบุรายละเอียด'}
                </small>
              </span>
              <button
                type="button"
                className="secondary"
                disabled={state === 'closed'}
                aria-label={`แก้ไข ${tripLabel(trip)}`}
                onClick={() => setEditTrip(trip)}
              >
                แก้ไข
              </button>
              {canDelete && (
                <button
                  type="button"
                  className="danger-outline"
                  disabled={state === 'closed'}
                  aria-label={`ลบ ${tripLabel(trip)}`}
                  onClick={() => {
                    setRemoveReason('');
                    setRemoving(trip);
                  }}
                >
                  ลบ
                </button>
              )}
            </li>
          ))}
        </ul>
        {!trips.length && <p>ยังไม่มีเที่ยวของวันที่เลือก</p>}
        {trips.length > 8 && (
          <button type="button" className="secondary" onClick={() => setAllTrips(!allTrips)}>
            {allTrips ? 'ดูเฉพาะล่าสุด' : `ดูทั้งหมด ${trips.length} เที่ยว`}
          </button>
        )}
      </section>

      <section className="panel padded" aria-label="สรุปยอดวันนี้">
        <h2>
          สรุปยอด {active.find((item) => item.id === project)?.name} · {date}
        </h2>
        <label className="field">
          <span>สรุปตาม</span>
          <SearchableSelect
            aria-label="สรุปตาม"
            value={group}
            onChange={(event) => setGroup(event.target.value as SummaryGroup)}
          >
            {Object.entries(summaryGroups).map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </SearchableSelect>
        </label>
        <table>
          <thead>
            <tr>
              <th>{summaryGroups[group]}</th>
              <th>เที่ยว</th>
            </tr>
          </thead>
          <tbody>
            {daySummary(data, session, group).map(([label, count]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="drive-actions">
          <button
            type="button"
            className="secondary"
            disabled={!total}
            onClick={() => {
              const text = [
                `${active.find((item) => item.id === project)?.name} ${date}`,
                `รวม ${total} เที่ยว`,
                ...daySummary(data, session, group).map(([label, count]) => `${label}: ${count}`),
              ].join('\n');
              void navigator.clipboard
                .writeText(text)
                .then(() => setMessage('คัดลอกข้อความสรุปแล้ว'))
                .catch(() => setError('คัดลอกไม่สำเร็จ กรุณาอนุญาตคลิปบอร์ด'));
              setLast(null);
            }}
          >
            คัดลอกข้อความสรุป
          </button>
          <button type="button" className="primary" onClick={onReconcile}>
            ตรวจยอด แนบหลักฐาน และปิดวัน
          </button>
        </div>
      </section>

      {card && (
        <TruckDialog
          key={card.id}
          data={data}
          truck={card}
          values={nextTripDefaults(data, session, card.id, context, overrides[card.id])}
          capacity={capacities[card.id]}
          trips={trips.filter((trip) => trip.truckId === card.id)}
          onClose={() => setOpenTruck('')}
          onApply={(override, capacity) => {
            setOverrides((all) => ({ ...all, [card.id]: override }));
            if (capacity) setCapacities((all) => ({ ...all, [card.id]: capacity }));
            setOpenTruck('');
            setMessage(`ใช้ค่าใหม่กับเที่ยวถัดไปของ ${card.name}`);
            setLast(null);
          }}
        />
      )}
      {editTrip && session && (
        <TripDialog
          data={data}
          trip={editTrip}
          title={tripLabel(editTrip)}
          onClose={() => setEditTrip(null)}
          onSave={async (values, why) => {
            await onChange((old) => {
              const current = findSession(old, project, date)!;
              return correctDailyTrip(
                old,
                current.id,
                current.body.version,
                editTrip.rowId,
                editTrip.key,
                values,
                owner,
                why,
              );
            });
            setEditTrip(null);
            setLast(null);
            setMessage('แก้ไขเที่ยวแล้ว');
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`ลบ ${tripLabel(removing)}`}
          message="เที่ยวนี้จะไม่นับในยอด โดยเก็บไว้ในประวัติแก้ไข"
          disabled={!removeReason.trim()}
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            let failure = '';
            await onChange((old) => {
              const result = removeTrips(
                old,
                project,
                date,
                [{ id: removing.key, rowId: removing.rowId, label: tripLabel(removing) }],
                owner,
                removeReason,
              );
              failure = result.failed[0]?.reason ?? '';
              return result.data;
            });
            if (failure) throw Error(failure);
            setRemoving(null);
            setLast(null);
            setMessage('ลบเที่ยวแล้ว ประวัติเดิมยังอยู่');
          }}
        >
          <label className="field">
            <span>เหตุผลที่ลบเที่ยว</span>
            <input value={removeReason} onChange={(event) => setRemoveReason(event.target.value)} />
          </label>
        </ConfirmDialog>
      )}
      {bulkOpen && (
        <BulkDeleteDialog
          count={selection.count}
          disabled={!removeReason.trim()}
          onCancel={() => setBulkOpen(false)}
          onDelete={async () => {
            const targets = visibleTrips
              .filter((trip) => selection.has(trip.key))
              .map((trip) => ({ id: trip.key, rowId: trip.rowId, label: tripLabel(trip) }));
            let outcome = {
              deleted: [] as string[],
              failed: [] as { id: string; label: string; reason: string }[],
            };
            await onChange((old) => {
              const result = removeTrips(old, project, date, targets, owner, removeReason);
              outcome = result;
              return result.data;
            });
            return outcome;
          }}
          onFinish={(outcome) => {
            setBulkOpen(false);
            setLast(null);
            selection.keep(outcome.failed.map((item) => item.id));
            bulkResult.set(outcome);
          }}
        >
          <label className="field">
            <span>เหตุผลที่ลบ (ใช้กับทุกรายการที่เลือก)</span>
            <input value={removeReason} onChange={(event) => setRemoveReason(event.target.value)} />
          </label>
        </BulkDeleteDialog>
      )}
    </section>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" onKeyDown={(event) => event.key === 'Escape' && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="section-heading">
          <h2>{title}</h2>
          <button type="button" autoFocus className="secondary" onClick={onClose}>
            ปิด
          </button>
        </div>
        <div className="padded content-stack">{children}</div>
      </section>
    </div>
  );
}

function TruckDialog({
  data,
  truck,
  values,
  capacity,
  trips,
  onClose,
  onApply,
}: {
  data: Data;
  truck: Master;
  values: ReturnType<typeof nextTripDefaults>;
  capacity?: number;
  trips: DayTrip[];
  onClose: () => void;
  onApply: (override: Override, capacity?: number) => void;
}) {
  const [form, setForm] = useState({
    driverId: values.driverId,
    sourceId: values.sourceId,
    soilType: values.soilType,
  });
  const [typed, setTyped] = useState(String(capacity ?? ''));
  const name = (id: string) => data.masters.find((item) => item.id === id)?.name ?? '';
  function submit(event: FormEvent) {
    event.preventDefault();
    // Only fields the user changed override the shared defaults.
    const changed = Object.fromEntries(
      Object.entries(form).filter(([key, value]) => value !== values[key as keyof typeof form]),
    );
    onApply(changed, Number(typed) > 0 ? Number(typed) : undefined);
  }
  return (
    <Dialog title={`รถ ${truck.name}`} onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        {!values.capacity && (
          <label className="field">
            <span>ความจุรถคันนี้ (m³) — ยังไม่มีในข้อมูลรถ</span>
            <input
              type="number"
              min="0.001"
              step="any"
              required
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </label>
        )}
        {(
          [
            ['driverId', 'driver', 'คนขับเที่ยวถัดไป'],
            ['sourceId', 'source', 'แหล่งดินเที่ยวถัดไป'],
            ['soilType', 'soilType', 'ชนิดดินเที่ยวถัดไป'],
          ] as const
        ).map(([key, kind, label]) => (
          <label className="field" key={key}>
            <span>{label}</span>
            <SearchableSelect
              aria-label={label}
              value={form[key]}
              onChange={(event) => setForm({ ...form, [key]: event.target.value })}
            >
              <Options masters={data.masters} kind={kind} />
            </SearchableSelect>
          </label>
        ))}
        <button type="submit" className="primary">
          ใช้กับเที่ยวถัดไป
        </button>
      </form>
      <h3>ประวัติของวันนี้</h3>
      <ol className="truck-history">
        {[...trips].reverse().map((trip) => (
          <li key={trip.key}>
            เที่ยวที่ {trip.sequence} · {time(trip.recordedAt)} ·{' '}
            {[name(trip.driverId), name(trip.sourceId)].filter(Boolean).join(' · ')}
          </li>
        ))}
      </ol>
      {!trips.length && <p>ยังไม่มีเที่ยว</p>}
    </Dialog>
  );
}

function TripDialog({
  data,
  trip,
  title,
  onClose,
  onSave,
}: {
  data: Data;
  trip: DayTrip;
  title: string;
  onClose: () => void;
  onSave: (
    values: { capacity: number; driverId: string; sourceId: string; soilType: string },
    reason: string,
  ) => Promise<void>;
}) {
  const [form, setForm] = useState({
    capacity: String(trip.capacity),
    driverId: trip.driverId,
    sourceId: trip.sourceId,
    soilType: trip.soilType,
    reason: '',
  });
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave(
        {
          capacity: Number(form.capacity),
          driverId: form.driverId,
          sourceId: form.sourceId,
          soilType: form.soilType,
        },
        form.reason,
      );
    } catch (e) {
      setError(connectionMessage(e));
      setBusy(false);
    }
  }
  return (
    <Dialog title={`แก้ไข ${title}`} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="form-grid">
        <label className="field">
          <span>ความจุเที่ยวนี้ (m³)</span>
          <input
            type="number"
            min="0.001"
            step="any"
            required
            value={form.capacity}
            onChange={(event) => setForm({ ...form, capacity: event.target.value })}
          />
        </label>
        {(
          [
            ['driverId', 'driver', 'คนขับ'],
            ['sourceId', 'source', 'แหล่งดิน'],
            ['soilType', 'soilType', 'ชนิดดิน'],
          ] as const
        ).map(([key, kind, label]) => (
          <label className="field" key={key}>
            <span>{label}</span>
            <SearchableSelect
              aria-label={`${label}ของเที่ยว`}
              value={form[key]}
              onChange={(event) => setForm({ ...form, [key]: event.target.value })}
            >
              <Options masters={data.masters} kind={kind} />
            </SearchableSelect>
          </label>
        ))}
        <label className="field">
          <span>เหตุผลที่แก้ไข</span>
          <input
            required
            value={form.reason}
            onChange={(event) => setForm({ ...form, reason: event.target.value })}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>
          บันทึกการแก้ไข
        </button>
      </form>
    </Dialog>
  );
}
