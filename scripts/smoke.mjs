import assert from 'node:assert/strict';
import { preview } from 'vite';
const server = await preview({ preview: { host: '127.0.0.1', port: 0, open: false } });
try {
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const root = origin + server.config.base;
  const response = await fetch(root);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /lang="th"/);
  assert.match(html, /<title>Khok Kloi Backhoe Engineering/);
  const logo = await fetch(root + 'company-logo.jpg');
  assert.equal(logo.status, 200);
  assert.match(logo.headers.get('content-type') ?? '', /image\/jpeg/);
  const logoBytes = Buffer.from(await logo.arrayBuffer());
  assert.equal(logoBytes.readUInt16BE(0), 0xffd8, 'Logo must be a real JPEG');
  const assets = [...html.matchAll(/(?:src|href)="([^"\s]+\/assets\/[^"\s]+)"/g)].map(
    (match) => match[1],
  );
  assert(assets.length >= 2, 'Built JavaScript and CSS are referenced');
  for (const asset of assets) {
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
  const artwork = await fetch(root + 'login-earthwork.png');
  assert.equal(artwork.status, 200);
  assert.match(artwork.headers.get('content-type') ?? '', /image\/png/);
  assert.equal(Buffer.from(await artwork.arrayBuffer()).readUInt32BE(0), 0x89504e47);
  const manifest = await (await fetch(root + 'manifest.webmanifest')).json();
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.name, 'Khok Kloi Backhoe Engineering');
  assert.equal(manifest.short_name, 'Khok Kloi');
  for (const size of [192, 512]) {
    assert(manifest.icons.some((icon) => icon.sizes === `${size}x${size}`));
    const icon = await fetch(
      new URL(manifest.icons.find((icon) => icon.sizes === `${size}x${size}`).src, root),
    );
    assert.equal(icon.status, 200);
    const bytes = Buffer.from(await icon.arrayBuffer());
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  assert.equal(new URL(manifest.start_url, root).href, root);
  const precache = await (await fetch(root + 'precache-manifest.json')).json();
  assert(precache.length >= 2);
  assert(precache.every((path) => path.startsWith(server.config.base + 'assets/')));
  const worker = await fetch(root + 'sw.js');
  assert.equal(worker.status, 200);
  assert.match(await worker.text(), /construction-shell-/);
  console.log(
    `HTTP smoke passed: HTML, ${assets.length} assets, manifest, PNG icons, service worker`,
  );
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
