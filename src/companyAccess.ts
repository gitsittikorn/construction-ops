import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { getSessionIdentity, identityDatabase } from './firebase';
import { cacheOwner, type CompanyScope } from './workspaceIdentity';
import { withDeadline } from './async';
import { openLocalDatabase } from './storage';
import { accessBackendAvailable, resolveAccessCompany } from './accessBackend';
export const offlineGrantLifetimeMs = 12 * 60 * 60 * 1000;
const freshGrant = (value: unknown) =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  Date.now() - Date.parse(value) <= offlineGrantLifetimeMs &&
  Date.parse(value) <= Date.now() + 300000;
export interface ResolvedCompany extends CompanyScope {
  name: string;
}
export interface CompanyMember {
  uid: string;
  name: string;
  role: 'manager' | 'operator';
  enabled: boolean;
  updatedAt: string;
}
const bounded = <T>(operation: Promise<T>) =>
  withDeadline(
    operation,
    20000,
    'ตรวจสิทธิ์บริษัทไม่สำเร็จ กรุณาเชื่อมต่อแล้วลองใหม่ ข้อมูลเดิมยังอยู่',
  );
const denied = () =>
  Object.assign(Error('บัญชีนี้ไม่มีสิทธิ์ในบริษัท หรือสิทธิ์ถูกปิดแล้ว'), {
    code: 'permission-denied',
  });
function assertActor(uid: string) {
  if (getSessionIdentity()?.uid !== uid) throw denied();
}
function validId(uid: string) {
  return Boolean(uid) && uid.length <= 128 && !uid.includes('/');
}
export async function resolveCompany(
  actorUid: string,
  companyId: string,
): Promise<ResolvedCompany> {
  assertActor(actorUid);
  if (!validId(companyId)) throw Error('รหัสบริษัทไม่ถูกต้อง');
  if (await accessBackendAvailable()) {
    try {
      return await resolveAccessCompany(actorUid, companyId);
    } catch (error) {
      if (!(
        error &&
        typeof error === 'object' &&
        'reason' in error &&
        ['access_policy_required', 'not_found'].includes(String(error.reason))
      ))
        throw error;
    }
  }
  const db = identityDatabase();
  let role: CompanyScope['role'];
  if (actorUid === companyId) {
    const snapshot = await bounded(getDocFromServer(doc(db, 'admins', actorUid)));
    if (!snapshot.exists() || snapshot.data().enabled !== true) throw denied();
    role = 'owner';
  } else {
    const snapshot = await bounded(
      getDocFromServer(doc(db, 'companies', companyId, 'members', actorUid)),
    );
    const member = snapshot.data();
    if (
      !member ||
      member.uid !== actorUid ||
      member.enabled !== true ||
      !['manager', 'operator', 'viewer'].includes(member.role)
    )
      throw denied();
    role = member.role;
  }
  const profile = await bounded(getDocFromServer(doc(db, 'companies', companyId)));
  assertActor(actorUid);
  if (profile.data()?.accessPolicy === 'allowlist-v1')
    throw Object.assign(
      Error('บริษัทนี้ต้องตรวจสิทธิ์อีเมลผ่าน Backend กรุณาให้ผู้ดูแลตรวจการเชื่อมต่อ'),
      { code: 'permission-denied' },
    );
  if (role !== 'owner' && (!profile.exists() || profile.data().ownerUid !== companyId))
    throw denied();
  return { actorUid, companyId, role, name: profile.data()?.name || 'บริษัทของฉัน' };
}
export function watchCompany(
  scope: ResolvedCompany,
  onChange: (next: ResolvedCompany | null) => void,
  onError: (error: unknown) => void,
) {
  let current = { ...scope },
    valid = true;
  const failed = (error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied')
      valid = false;
    onError(error);
  };
  const ref =
    scope.role === 'owner' && scope.actorUid === scope.companyId && !scope.accessPolicy
      ? doc(identityDatabase(), 'admins', scope.actorUid)
      : doc(identityDatabase(), 'companies', scope.companyId, 'members', scope.actorUid);
  const unsubscribe = onSnapshot(
    ref,
    (snapshot) => {
      if (snapshot.metadata.fromCache || !valid) return;
      const data = snapshot.data();
      if (
        !data ||
        data.enabled !== true ||
        ((current.role !== 'owner' || current.accessPolicy) &&
          !['owner', 'manager', 'operator', 'viewer'].includes(data.role))
      ) {
        valid = false;
        onChange(null);
      } else if ((current.role !== 'owner' || current.accessPolicy) && data.role !== current.role) {
        current = {
          ...current,
          role: data.role,
          ...(data.accessRole ? { accessRole: data.accessRole } : {}),
        };
        onChange({ ...current });
      }
    },
    failed,
  );
  const profile = onSnapshot(
    doc(identityDatabase(), 'companies', scope.companyId),
    (snapshot) => {
      if (
        valid &&
        !snapshot.metadata.fromCache &&
        snapshot.data()?.accessPolicy === 'allowlist-v1' &&
        !current.accessPolicy
      ) {
        valid = false;
        onChange(null);
        return;
      }
      if (
        valid &&
        !snapshot.metadata.fromCache &&
        snapshot.exists() &&
        snapshot.data().name !== current.name
      ) {
        current = { ...current, name: snapshot.data().name };
        onChange({ ...current });
      }
    },
    failed,
  );
  return () => {
    valid = false;
    unsubscribe();
    profile();
  };
}
export async function readCompanySelection(
  uid: string,
): Promise<(ResolvedCompany & { verifiedAt: string }) | null> {
  const db = await openLocalDatabase();
  try {
    if (await db.get('driveSettings', ['company-access-denied', uid])) return null;
    const value = await db.get('driveSettings', ['company-selection', uid]);
    if (!value) {
      const legacy = await db.get('state', uid),
        verifiedAt = legacy?.sync?.adminVerifiedAt;
      return freshGrant(verifiedAt)
        ? { actorUid: uid, companyId: uid, role: 'owner', name: 'บริษัทของฉัน', verifiedAt }
        : null;
    }
    if (
      value.actorUid !== uid ||
      typeof value.name !== 'string' ||
      value.name.length > 200 ||
      !freshGrant(value.verifiedAt)
    )
      return null;
    cacheOwner(value);
    return value;
  } finally {
    db.close();
  }
}
export async function rememberCompany(scope: ResolvedCompany) {
  const db = await openLocalDatabase();
  try {
    await db.delete('driveSettings', ['company-access-denied', scope.actorUid]);
    await db.put('driveSettings', { ...scope, verifiedAt: new Date().toISOString() }, [
      'company-selection',
      scope.actorUid,
    ]);
  } finally {
    db.close();
  }
}
export async function invalidateCompanyGrant(uid: string) {
  const db = await openLocalDatabase();
  try {
    await db.put('driveSettings', new Date().toISOString(), ['company-access-denied', uid]);
  } finally {
    db.close();
  }
}
function ownerOnly(scope: CompanyScope) {
  assertActor(scope.actorUid);
  if (scope.role !== 'owner' || (!scope.accessPolicy && scope.companyId !== scope.actorUid))
    throw denied();
}
export async function saveCompanyProfile(scope: CompanyScope, name: string) {
  ownerOnly(scope);
  if (!name.trim() || name.trim().length > 200) throw Error('ระบุชื่อบริษัท 1–200 ตัวอักษร');
  const db = identityDatabase(),
    ref = doc(db, 'companies', scope.companyId);
  await bounded(
    runTransaction(db, async (tx) => {
      assertActor(scope.actorUid);
      const previous = await tx.get(ref),
        at = new Date().toISOString();
      const after = {
        ...(previous.data()?.accessPolicy ? { accessPolicy: previous.data()!.accessPolicy } : {}),
        ownerUid: scope.companyId,
        name: name.trim(),
        createdAt: previous.data()?.createdAt ?? at,
        updatedAt: at,
      };
      tx.set(ref, after);
      tx.set(doc(db, 'companies', scope.companyId, 'audit', crypto.randomUUID()), {
        actor: scope.actorUid,
        action: 'company-save',
        at: serverTimestamp(),
        before: previous.data() ?? null,
        after,
      });
    }),
  );
}
export async function listCompanyMembers(scope: CompanyScope): Promise<CompanyMember[]> {
  if (scope.accessPolicy) throw Error('จัดการสิทธิ์อีเมลในหน้าผู้ใช้งานและสิทธิ์ผ่าน Backend');
  ownerOnly(scope);
  const snapshot = await bounded(
    getDocsFromServer(collection(identityDatabase(), 'companies', scope.companyId, 'members')),
  );
  assertActor(scope.actorUid);
  return snapshot.docs.map((doc) => doc.data() as CompanyMember);
}
export async function saveCompanyMember(
  scope: CompanyScope,
  input: Omit<CompanyMember, 'updatedAt'>,
) {
  if (scope.accessPolicy) throw Error('จัดการสิทธิ์อีเมลในหน้าผู้ใช้งานและสิทธิ์ผ่าน Backend');
  ownerOnly(scope);
  if (
    !validId(input.uid) ||
    input.uid === scope.companyId ||
    !input.name.trim() ||
    input.name.trim().length > 200 ||
    !['manager', 'operator'].includes(input.role) ||
    typeof input.enabled !== 'boolean'
  )
    throw Error('รหัสผู้ใช้ ชื่อ หรือสิทธิ์สมาชิกไม่ถูกต้อง เจ้าของบริษัทเป็นสิทธิ์ถาวร');
  const db = identityDatabase(),
    ref = doc(db, 'companies', scope.companyId, 'members', input.uid);
  await bounded(
    runTransaction(db, async (tx) => {
      assertActor(scope.actorUid);
      const [profile, previous] = await Promise.all([
        tx.get(doc(db, 'companies', scope.companyId)),
        tx.get(ref),
      ]);
      if (!profile.exists()) throw Error('บันทึกชื่อบริษัทก่อนเพิ่มสมาชิก');
      const after = { ...input, name: input.name.trim(), updatedAt: new Date().toISOString() };
      tx.set(ref, after);
      tx.set(doc(db, 'companies', scope.companyId, 'audit', crypto.randomUUID()), {
        actor: scope.actorUid,
        action: 'member-save',
        at: serverTimestamp(),
        before: previous.data() ?? null,
        after,
      });
    }),
  );
}
