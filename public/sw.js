const CACHE = 'construction-shell-v2';
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(['/', '/icon.svg', '/company-logo.jpg', '/manifest.webmanifest']),
      ),
  );
  self.skipWaiting();
});
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('construction-shell-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/assets/') || url.pathname === '/company-logo.jpg') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      }),
    );
    return;
  }
  if (event.request.mode === 'navigate')
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        try {
          const response = await fetch(event.request);
          if (response.ok) await cache.put('/', response.clone());
          return response;
        } catch {
          return (await cache.match('/')) || Response.error();
        }
      }),
    );
});
