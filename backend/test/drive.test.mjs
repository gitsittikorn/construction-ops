import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createTokenVault } from '../tokenVault.mjs';
import { createDriveService, driveScope } from '../driveService.mjs';
import { createApp } from '../app.mjs';

const user = { uid: 'owner-a', email: 'owner@example.com', email_verified: true, enabled: true };
function setup() {
  const now = 1000000;
  const records = new Map();
  const vault = createTokenVault(randomBytes(32).toString('base64'));
  const calls = { refresh: 0, exchange: 0 };
  const credentials = {
    access_token: 'access-secret',
    refresh_token: 'refresh-secret',
    expiry_date: now + 3600000,
    scope: driveScope,
  };
  const google = {
    async exchange() {
      calls.exchange++;
      return { ...credentials };
    },
    async refresh() {
      calls.refresh++;
      return { access_token: 'renewed-secret', expiry_date: now + 7200000 };
    },
    async email() {
      return user.email;
    },
  };
  const store = {
    async get(uid) {
      return records.get(uid) ?? null;
    },
    async put(uid, value) {
      records.set(uid, value);
    },
    async remove(uid) {
      records.delete(uid);
    },
  };
  const service = createDriveService({ store, google, vault, now: () => now });
  return { now, records, vault, calls, credentials, google, store, service };
}
test('vault encrypts credentials with fresh nonces and authenticates the owner and ciphertext', () => {
  const { vault, credentials } = setup();
  const record = vault.seal(user.uid, credentials);
  assert.deepEqual(vault.open(user.uid, record), credentials);
  assert.notEqual(record.iv, vault.seal(user.uid, credentials).iv);
  assert.ok(!JSON.stringify(record).includes('refresh-secret'));
  assert.throws(() => vault.open('another-user', record));
  assert.throws(() => vault.open(user.uid, { ...record, tag: randomBytes(16).toString('base64') }));
  assert.throws(() => createTokenVault('bad-key'));
});
test('exchange verifies account, encrypts persistent credentials and returns only an access token', async () => {
  const s = setup();
  assert.deepEqual(await s.service.exchange(user, 'auth-code', 'https://app.example.com'), {
    token: 'access-secret',
    expiresAt: s.now + 3540000,
  });
  assert.ok(!JSON.stringify([...s.records.values()]).includes('refresh-secret'));
  const restarted = createDriveService({
    store: s.store,
    google: s.google,
    vault: s.vault,
    now: () => s.now,
  });
  assert.equal((await restarted.session(user)).token, 'access-secret');
  assert.equal(s.calls.refresh, 0);
});
test('exchange refuses another Google account and partial consent without saving tokens', async () => {
  const s = setup();
  s.google.email = async () => 'other@example.com';
  await assert.rejects(s.service.exchange(user, 'code', 'https://app.example.com'), {
    code: 'account_mismatch',
    status: 403,
  });
  assert.equal(s.records.size, 0);
  s.credentials.scope = 'unrelated-scope';
  await assert.rejects(s.service.exchange(user, 'code', 'https://app.example.com'), {
    code: 'reconnect_required',
  });
  assert.equal(s.records.size, 0);
});
test('missing refresh token requires offline consent and never pretends persistence is ready', async () => {
  const s = setup();
  delete s.credentials.refresh_token;
  await assert.rejects(s.service.exchange(user, 'code', 'https://app.example.com'), {
    code: 'reconnect_required',
  });
  assert.equal(s.records.size, 0);
});
test('repeated consent preserves the existing refresh token if Google omits it', async () => {
  const s = setup();
  await s.service.exchange(user, 'first', 'https://app.example.com');
  delete s.credentials.refresh_token;
  await s.service.exchange(user, 'second', 'https://app.example.com');
  assert.equal(s.vault.open(user.uid, s.records.get(user.uid)).refresh_token, 'refresh-secret');
});
test('expiry triggers one renewal for concurrent requests and preserves refresh credentials', async () => {
  const s = setup();
  s.credentials.expiry_date = s.now + 90000;
  await s.service.exchange(user, 'code', 'https://app.example.com');
  const sessions = await Promise.all([s.service.session(user), s.service.session(user)]);
  assert.ok(sessions.every((session) => session.token === 'renewed-secret'));
  assert.equal(s.calls.refresh, 1);
  assert.equal(s.vault.open(user.uid, s.records.get(user.uid)).refresh_token, 'refresh-secret');
});
test('force renewal recovers a revoked access token before its expiry', async () => {
  const s = setup();
  await s.service.exchange(user, 'code', 'https://app.example.com');
  assert.equal((await s.service.session(user, true)).token, 'renewed-secret');
  assert.equal(s.calls.refresh, 1);
});
test('withdrawn consent requires reconnect, while transient provider failure preserves credentials', async () => {
  const s = setup();
  await s.service.exchange(user, 'code', 'https://app.example.com');
  s.google.refresh = async () => {
    throw Error('network failure with sensitive details');
  };
  await assert.rejects(s.service.session(user, true), {
    code: 'service_unavailable',
    message: 'service_unavailable',
  });
  assert.equal(s.records.size, 1);
  s.google.refresh = async () => {
    throw { response: { data: { error: 'invalid_grant' } } };
  };
  await assert.rejects(s.service.session(user, true), { code: 'reconnect_required' });
  assert.equal(s.records.size, 0);
});
test('disconnect removes credentials and another account cannot read the connection', async () => {
  const s = setup();
  await s.service.exchange(user, 'code', 'https://app.example.com');
  await assert.rejects(s.service.session({ ...user, uid: 'owner-b' }), {
    code: 'reconnect_required',
  });
  await s.service.disconnect(user);
  await assert.rejects(s.service.session(user), { code: 'reconnect_required' });
});
test(
  'HTTP endpoints enforce Firebase identity, admin access, exact origin, CSRF header and input validation',
  { timeout: 20000 },
  async (t) => {
    const s = setup();
    const app = createApp({
      service: s.service,
      allowedOrigins: ['https://app.example.com'],
      async verifyUser(token) {
        if (token === 'bad') throw Error('bad token');
        return { ...user, enabled: token !== 'disabled' };
      },
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(
      () =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    );
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = {
      Origin: 'https://app.example.com',
      Authorization: 'Bearer good',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    const post = (path, body = {}, override = {}) =>
      fetch(`${base}/api/drive/${path}`, {
        signal: AbortSignal.timeout(5000),
        method: 'POST',
        headers: { ...headers, ...override },
        body: JSON.stringify(body),
      });
    assert.equal(
      (await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) })).status,
      200,
    );
    assert.equal(
      (await post('exchange', { code: 'test' }, { Origin: 'https://evil.example' })).status,
      403,
    );
    assert.equal(
      (await post('exchange', { code: 'test' }, { 'X-Requested-With': '' })).status,
      403,
    );
    assert.equal(
      (await post('exchange', { code: 'test' }, { Authorization: 'Bearer bad' })).status,
      401,
    );
    assert.equal(
      (await post('exchange', { code: 'test' }, { Authorization: 'Bearer disabled' })).status,
      403,
    );
    assert.equal((await post('exchange', {})).status, 400);
    const oversized = await post('exchange', { code: 'sensitive-placeholder'.repeat(1024) });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { error: 'payload_too_large' });
    assert.equal(s.calls.exchange, 0);
    const response = await post('exchange', { code: 'test' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(!JSON.stringify(await response.json()).includes('refresh-secret'));
    assert.equal((await post('session')).status, 200);
    assert.equal(
      (
        await fetch(`${base}/api/drive/connection`, {
          method: 'DELETE',
          headers,
          signal: AbortSignal.timeout(5000),
        })
      ).status,
      204,
    );
    assert.equal((await post('session')).status, 409);
  },
);

test('authenticated request budgets are bounded per owner, expire, and stop provider calls with Retry-After', async (t) => {
  let timestamp = 1000,
    calls = 0;
  const app = createApp({
    allowedOrigins: ['https://app.example.com'],
    verifyUser: async (uid) => ({ ...user, uid, enabled: true }),
    service: {
      session: async () => {
        calls++;
        return { token: 'synthetic-access', expiresAt: 999999 };
      },
    },
    now: () => timestamp,
    requestBudget: { limit: 2, windowMs: 10000, capacity: 2 },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const post = (owner) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/drive/session`, {
      method: 'POST',
      headers: {
        Origin: 'https://app.example.com',
        Authorization: `Bearer ${owner}`,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    });
  assert.equal((await post('owner-a')).status, 200);
  assert.equal((await post('owner-a')).status, 200);
  const limited = await post('owner-a');
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '10');
  assert.deepEqual(await limited.json(), { error: 'rate_limited' });
  assert.equal(calls, 2);
  assert.equal((await post('owner-b')).status, 200);
  assert.equal((await post('owner-c')).status, 429);
  timestamp += 10000;
  assert.equal((await post('owner-a')).status, 200);
  assert.equal((await post('owner-c')).status, 200);
  assert.equal(calls, 5);
});
