import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccessService } from '../accessService.mjs';
import { grantPath, normalizeEmail, emailKey } from '../accessModel.mjs';
import { prepareAccessBootstrap, applyAccessBootstrap } from '../bootstrapAccess.mjs';
import { createApp } from '../app.mjs';
import { identity, memoryAccess } from './accessFixtures.mjs';
const input = (email, role = 'staff', status = 'enabled', expectedRevision = null) => ({
  email,
  name: email,
  role,
  status,
  expectedRevision,
});

test('email keys normalize case/space without merging different Google email addresses', () => {
  assert.equal(normalizeEmail(' ROOT@Example.com '), 'root@example.com');
  assert.equal(emailKey(' ROOT@Example.com '), emailKey('root@example.com'));
  assert.notEqual(emailKey('a.b@example.com'), emailKey('ab@example.com'));
  assert.notEqual(emailKey('a+work@example.com'), emailKey('a@example.com'));
  for (const email of ['', 'a/b@example.com', 'a@b', 'x @example.com'])
    assert.throws(() => normalizeEmail(email));
});
test('email-before-login invite binds only a verified Google UID and preserves login timestamps/audit', async () => {
  const s = memoryAccess(),
    service = createAccessService({ ...s, now: () => '2026-11-10T01:00:00Z' });
  await service.save(identity(), 'company', input(' NEW@Example.com '));
  const pending = await s.store.get(grantPath('company', 'new@example.com'));
  assert.equal(pending.uid, null);
  const user = identity('new-user', 'new@example.com');
  for (const bad of [
    { ...user, email_verified: false },
    { ...user, firebase: { sign_in_provider: 'password' } },
    identity('foreign', 'absent@example.com'),
  ])
    await assert.rejects(service.session(bad, 'company'));
  assert.equal((await service.companies(user)).companies.length, 1);
  assert.equal((await service.session(user, 'company')).role, 'operator');
  assert.equal(
    (await s.store.get(grantPath('company', user.email))).lastLoginAt,
    '2026-11-10T01:00:00Z',
  );
  await service.session(user, 'company');
  await assert.rejects(service.session(identity('replacement', user.email), 'company'), {
    code: 'access_denied',
  });
  await assert.rejects(service.session(user, 'foreign'), { code: 'access_policy_required' });
  assert.equal(
    (await service.audits(identity(), 'company')).events.filter(
      (e) => e.action === 'access-uid-bound',
    ).length,
    1,
  );
});
test('admin/staff/viewer and cross-company callers cannot administer or inject a UID', async () => {
  const s = memoryAccess(),
    service = createAccessService(s);
  for (const role of ['admin', 'staff', 'viewer']) {
    const email = `${role}@example.com`;
    s.grant(role, email, role);
    await assert.rejects(service.list(identity(role, email), 'company'), { code: 'access_denied' });
    await assert.rejects(
      service.save(identity(role, email), 'company', input('victim@example.com', 'super_admin')),
      { code: 'access_denied' },
    );
  }
  await assert.rejects(
    service.save(identity(), 'company', { ...input('new@example.com'), uid: 'forged' }),
    { code: 'invalid_request' },
  );
  await assert.rejects(service.save(identity(), 'foreign', input('new@example.com')), {
    code: 'access_policy_required',
  });
  await service.save(identity(), 'company', input('new@example.com'));
  await assert.rejects(
    service.save(identity(), 'company', input('new@example.com', 'admin', 'enabled', 0)),
    { code: 'stale_user' },
  );
});
test('the last bound super admin cannot be disabled, removed or downgraded; pending invitations do not count', async () => {
  const s = memoryAccess(),
    service = createAccessService(s);
  await service.save(identity(), 'company', input('future@example.com', 'super_admin'));
  for (const row of [
    input('root@example.com', 'super_admin', 'disabled', 1),
    input('root@example.com', 'super_admin', 'removed', 1),
    input('root@example.com', 'admin', 'enabled', 1),
  ])
    await assert.rejects(service.save(identity(), 'company', row), { code: 'last_super_admin' });
  assert.equal((await s.store.get('companies/company/access_control/state')).enabledSuperAdmins, 1);
  await service.session(identity('second', 'future@example.com'), 'company');
  const outcomes = await Promise.allSettled([
    service.save(identity(), 'company', input('root@example.com', 'super_admin', 'disabled', 1)),
    service.save(
      identity('second', 'future@example.com'),
      'company',
      input('future@example.com', 'super_admin', 'disabled', 1),
    ),
  ]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await s.store.get('companies/company/access_control/state')).enabledSuperAdmins, 1);
  assert.equal(s.revocations.length, 1);
});
test('disable/downgrade uses live grants, revokes tokens and reports revocation-provider failures safely', async () => {
  const s = memoryAccess(),
    service = createAccessService(s),
    user = identity('staff', 'staff@example.com');
  s.grant(user.uid, user.email, 'staff');
  await service.save(identity(), 'company', input(user.email, 'viewer', 'enabled', 1));
  assert.deepEqual(s.revocations, ['staff']);
  await service.save(identity(), 'company', input(user.email, 'viewer', 'disabled', 2));
  await assert.rejects(service.authorize(user, 'company'), { code: 'access_denied' });
  assert.equal((await s.store.get(`companies/company/members/${user.uid}`)).enabled, false);
  s.auth.revokeRefreshTokens = async () => {
    throw Error('private provider detail');
  };
  const result = await service.save(
    identity(),
    'company',
    input(user.email, 'viewer', 'enabled', 3),
  );
  assert.equal(result.sessionRevocationPending, true);
  assert.ok(!JSON.stringify(result).includes('private provider detail'));
});
test('optional administrator MFA fails closed while non-admin roles remain usable', async () => {
  const s = memoryAccess(),
    service = createAccessService({ ...s, requireAdminMfa: true });
  await assert.rejects(service.session(identity(), 'company'), { code: 'mfa_required' });
  await service.session(
    { ...identity(), firebase: { sign_in_provider: 'google.com', sign_in_second_factor: 'totp' } },
    'company',
  );
  s.grant('worker', 'worker@example.com', 'staff');
  await service.session(identity('worker', 'worker@example.com'), 'company');
});
test('bootstrap dry-run/migration preserves business data, stops stale previews and is idempotent', async () => {
  const s = memoryAccess();
  s.records.delete(grantPath('company', 'root@example.com'));
  s.records.delete('companies/company/members/company');
  s.records.set('companies/company', {
    ownerUid: 'company',
    name: 'Legacy',
    createdAt: 'old',
    updatedAt: 'old',
  });
  s.records.set('companies/company/members/worker', {
    uid: 'worker',
    name: 'Worker',
    role: 'operator',
    enabled: true,
    updatedAt: 'old',
  });
  s.records.set('users/company/projects/real', { original: 'unchanged' });
  const person = (uid, email) => ({
    uid,
    email,
    emailVerified: true,
    disabled: false,
    providerData: [{ providerId: 'google.com' }],
  });
  const auth = {
    getUserByEmail: async () => person('company', 'root@example.com'),
    getUser: async () => person('worker', 'worker@example.com'),
  };
  const before = structuredClone([...s.records]);
  const plan = await prepareAccessBootstrap({
    ...s,
    auth,
    companyId: 'company',
    email: 'root@example.com',
  });
  assert.deepEqual([...s.records], before);
  await applyAccessBootstrap(s.store, plan);
  assert.deepEqual(s.records.get('users/company/projects/real'), { original: 'unchanged' });
  assert.equal((await s.store.get(grantPath('company', 'worker@example.com'))).role, 'staff');
  assert.equal(
    (await prepareAccessBootstrap({ ...s, auth, companyId: 'company', email: 'root@example.com' }))
      .alreadyActive,
    true,
  );
  await assert.rejects(applyAccessBootstrap(s.store, plan), /stale/);
});
test('HTTP access endpoints enforce origin, CSRF, verified identity, allowlist and roles with safe errors', async () => {
  const s = memoryAccess(),
    accessService = createAccessService(s);
  const app = createApp({
    service: {},
    accessService,
    verifyIdentity: async (token) =>
      token === 'root' ? identity() : identity('foreign', 'foreign@example.com'),
    verifyUser: async () => ({}),
    allowedOrigins: ['https://app.example.com'],
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/access/users/list`;
  const headers = {
    Origin: 'https://app.example.com',
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    Authorization: 'Bearer root',
    'X-Company-ID': 'company',
  };
  try {
    assert.equal((await fetch(url, { method: 'POST', headers, body: '{}' })).status, 200);
    assert.equal(
      (
        await fetch(url, {
          method: 'POST',
          headers: { ...headers, Origin: 'https://evil.example' },
          body: '{}',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(url, {
          method: 'POST',
          headers: { ...headers, 'X-Requested-With': '' },
          body: '{}',
        })
      ).status,
      403,
    );
    const denied = await fetch(url, {
      method: 'POST',
      headers: { ...headers, Authorization: 'Bearer foreign' },
      body: '{}',
    });
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { error: 'access_denied' });
    assert.equal(
      (await fetch(url, { method: 'POST', headers: { ...headers, Authorization: '' }, body: '{}' }))
        .status,
      401,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('a suspended company license denies session, discovery and administrative access even with an enabled grant', async () => {
  const s = memoryAccess(),
    service = createAccessService(s);
  s.records.set('admins/company', { enabled: false });
  assert.deepEqual(await service.companies(identity()), { companies: [] });
  await assert.rejects(service.session(identity(), 'company'), { code: 'access_denied' });
  await assert.rejects(service.list(identity(), 'company'), { code: 'access_denied' });
});
