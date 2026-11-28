import { normalizeName, saveMaster } from './masterData';
import { sheetsReader } from './sheetsReader';
import type { Data, Master } from './models';

/** Sheet tabs that hold one name per row. The order column has no field and is not stored. */
export const nameSheets = {
  source: { tab: 'แหล่งดิน', name: ['แหล่งดิน'], code: 'รหัสแหล่งดิน', title: 'แหล่งดิน' },
  soilType: {
    tab: 'ชนิดดิน',
    name: ['รายการ', 'ชนิดดิน'],
    code: 'รหัสวัสดุ',
    title: 'ชนิดดิน',
  },
} as const;
export type NameKind = keyof typeof nameSheets;

export interface NameRow {
  row: number;
  id: string;
  name: string;
}
export interface NamePlanRow extends NameRow {
  action: 'create' | 'rename' | 'skip' | 'error';
  note: string;
}

const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

export function parseNameRows(kind: NameKind, table: unknown[][]): NameRow[] {
  const config = nameSheets[kind];
  const headers = (table[0] ?? []).map(text);
  const nameColumn = headers.findIndex((header) =>
    (config.name as readonly string[]).includes(header),
  );
  if (nameColumn < 0)
    throw Error(`ไม่พบคอลัมน์ ${config.name[0]} กรุณาตรวจหัวตารางในแท็บ ${config.tab}`);
  const codeColumn = headers.indexOf(config.code);
  return table
    .slice(1)
    .map((cells, index) => ({
      row: index + 2,
      id: codeColumn < 0 ? '' : text(cells[codeColumn]),
      name: text(cells[nameColumn]).replace(/\s+/g, ' '),
      blank: cells.every((cell) => !text(cell)),
    }))
    .filter((row) => !row.blank)
    .map(({ row, id, name }) => ({ row, id, name }));
}

export function planNameImport(kind: NameKind, rows: NameRow[], masters: Master[]) {
  const existing = masters.filter((item) => item.kind === kind);
  const seen = new Set<string>();
  return rows.map((row): NamePlanRow => {
    const result = (action: NamePlanRow['action'], note = '') => ({ ...row, action, note });
    const key = normalizeName(row.name);
    if (!row.name) return result('error', 'ไม่มีชื่อในแถวนี้');
    if (row.name.length > 200) return result('error', 'ชื่อยาวเกิน 200 ตัวอักษร');
    if (seen.has(key)) return result('skip', 'ชื่อซ้ำกับแถวก่อนหน้าในชีต');
    seen.add(key);
    const byName = existing.find((item) => normalizeName(item.name) === key);
    if (row.id) {
      const byId = existing.find((item) => item.id === row.id);
      if (!byId) return result('error', 'รหัสนี้ไม่พบในระบบ ให้เว้นว่างเพื่อเพิ่มรายการใหม่');
      if (byName && byName.id !== byId.id) return result('error', 'ชื่อชนกับรายการอื่นในระบบ');
      return byId.name === row.name
        ? result('skip', 'มีอยู่แล้ว')
        : result('rename', `เปลี่ยนชื่อจาก ${byId.name}`);
    }
    if (byName) return result('skip', byName.active ? 'มีอยู่แล้ว' : 'มีอยู่แล้วแต่ปิดใช้งาน');
    return result('create');
  });
}

export function applyNameImport(
  data: Data,
  kind: NameKind,
  rows: NameRow[],
  actor: string,
  previewMasters: Master[],
): Data {
  if (JSON.stringify(data.masters) !== JSON.stringify(previewMasters))
    throw Error('ข้อมูลพื้นฐานเปลี่ยนระหว่างตรวจไฟล์ กรุณาอ่านชีตใหม่ก่อนบันทึก');
  const plan = planNameImport(kind, rows, data.masters);
  if (plan.some((row) => row.action === 'error')) throw Error('กรุณาแก้แถวที่ผิดพลาดในชีตก่อน');
  const now = new Date().toISOString();
  let next = data;
  for (const row of plan) {
    if (row.action === 'skip') continue;
    const old = next.masters.find((item) => item.id === row.id && item.kind === kind);
    next = saveMaster(
      next,
      old
        ? { ...old, name: row.name, updatedAt: now }
        : {
            id: crypto.randomUUID(),
            kind,
            name: row.name,
            detail: '',
            capacity: 0,
            active: true,
            createdAt: now,
            updatedAt: now,
          },
      actor,
    );
  }
  return next;
}

/** Reads the tab named in the link, or the tab with the expected name. */
export async function readNameSheet(token: string, id: string, kind: NameKind, sheetId?: number) {
  const get = sheetsReader(token, id);
  const config = nameSheets[kind];
  const metadata = await get<{ sheets?: { properties?: { sheetId: number; title: string } }[] }>(
    '?fields=sheets.properties',
  );
  const tabs = (metadata.sheets ?? []).flatMap((tab) => (tab.properties ? [tab.properties] : []));
  const tab =
    sheetId === undefined
      ? tabs.find((item) => item.title.trim() === config.tab)
      : tabs.find((item) => item.sheetId === sheetId);
  if (!tab) throw Error(`ไม่พบแท็บ ${config.tab} ในไฟล์ตามลิงก์`);
  const range = `'${tab.title.replace(/'/g, "''")}'!A1:Z20001`;
  const payload = await get<{ values?: unknown[][] }>(
    `/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
  );
  if (payload.values !== undefined && !payload.values.every(Array.isArray))
    throw Error('Google Sheets ส่งข้อมูลไม่ถูกต้อง');
  const rows = parseNameRows(kind, payload.values ?? []);
  if (!rows.length) throw Error(`ไม่มีข้อมูลในแท็บ ${tab.title}`);
  return { rows, title: tab.title };
}
