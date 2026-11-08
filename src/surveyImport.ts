import { validateWorkbookArchive } from './workbookSafety';
import type { SurveyBody } from './workspaceModels';
import { calculateSurvey, surveyTable } from './surveying';
import { readBlobBytes } from './files';
import { reportCsv } from './reports';

export function parseSurveyCsv(text: string): string[][] {
  if (text.length > 5 * 1024 * 1024) throw Error('ไฟล์สำรวจเกิน 5 MB');
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  const finishCell = () => {
    row.push(cell);
    cell = '';
    closed = false;
  };
  const finishRow = () => {
    finishCell();
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
    if (rows.length > 2501) throw Error('นำเข้าได้ไม่เกิน 2,500 จุด');
  };
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else cell += char;
    } else if (char === ',') finishCell();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      finishRow();
    } else if (char === '"') {
      if (cell || closed) throw Error('รูปแบบเครื่องหมายคำพูดใน CSV ไม่ถูกต้อง');
      quoted = true;
    } else {
      if (closed) throw Error('รูปแบบ CSV หลังเครื่องหมายคำพูดไม่ถูกต้อง');
      cell += char;
    }
  }
  if (quoted) throw Error('เครื่องหมายคำพูดใน CSV ไม่ครบ');
  if (cell || row.length || closed) finishRow();
  return rows;
}
export function surveyPointsFromRows(rows: unknown[][], body: SurveyBody) {
  const headers = ['จุด', 'X m', 'Y m', 'ระดับเดิม m', 'ระดับแบบ m'];
  if (!rows.length || headers.some((header, index) => rows[0][index] !== header))
    throw Error('หัวตารางไม่ตรง กรุณาใช้ไฟล์สำรวจ CSV หรือชีต กริด ที่ส่งออกจากแอป');
  if (rows.length < 2 || rows.length > 2501) throw Error('ต้องมีจุดสำรวจ 1–2,500 จุด');
  const number = (value: unknown) => {
    // Our injection-safe CSV exports negative numbers as apostrophe-prefixed text.
    if (typeof value === 'string') value = value.trim().replace(/^'(?=[+-]?\d)/, '');
    if (
      (typeof value !== 'number' && typeof value !== 'string') ||
      value === '' ||
      !Number.isFinite(Number(value))
    )
      throw Error('ระดับและพิกัดต้องเป็นตัวเลขหน่วยเมตร ใช้จุดทศนิยม');
    return Number(value);
  };
  const points = rows.slice(1).map((row) => {
    if (typeof row[0] !== 'string' || !row[0].trim()) throw Error('ต้องระบุรหัสจุดกริด');
    return {
      id: row[0].trim(),
      x: number(row[1]),
      y: number(row[2]),
      existing: number(row[3]),
      customDesign: number(row[4]),
    };
  });
  calculateSurvey({ ...body, points });
  return points;
}
export async function readSurveyImport(file: File, body: SurveyBody) {
  if (!file.size || file.size > 5 * 1024 * 1024) throw Error('เลือกไฟล์สำรวจขนาดไม่เกิน 5 MB');
  const bytes = await readBlobBytes(file);
  let rows: unknown[][];
  if (file.name.toLowerCase().endsWith('.csv'))
    rows = parseSurveyCsv(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  else if (file.name.toLowerCase().endsWith('.xlsx')) {
    validateWorkbookArchive(bytes);
    const { readSheet } = await import('read-excel-file/universal');
    rows = await readSheet(new Uint8Array(bytes).slice().buffer, 'กริด');
  } else throw Error('รองรับไฟล์ .csv หรือ .xlsx เท่านั้น');
  return surveyPointsFromRows(rows, body);
}
export function surveyCsv(body: SurveyBody) {
  calculateSurvey(body);
  return reportCsv(
    surveyTable({
      id: '',
      projectId: '',
      name: '',
      recordType: 'survey',
      createdAt: '',
      updatedAt: '',
      body,
    }),
  );
}
