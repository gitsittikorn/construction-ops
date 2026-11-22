export type CompanyRole = 'owner' | 'manager' | 'operator' | 'viewer';
export interface CompanyScope {
  companyId: string;
  actorUid: string;
  role: CompanyRole;
  accessPolicy?: 'allowlist-v1';
  accessRole?: 'super_admin' | 'admin' | 'staff' | 'viewer';
}
const prefix = 'company-v1:';
let activeScope: CompanyScope | null = null;
export function cacheOwner(scope: CompanyScope): string {
  if (
    ![scope.companyId, scope.actorUid].every((id) => id && id.length <= 128 && !id.includes('/')) ||
    !['owner', 'manager', 'operator', 'viewer'].includes(scope.role)
  )
    throw Error('รหัสบริษัทหรือสิทธิ์ไม่ถูกต้อง');
  return scope.companyId === scope.actorUid && scope.role === 'owner'
    ? scope.actorUid
    : (
        prefix + encodeURIComponent(JSON.stringify([scope.companyId, scope.actorUid, scope.role]))
      ).padEnd(129, '~');
}
export function sharedCache(owner: string) {
  return owner.length > 128 && owner.startsWith(prefix);
}
export function ownerScope(owner: string): CompanyScope {
  if (!sharedCache(owner)) return { companyId: owner, actorUid: owner, role: 'owner' };
  try {
    const value: unknown = JSON.parse(
      decodeURIComponent(owner.slice(prefix.length).replace(/~+$/, '')),
    );
    if (!Array.isArray(value) || value.length !== 3) throw Error();
    const scope = { companyId: value[0], actorUid: value[1], role: value[2] } as CompanyScope;
    if (cacheOwner(scope) !== owner) throw Error();
    return scope;
  } catch {
    throw Error('พื้นที่ทำงานไม่ถูกต้อง กรุณาเลือกบริษัทใหม่');
  }
}
export const companyId = (owner: string) => ownerScope(owner).companyId;
export const actorUid = (owner: string) => ownerScope(owner).actorUid;
export const companyRole = (owner: string) => ownerScope(owner).role;
export const managesBusiness = (owner: string) => ['owner', 'manager'].includes(companyRole(owner));
export const recordsBusiness = (owner: string) => companyRole(owner) !== 'viewer';
export function setWorkspaceSession(scope: CompanyScope | null) {
  activeScope = scope ? { ...scope } : null;
}
export function getWorkspaceSession() {
  return activeScope ? { ...activeScope } : null;
}
export function activeCacheOwner(uid: string) {
  return activeScope?.actorUid === uid ? cacheOwner(activeScope) : uid;
}
// These identify local IndexedDB keys only. Server authorization must independently
// verify membership; an encoded role is never an authority claim.
export const uploadStore = (owner: string) => (sharedCache(owner) ? 'scopedUploads' : 'uploads');
export const uploadKey = (owner: string, id: string): IDBValidKey =>
  sharedCache(owner) ? [owner, id] : id;

export function workspaceMatches(owner: string, uid?: string) {
  return (
    Boolean(uid) && actorUid(owner) === uid && (!activeScope || cacheOwner(activeScope) === owner)
  );
}
