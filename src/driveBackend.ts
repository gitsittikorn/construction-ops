import { activeCacheOwner, companyId } from './workspaceIdentity';
import { getFirebaseIdToken, getSessionIdentity } from './firebase';
import type { DriveSession } from './driveSession';

const base = (import.meta.env.VITE_DRIVE_BACKEND_URL ?? '').replace(/\/$/, '');
export const driveBackendConfigured = Boolean(base);
export class DriveBackendError extends Error {
  constructor(public code: string) {
    super(
      code === 'reconnect_required'
        ? 'กรุณาเชื่อมต่อ Google Drive ใหม่เพื่ออนุญาตการต่ออายุอัตโนมัติ'
        : code === 'oauth_client_mismatch'
          ? 'Client ID ของเว็บกับ backend ไม่ตรงกัน กรุณาตรวจสอบการตั้งค่าและรุ่นที่ deploy'
          : code === 'account_mismatch'
            ? 'กรุณาใช้บัญชี Drive เดียวกับ Firebase'
            : code === 'unauthorized'
              ? 'กรุณาเข้าสู่ระบบ Firebase ใหม่'
              : code === 'forbidden'
                ? 'บัญชีนี้ยังไม่มีสิทธิ์ใช้งาน backend'
                : code === 'rate_limited'
                  ? 'เรียกใช้งานบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'
                  : 'ติดต่อ backend ไม่สำเร็จ กรุณาลองใหม่ ไฟล์ยังอยู่ในเครื่อง',
    );
  }
}
async function call(path: string, body?: object, method = 'POST'): Promise<unknown> {
  const user = getSessionIdentity();
  if (!user) throw new DriveBackendError('unauthorized');
  const workspace = activeCacheOwner(user.uid);
  const company = companyId(workspace);
  const url = new URL(base);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  )
    throw new DriveBackendError('invalid_backend_url');
  const idToken = await getFirebaseIdToken(user.uid);
  if (getSessionIdentity()?.uid !== user.uid || activeCacheOwner(user.uid) !== workspace)
    throw new DriveBackendError('unauthorized');
  let response: Response;
  try {
    response = await fetch(`${base}/api/drive/${path}`, {
      method,
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(company !== user.uid ? { 'X-Company-ID': company } : {}),
      },
      body: method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(90000),
    });
  } catch {
    throw new DriveBackendError('service_unavailable');
  }
  if (getSessionIdentity()?.uid !== user.uid || activeCacheOwner(user.uid) !== workspace)
    throw new DriveBackendError('unauthorized');
  if (response.status === 204) return null;
  let data: Record<string, unknown>;
  try {
    data = await response.json();
  } catch {
    throw new DriveBackendError('service_unavailable');
  }
  if (!response.ok) {
    const allowed = [
      'reconnect_required',
      'unauthorized',
      'forbidden',
      'account_mismatch',
      'rate_limited',
    ];
    throw new DriveBackendError(
      typeof data.error === 'string' && allowed.includes(data.error)
        ? data.error
        : 'service_unavailable',
    );
  }
  if (
    typeof data.token !== 'string' ||
    !data.token ||
    typeof data.expiresAt !== 'number' ||
    !Number.isFinite(data.expiresAt) ||
    data.expiresAt <= Date.now()
  )
    throw new DriveBackendError('invalid_response');
  if (
    !import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    data.clientId !== import.meta.env.VITE_GOOGLE_CLIENT_ID
  )
    throw new DriveBackendError('oauth_client_mismatch');
  return { token: data.token, expiresAt: data.expiresAt } satisfies DriveSession;
}
export const restoreDriveConnection = (force = false) =>
  call('session', { force }) as Promise<DriveSession>;
export const exchangeDriveCode = (code: string) =>
  call('exchange', { code }) as Promise<DriveSession>;
export const disconnectDriveBackend = () => call('connection', undefined, 'DELETE');
