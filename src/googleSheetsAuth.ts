import { requestGoogleToken } from './drive';
import { sheetsReadScope, sheetsWriteScope } from './truckSheets';

export function requestSheetsToken(email: string, scope: string) {
  if (![sheetsReadScope, sheetsWriteScope].includes(scope))
    return Promise.reject(Error('ขอบเขตสิทธิ์ Google Sheets ไม่ถูกต้อง'));
  return requestGoogleToken(
    email,
    ['openid', 'https://www.googleapis.com/auth/userinfo.email', scope],
    'Google Sheets',
  );
}

export async function verifySheetsAccount(token: string, email: string) {
  let response: Response;
  try {
    response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw Error('ตรวจบัญชี Google ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่');
  }
  if (!response.ok)
    throw Error(
      response.status === 401
        ? 'สิทธิ์ Google Sheets หมดอายุ กรุณากดนำเข้าและเชื่อมต่อใหม่'
        : 'ตรวจบัญชี Google ไม่สำเร็จ กรุณาอนุญาตสิทธิ์อีเมลและเชื่อมต่อใหม่',
    );
  let identity: { sub?: string; email?: string; email_verified?: boolean };
  try {
    identity = await response.json();
  } catch {
    throw Error('Google ส่งข้อมูลบัญชีไม่ถูกต้อง กรุณาเชื่อมต่อใหม่');
  }
  if (
    !identity ||
    typeof identity.sub !== 'string' ||
    !identity.sub ||
    identity.email_verified !== true ||
    typeof identity.email !== 'string' ||
    !email ||
    identity.email.toLowerCase() !== email.toLowerCase()
  )
    throw Error('กรุณาเชื่อม Google Sheets ด้วยบัญชีเดียวกับที่เข้าสู่ระบบ');
}
