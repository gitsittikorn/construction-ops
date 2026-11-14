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
export const spreadsheetUrl = (id: string) =>
  `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`;
export async function saveTruckSheet(owner: string, id: string) {
  const database = await openLocalDatabase();
  try {
    await database.put('driveSettings', id, `truck-sheet:${owner}`);
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
export async function prepareTruckSheet(
  token: string,
  id: string,
  assertActive: () => void = () => {},
) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error('รหัส Google Sheets ไม่ถูกต้อง');
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`;
  async function call(url: string, init: RequestInit = {}) {
    // Revalidate before every request, especially the write after metadata/header reads.
    assertActive();
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
export async function readTruckSheet(token: string, id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error('รหัส Google Sheets ไม่ถูกต้อง');
  let response: Response;
  try {
    response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent("'Trucks'!A1:Z1002")}?valueRenderOption=UNFORMATTED_VALUE`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30000),
      },
    );
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
              ? 'ไม่พบชีต Trucks หรือช่วงข้อมูลไม่ถูกต้อง กรุณาคงชื่อชีต Trucks'
              : `Google Sheets ตอบกลับผิดพลาด (${response.status}) กรุณาลองใหม่`,
    );
  const body = await response.text();
  if (body.length > 5 * 1024 * 1024) throw Error('ข้อมูลชีตต้องไม่เกิน 5 MB');
  let payload: { values?: unknown[][] };
  try {
    payload = JSON.parse(body);
  } catch {
    throw Error('Google Sheets ส่งข้อมูลไม่ถูกต้อง');
  }
  if (
    payload.values !== undefined &&
    (!Array.isArray(payload.values) || !payload.values.every(Array.isArray))
  )
    throw Error('Google Sheets ส่งข้อมูลไม่ถูกต้อง');
  const rows = parseTruckRows(payload.values ?? []);
  if (!rows.length) throw Error('ไม่มีข้อมูลรถในชีต Trucks กรุณากรอกข้อมูลก่อนนำเข้า');
  return rows;
}
