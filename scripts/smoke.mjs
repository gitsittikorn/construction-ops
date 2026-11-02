import assert from 'node:assert/strict';
import { preview } from 'vite';
const server = await preview({ preview: { host: '127.0.0.1', port: 0, open: false } });
try {
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /lang="th"/);
  assert.match(html, /<title>Khok Kloi Backhoe Engineering/);
  const logo = await fetch(origin + '/company-logo.jpg');
  assert.equal(logo.status, 200);
  assert.match(logo.headers.get('content-type') ?? '', /image\/jpeg/);
  const logoBytes = Buffer.from(await logo.arrayBuffer());
  assert.equal(logoBytes.readUInt16BE(0), 0xffd8, 'Logo must be a real JPEG');
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)].map((match) => match[1]);
  assert(assets.length >= 2, 'Built JavaScript and CSS are referenced');
  for (const asset of assets) {
    const response = await fetch(origin + asset);
    assert.equal(response.status, 200, asset);
    assert.doesNotMatch(response.headers.get('content-type') ?? '', /text\/html/, asset);
  }
  const manifest = await (await fetch(origin + '/manifest.webmanifest')).json();
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.name, 'Khok Kloi Backhoe Engineering');
  assert.equal(manifest.short_name, 'Khok Kloi');
  for (const size of [192, 512]) {
    assert(manifest.icons.some((icon) => icon.sizes === `${size}x${size}`));
    const icon = await fetch(origin + `/icon-${size}.png`);
    assert.equal(icon.status, 200);
    const bytes = Buffer.from(await icon.arrayBuffer());
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  const worker = await fetch(origin + '/sw.js');
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
