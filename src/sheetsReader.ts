/** Read-only Google Sheets requests shared by every sheet import. */
export function sheetsReader(token: string, id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error('รหัส Google Sheets ไม่ถูกต้อง');
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`;
  let received = 0;
  return async function get<T>(path: string): Promise<T> {
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
  };
}
