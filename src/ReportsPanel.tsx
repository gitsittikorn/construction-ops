import { useState } from 'react';
import type { Data, Master } from './models';
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
  type ReportType,
} from './reports';

export default function ReportsPanel({ data }: { data: Data }) {
  const [filter, setFilter] = useState(emptyReportFilter),
    [type, setType] = useState<ReportType>('daily'),
    [error, setError] = useState(''),
    [page, setPage] = useState(0);
  let rows: ReturnType<typeof reportRows> = [],
    problem = '';
  try {
    rows = reportRows(data, filter);
  } catch (e) {
    problem = (e as Error).message;
  }
  const table = reportTable(data, rows, type),
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
        <select value={filter[key]} onChange={(e) => set(key, e.target.value)}>
          <option value="">ทั้งหมด</option>
          {data.masters
            .filter((m) => m.kind === kind)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </label>
    );
  }
  const subtitle = `เที่ยว ${totals.trips} · ปริมาตรที่ทราบ ${totals.volume} m³ · ยืนยัน ${totals.verifiedTrips} เที่ยว / ${totals.verifiedVolume} m³ · ไม่ทราบความจุ ${totals.unknownVolumeTrips} เที่ยว`;
  return (
    <section aria-label="รายงานธุรกิจ">
      <h2>รายงานและส่งออก</h2>
      <div className="operations-filters">
        <label>
          รูปแบบรายงาน
          <select
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
          </select>
        </label>
        <label>
          โครงการรายงาน
          <select value={filter.project} onChange={(e) => set('project', e.target.value)}>
            <option value="">ทั้งหมด</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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
        {master('truck', 'กรองรถ', 'truck')}
        {master('driver', 'กรองคนขับ', 'driver')}
        {master('team', 'กรองทีม', 'tag')}
        {master('source', 'กรองแหล่งดิน', 'source')}
        <label>
          การยืนยัน
          <select value={filter.verification} onChange={(e) => set('verification', e.target.value)}>
            <option value="">ทั้งหมด</option>
            <option value="verified">ยืนยันแล้ว</option>
            <option value="pending">รอตรวจ</option>
          </select>
        </label>
      </div>
      <p>{subtitle}</p>
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
      {(error || problem) && <p role="alert">{error || problem}</p>}
      <div className="operations-actions">
        <button
          disabled={!!problem}
          onClick={() =>
            downloadBlob(
              new Blob([reportCsv(table)], { type: 'text/csv;charset=utf-8' }),
              'daily-report.csv',
            )
          }
        >
          ส่งออกรายงาน CSV
        </button>
        <button
          disabled={!!problem}
          onClick={() =>
            void reportWorkbook(data, rows, type)
              .then((blob) => downloadBlob(blob, 'daily-report.xlsx'))
              .catch((e) => setError(e.message))
          }
        >
          ส่งออกรายงาน Excel
        </button>
        <button
          disabled={!!problem}
          onClick={() => {
            try {
              printDocument(printableReport(reportTypes[type], table, subtitle));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          พิมพ์ / บันทึกรายงาน PDF A4
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {table[0].map((v, i) => (
                <th key={i}>{v}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={i}>
                {row.map((v, j) => (
                  <td key={j}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button disabled={page === 0} onClick={() => setPage(page - 1)}>
        หน้าก่อนหน้า
      </button>
      <span> หน้า {page + 1} </span>
      <button disabled={(page + 1) * 100 >= table.length - 1} onClick={() => setPage(page + 1)}>
        หน้าถัดไป
      </button>
    </section>
  );
}
