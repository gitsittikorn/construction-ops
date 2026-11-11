import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
const script = readFileSync('public/sw.js', 'utf8');
function harness(base = '/') {
  const listeners: Record<string, (event: any) => void> = {};
  const cache = { addAll: vi.fn().mockResolvedValue(undefined), match: vi.fn(), put: vi.fn() };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi
      .fn()
      .mockResolvedValue([
        'construction-shell-old',
        'construction-shell-%2Fother%2F-old',
        'another-app',
      ]),
    delete: vi.fn(),
  };
  const fetch = vi.fn();
  const self = {
    addEventListener: (name: string, listener: (event: any) => void) => {
      listeners[name] = listener;
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    location: { origin: 'https://site.test', href: `https://site.test${base}sw.js` },
  };
  new Function('self', 'caches', 'fetch', script)(self, caches, fetch);
  return { listeners, cache, caches, fetch, self };
}
describe('service worker cache policy (simulated worker)', () => {
  it('caches the hosted subpath and leaves sibling applications and root requests alone', async () => {
    const h = harness('/construction-ops/');
    h.fetch.mockResolvedValue({ ok: true, json: async () => ['/construction-ops/assets/lazy.js'] });
    let task: Promise<unknown> = Promise.resolve();
    h.listeners.install({
      waitUntil: (value: Promise<unknown>) => {
        task = value;
      },
    });
    await task;
    expect(h.fetch).toHaveBeenCalledWith('/construction-ops/precache-manifest.json', {
      cache: 'no-store',
    });
    expect(h.cache.addAll).toHaveBeenCalledWith(
      expect.arrayContaining([
        '/construction-ops/',
        '/construction-ops/company-logo.jpg',
        '/construction-ops/login-earthwork.png',
        '/construction-ops/assets/lazy.js',
      ]),
    );
    h.listeners.activate({
      waitUntil: (value: Promise<unknown>) => {
        task = value;
      },
    });
    await task;
    expect(h.caches.delete).not.toHaveBeenCalled();
    const respondWith = vi.fn();
    h.listeners.fetch({
      request: { url: 'https://site.test/', method: 'GET', mode: 'navigate' },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
    h.fetch.mockResolvedValue({ ok: true, json: async () => ['/assets/wrong-root.js'] });
    h.listeners.install({
      waitUntil: (value: Promise<unknown>) => {
        task = value;
      },
    });
    await expect(task).rejects.toThrow('Invalid');
  });
  it('preloads every build asset and activates an update only on an explicit message', async () => {
    const h = harness();
    h.fetch.mockResolvedValue({ ok: true, json: async () => ['/assets/lazy.js'] });
    let task: Promise<unknown> = Promise.resolve();
    h.listeners.install({
      waitUntil: (value: Promise<unknown>) => {
        task = value;
      },
    });
    await task;
    expect(h.cache.addAll).toHaveBeenCalledWith(
      expect.arrayContaining(['/assets/lazy.js', '/icon-192.png']),
    );
    expect(h.self.skipWaiting).not.toHaveBeenCalled();
    h.listeners.message({ data: { type: 'ACTIVATE_UPDATE' } });
    expect(h.self.skipWaiting).toHaveBeenCalledOnce();
  });
  it('matches immutable precached modules despite Vary headers, and rejects foreign precache paths', async () => {
    const h = harness();
    h.cache.match.mockResolvedValue('module');
    let response: Promise<unknown> = Promise.resolve();
    const request = { url: 'https://site.test/assets/lazy.js', method: 'GET' };
    h.listeners.fetch({
      request,
      respondWith: (value: Promise<unknown>) => {
        response = value;
      },
    });
    expect(await response).toBe('module');
    expect(h.cache.match).toHaveBeenCalledWith(request, { ignoreVary: true });
    h.fetch.mockResolvedValue({ ok: true, json: async () => ['https://other.test/bad.js'] });
    let task: Promise<unknown> = Promise.resolve();
    h.listeners.install({
      waitUntil: (value: Promise<unknown>) => {
        task = value;
      },
    });
    await expect(task).rejects.toThrow('Invalid');
  });
  it('only removes this application’s obsolete caches', async () => {
    const h = harness();
    let task: Promise<unknown> = Promise.resolve();
    h.listeners.activate({
      waitUntil: (value: Promise<unknown>) => {
        task = value;
      },
    });
    await task;
    expect(h.caches.delete).toHaveBeenCalledExactlyOnceWith('construction-shell-old');
    expect(h.self.clients.claim).toHaveBeenCalledOnce();
  });
  it('never intercepts cloud API calls or write requests', () => {
    const h = harness(),
      respondWith = vi.fn();
    h.listeners.fetch({
      request: { url: 'https://googleapis.com/file', method: 'GET' },
      respondWith,
    });
    h.listeners.fetch({
      request: { url: 'https://site.test/upload', method: 'POST' },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
  });
  it('restores cached shell when offline', async () => {
    const h = harness();
    h.fetch.mockRejectedValue(Error('offline'));
    h.cache.match.mockResolvedValue('saved-shell');
    let response: Promise<unknown> = Promise.resolve();
    h.listeners.fetch({
      request: { url: 'https://site.test/trips', method: 'GET', mode: 'navigate' },
      respondWith: (value: Promise<unknown>) => {
        response = value;
      },
    });
    expect(await response).toBe('saved-shell');
  });
  it('refreshes cached HTML after successful navigation', async () => {
    const h = harness();
    h.fetch.mockResolvedValue({ ok: true, clone: () => 'new-shell' });
    let response: Promise<unknown> = Promise.resolve();
    h.listeners.fetch({
      request: { url: 'https://site.test/', method: 'GET', mode: 'navigate' },
      respondWith: (value: Promise<unknown>) => {
        response = value;
      },
    });
    await response;
    expect(h.cache.put).toHaveBeenCalledWith('/', 'new-shell');
  });
});
