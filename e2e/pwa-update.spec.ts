import { test, expect, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Two shell-only release fixtures use the real production bundles and worker.
// This is a Chromium lifecycle test, not Google sync or a historical schema migration.
for (const { base, legacy } of [
  { base: '/', legacy: true },
  { base: '/construction-ops/', legacy: true },
  { base: '/', legacy: false },
  { base: '/construction-ops/', legacy: false },
]) {
  test(`PWA ${base} ${legacy ? 'f074bc0 worker' : 'fixed worker'} keeps pending originals through a failed install and offline old-to-new activation`, async ({
    page,
    context,
  }) => {
    let release = 'old';
    const directory = path.resolve(
      base === '/' ? 'test-results/pwa-dist' : 'test-results/pages-dist',
    );
    const server = createServer(async (request, response) => {
      try {
        const pathname = new URL(request.url!, 'http://localhost').pathname;
        if (!pathname.startsWith(base)) throw Error('Wrong base');
        const file = pathname.slice(base.length) || 'index.html';
        if (file.includes('..')) throw Error('Invalid path');
        let body = await readFile(path.join(directory, file));
        if (file === 'sw.js') {
          if (legacy && release === 'old') body = await readFile('e2e/fixtures/sw-f074bc0.txt');
          body = Buffer.from(
            body.toString().replace(/const VERSION = '[^']+';/, `const VERSION = '${release}';`),
          );
        }
        if (file === 'index.html')
          body = Buffer.from(
            body.toString().replace('<html', `<html data-pwa-release="${release}"`),
          );
        if (file === 'precache-manifest.json' && release === 'broken')
          body = Buffer.from(JSON.stringify([`${base}assets/missing.js`]));
        const extension = path.extname(file);
        response.writeHead(200, {
          'Content-Type':
            (
              {
                '.html': 'text/html',
                '.js': 'text/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
              } as Record<string, string>
            )[extension] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        response.end(body);
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}${base}`;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const snapshot = (target: Page) =>
      target.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('construction-ops');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const get = (store: string, key: IDBValidKey) =>
          new Promise<any>((resolve, reject) => {
            const request = db.transaction(store).objectStore(store).get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        try {
          const state = await get('state', 'local');
          const upload = await get('uploads', 'update-original');
          return {
            state,
            upload: {
              ...upload,
              blob: Array.from(new Uint8Array(await upload.blob.arrayBuffer())),
            },
          };
        } finally {
          db.close();
        }
      });
    try {
      await page.goto(url);
      await expect(page.getByText('เริ่มต้นโครงการแรก', { exact: true })).toBeVisible();
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await page.reload();
      await context.setOffline(true);
      await page
        .getByRole('navigation')
        .getByRole('button', { name: 'โครงการ', exact: true })
        .click();
      await page.getByRole('button', { name: 'เพิ่มโครงการ', exact: true }).click();
      await page.getByLabel('ชื่อโครงการ', { exact: true }).fill('Pending across update');
      await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Pending across update', exact: true }),
      ).toBeVisible();
      await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const request = indexedDB.open('construction-ops');
          request.onsuccess = () => resolve(request.result);
        });
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction('uploads', 'readwrite');
          transaction.objectStore('uploads').put({
            id: 'update-original',
            owner: 'local',
            status: 'pending',
            driveId: '',
            blob: new Blob([new Uint8Array([0, 255, 13, 10, 128])]),
          });
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        });
        db.close();
      });
      const before = await snapshot(page);
      expect(Object.values(before.state.sync.entries).map((entry: any) => entry.status)).toEqual([
        'pending',
      ]);
      await context.setOffline(false);
      release = 'broken';
      await page.evaluate(async () => {
        const registration = (await navigator.serviceWorker.getRegistration())!;
        const failed = new Promise<void>((resolve) =>
          registration.addEventListener(
            'updatefound',
            () => {
              const worker = registration.installing!;
              worker.addEventListener('statechange', () => {
                if (worker.state === 'redundant') resolve();
              });
            },
            { once: true },
          ),
        );
        await registration.update();
        await failed;
      });
      expect(await snapshot(page)).toEqual(before);
      release = 'new';
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration())!.update();
      });
      await expect(page.getByRole('button', { name: 'อัปเดตแอปและโหลดใหม่' })).toBeVisible();
      // The archived baseline worker has the known network-first defect. A fixed
      // worker must pin its shell; both paths must retain pending originals.
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute(
        'data-pwa-release',
        legacy ? 'new' : 'old',
      );
      await expect(page.getByRole('button', { name: 'อัปเดตแอปและโหลดใหม่' })).toBeVisible();
      await context.setOffline(true);
      // The archived worker may already display the new HTML marker before
      // activation. Wait for the actual reload before reading IndexedDB.
      await Promise.all([
        page.waitForEvent('domcontentloaded'),
        page.getByRole('button', { name: 'อัปเดตแอปและโหลดใหม่' }).click(),
      ]);
      await expect(page.locator('html')).toHaveAttribute('data-pwa-release', 'new');
      await expect(page.getByText('Pending across update', { exact: true })).toBeVisible();
      expect(await snapshot(page)).toEqual(before);
      await page
        .getByRole('navigation')
        .getByRole('button', { name: 'รายงาน', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'ส่งออกรายงาน Excel', exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-pwa-release', 'new');
      expect(await snapshot(page)).toEqual(before);
      expect(errors).toEqual([]);
    } finally {
      await context.setOffline(false);
      await page.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
}
