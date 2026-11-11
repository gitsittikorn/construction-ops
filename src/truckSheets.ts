import { parseTruckRows, truckHeaders, legacyTruckHeaders } from './truckImport';
import { openLocalDatabase } from './storage';

export const sheetsReadScope = 'https://www.googleapis.com/auth/spreadsheets.readonly';
export const sheetsWriteScope = 'https://www.googleapis.com/auth/spreadsheets';
export const defaultTruckSheetId = '1_DHAvNEMXyeVbFhc9Am13o8b_gu4AhOSCQljTUq6jzA';
export function spreadsheetId(input: string): string {
  try {
    const url = new URL(input.trim());
    const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
    if (
      url.protocol === 'https:' &&
      url.hostname === 'docs.google.com' &&
      match &&
      match[1] !== 'e'
    )
      return match[1];
  } catch {
    /* Show the same actionable validation for malformed URLs. */
  }
  throw Error(
    'กรุณาใส่ลิงก์ Google Sheets เช่น https://docs.google.com/spreadsheets/d/รหัสชีต/edit',
  );
}
export function spreadsheetSelection(input: string) {
  const id = spreadsheetId(input);
  const url = new URL(input.trim());
  const fragment = new URLSearchParams(url.hash.slice(1)).get('gid');
  const query = url.searchParams.get('gid');
  const value = fragment ?? query;
  if (value === null) return { id, sheetId: undefined };
  const sheetId = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(sheetId) ||
    sheetId > 2147483647 ||
    (fragment !== null && query !== null && Number(fragment) !== Number(query))
  )
    throw Error('รหัสแท็บ gid ในลิงก์ไม่ถูกต้อง กรุณาคัดลอกลิงก์จากแท็บที่ต้องการ');
  return { id, sheetId };
}
export const spreadsheetUrl = (id: string, sheetId?: number) =>
  `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit${sheetId === undefined ? '' : `#gid=${sheetId}`}`;
export async function saveTruckSheet(owner: string, id: string, sheetId?: number) {
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction('driveSettings', 'readwrite');
    try {
      await transaction.store.put(id, `truck-sheet:${owner}`);
      if (sheetId === undefined) await transaction.store.delete(`truck-sheet-tab:${owner}`);
      else await transaction.store.put(sheetId, `truck-sheet-tab:${owner}`);
      await transaction.done;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        /* It may already have aborted. */
      }
      await transaction.done.catch(() => {});
      throw error;
    }
  } finally {
    database.close();
  }
}
export async function loadTruckSheetSelection(owner: string) {
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction('driveSettings', 'readonly');
    const id = (await transaction.store.get(`truck-sheet:${owner}`)) ?? '';
    const sheetId = await transaction.store.get(`truck-sheet-tab:${owner}`);
    await transaction.done;
    return {
      id,
      sheetId: Number.isSafeInteger(sheetId) && sheetId >= 0 ? (sheetId as number) : undefined,
    };
  } finally {
    database.close();
  }
}
export async function loadTruckSheet(owner: string): Promise<string> {
  const database = await openLocalDatabase();
  try {
    return (await database.get('driveSettings', `truck-sheet:${owner}`)) ?? '';
  } finally {
    database.close();
  }
}
// Never overwrite a nonempty, incompatible header or any vehicle rows.
export async function prepareTruckSheet(token: string, id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error('รหัส Google Sheets ไม่ถูกต้อง');
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`;
  async function call(url: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw Error('เชื่อมต่อ Google Sheets ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่');
    }
    if (!response.ok)
      throw Error(
        `เตรียมเทมเพลตไม่สำเร็จ (${response.status}) กรุณาตรวจสิทธิ์แก้ไขชีต เปิด Google Sheets API และเชื่อมต่อใหม่`,
      );
    return response.json();
  }
  const metadata = await call(`${base}?fields=sheets.properties`);
  if (!Array.isArray(metadata.sheets)) throw Error('ข้อมูล Google Sheets ไม่ถูกต้อง');
  const existing = metadata.sheets.find(
    (sheet: { properties: { title: string } }) => sheet.properties.title === 'Trucks',
  );
  const ids = metadata.sheets.map(
    (sheet: { properties: { sheetId: number } }) => sheet.properties.sheetId,
  );
  const sheetId: number = existing?.properties.sheetId ?? Math.max(0, ...ids) + 1;
  let needsHeader = true;
  let activeHeaders = truckHeaders;
  if (existing) {
    const header = await call(
      `${base}/values/${encodeURIComponent("'Trucks'!A1:Z1")}?valueRenderOption=UNFORMATTED_VALUE`,
    );
    const cells: unknown[] = header.values?.[0] ?? [];
    const nonempty = cells.some((value) => value !== '' && value !== null);
    const labels = cells.map((value) => String(value ?? '').trim());
    if (
      nonempty &&
      (legacyTruckHeaders.some((value) => !labels.includes(value)) ||
        labels.some((value) => !truckHeaders.includes(value)) ||
        new Set(labels).size !== labels.length)
    )
      throw Error(
        'ชีต Trucks มีหัวคอลัมน์เดิมที่ไม่ตรงเทมเพลต ระบบจะไม่เขียนทับ กรุณาเก็บสำเนาหรือใช้ชีตว่าง',
      );
    needsHeader = !nonempty;
    if (nonempty) activeHeaders = labels;
  }
  const requests: object[] = [];
  if (!existing)
    requests.push({
      addSheet: {
        properties: {
          sheetId,
          title: 'Trucks',
          gridProperties: { rowCount: 1001, columnCount: truckHeaders.length },
        },
      },
    });
  if (needsHeader)
    if (existing)
      requests.push({
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: {
              columnCount: Math.max(
                existing.properties.gridProperties?.columnCount ?? 0,
                truckHeaders.length,
              ),
            },
          },
          fields: 'gridProperties.columnCount',
        },
      });
  if (needsHeader)
    requests.push({
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: [
          { values: truckHeaders.map((value) => ({ userEnteredValue: { stringValue: value } })) },
        ],
        fields: 'userEnteredValue',
      },
    });
  requests.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
      fields: 'gridProperties.frozenRowCount',
    },
  });
  requests.push({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: activeHeaders.length,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.14, green: 0.3, blue: 0.24 },
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
        },
      },
      fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat',
    },
  });
  const capacityColumn = activeHeaders.indexOf('ความจุ (m³)');
  for (const [startColumnIndex, endColumnIndex] of [
    [0, capacityColumn],
    [capacityColumn + 1, activeHeaders.length],
  ].filter(([start, end]) => end > start))
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 1, startColumnIndex, endColumnIndex },
        cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
        fields: 'userEnteredFormat.numberFormat',
      },
    });
  await call(`${base}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
}
interface SheetTab {
  sheetId: number;
  title: string;
  sheetType?: string;
  gridProperties?: { rowCount?: number; columnCount?: number };
}
interface SheetValues {
  values?: unknown[][];
}
const referenceTab = (title: string) =>
  ['examples', 'instructions', 'tags'].includes(title.trim().toLowerCase());
function truckRange(tab: SheetTab, header = false) {
  const column = Math.min(26, tab.gridProperties?.columnCount ?? 26);
  const row = header ? 1 : Math.min(1002, tab.gridProperties?.rowCount ?? 1002);
  return `'${tab.title.replace(/'/g, "''")}'!A1:${String.fromCharCode(64 + column)}${row}`;
}
export async function readTruckSheetSource(token: string, id: string, sheetId?: number) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error('รหัส Google Sheets ไม่ถูกต้อง');
  if (sheetId !== undefined && (!Number.isSafeInteger(sheetId) || sheetId < 0))
    throw Error('รหัสแท็บ gid ไม่ถูกต้อง');
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`;
  let received = 0;
  async function get<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(base + path, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw Error('อ่าน Google Sheets ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่');
    }
    if (!response.ok)
      throw Error(
        response.status === 401
          ? 'สิทธิ์ Google Sheets หมดอายุ กรุณากดนำเข้าและเชื่อมต่อใหม่'
          : response.status === 403
            ? 'Google Sheets ไม่อนุญาต: เปิด Google Sheets API ใน Google Cloud โปรเจกต์เดียวกับ OAuth Client ID และอนุญาตสิทธิ์อ่านชีต'
            : response.status === 404
              ? 'ไม่พบชีตหรือบัญชีนี้ไม่มีสิทธิ์อ่าน กรุณาตรวจลิงก์และการแชร์'
              : response.status === 400
                ? 'อ่านช่วงข้อมูลไม่สำเร็จ กรุณาตรวจแท็บในลิงก์แล้วลองใหม่'
                : `Google Sheets ตอบกลับผิดพลาด (${response.status}) กรุณาลองใหม่`,
      );
    const body = await response.text();
    received += new TextEncoder().encode(body).byteLength;
    if (received > 5 * 1024 * 1024) throw Error('ข้อมูลชีตต้องไม่เกิน 5 MB');
    try {
      const payload = JSON.parse(body);
      if (!payload || typeof payload !== 'object') throw Error();
      return payload as T;
    } catch {
      throw Error('Google Sheets ส่งข้อมูลไม่ถูกต้อง');
    }
  }
  const metadata = await get<{ sheets?: { properties?: SheetTab }[] }>('?fields=sheets.properties');
  if (
    !Array.isArray(metadata.sheets) ||
    metadata.sheets.some(
      (tab) =>
        !tab?.properties ||
        typeof tab.properties.title !== 'string' ||
        !tab.properties.title ||
        !Number.isSafeInteger(tab.properties.sheetId) ||
        tab.properties.sheetId < 0,
    )
  )
    throw Error('Google Sheets ส่งข้อมูลไม่ถูกต้อง');
  let tabs = metadata.sheets
    .map((tab) => tab.properties!)
    .filter((tab) => (!tab.sheetType || tab.sheetType === 'GRID') && !referenceTab(tab.title));
  if (sheetId !== undefined) tabs = tabs.filter((tab) => tab.sheetId === sheetId);
  if (!tabs.length) throw Error('ไม่พบแท็บข้อมูลรถตามลิงก์ กรุณาเลือกแท็บข้อมูลและคัดลอกลิงก์ใหม่');
  if (tabs.length > 50) throw Error('มีแท็บจำนวนมาก กรุณาคัดลอกลิงก์จากแท็บข้อมูลรถให้มี gid');
  for (const tab of tabs) {
    const grid = tab.gridProperties;
    if (
      grid &&
      [grid.rowCount, grid.columnCount].some(
        (value) => value !== undefined && (!Number.isSafeInteger(value) || value < 1),
      )
    )
      throw Error('Google Sheets ส่งข้อมูลช่วงตารางไม่ถูกต้อง');
  }
  async function batch(selected: SheetTab[], header: boolean) {
    const params = new URLSearchParams({
      valueRenderOption: 'UNFORMATTED_VALUE',
      majorDimension: 'ROWS',
    });
    selected.forEach((tab) => params.append('ranges', truckRange(tab, header)));
    const payload = await get<{ spreadsheetId?: string; valueRanges?: SheetValues[] }>(
      `/values:batchGet?${params}`,
    );
    if (
      (payload.spreadsheetId !== undefined && payload.spreadsheetId !== id) ||
      !Array.isArray(payload.valueRanges) ||
      payload.valueRanges.length !== selected.length ||
      payload.valueRanges.some(
        (range) =>
          !range ||
          (range.values !== undefined &&
            (!Array.isArray(range.values) || !range.values.every(Array.isArray))),
      )
    )
      throw Error('Google Sheets ส่งข้อมูลไม่ถูกต้อง');
    return payload.valueRanges.map((range) => range.values ?? []);
  }
  const headers = await batch(tabs, true);
  tabs = tabs.filter((_, index) =>
    legacyTruckHeaders.every((header) =>
      headers[index][0]?.some((cell) => typeof cell === 'string' && cell.trim() === header),
    ),
  );
  if (!tabs.length)
    throw Error('ไม่พบแท็บข้อมูลรถที่มีหัวคอลัมน์ครบ กรุณาตรวจหัวตารางในไฟล์ตามลิงก์');
  const tables = await batch(tabs, false);
  const populated = tabs
    .map((tab, index) => ({ tab, data: tables[index] }))
    .filter(({ data }) =>
      data
        .slice(1)
        .some((row) => row.some((cell) => cell !== null && cell !== undefined && cell !== '')),
    );
  if (!populated.length) throw Error('ไม่มีข้อมูลรถในแท็บที่เลือก กรุณากรอกข้อมูลก่อนนำเข้า');
  if (populated.length > 1)
    throw Error('พบหลายแท็บข้อมูลรถ กรุณาเปิดแท็บที่ต้องการแล้วคัดลอกลิงก์ที่มี gid มาวาง');
  const { tab, data } = populated[0];
  return { rows: parseTruckRows(data), title: tab.title, sheetId: tab.sheetId };
}
export async function readTruckSheet(token: string, id: string, sheetId?: number) {
  return (await readTruckSheetSource(token, id, sheetId)).rows;
}
