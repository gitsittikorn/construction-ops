import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

export function precachePlugin(): Plugin {
  let outDir = '';
  let base = '/';
  return {
    name: 'construction-precache',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      base = config.base;
    },
    async closeBundle() {
      const names = (await readdir(path.join(outDir, 'assets')))
        .filter((name) => /\.(js|css)$/.test(name))
        .sort();
      const version = createHash('sha256')
        .update(base + names.join('\n'))
        .digest('hex')
        .slice(0, 16);
      await writeFile(
        path.join(outDir, 'precache-manifest.json'),
        JSON.stringify(names.map((name) => `${base}assets/${name}`)),
      );
      const workerPath = path.join(outDir, 'sw.js'),
        worker = await readFile(workerPath, 'utf8');
      await writeFile(
        workerPath,
        worker.replace("CACHE_PREFIX + 'v5'", `CACHE_PREFIX + '${version}'`),
      );
    },
  };
}
