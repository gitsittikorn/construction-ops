import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
const script = readFileSync('public/sw.js', 'utf8');
function harness() {
  const listeners: Record<string, (event: any) => void> = {};
  const cache = { addAll: vi.fn().mockResolvedValue(undefined), match: vi.fn(), put: vi.fn() };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue(['construction-shell-old', 'another-app']),
    delete: vi.fn(),
  };
  const fetch = vi.fn();
  const self = {
    addEventListener: (name: string, listener: (event: any) => void) => {
      listeners[name] = listener;
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    location: { origin: 'https://site.test' },
  };
  new Function('self', 'caches', 'fetch', script)(self, caches, fetch);
  return { listeners, cache, caches, fetch, self };
}
describe('service worker cache policy (simulated worker)', () => {
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
