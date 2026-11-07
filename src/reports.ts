import type { Data } from './models';
import { csv } from './domain';
import { dailySessions, verificationState, dailyRowVolume } from './daily';
import { validDate } from './daily';
import type { SheetData } from 'write-excel-file/universal';

export const reportTypes = {
  daily: 'เที่ยวรถรายวัน',
  project: 'สรุปโครงการ',
  truck: 'สรุปรถ',
  driver: 'สรุปคนขับ',
  source: 'สรุปแหล่งดิน',
  verification: 'ตรวจยอดประจำวัน',
  cumulative: 'ปริมาตรสะสม',
} as const;
export type ReportType = keyof typeof reportTypes;
export interface ReportFilter {
  project: string;
  from: string;
  to: string;
  truck: string;
  driver: string;
  team: string;
  source: string;
  verification: string;
}
export const emptyReportFilter: ReportFilter = {
  project: '',
  from: '',
  to: '',
  truck: '',
  driver: '',
  team: '',
  source: '',
  verification: '',
};
export interface ReportRow {
  id: string;
  project: string;
  date: string;
  truck: string;
  driver: string;
  team: string;
  source: string;
  trips: number;
  reported: number | null;
  capacity: number | null;
  volume: number | null;
  verified: boolean;
  status: string;
  origin: string;
}
export function reportRows(data: Data, filter: ReportFilter): ReportRow[] {
  if (
    (filter.from && !validDate(filter.from)) ||
    (filter.to && !validDate(filter.to)) ||
    (filter.from && filter.to && filter.from > filter.to)
  )
    throw Error('ช่วงวันที่รายงานไม่ถูกต้อง');
  const legacy: ReportRow[] = data.trips.map((t) => ({
    id: t.id,
    project: t.projectId,
    date: t.date,
    truck: t.truckId,
    driver: t.driverId,
    team: '',
    source: t.sourceId,
    trips: 1,
    reported: null,
    capacity: t.capacityPerTrip ?? null,
    volume: t.capacityPerTrip ?? null,
    verified: false,
    status: 'PENDING',
    origin: 'บันทึกรายเที่ยวเดิม',
  }));
  const daily: ReportRow[] = dailySessions(data).flatMap((s) =>
    s.body.rows.map((r) => ({
      id: `${s.id}:${r.id}`,
      project: s.projectId,
      date: s.body.date,
      truck: r.truckId,
      driver: r.driverId,
      team: r.teamId,
      source: r.sourceId,
      trips: r.tripCount,
      reported: r.reportedTrips,
      capacity: r.capacity,
      volume: dailyRowVolume(r),
      verified: verificationState(s, r) === 'VERIFIED',
      status: verificationState(s, r),
      origin: s.body.state === 'closed' ? 'วันปิดแล้ว' : 'วันทำงาน',
    })),
  );
  return [...legacy, ...daily]
    .filter(
      (r) =>
        (!filter.project || r.project === filter.project) &&
        (!filter.from || r.date >= filter.from) &&
        (!filter.to || r.date <= filter.to) &&
        (!filter.truck || r.truck === filter.truck) &&
        (!filter.driver || r.driver === filter.driver) &&
        (!filter.team || r.team === filter.team) &&
        (!filter.source || r.source === filter.source) &&
        (!filter.verification || (filter.verification === 'verified' ? r.verified : !r.verified)),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
export function reportTotals(rows: ReportRow[]) {
  return rows.reduce(
    (total, r) => ({
      trips: total.trips + r.trips,
      volume: total.volume + (r.volume ?? 0),
      verifiedTrips: total.verifiedTrips + (r.verified ? r.trips : 0),
      verifiedVolume: total.verifiedVolume + (r.verified ? (r.volume ?? 0) : 0),
      unknownVolumeTrips: total.unknownVolumeTrips + (r.volume === null ? r.trips : 0),
    }),
    { trips: 0, volume: 0, verifiedTrips: 0, verifiedVolume: 0, unknownVolumeTrips: 0 },
  );
}
export function reportTable(
  data: Data,
  rows: ReportRow[],
  type: ReportType,
): (string | number)[][] {
  const name = (id: string) => data.masters.find((m) => m.id === id)?.name ?? id;
  const project = (id: string) => data.projects.find((p) => p.id === id)?.name ?? id;
  if (type === 'daily' || type === 'verification')
    return [
      [
        'วันที่',
        'โครงการ',
        'ทะเบียนรถ',
        'คนขับ',
        'ทีม',
        'แหล่งดิน',
        'เที่ยวบันทึก',
        'เที่ยวรายงาน',
        'ผลต่าง',
        'ความจุต่อเที่ยว m³',
        'ปริมาตร m³',
        'สถานะ',
        'ที่มา',
      ],
      ...rows.map((r) => [
        r.date,
        project(r.project),
        name(r.truck),
        name(r.driver),
        name(r.team),
        name(r.source),
        r.trips,
        r.reported ?? '',
        r.reported === null ? '' : r.trips - r.reported,
        r.capacity ?? 'ไม่มี snapshot',
        r.volume ?? 'ไม่ทราบ',
        r.status,
        r.origin,
      ]),
    ];
  const field =
    type === 'project'
      ? 'project'
      : type === 'truck'
        ? 'truck'
        : type === 'driver'
          ? 'driver'
          : type === 'source'
            ? 'source'
            : 'date';
  const groups = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const key = row[field];
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  let cumulative = 0;
  const result: (string | number)[][] = [
    [
      type === 'cumulative' ? 'วันที่' : reportTypes[type],
      'เที่ยวบันทึก',
      'เที่ยวที่ยืนยัน',
      'เที่ยวรอตรวจ',
      'ปริมาตรที่ทราบ m³',
      'ปริมาตรยืนยัน m³',
      'เที่ยวที่ไม่ทราบปริมาตร',
      ...(type === 'cumulative' ? ['ปริมาตรสะสมที่ทราบ m³'] : []),
    ],
  ];
  for (const [key, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const t = reportTotals(group);
    cumulative += t.volume;
    result.push([
      field === 'project' ? project(key) : field === 'date' ? key : name(key) || 'ไม่ระบุ',
      t.trips,
      t.verifiedTrips,
      t.trips - t.verifiedTrips,
      t.volume,
      t.verifiedVolume,
      t.unknownVolumeTrips,
      ...(type === 'cumulative' ? [cumulative] : []),
    ]);
  }
  return result;
}
export function reportCsv(table: (string | number)[][]) {
  return csv(
    table.map((r, index) =>
      r.map((v, column) =>
        typeof v === 'number'
          ? String(v)
          : index > 0 && table[0][column] === 'ทะเบียนรถ'
            ? `'${v}`
            : v,
      ),
    ),
  );
}
export async function reportWorkbook(data: Data, rows: ReportRow[], type: ReportType) {
  const { default: write } = await import('write-excel-file/universal');
  const table = reportTable(data, rows, type),
    totals = reportTotals(rows);
  const totalRow: (string | number)[] = table[0].map(() => '');
  totalRow[0] = 'รวม';
  for (const [label, value] of [
    ['เที่ยวบันทึก', totals.trips],
    ['เที่ยวที่ยืนยัน', totals.verifiedTrips],
    ['เที่ยวรอตรวจ', totals.trips - totals.verifiedTrips],
    ['ปริมาตร m³', totals.volume],
    ['ปริมาตรที่ทราบ m³', totals.volume],
    ['ปริมาตรยืนยัน m³', totals.verifiedVolume],
    ['เที่ยวที่ไม่ทราบปริมาตร', totals.unknownVolumeTrips],
  ] as [string, number][]) {
    const index = table[0].indexOf(label);
    if (index >= 0) totalRow[index] = value;
  }
  table.push(totalRow);
  const cells = (table: (string | number)[][]): SheetData =>
    table.map((r, i) =>
      r.map((value, column) => ({
        value:
          typeof value === 'string' && i > 0 && table[0][column] === 'วันที่' && validDate(value)
            ? new Date(`${value}T00:00:00Z`)
            : value,
        type:
          typeof value === 'string' && i > 0 && table[0][column] === 'วันที่' && validDate(value)
            ? Date
            : typeof value === 'number'
              ? Number
              : String,
        ...(typeof value === 'string' && i > 0 && table[0][column] === 'วันที่' && validDate(value)
          ? { format: 'yyyy-mm-dd' }
          : typeof value === 'number'
            ? { format: '0.###' }
            : { format: '@' }),
        ...(i === 0 ? { fontWeight: 'bold' as const } : {}),
      })),
    );
  const summary = [
    ['รายการ', 'จำนวน'],
    ['เที่ยวรวม', totals.trips],
    ['ปริมาตรที่ทราบ m³', totals.volume],
    ['เที่ยวที่ยืนยัน', totals.verifiedTrips],
    ['ปริมาตรยืนยัน m³', totals.verifiedVolume],
    ['เที่ยวที่ไม่มี snapshot ความจุ', totals.unknownVolumeTrips],
  ];
  return write([
    { sheet: 'รายงาน', data: cells(table), columns: table[0].map(() => ({ width: 23 })) },
    { sheet: 'สรุปยอด', data: cells(summary), columns: [{ width: 40 }, { width: 24 }] },
  ]).toBlob();
}
export const escapeHtml = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function printableReport(title: string, table: (string | number)[][], subtitle = '') {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:A4 landscape;margin:14mm;@bottom-center{content:"หน้า " counter(page) " / " counter(pages)}}body{font:12px Tahoma,"Noto Sans Thai",sans-serif;color:#111}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:5px;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}h1{font-size:20px}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p><table><thead><tr>${table[0].map((v) => `<th>${escapeHtml(v)}</th>`).join('')}</tr></thead><tbody>${table
    .slice(1)
    .map((r) => `<tr>${r.map((v) => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></body></html>`;
}
export function printDocument(html: string) {
  const target = window.open('', '_blank');
  if (!target) throw Error('กรุณาอนุญาตหน้าต่างพิมพ์รายงาน');
  target.document.write(html);
  target.document.close();
  target.focus();
  target.print();
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
