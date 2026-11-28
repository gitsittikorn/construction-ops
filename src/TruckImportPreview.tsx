import { useState } from 'react';
import Pager, { paginate } from './Pager';
import SearchableSelect from './SearchableSelect';
import { searchRank } from './searchOptions';
import { normalizeName, truckTypes } from './masterData';
import type { TruckImportPlan, TruckImportPlanRow } from './truckImport';

const actions = {
  create: 'เพิ่มใหม่',
  update: 'อัปเดต',
  link: 'ผูกคนขับ',
  skip: 'ข้ามรถเดิม',
  error: 'แก้ไขไฟล์ก่อน',
} as const;
const columns = [
  'แถว',
  'รหัสรถ',
  'ทะเบียนรถ',
  'จังหวัดทะเบียน',
  'ประเภทรถ',
  'เบอร์โทร',
  'ชื่อเล่น',
  'แท็กทีม',
  'ความจุ (m³)',
  'รายละเอียด',
  'สถานะ',
  'คนขับที่จะผูก',
  'การดำเนินการ',
  'ข้อผิดพลาด / ข้อสังเกต',
];

export function ImportSummary({ plan }: { plan: TruckImportPlan }) {
  return (
    <div className="import-summary">
      <p>
        เพิ่ม {plan.creates} · อัปเดต {plan.updates} · ข้าม {plan.skips} · ผิดพลาด {plan.errors}
      </p>
      <p>
        รถ: อ่านได้ {plan.rows.length} คัน · ผูกคนขับอย่างเดียว {plan.linkOnly} ·
        ไม่มีการเปลี่ยนแปลง {plan.unchanged} · ข้อมูลไม่สมบูรณ์ {plan.incomplete}
      </p>
      <p>
        จะผูกคนขับ {plan.links} คัน · สร้างคนขับใหม่ {plan.newDrivers} คน
      </p>
      <p>
        คนขับเดิม {plan.existingDrivers} คน · รายการที่ต้องตรวจสอบคนขับ {plan.reviews}
      </p>
      <p>
        ทีม: ใหม่ {plan.newTags.length} · เดิม {plan.existingTags} · จะผูกทีม {plan.teamLinks} คัน
      </p>
    </div>
  );
}

const rowTeams = (row: TruckImportPlanRow) => row.source.tags.map(normalizeName);

/** Every sheet row and column. Search, filters and pages never limit what is imported. */
export default function TruckImportPreview({ plan }: { plan: TruckImportPlan }) {
  const [query, setQuery] = useState(''),
    [action, setAction] = useState(''),
    [team, setTeam] = useState(''),
    [page, setPage] = useState(0);
  const teams = [
    ...new Map(
      plan.rows.flatMap((row) => row.source.tags.map((tag) => [normalizeName(tag), tag])),
    ).entries(),
  ];
  const filtered = plan.rows.filter((row) => {
    const source = row.source;
    if (action === 'review' ? !(row.review || row.incomplete) : action && row.action !== action)
      return false;
    if (team && !rowTeams(row).includes(team)) return false;
    return Number.isFinite(
      searchRank(
        [source.plate, source.province, source.nickname, source.driver, source.phone].join(' '),
        query,
      ),
    );
  });
  const view = paginate(filtered, page);
  const reset = (set: (value: string) => void) => (value: string) => {
    set(value);
    setPage(0);
  };
  return (
    <>
      <div className="operations-filters">
        <label>
          ค้นหาในรายการนำเข้า
          <input
            type="search"
            aria-label="ค้นหาในรายการนำเข้า"
            value={query}
            onChange={(event) => reset(setQuery)(event.target.value)}
          />
        </label>
        <label>
          การดำเนินการ
          <SearchableSelect
            aria-label="กรองการดำเนินการนำเข้า"
            value={action}
            onChange={(event) => reset(setAction)(event.target.value)}
          >
            <option value="">ทั้งหมด</option>
            {Object.entries(actions).map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
            <option value="review">ต้องตรวจสอบ / ไม่สมบูรณ์</option>
          </SearchableSelect>
        </label>
        <label>
          ทีมในไฟล์
          <SearchableSelect
            aria-label="กรองทีมในไฟล์"
            value={team}
            onChange={(event) => reset(setTeam)(event.target.value)}
          >
            <option value="">ทุกทีม</option>
            {teams.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </SearchableSelect>
        </label>
      </div>
      <p role="status">
        แสดง {filtered.length} จาก {plan.rows.length} รายการ · การยืนยันจะนำเข้าตามทุกรายการ
        ไม่ใช่เฉพาะที่แสดง
      </p>
      <div className="table-wrap preview-table" tabIndex={0} aria-label="ตารางตรวจรายการนำเข้า">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.items.map((row) => {
              const source = row.source;
              return (
                <tr key={source.row} data-action={row.action}>
                  <td>{source.row}</td>
                  <td>{source.id || (row.existingId ? 'รหัสเดิม' : 'สร้างอัตโนมัติ')}</td>
                  <td>{source.plate}</td>
                  <td>{source.province || 'ไม่ระบุ'}</td>
                  <td>{source.truckType ? truckTypes[source.truckType] : '—'}</td>
                  <td>{source.phone || '—'}</td>
                  <td>{source.nickname ?? '—'}</td>
                  <td>{source.tags.join(', ') || '—'}</td>
                  <td>{source.blankCapacity ? '—' : source.capacity}</td>
                  <td>{source.detail || '—'}</td>
                  <td>{source.blankStatus ? '—' : source.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</td>
                  <td>
                    {row.driver ? row.driver.name + (row.driver.isNew ? ' (ใหม่)' : '') : '—'}
                  </td>
                  <td>{actions[row.action]}</td>
                  <td>
                    {[...row.errors, ...row.notes].map((note) => (
                      <div key={note}>{note}</div>
                    ))}
                    {row.changes.map((change) => (
                      <div className="change" key={change.label}>
                        {change.label}: <del>{change.before || 'ว่าง'}</del> →{' '}
                        <b>{change.after || 'ว่าง'}</b>
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager
        page={view.current}
        pages={view.pages}
        total={filtered.length}
        label="รายการนำเข้า"
        onPage={setPage}
      />
    </>
  );
}
