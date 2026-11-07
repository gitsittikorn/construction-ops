import type { UploadRecord } from './uploads';
import { withDeadline } from './async';
import { driveBackendConfigured, exchangeDriveCode } from './driveBackend';
export const driveScope = 'https://www.googleapis.com/auth/drive.file';
export const driveConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}
interface OAuthClient {
  requestAccessToken: (options: { prompt: string }) => void;
}
interface GoogleIdentity {
  accounts: {
    oauth2: {
      initCodeClient?: (options: {
        client_id: string;
        scope: string;
        login_hint: string;
        ux_mode: 'popup';
        include_granted_scopes: boolean;
        callback: (response: { code?: string; error?: string }) => void;
        error_callback: () => void;
      }) => { requestCode: () => void };
      initTokenClient: (options: {
        client_id: string;
        scope: string;
        hint: string;
        callback: (response: TokenResponse) => void;
        error_callback: () => void;
      }) => OAuthClient;
    };
  };
}
declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}
let library: Promise<void> | undefined;
export function loadGoogleIdentity() {
  if (window.google) return Promise.resolve();
  if (library) return library;
  library = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    const timer = setTimeout(() => {
      script.remove();
      library = undefined;
      reject(Error('โหลด Google ไม่สำเร็จ กรุณาลองใหม่'));
    }, 15000);
    script.onload = () => {
      clearTimeout(timer);
      if (window.google) resolve();
      else {
        library = undefined;
        reject(Error('Google Identity ไม่พร้อมใช้งาน'));
      }
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      library = undefined;
      reject(Error('โหลด Google ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต'));
    };
    document.head.appendChild(script);
  });
  return library;
}
export function requestDriveToken(
  email: string,
  additionalScopes: string[] = [],
): Promise<{ token: string; expiresAt: number }> {
  if (!driveConfigured || !window.google)
    return Promise.reject(Error('Google Drive ยังไม่พร้อม กรุณาตรวจสอบ Client ID และการเชื่อมต่อ'));
  if (driveBackendConfigured && additionalScopes.length === 0) {
    const code = new Promise<string>((resolve, reject) => {
      const init = window.google!.accounts.oauth2.initCodeClient;
      if (!init) {
        reject(Error('Google Identity ยังไม่พร้อม'));
        return;
      }
      const client = init({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        scope: driveScope,
        login_hint: email,
        ux_mode: 'popup',
        include_granted_scopes: false,
        callback: (response) =>
          response.code && !response.error
            ? resolve(response.code)
            : reject(Error('ไม่ได้รับสิทธิ์ Google Drive')),
        error_callback: () => reject(Error('หน้าต่างเชื่อมต่อถูกปิดหรือถูกบล็อก กรุณาลองใหม่')),
      });
      client.requestCode();
    });
    return withDeadline(code, 90000, 'รอการอนุญาต Google Drive นานเกินไป').then(exchangeDriveCode);
  }
  return withDeadline(
    new Promise<{ token: string; expiresAt: number }>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        scope: [driveScope, ...additionalScopes].join(' '),
        hint: email,
        callback: (response) => {
          if (
            response.error ||
            !response.access_token ||
            ![driveScope, ...additionalScopes].every((scope) =>
              response.scope?.split(' ').includes(scope),
            ) ||
            !response.expires_in
          ) {
            reject(Error('ไม่ได้รับสิทธิ์ Google Drive กรุณาอนุญาตการเข้าถึงไฟล์'));
            return;
          }
          resolve({
            token: response.access_token,
            expiresAt: Date.now() + Number(response.expires_in) * 1000 - 60000,
          });
        },
        error_callback: () => reject(Error('หน้าต่างเชื่อมต่อถูกปิดหรือถูกบล็อก กรุณาลองใหม่')),
      });
      client.requestAccessToken({ prompt: '' });
    }),
    90000,
    'รอการอนุญาต Google Drive นานเกินไป กรุณาปิดหน้าต่างเดิมแล้วกดเชื่อมต่ออีกครั้ง',
  );
}
const base = 'https://www.googleapis.com/drive/v3';
export class DriveError extends Error {
  constructor(public status: number) {
    super(
      status === 401
        ? 'สิทธิ์ Drive หมดอายุ กรุณากดเชื่อมต่ออีกครั้ง'
        : status === 403
          ? 'Drive ไม่อนุญาต กรุณาตรวจสอบ API และสิทธิ์บัญชี'
          : `Google Drive ตอบกลับผิดพลาด (${status})`,
    );
  }
}
async function call(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new DriveError(response.status);
  return response;
}
export async function verifyDriveAccount(token: string, email: string) {
  const response = await call(token, '/about?fields=user(emailAddress)');
  const data = await response.json();
  if (!email || data.user?.emailAddress?.toLowerCase() !== email.toLowerCase())
    throw Error('กรุณาเชื่อม Drive ด้วยบัญชีเดียวกับที่เข้าสู่ระบบ');
}
export async function generateDriveIds(token: string, count: number): Promise<string[]> {
  const result = await (
    await call(token, `/files/generateIds?count=${count}&space=drive&type=files`)
  ).json();
  if (!Array.isArray(result.ids) || result.ids.length !== count)
    throw Error('สร้าง Drive File ID ไม่สำเร็จ');
  return result.ids;
}
export interface DriveFile {
  id: string;
  name?: string;
  size?: string;
  mimeType: string;
  trashed?: boolean;
  parents?: string[];
  appProperties?: Record<string, string>;
}
// Inventory is limited to files created by this app for the current owner.
export async function listOwnedDriveFiles(token: string, owner: string): Promise<DriveFile[]> {
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const query = `trashed = false and mimeType != 'application/vnd.google-apps.folder' and appProperties has { key='owner' and value='${escape(owner)}' }`;
  const files: DriveFile[] = [];
  const seen = new Set<string>();
  let pageToken = '';
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({
      q: query,
      pageSize: '100',
      fields:
        'nextPageToken,incompleteSearch,files(id,name,size,mimeType,trashed,parents,appProperties)',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const result = await (await call(token, `/files?${params}`)).json();
    if (result.incompleteSearch || !Array.isArray(result.files))
      throw Error('Drive ส่งรายการไฟล์ไม่ครบ กรุณาตรวจใหม่ภายหลัง');
    for (const file of result.files) {
      if (typeof file.id !== 'string' || !file.id || file.appProperties?.owner !== owner)
        throw Error('รายการไฟล์ Drive ไม่ตรงกับบัญชี');
      files.push(file);
    }
    if (!result.nextPageToken) return files;
    if (typeof result.nextPageToken !== 'string' || seen.has(result.nextPageToken))
      throw Error('Drive ส่งหน้ารายการซ้ำ กรุณาตรวจใหม่ภายหลัง');
    pageToken = result.nextPageToken;
    seen.add(pageToken);
  }
  throw Error('รายการไฟล์มากเกินขอบเขตการตรวจครั้งนี้ ยังยืนยันว่าตรวจครบไม่ได้');
}
export async function getDriveFile(token: string, id: string): Promise<DriveFile | null> {
  try {
    return await (
      await call(
        token,
        `/files/${encodeURIComponent(id)}?fields=id,name,size,mimeType,trashed,parents,appProperties`,
      )
    ).json();
  } catch (error) {
    if (error instanceof DriveError && error.status === 404) return null;
    throw error;
  }
}
export async function ensureDriveFolder(
  token: string,
  id: string,
  name: string,
  parentId?: string,
  renameExisting = false,
) {
  async function verifyExisting(existing: DriveFile) {
    if (
      existing.trashed ||
      existing.mimeType !== 'application/vnd.google-apps.folder' ||
      (parentId && !existing.parents?.includes(parentId))
    )
      throw Error('โฟลเดอร์ Drive ถูกย้าย ลบ หรือชนิดไม่ถูกต้อง');
    if (renameExisting && existing.name !== name)
      await call(token, `/files/${encodeURIComponent(id)}?fields=id,name`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
  }
  const existing = await getDriveFile(token, id);
  if (existing) return verifyExisting(existing);
  try {
    await call(token, '/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    });
  } catch (error) {
    if (error instanceof DriveError && error.status === 409) {
      const found = await getDriveFile(token, id);
      if (found) return verifyExisting(found);
    }
    throw error;
  }
}
export function validateUploadedFile(file: DriveFile, record: UploadRecord) {
  if (
    file.trashed ||
    file.id !== record.driveId ||
    Number(file.size) !== record.size ||
    file.mimeType !== record.mimeType ||
    file.appProperties?.operationId !== record.id ||
    file.appProperties?.owner !== record.owner ||
    !file.parents?.includes(record.folderId)
  )
    throw Error('ผลอัปโหลดไม่ตรงกับไฟล์ต้นฉบับ กรุณาตรวจสอบ');
}
export async function uploadOriginal(
  token: string,
  record: UploadRecord,
  onProgress: (percent: number) => void,
) {
  const existing = await getDriveFile(token, record.driveId);
  if (existing) {
    validateUploadedFile(existing, record);
    onProgress(100);
    return;
  }
  if (!record.blob) throw Error('ไม่พบไฟล์ต้นฉบับในอุปกรณ์');
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': record.mimeType,
        'X-Upload-Content-Length': String(record.size),
      },
      body: JSON.stringify({
        id: record.driveId,
        name: record.name,
        mimeType: record.mimeType,
        parents: [record.folderId],
        appProperties: { operationId: record.id, owner: record.owner, projectId: record.projectId },
      }),
      signal: AbortSignal.timeout(60000),
    },
  );
  if (response.status !== 409) {
    if (!response.ok) throw new DriveError(response.status);
    const location = response.headers.get('Location');
    if (!location || new URL(location).origin !== 'https://www.googleapis.com')
      throw Error('ไม่พบ URL อัปโหลดที่ถูกต้อง');
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', location);
      xhr.timeout = 120000;
      xhr.setRequestHeader('Content-Type', record.mimeType);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable)
          onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new DriveError(xhr.status));
      xhr.onerror = () => reject(Error('เครือข่ายขัดข้อง ไฟล์ยังอยู่ในอุปกรณ์ กดลองใหม่ได้'));
      xhr.ontimeout = () => reject(Error('อัปโหลดหมดเวลา กรุณาลองใหม่'));
      xhr.send(record.blob!);
    });
  }
  const uploaded = await getDriveFile(token, record.driveId);
  if (!uploaded) throw Error('ยังยืนยันผลอัปโหลดไม่ได้ กรุณาลองใหม่');
  validateUploadedFile(uploaded, record);
  onProgress(100);
}
export async function downloadOriginal(token: string, id: string): Promise<Blob> {
  return (await call(token, `/files/${encodeURIComponent(id)}?alt=media`)).blob();
}
export async function downloadVerifiedOriginal(token: string, record: UploadRecord): Promise<Blob> {
  if (record.status !== 'synced' || !record.driveId || !record.folderId)
    throw Error('ต้องมีข้อมูลอัปโหลดที่ยืนยันแล้วก่อนกู้คืนต้นฉบับ');
  const file = await getDriveFile(token, record.driveId);
  if (!file) throw Error('ไม่พบต้นฉบับใน Drive ข้อมูลในเครื่องยังอยู่');
  validateUploadedFile(file, record);
  const blob = await downloadOriginal(token, record.driveId);
  if (blob.size !== record.size || blob.type.split(';')[0] !== record.mimeType)
    throw Error('ไฟล์ที่ดาวน์โหลดไม่ตรงกับต้นฉบับ กรุณาลองใหม่');
  return blob;
}
