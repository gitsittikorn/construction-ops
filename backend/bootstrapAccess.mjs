import { randomUUID } from 'node:crypto';
import {
  accessPolicy,
  normalizeEmail,
  grantPath,
  emailKey,
  roleAliases,
  validCompanyId,
} from './accessModel.mjs';

const membersVersion = (rows) =>
  JSON.stringify(
    rows
      .map(({ id, uid, role, enabled, name, updatedAt }) => ({
        id,
        uid,
        role,
        enabled,
        name,
        updatedAt,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
export async function prepareAccessBootstrap({
  store,
  auth,
  companyId,
  email,
  companyName,
  now = () => new Date().toISOString(),
}) {
  validCompanyId(companyId);
  const normalized = normalizeEmail(email),
    founder = await auth.getUserByEmail(normalized);
  if (
    founder.uid !== companyId ||
    founder.disabled ||
    !founder.emailVerified ||
    !founder.providerData?.some((p) => p.providerId === 'google.com')
  )
    throw Error(
      'Bootstrap requires the verified Google founder identity matching the existing company namespace',
    );
  const profile = await store.get(`companies/${companyId}`),
    admin = await store.get(`admins/${companyId}`);
  if (profile?.accessPolicy === accessPolicy) return { alreadyActive: true, companyId };
  if ((profile && profile.ownerUid !== companyId) || (admin && admin.enabled !== true))
    throw Error('Existing company/owner configuration requires manual review');
  const members = await store.members(companyId);
  if (members.length > 100)
    throw Error(
      'Bootstrap supports at most 100 legacy members; prepare a reviewed staged migration',
    );
  const at = now(),
    entries = [];
  async function add(identity, name, role, enabled) {
    if (
      !identity.email ||
      (enabled &&
        (identity.disabled ||
          !identity.emailVerified ||
          !identity.providerData?.some((p) => p.providerId === 'google.com')))
    )
      throw Error(
        'An enabled legacy member is not a verified Google identity; migration stopped without writes',
      );
    const address = normalizeEmail(identity.email);
    if (entries.some((entry) => entry.email === address || entry.uid === identity.uid))
      throw Error('Duplicate legacy email or UID requires manual review');
    entries.push({
      uid: identity.uid,
      email: address,
      name: name || identity.displayName || address,
      role,
      status: enabled ? 'enabled' : 'disabled',
      revision: 1,
      createdAt: at,
      updatedAt: at,
      lastLoginAt: null,
      createdBy: founder.uid,
      updatedBy: founder.uid,
    });
  }
  await add(founder, founder.displayName, 'super_admin', true);
  for (const member of members) {
    if (
      member.id !== member.uid ||
      !['manager', 'operator', 'viewer'].includes(member.role) ||
      typeof member.enabled !== 'boolean'
    )
      throw Error('Unsupported legacy member; migration stopped without writes');
    await add(
      await auth.getUser(member.uid),
      member.name,
      { manager: 'admin', operator: 'staff', viewer: 'viewer' }[member.role],
      member.enabled,
    );
  }
  const name = profile?.name || companyName?.trim();
  if (!name || name.length > 200) throw Error('Supply a company name of 1–200 characters');
  return { alreadyActive: false, companyId, profile, admin, members, entries, at, name };
}
export async function applyAccessBootstrap(store, plan) {
  if (plan.alreadyActive) return { alreadyActive: true };
  const { companyId, entries, at } = plan;
  return store.run(async (tx) => {
    const profile = await tx.get(`companies/${companyId}`),
      admin = await tx.get(`admins/${companyId}`),
      members = await tx.members(companyId);
    if (
      profile?.accessPolicy ||
      (profile?.updatedAt ?? null) !== (plan.profile?.updatedAt ?? null) ||
      JSON.stringify(admin) !== JSON.stringify(plan.admin) ||
      membersVersion(members) !== membersVersion(plan.members)
    )
      throw Error('Bootstrap preview is stale; run dry-run again');
    for (const entry of entries)
      if (await tx.get(grantPath(companyId, entry.email)))
        throw Error('Existing access grant requires manual review; no overwrite');
    tx.set(`companies/${companyId}`, {
      ownerUid: companyId,
      name: plan.name,
      createdAt: profile?.createdAt ?? at,
      updatedAt: at,
      accessPolicy,
    });
    if (!admin) tx.set(`admins/${companyId}`, { enabled: true });
    tx.set(`companies/${companyId}/access_control/state`, { enabledSuperAdmins: 1 });
    for (const entry of entries) {
      tx.set(grantPath(companyId, entry.email), entry);
      tx.set(`companies/${companyId}/members/${entry.uid}`, {
        uid: entry.uid,
        email: entry.email,
        name: entry.name,
        role: roleAliases[entry.role],
        accessRole: entry.role,
        enabled: entry.status === 'enabled',
        accessPolicy,
        grantId: emailKey(entry.email),
        updatedAt: at,
      });
    }
    tx.set(`companies/${companyId}/audit_logs/${randomUUID()}`, {
      actor: companyId,
      action: 'access-bootstrap',
      at,
      before: { memberCount: plan.members.length },
      after: { migratedCount: entries.length, accessPolicy },
    });
    return { companyId, migratedCount: entries.length, accessPolicy };
  });
}
