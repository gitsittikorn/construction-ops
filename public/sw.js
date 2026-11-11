const BASE = new URL('./', self.location.href).pathname;
const CACHE_PREFIX = `construction-shell-${BASE === '/' ? '' : encodeURIComponent(BASE) + '-'}`;
const CACHE = CACHE_PREFIX + 'v5';
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      const response = await fetch(BASE + 'precache-manifest.json', { cache: 'no-store' });
      if (!response.ok) throw Error('App assets are not ready');
      const assets = await response.json();
      if (
        !Array.isArray(assets) ||
        assets.some(
          (url) =>
            typeof url !== 'string' ||
            !url.startsWith(BASE + 'assets/') ||
            !/^[^/]+\.(js|css)$/.test(url.slice((BASE + 'assets/').length)),
        )
      )
        throw Error('Invalid app asset manifest');
      return cache.addAll([
        BASE,
        BASE + 'icon.svg',
        BASE + 'company-logo.jpg',
        BASE + 'login-earthwork.png',
        BASE + 'manifest.webmanifest',
        BASE + 'icon-192.png',
        BASE + 'icon-512.png',
        ...assets,
      ]);
    }),
  );
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(CACHE_PREFIX) &&
                key !== CACHE &&
                (BASE !== '/' || !key.startsWith('construction-shell-%2F')),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(BASE)
  )
    return;
  if (
    url.pathname.startsWith(BASE + 'assets/') ||
    url.pathname === BASE + 'company-logo.jpg' ||
    url.pathname === BASE + 'login-earthwork.png'
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        // Build assets are immutable and never user-specific; ignore preview-server
        // Vary: Origin so precached module requests also match their import headers.
        const hit = await cache.match(event.request, { ignoreVary: true });
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
          if (response.ok) await cache.put(BASE, response.clone());
          return response;
        } catch {
          return (await cache.match(BASE)) || Response.error();
        }
      }),
    );
});
