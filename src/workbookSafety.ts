// Bound ZIP resource declarations before the spreadsheet library allocates buffers.
// XLSX uses ordinary single-disk ZIP; ZIP64, encryption and unusual layouts are rejected.
export function validateWorkbookArchive(input: ArrayBuffer) {
  const bytes = new Uint8Array(input),
    view = new DataView(input);
  const invalid = () => {
    throw Error('อ่านไฟล์ Excel ไม่สำเร็จ: โครงสร้างไม่ถูกต้องหรือไม่รองรับ');
  };
  const limit = () => {
    throw Error('ข้อมูลหลังแตกไฟล์ Excel ใหญ่เกินขอบเขต กรุณาแบ่งไฟล์ก่อนนำเข้า');
  };
  if (bytes.length < 22 || bytes.length > 5 * 1024 * 1024) invalid();
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0) invalid();
  const count = view.getUint16(end + 10, true),
    size = view.getUint32(end + 12, true),
    offset = view.getUint32(end + 16, true);
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    view.getUint16(end + 8, true) !== count ||
    !count ||
    count === 65535 ||
    offset + size !== end
  )
    invalid();
  if (count > 256 || size > 1024 * 1024) limit();
  let cursor = offset,
    total = 0;
  const names = new Set<string>(),
    ranges: [number, number][] = [];
  const decode = new TextDecoder('utf-8', { fatal: true });
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) invalid();
    const flags = view.getUint16(cursor + 8, true),
      method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true),
      expanded = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true),
      extra = view.getUint16(cursor + 30, true),
      comment = view.getUint16(cursor + 32, true);
    const local = view.getUint32(cursor + 42, true),
      next = cursor + 46 + nameLength + extra + comment;
    if (
      next > end ||
      !nameLength ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      view.getUint16(cursor + 34, true)
    )
      invalid();
    total += expanded;
    if (expanded > 20 * 1024 * 1024 || total > 40 * 1024 * 1024) limit();
    const name = decode.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (
      names.has(name) ||
      name.startsWith('/') ||
      name.includes('\\') ||
      name.includes('\0') ||
      name.split('/').some((part) => ['..', '__proto__', 'constructor', 'prototype'].includes(part))
    )
      invalid();
    names.add(name);
    if (
      local + 30 > offset ||
      view.getUint32(local, true) !== 0x04034b50 ||
      view.getUint16(local + 6, true) !== flags ||
      view.getUint16(local + 8, true) !== method
    )
      invalid();
    const localName = view.getUint16(local + 26, true),
      localExtra = view.getUint16(local + 28, true);
    const start = local + 30 + localName + localExtra,
      finish = start + compressed;
    if (
      finish > offset ||
      decode.decode(bytes.subarray(local + 30, local + 30 + localName)) !== name
    )
      invalid();
    if (
      !(flags & 8) &&
      (view.getUint32(local + 18, true) !== compressed ||
        view.getUint32(local + 22, true) !== expanded ||
        view.getUint32(local + 14, true) !== view.getUint32(cursor + 16, true))
    )
      invalid();
    if (ranges.some(([a, b]) => local < b && finish > a)) invalid();
    ranges.push([local, finish]);
    cursor = next;
  }
  if (cursor !== end) invalid();
}
