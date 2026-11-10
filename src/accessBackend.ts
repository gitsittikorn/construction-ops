import { getFirebaseIdToken, getSessionIdentity } from './firebase';
import { cacheOwner, getWorkspaceSession, type CompanyScope } from './workspaceIdentity';

const base = (
  import.meta.env.VITE_ACCESS_BACKEND_URL ||
  import.meta.env.VITE_DRIVE_BACKEND_URL ||
  ''
).replace(/\/$/, '');
export const accessBackendConfigured = Boolean(base);
let accessEndpointAvailable: boolean | undefined;
export async function accessBackendAvailable() {
  if (!accessBackendConfigured) return false;
  if (accessEndpointAvailable === undefined) await listAccessCompanies();
  return accessEndpointAvailable === true;
}
export type AccessRole = 'super_admin' | 'admin' | 'staff' | 'viewer';
export const accessRoleLabels: Record<AccessRole, string> = {
  super_admin: 'ผู้ดูแลสูงสุด',
  admin: 'ผู้จัดการระบบ',
  staff: 'พนักงานบันทึกข้อมูล',
  viewer: 'ผู้ดูข้อมูลเท่านั้น',
};
const aliases = {
  super_admin: 'owner',
  admin: 'manager',
  staff: 'operator',
  viewer: 'viewer',
} as const;
export interface AccessUser {
  uid: string | null;
  email: string;
  name: string;
  role: AccessRole;
  status: 'enabled' | 'disabled' | 'removed';
  revision: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  createdBy: string;
  updatedBy: string;
}
export interface AccessAudit {
  id: string;
  actor: string;
  action: string;
  email?: string;
  at: string;
}
const messages: Record<string, string> = {
  not_found:
    'Backend รุ่นนี้ยังไม่มีบริการสิทธิ์อีเมล กรุณาให้ผู้ดูแลอัปเดต Backend ก่อนเปิดนโยบายใหม่',
  access_denied: 'บัญชีนี้ไม่ได้รับอนุญาต หรือสิทธิ์ถูกปิด กรุณาติดต่อผู้ดูแลสูงสุด',
  forbidden: 'บัญชีนี้ไม่มีสิทธิ์จัดการผู้ใช้งาน',
  google_identity_required: 'กรุณาเข้าสู่ระบบด้วยบัญชี Google ที่ยืนยันอีเมลแล้ว',
  unauthorized: 'เซสชันหมดอายุหรือบัญชีเปลี่ยน กรุณาเข้าสู่ระบบ Google ใหม่',
  access_policy_required:
    'บริษัทยังไม่ได้เปิดระบบอนุมัติอีเมล กรุณาให้ผู้ดูแลตรวจขั้นตอนย้ายสิทธิ์',
  last_super_admin:
    'ต้องเหลือผู้ดูแลสูงสุดที่เข้าระบบได้อย่างน้อย 1 คน อีเมลที่ยังไม่เคยเข้าระบบไม่นับ',
  stale_user: 'สิทธิ์รายการนี้เปลี่ยนแล้ว กรุณาโหลดรายชื่อใหม่ก่อนบันทึก',
  invalid_email: 'กรุณาระบุอีเมล Google ให้ถูกต้อง',
  invalid_request: 'ข้อมูลผู้ใช้งานไม่ถูกต้อง กรุณาตรวจชื่อ อีเมล บทบาท และสถานะ',
  rate_limited: 'เรียกใช้งานบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  mfa_required: 'บัญชีผู้ดูแลต้องยืนยันตัวตนหลายขั้นตอนก่อนใช้งาน กรุณาติดต่อผู้ดูแลการตั้งค่า MFA',
};
export function accessErrorMessage(code: unknown) {
  return typeof code === 'string' && Object.hasOwn(messages, code)
    ? messages[code]
    : 'บริการสิทธิ์ไม่พร้อม กรุณาให้ผู้ดูแลตรวจการตั้งค่า Backend';
}
async function call<T>(path: string, company?: string, body: object = {}): Promise<T> {
  const user = getSessionIdentity(),
    initial = getWorkspaceSession();
  if (!user || !base)
    throw Object.assign(
      Error('ยังไม่ได้ตั้งค่าบริการจัดการสิทธิ์ หรือยังไม่ได้เข้าสู่ระบบ Google'),
      { code: 'permission-denied' },
    );
  const selection = initial ? cacheOwner(initial) : '';
  const active = () => {
    const scope = getWorkspaceSession();
    return getSessionIdentity()?.uid === user.uid && (scope ? cacheOwner(scope) : '') === selection;
  };
  const url = new URL(base);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  )
    throw Error('URL บริการจัดการสิทธิ์ต้องเป็น HTTPS');
  const token = await getFirebaseIdToken(user.uid);
  if (!active()) throw Object.assign(Error(messages.unauthorized), { code: 'permission-denied' });
  let response: Response;
  try {
    response = await fetch(`${base}/api/access/${path}`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(25000),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(company ? { 'X-Company-ID': company } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw Object.assign(
      Error('ติดต่อบริการสิทธิ์ไม่สำเร็จ ข้อมูลค้างยังอยู่ กรุณาลองใหม่เมื่อออนไลน์'),
      { code: 'unavailable' },
    );
  }
  if (!active()) throw Object.assign(Error(messages.unauthorized), { code: 'permission-denied' });
  const value = await response.json().catch(() => null);
  if (!response.ok)
    throw Object.assign(Error(accessErrorMessage(value?.error)), {
      code: response.status >= 500 ? 'unavailable' : 'permission-denied',
      reason:
        typeof value?.error === 'string' && Object.hasOwn(messages, value.error)
          ? value.error
          : 'service_unavailable',
    });
  if (!value || typeof value !== 'object') throw Error('บริการสิทธิ์ส่งข้อมูลไม่ถูกต้อง');
  return value as T;
}
export async function listAccessCompanies() {
  let result: { companies: { companyId: string; name: string }[] };
  try {
    result = await call<{ companies: { companyId: string; name: string }[] }>('companies');
  } catch (error) {
    if (error && typeof error === 'object' && 'reason' in error && error.reason === 'not_found') {
      accessEndpointAvailable = false;
      return [];
    }
    throw error;
  }
  if (
    !Array.isArray(result.companies) ||
    result.companies.length > 50 ||
    result.companies.some(
      (c) =>
        typeof c.companyId !== 'string' ||
        !c.companyId ||
        c.companyId.length > 128 ||
        c.companyId.includes('/') ||
        typeof c.name !== 'string',
    )
  )
    throw Error('รายการบริษัทไม่ถูกต้อง');
  accessEndpointAvailable = true;
  return result.companies;
}
export async function resolveAccessCompany(actorUid: string, companyId: string) {
  const result = await call<
    CompanyScope & { name: string; accessRole: AccessRole; accessPolicy: 'allowlist-v1' }
  >('session', companyId);
  if (
    result.actorUid !== actorUid ||
    result.companyId !== companyId ||
    result.accessPolicy !== 'allowlist-v1' ||
    !Object.hasOwn(aliases, result.accessRole) ||
    aliases[result.accessRole] !== result.role ||
    typeof result.name !== 'string' ||
    result.name.length > 200
  )
    throw Error('ข้อมูลสิทธิ์บริษัทไม่ถูกต้อง');
  cacheOwner(result);
  return result;
}
export const listAccessUsers = (company: string, search = '', after = '') =>
  call<{ users: AccessUser[]; next: string | null }>('users/list', company, { search, after });
export const saveAccessUser = (
  company: string,
  input: Pick<AccessUser, 'email' | 'name' | 'role' | 'status'> & {
    expectedRevision: number | null;
  },
) => call<{ user: AccessUser; sessionRevocationPending: boolean }>('users/save', company, input);
export const listAccessAudit = (company: string) =>
  call<{ events: AccessAudit[] }>('audit', company);
