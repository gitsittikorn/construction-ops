import SearchableSelect from './SearchableSelect';
import { useState } from 'react';
import type { Data, Master } from './models';
import { demoProjectId } from './demoProjectInfo';
import { verificationLabels } from './workspaceLabels';
import {
  emptyReportFilter,
  reportTypes,
  reportRows,
  reportTotals,
  reportTable,
  reportCsv,
  reportWorkbook,
  printableReport,
  printDocument,
  downloadBlob,
  reportMetadata,
  type ReportType,
} from './reports';

export default function ReportsPanel({
  data,
  initialProject = '',
}: {
  data: Data;
  initialProject?: string;
}) {
  const [filter, setFilter] = useState({ ...emptyReportFilter, project: initialProject }),
    [type, setType] = useState<ReportType>('daily'),
    [error, setError] = useState(''),
    [page, setPage] = useState(0);
  const [includeEvidence, setIncludeEvidence] = useState(false);
  let rows: ReturnType<typeof reportRows> = [],
    problem = '';
  try {
    rows = reportRows(data, filter);
  } catch (e) {
    problem = (e as Error).message;
  }
  const table = reportTable(data, rows, type, includeEvidence),
    totals = reportTotals(rows),
    visible = table.slice(1 + page * 100, 1 + (page + 1) * 100);
  const set = (key: keyof typeof filter, value: string) => {
    setFilter((f) => ({ ...f, [key]: value }));
    setPage(0);
  };
  function master(
    key: 'truck' | 'driver' | 'team' | 'source',
    label: string,
    kind: Master['kind'],
  ) {
    return (
      <label>
        {label}
        <SearchableSelect aria-label={label} value={filter[key]} onChange={(e) => set(key, e.target.value)}>
          <option value="">ทั้งหมด</option>
          {data.masters
            .filter((m) => m.kind === kind)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </SearchableSelect>
      </label>
    );
  }
  const subtitle = `เที่ยว ${totals.trips} · ปริมาตรที่ทราบ ${totals.volume} m³ · ยืนยัน ${totals.verifiedTrips} เที่ยว / ${totals.verifiedVolume} m³ · ไม่ทราบความจุ ${totals.unknownVolumeTrips} เที่ยว`;
  return (
    <section aria-label="รายงานธุรกิจ" className="content-stack reports-panel">
      <h2>รายงานและส่งออก</h2>
      {rows.some((row) => row.project === demoProjectId) && (
        <p className="demo-report-note" role="note">
          รายงานนี้มีข้อมูลสมมติ DEMO อยู่ด้วย หากใช้ส่งงานจริง ให้เลือกโครงการจริงก่อนดาวน์โหลด
        </p>
      )}
      <div className="operations-filters">
        <label>
          รูปแบบรายงาน
          <SearchableSelect
            aria-label="รูปแบบรายงาน"
            value={type}
            onChange={(e) => {
              setType(e.target.value as ReportType);
              setPage(0);
            }}
          >
            {Object.entries(reportTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </SearchableSelect>
        </label>
        <label>
          โครงการรายงาน
          <SearchableSelect
            aria-label="โครงการรายงาน"
            value={filter.project}
            onChange={(e) => set('project', e.target.value)}
          >
            <option value="">ทั้งหมด</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SearchableSelect>
        </label>
        <label>
          ตั้งแต่วันที่
          <input
            aria-label="รายงานตั้งแต่วันที่"
            type="date"
            value={filter.from}
            onChange={(e) => set('from', e.target.value)}
          />
        </label>
        <label>
          ถึงวันที่
          <input
            aria-label="รายงานถึงวันที่"
            type="date"
            value={filter.to}
            onChange={(e) => set('to', e.target.value)}
          />
        </label>
        <button
          className="secondary"
          onClick={() => {
            setFilter(emptyReportFilter);
            setIncludeEvidence(false);
            setPage(0);
            setError('');
          }}
        >
          ล้างตัวกรองรายงาน
        </button>
      </div>
      <details className="advanced-options">
        <summary>
          กรองเพิ่มเติม · รถ คนขับ ทีม และสถานะยืนยัน
          {[filter.truck, filter.driver, filter.team, filter.source, filter.verification].filter(
            Boolean,
          ).length > 0
            ? ' (มีตัวกรองที่ใช้อยู่)'
            : ''}
        </summary>
        <div className="operations-filters">
          {master('truck', 'กรองรถ', 'truck')}
          {master('driver', 'กรองคนขับ', 'driver')}
          {master('team', 'กรองทีม', 'tag')}
          {master('source', 'กรองแหล่งดิน', 'source')}
          <label>
            การยืนยัน
            <SearchableSelect
              aria-label="การยืนยันรายงาน"
              value={filter.verification}
              onChange={(e) => set('verification', e.target.value)}
            >
              <option value="">ทั้งหมด</option>
              <option value="verified">ยืนยันแล้ว</option>
              <option value="pending">รอตรวจ</option>
            </SearchableSelect>
          </label>
        </div>
      </details>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={includeEvidence}
          onChange={(event) => setIncludeEvidence(event.target.checked)}
        />
        แนบเลขอ้างอิงหลักฐาน
      </label>
      <div className="report-summary" aria-label="ยอดสรุปรายงาน">
        <article>
          <span>เที่ยวทั้งหมด</span>
          <strong>
            {totals.trips.toLocaleString('th-TH')} <small>เที่ยว</small>
          </strong>
        </article>
        <article>
          <span>ปริมาตรที่คำนวณได้</span>
          <strong>
            {totals.volume.toLocaleString('th-TH')} <small>m³</small>
          </strong>
        </article>
        <article>
          <span>เที่ยวที่ยืนยันแล้ว</span>
          <strong>
            {totals.verifiedTrips.toLocaleString('th-TH')} <small>เที่ยว</small>
          </strong>
        </article>
      </div>
      <p className="report-context">
        ยังไม่ทราบความจุ {totals.unknownVolumeTrips.toLocaleString('th-TH')} เที่ยว · ยืนยันแล้ว{' '}
        {totals.verifiedVolume.toLocaleString('th-TH')} m³
      </p>
      <details className="explanation">
        <summary>อ่านยอดรายงานอย่างไร</summary>
        <p>
          ปริมาตรในรายงานนี้คือดินหลวมที่ส่งตาม snapshot รถ ไม่ใช่ถมแน่นหรือปริมาตรตามแบบ
          สัปดาห์เริ่มวันจันทร์ถึงอาทิตย์ และรวมเฉพาะวันที่อยู่ในตัวกรอง
        </p>
        <p>
          เที่ยวเดิมที่ไม่มี snapshot ความจุจะไม่ถูกเดาปริมาตร และไม่ถูกนับเป็นยอดยืนยัน
          ยอดจากวันทำงานและบันทึกรายเที่ยวแสดงที่มาแยกกัน
        </p>
        {type === 'verification' && (
          <p>
            รายงานตรวจยอดรวมต่อรถต่อวันตามความจุรายเที่ยว หากกรองเหลือบางเที่ยวของรถ
            จะไม่เปรียบเทียบกับยอดรายงานทั้งคัน
          </p>
        )}
      </details>
      {(error || problem) && <p role="alert">{error || problem}</p>}
      <div className="operations-actions">
        <button
          className="secondary"
          disabled={!!problem}
          onClick={() =>
            downloadBlob(
              new Blob([reportCsv(table, reportMetadata(data, type, filter))], {
                type: 'text/csv;charset=utf-8',
              }),
              'daily-report.csv',
            )
          }
        >
          ส่งออกรายงาน CSV
        </button>
        <button
          className="primary"
          disabled={!!problem}
          onClick={() =>
            void reportWorkbook(data, rows, type, { filter, includeEvidence })
              .then((blob) => downloadBlob(blob, 'daily-report.xlsx'))
              .catch((e) => setError(e.message))
          }
        >
          ส่งออกรายงาน Excel
        </button>
        <button
          className="secondary"
          disabled={!!problem}
          onClick={() => {
            try {
              printDocument(
                printableReport(
                  reportTypes[type],
                  table,
                  `${subtitle} · ${reportMetadata(data, type, filter)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(' · ')}`,
                ),
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          พิมพ์ / บันทึกรายงาน PDF A4
        </button>
      </div>
      <p className="table-scroll-hint">
        เลื่อนตารางซ้าย–ขวาเพื่อดูทุกคอลัมน์ หรือกดที่ตารางแล้วใช้ปุ่มลูกศร
      </p>
      <div
        className="table-scroll"
        role="region"
        aria-label="ตารางรายงาน เลื่อนดูคอลัมน์เพิ่มเติม"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              {table[0].map((v, i) => (
                <th key={i}>{v}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!visible.length && (
              <tr>
                <td colSpan={table[0].length} className="empty-results">
                  ยังไม่พบรายการในช่วงที่เลือก ลองเปลี่ยนวันที่หรือกดล้างตัวกรองรายงาน
                </td>
              </tr>
            )}
            {visible.map((row, i) => (
              <tr key={i}>
                {row.map((v, j) => (
                  <td key={j}>
                    {table[0][j] === 'สถานะ' && typeof v === 'string'
                      ? v.replace(
                          /^(PENDING|MATCHED|MISMATCHED|VERIFIED|REOPENED)\b/,
                          (state) => verificationLabels[state] ?? state,
                        )
                      : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination" aria-label="หน้ารายงาน">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>
          หน้าก่อนหน้า
        </button>
        <span> หน้า {page + 1} </span>
        <button disabled={(page + 1) * 100 >= table.length - 1} onClick={() => setPage(page + 1)}>
          หน้าถัดไป
        </button>
      </div>
    </section>
  );
}
