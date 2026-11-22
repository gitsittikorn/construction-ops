import { randomUUID } from 'node:crypto';
import { ApiError } from './driveService.mjs';
import {
  accessPolicy,
  roleAliases,
  requireGoogleIdentity,
  normalizeEmail,
  validCompanyId,
  grantPath,
  emailKey,
  isActiveSuper,
} from './accessModel.mjs';

export function createAccessService({
  store,
  auth,
  now = () => new Date().toISOString(),
  requireAdminMfa = false,
}) {
  function assertGrant(user, entry, email) {
    if (
      !entry ||
      entry.email !== email ||
      entry.status !== 'enabled' ||
      !Object.hasOwn(roleAliases, entry.role) ||
      (entry.uid && entry.uid !== user.uid)
    )
      throw new ApiError(403, 'access_denied');
    if (requireAdminMfa && entry.role === 'super_admin' && !user.firebase?.sign_in_second_factor)
      throw new ApiError(403, 'mfa_required');
  }
  async function check(tx, user, company, administrative = false) {
    const email = requireGoogleIdentity(user);
    validCompanyId(company);
    const profile = await tx.get(`companies/${company}`),
      entry = await tx.get(grantPath(company, email)),
      license = await tx.get(`admins/${company}`);
    if (profile?.accessPolicy !== accessPolicy || profile.ownerUid !== company)
      throw new ApiError(403, 'access_policy_required');
    if (license?.enabled !== true) throw new ApiError(403, 'access_denied');
    assertGrant(user, entry, email);
    if (entry.uid !== user.uid || (administrative && entry.role !== 'super_admin'))
      throw new ApiError(403, 'access_denied');
    return { profile, entry, email };
  }
  return {
    async companies(user) {
      const email = requireGoogleIdentity(user),
        rows = await store.companiesFor(email),
        companies = [];
      for (const row of rows) {
        if (
          row.status !== 'enabled' ||
          (row.uid && row.uid !== user.uid) ||
          !Object.hasOwn(roleAliases, row.role)
        )
          continue;
        const profile = await store.get(`companies/${validCompanyId(row.companyId)}`);
        const license = await store.get(`admins/${row.companyId}`);
        if (
          license?.enabled === true &&
          profile?.accessPolicy === accessPolicy &&
          profile.ownerUid === row.companyId
        )
          companies.push({ companyId: row.companyId, name: profile.name });
      }
      return { companies };
    },
    async session(user, company) {
      const email = requireGoogleIdentity(user);
      validCompanyId(company);
      return store.run(async (tx) => {
        const profile = await tx.get(`companies/${company}`),
          path = grantPath(company, email),
          entry = await tx.get(path),
          state = await tx.get(`companies/${company}/access_control/state`),
          license = await tx.get(`admins/${company}`);
        if (profile?.accessPolicy !== accessPolicy || profile.ownerUid !== company)
          throw new ApiError(403, 'access_policy_required');
        if (license?.enabled !== true) throw new ApiError(403, 'access_denied');
        assertGrant(user, entry, email);
        if (!Number.isSafeInteger(state?.enabledSuperAdmins) || state.enabledSuperAdmins < 1)
          throw new ApiError(503, 'access_state_invalid');
        const at = now(),
          bound = { ...entry, uid: user.uid, lastLoginAt: at };
        tx.set(path, bound);
        tx.set(`companies/${company}/members/${user.uid}`, {
          uid: user.uid,
          name: entry.name,
          email,
          role: roleAliases[entry.role],
          accessRole: entry.role,
          enabled: true,
          accessPolicy,
          grantId: emailKey(email),
          updatedAt: entry.updatedAt,
        });
        if (!isActiveSuper(entry) && isActiveSuper(bound))
          tx.set(`companies/${company}/access_control/state`, {
            ...state,
            enabledSuperAdmins: state.enabledSuperAdmins + 1,
          });
        tx.set(`companies/${company}/audit_logs/${randomUUID()}`, {
          actor: user.uid,
          action: entry.uid ? 'access-login' : 'access-uid-bound',
          at,
          email,
          before: { uid: entry.uid ?? null },
          after: { uid: user.uid },
        });
        return {
          actorUid: user.uid,
          companyId: company,
          role: roleAliases[entry.role],
          accessRole: entry.role,
          accessPolicy,
          name: profile.name,
        };
      });
    },
    async authorize(user, company, administrative = false) {
      return store.run(async (tx) => (await check(tx, user, company, administrative)).entry);
    },
    async list(user, company, input = {}) {
      await this.authorize(user, company, true);
      const search = typeof input.search === 'string' ? input.search.trim().toLowerCase() : '',
        after = typeof input.after === 'string' ? input.after : '';
      if (search.length > 254 || after.length > 254 || /[\s/]/.test(search + after))
        throw new ApiError(400, 'invalid_request');
      return store.users(company, search, after);
    },
    async audits(user, company) {
      await this.authorize(user, company, true);
      return { events: await store.audits(company) };
    },
    async save(user, company, input) {
      requireGoogleIdentity(user);
      validCompanyId(company);
      if (
        !input ||
        Object.keys(input).some(
          (key) => !['email', 'name', 'role', 'status', 'expectedRevision'].includes(key),
        ) ||
        typeof input.name !== 'string' ||
        !input.name.trim() ||
        input.name.trim().length > 200 ||
        !Object.hasOwn(roleAliases, input.role) ||
        !['enabled', 'disabled', 'removed'].includes(input.status)
      )
        throw new ApiError(400, 'invalid_request');
      const email = normalizeEmail(input.email);
      const result = await store.run(async (tx) => {
        await check(tx, user, company, true);
        const path = grantPath(company, email),
          previous = await tx.get(path),
          state = await tx.get(`companies/${company}/access_control/state`);
        if (
          previous ? input.expectedRevision !== previous.revision : input.expectedRevision != null
        )
          throw new ApiError(409, 'stale_user');
        if (!Number.isSafeInteger(state?.enabledSuperAdmins) || state.enabledSuperAdmins < 1)
          throw new ApiError(503, 'access_state_invalid');
        const at = now(),
          next = {
            uid: previous?.uid ?? null,
            email,
            name: input.name.trim(),
            role: input.role,
            status: input.status,
            revision: (previous?.revision ?? 0) + 1,
            createdAt: previous?.createdAt ?? at,
            updatedAt: at,
            lastLoginAt: previous?.lastLoginAt ?? null,
            createdBy: previous?.createdBy ?? user.uid,
            updatedBy: user.uid,
          };
        const count =
          state.enabledSuperAdmins + Number(isActiveSuper(next)) - Number(isActiveSuper(previous));
        if (count < 1) throw new ApiError(409, 'last_super_admin');
        tx.set(path, next);
        tx.set(`companies/${company}/access_control/state`, {
          ...state,
          enabledSuperAdmins: count,
        });
        if (next.uid)
          tx.set(`companies/${company}/members/${next.uid}`, {
            uid: next.uid,
            name: next.name,
            email,
            role: roleAliases[next.role],
            accessRole: next.role,
            enabled: next.status === 'enabled',
            accessPolicy,
            grantId: emailKey(email),
            updatedAt: at,
          });
        tx.set(`companies/${company}/audit_logs/${randomUUID()}`, {
          actor: user.uid,
          action: previous ? 'access-user-updated' : 'access-user-invited',
          at,
          email,
          before: previous,
          after: next,
        });
        return {
          user: next,
          revokeUid:
            previous?.uid && (previous.role !== next.role || previous.status !== next.status)
              ? previous.uid
              : null,
        };
      });
      let sessionRevocationPending = false;
      if (result.revokeUid) {
        try {
          await auth.revokeRefreshTokens(result.revokeUid);
        } catch {
          sessionRevocationPending = true;
        }
      }
      return { user: result.user, sessionRevocationPending };
    },
  };
}
