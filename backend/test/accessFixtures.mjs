import { grantPath, roleAliases } from '../accessModel.mjs';
export const identity = (uid = 'company', email = 'root@example.com') => ({
  uid,
  email,
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
});
export function memoryAccess() {
  const records = new Map(),
    revocations = [];
  let pending = Promise.resolve();
  const copy = (v) => (v == null ? null : structuredClone(v));
  const members = (map, company) =>
    [...map]
      .filter(([p]) => p.startsWith(`companies/${company}/members/`))
      .map(([p, v]) => ({ ...copy(v), id: p.split('/').at(-1) }));
  const store = {
    get: async (path) => copy(records.get(path)),
    members: async (company) => members(records, company),
    run(task) {
      const next = pending.then(async () => {
        const draft = new Map([...records].map(([p, v]) => [p, copy(v)]));
        let writing = false;
        const result = await task({
          get: async (path) => {
            if (writing) throw Error('Read after write');
            return copy(draft.get(path));
          },
          members: async (company) => {
            if (writing) throw Error('Read after write');
            return members(draft, company);
          },
          set: (path, value) => {
            writing = true;
            draft.set(path, copy(value));
          },
        });
        records.clear();
        for (const [p, v] of draft) records.set(p, v);
        return result;
      });
      pending = next.catch(() => {});
      return next;
    },
    companiesFor: async (email) =>
      [...records]
        .filter(
          ([p, v]) => /^companies\/[^/]+\/authorized_users\/[^/]+$/.test(p) && v.email === email,
        )
        .map(([p, v]) => ({ ...copy(v), companyId: p.split('/')[1] })),
    users: async (company, search = '', after = '') => ({
      users: [...records]
        .filter(
          ([p, v]) =>
            p.startsWith(`companies/${company}/authorized_users/`) &&
            v.email.startsWith(search) &&
            v.email > after,
        )
        .map(([, v]) => copy(v))
        .sort((a, b) => a.email.localeCompare(b.email)),
      next: null,
    }),
    audits: async (company) =>
      [...records]
        .filter(([p]) => p.startsWith(`companies/${company}/audit_logs/`))
        .map(([, v]) => copy(v)),
  };
  function grant(uid, email, role, status = 'enabled', company = 'company') {
    const row = {
      uid,
      email,
      name: email,
      role,
      status,
      revision: 1,
      createdAt: '2026-11-10T00:00:00Z',
      updatedAt: '2026-11-10T00:00:00Z',
      createdBy: company,
      updatedBy: company,
      lastLoginAt: null,
    };
    records.set(grantPath(company, email), row);
    if (uid)
      records.set(`companies/${company}/members/${uid}`, {
        uid,
        email,
        name: email,
        role: roleAliases[role],
        accessRole: role,
        enabled: status === 'enabled',
        accessPolicy: 'allowlist-v1',
        updatedAt: row.updatedAt,
      });
    return row;
  }
  records.set('companies/company', {
    ownerUid: 'company',
    name: 'Company',
    createdAt: '2026-11-10T00:00:00Z',
    updatedAt: '2026-11-10T00:00:00Z',
    accessPolicy: 'allowlist-v1',
  });
  records.set('admins/company', { enabled: true });
  records.set('companies/company/access_control/state', { enabledSuperAdmins: 1 });
  grant('company', 'root@example.com', 'super_admin');
  const auth = {
    revokeRefreshTokens: async (uid) => {
      revocations.push(uid);
    },
  };
  return { store, records, grant, auth, revocations };
}
