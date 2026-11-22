import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

export function precachePlugin(): Plugin {
  let outDir = '',
    base = '/';
  return {
    name: 'construction-precache',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      base = config.base;
      if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base))
        throw Error('PWA base must be a local path with a leading and trailing slash');
    },
    async closeBundle() {
      const names = (await readdir(path.join(outDir, 'assets')))
        .filter((name) => /\.(js|css)$/.test(name))
        .sort();
      const workerPath = path.join(outDir, 'sw.js'),
        worker = await readFile(workerPath, 'utf8'),
        hash = createHash('sha256').update(base).update(names.join('\n')).update(worker);
      for (const name of [
        'index.html',
        'manifest.webmanifest',
        'icon.svg',
        'icon-192.png',
        'icon-512.png',
        'company-logo.jpg',
        'login-earthwork.png',
      ])
        hash.update(await readFile(path.join(outDir, name)));
      const version = hash.digest('hex').slice(0, 16);
      await writeFile(
        path.join(outDir, 'precache-manifest.json'),
        JSON.stringify(names.map((name) => `${base}assets/${name}`)),
      );
      await writeFile(
        workerPath,
        worker.replace("const VERSION = 'v5';", `const VERSION = '${version}';`),
      );
      await writeFile(path.join(outDir, '.nojekyll'), '');
    },
  };
}
