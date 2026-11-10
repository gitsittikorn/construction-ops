import assert from 'node:assert/strict';
import { preview } from 'vite';
const pages = process.argv.includes('--pages'),
  base = pages ? '/construction-ops/' : '/';
const server = await preview({
  base,
  build: { outDir: pages ? 'dist-pages' : 'dist' },
  preview: { host: '127.0.0.1', port: 0, open: false },
});
try {
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const appUrl = `${origin}${base}`;
  const response = await fetch(appUrl);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /lang="th"/);
  assert.match(html, /<title>Khok Kloi Backhoe Engineering/);
  const logo = await fetch(appUrl + 'company-logo.jpg');
  assert.equal(logo.status, 200);
  assert.match(logo.headers.get('content-type') ?? '', /image\/jpeg/);
  const logoBytes = Buffer.from(await logo.arrayBuffer());
  assert.equal(logoBytes.readUInt16BE(0), 0xffd8, 'Logo must be a real JPEG');
  const assets = [
    ...html.matchAll(/(?:src|href)="([^"\s]+\/assets\/[^"\s]+|\/assets\/[^"\s]+)"/g),
  ].map((match) => match[1]);
  assert(assets.length >= 2, 'Built JavaScript and CSS are referenced');
  for (const asset of assets) {
    assert(asset.startsWith(`${base}assets/`), 'Assets must stay under the application base');
    const response = await fetch(origin + asset);
    assert.equal(response.status, 200, asset);
    assert.doesNotMatch(response.headers.get('content-type') ?? '', /text\/html/, asset);
    if (asset.endsWith('.js'))
      assert.doesNotMatch(
        await response.text(),
        /construction:upload-diagnostics/,
        'Development diagnostics must not ship in production',
      );
  }
  const manifest = await (await fetch(appUrl + 'manifest.webmanifest')).json();
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.name, 'Khok Kloi Backhoe Engineering');
  assert.equal(manifest.short_name, 'Khok Kloi');
  assert.equal(new URL(manifest.start_url, appUrl).pathname, base);
  assert.equal(new URL(manifest.scope, appUrl).pathname, base);
  assert(html.includes(`href="${base}icon-192.png"`), 'iOS Home Screen icon is configured');
  for (const size of [192, 512]) {
    assert(manifest.icons.some((icon) => icon.sizes === `${size}x${size}`));
    const icon = await fetch(appUrl + `icon-${size}.png`);
    assert.equal(icon.status, 200);
    const bytes = Buffer.from(await icon.arrayBuffer());
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  const precache = await (await fetch(appUrl + 'precache-manifest.json')).json();
  assert(precache.length > 0 && precache.every((url) => url.startsWith(`${base}assets/`)));
  const worker = await fetch(appUrl + 'sw.js');
  assert.equal(worker.status, 200);
  assert.match(await worker.text(), /construction-shell-/);
  console.log(
    `HTTP smoke passed at ${base}: HTML, ${assets.length} assets, manifest, PNG icons, service worker`,
  );
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
