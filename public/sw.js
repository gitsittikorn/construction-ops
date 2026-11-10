const VERSION = 'v5';
const BASE = new URL(self.registration.scope).pathname;
const PREFIX = `construction-shell-${encodeURIComponent(BASE)}-`;
const CACHE = `${PREFIX}${VERSION}`;
const ASSETS = `${BASE}assets/`;
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      const response = await fetch(`${BASE}precache-manifest.json`, { cache: 'no-store' });
      if (!response.ok) throw Error('App assets are not ready');
      const assets = await response.json();
      if (
        !Array.isArray(assets) ||
        assets.some(
          (url) =>
            typeof url !== 'string' ||
            !url.startsWith(ASSETS) ||
            !/^[A-Za-z0-9_.-]+\.(js|css)$/.test(url.slice(ASSETS.length)),
        )
      )
        throw Error('Invalid app asset manifest');
      return cache.addAll([
        BASE,
        `${BASE}icon.svg`,
        `${BASE}company-logo.jpg`,
        `${BASE}login-earthwork.png`,
        `${BASE}manifest.webmanifest`,
        `${BASE}icon-192.png`,
        `${BASE}icon-512.png`,
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
                key !== CACHE &&
                (key.startsWith(PREFIX) ||
                  (BASE === '/' && /^construction-shell-(?:v\d+|[a-f0-9]{16})$/.test(key))),
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
    url.pathname.startsWith(ASSETS) ||
    url.pathname === `${BASE}company-logo.jpg` ||
    url.pathname === `${BASE}login-earthwork.png`
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
  if (
    event.request.mode === 'navigate' &&
    (url.pathname === BASE || url.pathname === `${BASE}index.html`)
  )
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        // Keep HTML and immutable modules from the same installed release.
        // A waiting worker owns the new shell until the user activates it.
        const shell = await cache.match(BASE);
        if (shell) return shell;
        try {
          const response = await fetch(event.request);
          if (response.ok && response.headers.get('content-type')?.includes('text/html'))
            await cache.put(BASE, response.clone());
          return response;
        } catch {
          return (await cache.match(BASE)) || Response.error();
        }
      }),
    );
});
