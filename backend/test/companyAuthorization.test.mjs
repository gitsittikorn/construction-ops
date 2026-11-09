import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companyAuthorization } from '../companyAuthorization.mjs';
const read = {
  admin: async (uid) => ({ enabled: uid === 'company' }),
  company: async (id) => ({ ownerUid: id }),
  member: async (_id, uid) => ({ uid, enabled: true, role: 'operator' }),
};
test('company owner and explicit manager/operator membership authorize only the caller identity', async () => {
  assert.equal(await companyAuthorization('company', undefined, read), true);
  assert.equal(await companyAuthorization('worker', 'company', read), true);
  assert.equal(
    await companyAuthorization('worker', 'company', {
      ...read,
      member: async () => ({ uid: 'worker', enabled: true, role: 'manager' }),
    }),
    true,
  );
  assert.equal(await companyAuthorization('worker', undefined, read), false);
});
test('foreign, disabled, malformed, impersonated and owner-escalation memberships are rejected', async () => {
  for (const value of [
    null,
    { uid: 'worker', enabled: false, role: 'manager' },
    { uid: 'other', enabled: true, role: 'manager' },
    { uid: 'worker', enabled: true, role: 'owner' },
  ])
    assert.equal(
      await companyAuthorization('worker', 'company', { ...read, member: async () => value }),
      false,
    );
  assert.equal(await companyAuthorization('worker', 'foreign', read), false);
  assert.equal(
    await companyAuthorization('worker', 'company', {
      ...read,
      company: async () => ({ ownerUid: 'foreign' }),
    }),
    false,
  );
  assert.equal(await companyAuthorization('worker', 'a/b', read), false);
  assert.equal(
    await companyAuthorization('worker', 'company', {
      ...read,
      admin: async () => ({ enabled: false }),
    }),
    false,
  );
});
