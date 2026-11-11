import { validateWorkbookArchive } from './workbookSafety';
import type { SheetData } from 'write-excel-file/universal';
import type { Master } from './models';
import { truckHeaders, legacyTruckHeaders, parseTruckRows } from './truckImport';
import { tagNames, truckTypes } from './masterData';
const textCell = (value: string) => ({ value, type: String, format: '@' });
const header = () =>
  truckHeaders.map((value) => ({
    ...textCell(value),
    fontWeight: 'bold' as const,
    backgroundColor: '#244D3C',
    textColor: '#FFFFFF',
  }));
const columns = truckHeaders.map((_, index) => ({
  width: [38, 20, 23, 18, 23, 22, 34, 18, 36, 18][index],
}));
export async function createTruckWorkbook(
  trucks: Master[],
  masters: Master[],
  template = false,
): Promise<Blob> {
  const { default: write } = await import('write-excel-file/universal');
  const data: SheetData = [header()];
  if (template) {
    for (let index = 0; index < 100; index++) data.push(truckHeaders.map(() => textCell('')));
  } else
    for (const truck of trucks) {
      data.push([
        textCell(truck.id),
        textCell(truck.name),
        textCell(truck.province ?? ''),
        textCell(truck.truckType ? truckTypes[truck.truckType] : ''),
        textCell(truck.phone ?? ''),
        textCell(truck.nickname ?? ''),
        textCell(tagNames(truck, masters).join(', ')),
        { value: truck.capacity, type: Number, format: '0.###' },
        textCell(truck.detail),
        textCell(truck.active ? 'ใช้งาน' : 'ปิดใช้งาน'),
      ]);
    }
  const example: SheetData = [
    header(),
    [
      '',
      '81-1234',
      'กรุงเทพมหานคร',
      'หกล้อ',
      '0812345678',
      'รถเล็ก',
      'ทีม A, งานประจำ',
      6,
      'ตัวอย่างรถหกล้อ',
      'ใช้งาน',
    ].map((value) => (typeof value === 'number' ? { value, type: Number } : textCell(value))),
    [
      '',
      '82-5678',
      'ภูเก็ต',
      'สิบล้อ',
      '0898765432',
      'รถใหญ่',
      'ทีม B',
      12,
      'ตัวอย่างรถสิบล้อ',
      'ใช้งาน',
    ].map((value) => (typeof value === 'number' ? { value, type: Number } : textCell(value))),
  ];
  const instructions: SheetData = [
    ['วิธีใช้งาน'],
    ['กรอกข้อมูลในชีต Trucks และคงหัวคอลัมน์เดิมทุกช่อง'],
    ['ทะเบียนรถเป็นข้อมูลบังคับ ช่องอื่นเว้นว่างได้'],
    ['รหัสรถ: เว้นว่างเพื่อเพิ่มใหม่ หรือใช้รหัสเดิมจากไฟล์ส่งออกเมื่อต้องการแก้ไข'],
    ['เบอร์โทรและทะเบียนต้องเป็นข้อความ เพื่อรักษาเลข 0 นำหน้า'],
    ['ประเภทรถ: หกล้อ / สิบล้อ / อื่น ๆ หรือเว้นว่าง'],
    ['แท็กทีม: คั่นแต่ละแท็กด้วย , เช่น ทีม A, งานประจำ'],
    ['แท็กใหม่จะถูกสร้างเมื่อยืนยันนำเข้า ไม่สร้างจากชีตตัวอย่างหรือรายการแท็ก'],
    ['สถานะ: ใช้งาน / ปิดใช้งาน หรือเว้นว่างเพื่อใช้งาน'],
    ['การนำเข้าค่าเริ่มต้นจะข้ามรถเดิม เปิดตัวเลือกอัปเดตเมื่อตั้งใจแก้ไขเท่านั้น'],
    [
      'การอัปเดตจะแทนค่าคอลัมน์ในไฟล์ ช่องว่างล้างข้อมูลเดิม; ไฟล์เก่าไม่มีชื่อเล่นจะคงชื่อเล่นเดิม',
    ],
    ['ทะเบียนเดียวกันต่างจังหวัดเป็นคนละรถ; รถเก่าไม่ระบุจังหวัดจะให้ตรวจอัปเดต'],
    ['จำกัด 1,000 แถว และขนาดไฟล์ 5 MB ต่อครั้ง'],
    ['ตัวอย่างข้อมูลอยู่ในชีต Examples ไม่นำเข้าอัตโนมัติ'],
  ];
  const tags: SheetData = [
    ['แท็กทีม', 'สถานะ'],
    ...masters
      .filter((item) => item.kind === 'tag')
      .map((tag) => [tag.name, tag.active ? 'ใช้งาน' : 'ปิดใช้งาน']),
  ];
  return write([
    { sheet: 'Trucks', data, columns },
    { sheet: 'Instructions', data: instructions, columns: [{ width: 110 }] },
    { sheet: 'Examples', data: example, columns },
    { sheet: 'Tags', data: tags, columns: [{ width: 35 }, { width: 18 }] },
  ]).toBlob();
}
export async function readTruckWorkbook(input: ArrayBuffer) {
  if (input.byteLength > 5 * 1024 * 1024) throw Error('ไฟล์ต้องมีขนาดไม่เกิน 5 MB');
  validateWorkbookArchive(input);
  try {
    const {
      default: readWorkbook,
      readSheet,
      SheetNotFoundError,
    } = await import('read-excel-file/universal');
    try {
      return parseTruckRows(await readSheet(input, 'Trucks'));
    } catch (error) {
      if (!(error instanceof SheetNotFoundError)) throw error;
    }
    // A renamed data sheet is safe only when its schema identifies one unambiguous table.
    // Examples and reference sheets must never become operational records.
    const sheets = (await readWorkbook(input)).filter(
      ({ sheet, data }) =>
        !['examples', 'instructions', 'tags'].includes(sheet.toLowerCase()) &&
        legacyTruckHeaders.every((header) =>
          data[0]?.some((cell) => typeof cell === 'string' && cell.trim() === header),
        ),
    );
    if (sheets.length > 1)
      throw Error('พบหลายชีตข้อมูลรถ กรุณาตั้งชื่อชีตที่ต้องการนำเข้าเป็น Trucks');
    if (!sheets.length)
      throw Error('ไม่พบชีตข้อมูลรถที่มีหัวคอลัมน์ครบ กรุณาใช้ชีต Trucks ตามไฟล์ตัวอย่าง');
    return parseTruckRows(sheets[0].data);
  } catch (error) {
    if (error instanceof Error && /คอลัมน์|หัวตาราง|1,000|ทะเบียน|หลายชีต/.test(error.message))
      throw error;
    throw Error('อ่านไฟล์ Excel ไม่สำเร็จ กรุณาใช้ .xlsx ที่มีชีต Trucks ตามไฟล์ตัวอย่าง');
  }
}
