import { createHash } from 'node:crypto';
import { ApiError } from './driveService.mjs';

export const accessPolicy = 'allowlist-v1';
export const roleAliases = {
  super_admin: 'owner',
  admin: 'manager',
  staff: 'operator',
  viewer: 'viewer',
};
export function normalizeEmail(value) {
  if (typeof value !== 'string') throw new ApiError(400, 'invalid_email');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email))
    throw new ApiError(400, 'invalid_email');
  return email;
}
export const emailKey = (email) => createHash('sha256').update(normalizeEmail(email)).digest('hex');
export function validCompanyId(id) {
  if (typeof id !== 'string' || !id || id.length > 128 || id.includes('/'))
    throw new ApiError(400, 'invalid_company');
  return id;
}
export function requireGoogleIdentity(user) {
  if (
    !user?.uid ||
    user.uid.length > 128 ||
    user.uid.includes('/') ||
    user.email_verified !== true ||
    user.firebase?.sign_in_provider !== 'google.com'
  )
    throw new ApiError(401, 'google_identity_required');
  return normalizeEmail(user.email);
}
export const isActiveSuper = (record) =>
  record?.status === 'enabled' &&
  record.role === 'super_admin' &&
  typeof record.uid === 'string' &&
  Boolean(record.uid);
export const grantPath = (company, email) =>
  `companies/${validCompanyId(company)}/authorized_users/${emailKey(email)}`;
