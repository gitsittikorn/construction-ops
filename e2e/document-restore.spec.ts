import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);
const metadata = {
  id: 'restore-file',
  size: String(png.length),
  mimeType: 'image/png',
  parents: ['restore-folder'],
  appProperties: { operationId: 'restore-operation', owner: 'phase4-isolated' },
};
async function isolate(page: Page) {
  // Only this harness gets a synthetic identity. No configured account or real Google service is used.
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/src/firebase.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
    export const getSessionIdentity=()=>({uid:'phase4-isolated',email:'test@example.invalid'});
    export const getFirebaseIdToken=async()=> 'synthetic-only';
    export const resolveDriveFolders=async(_owner,_key,candidate)=>candidate;
    export const resolveEvidenceFolder=async(_owner,_key,candidate)=>candidate;
    export const saveDocumentMetadata=async()=>{};
  `,
    }),
  );
}
test('P4: restores a private original once, persists bytes through refresh and previews/downloads offline', async ({
  page,
  context,
}) => {
  await isolate(page);
  let metadataReads = 0,
    mediaReads = 0;
  await page.route('https://www.googleapis.com/drive/v3/files/restore-file**', async (route) => {
    expect(route.request().method()).toBe('GET');
    if (new URL(route.request().url()).searchParams.get('alt') === 'media') {
      mediaReads++;
      await route.fulfill({ contentType: 'image/png', body: png });
    } else {
      metadataReads++;
      await route.fulfill({ json: metadata });
    }
  });
  await page.goto('/e2e/restore-harness.html');
  await page.getByRole('button', { name: 'เก็บต้นฉบับไว้ดูออฟไลน์', exact: true }).dblclick();
  await expect(page.getByText('มีต้นฉบับในเครื่อง พร้อมดูออฟไลน์', { exact: true })).toBeVisible();
  expect([metadataReads, mediaReads]).toEqual([1, 1]);
  await page.reload();
  await expect(page.getByText('มีต้นฉบับในเครื่อง พร้อมดูออฟไลน์', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'ดูภาพต้นฉบับ', exact: true }).click();
  const image = page.getByRole('img', { name: 'ต้นฉบับ private-proof.png', exact: true });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0),
    )
    .toBe(true);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ดาวน์โหลดต้นฉบับ', exact: true }).click();
  const file = await download;
  expect(await readFile((await file.path())!)).toEqual(png);
  expect([metadataReads, mediaReads]).toEqual([1, 1]);
  await context.setOffline(false);
});
test('P4: foreign metadata and interrupted media never create a cache; safe retry succeeds', async ({
  page,
}) => {
  await isolate(page);
  let attempt = 0,
    mediaReads = 0;
  await page.route('https://www.googleapis.com/drive/v3/files/restore-file**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('alt') === 'media') {
      mediaReads++;
      await route.fulfill({
        contentType: 'image/png',
        body: attempt === 2 ? png.subarray(0, 10) : png,
      });
    } else {
      attempt++;
      await route.fulfill({
        json:
          attempt === 1
            ? { ...metadata, appProperties: { ...metadata.appProperties, owner: 'foreign-owner' } }
            : metadata,
      });
    }
  });
  await page.goto('/e2e/restore-harness.html');
  const button = page.getByRole('button', { name: 'เก็บต้นฉบับไว้ดูออฟไลน์', exact: true });
  await button.click();
  await expect(page.getByRole('alert')).toContainText('ไม่ตรง');
  expect(mediaReads).toBe(0);
  await button.click();
  await expect(page.getByRole('alert')).toContainText('ไฟล์ที่ดาวน์โหลดไม่ตรง');
  await expect(page.getByText('มีต้นฉบับในเครื่อง พร้อมดูออฟไลน์', { exact: true })).toHaveCount(0);
  await button.click();
  await expect(page.getByText('มีต้นฉบับในเครื่อง พร้อมดูออฟไลน์', { exact: true })).toBeVisible();
  expect([attempt, mediaReads]).toEqual([3, 2]);
});

test('P4: a second isolated browser has no inherited cache and must independently restore its authorized original', async ({
  browser,
}) => {
  // Two fresh browser profiles model separate local stores, not physical Android devices.
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    for (const context of contexts) {
      const page = await context.newPage();
      await isolate(page);
      let reads = 0;
      await page.route(
        'https://www.googleapis.com/drive/v3/files/restore-file**',
        async (route) => {
          reads++;
          if (new URL(route.request().url()).searchParams.get('alt') === 'media')
            await route.fulfill({ contentType: 'image/png', body: png });
          else await route.fulfill({ json: metadata });
        },
      );
      await page.goto('http://127.0.0.1:5174/e2e/restore-harness.html');
      await expect(
        page.getByRole('button', { name: 'เก็บต้นฉบับไว้ดูออฟไลน์', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('มีต้นฉบับในเครื่อง พร้อมดูออฟไลน์', { exact: true }),
      ).toHaveCount(0);
      expect(reads).toBe(0);
      await page.getByRole('button', { name: 'เก็บต้นฉบับไว้ดูออฟไลน์', exact: true }).click();
      await expect(
        page.getByText('มีต้นฉบับในเครื่อง พร้อมดูออฟไลน์', { exact: true }),
      ).toBeVisible();
      await context.setOffline(true);
      const event = page.waitForEvent('download');
      await page.getByRole('button', { name: 'ดาวน์โหลดต้นฉบับ', exact: true }).click();
      expect(await readFile((await (await event).path())!)).toEqual(png);
      expect(reads).toBe(2);
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('P4: a read-only Drive audit reports missing and unmapped files without deleting metadata or requesting originals', async ({
  page,
}) => {
  await isolate(page);
  const requests: string[] = [];
  await page.route('https://www.googleapis.com/drive/v3/files?**', async (route) => {
    requests.push(route.request().method());
    await route.fulfill({
      json: {
        files: [
          {
            ...metadata,
            id: 'unmapped-file',
            name: 'from-another-device.png',
            appProperties: { owner: 'phase4-isolated', operationId: 'another-operation' },
          },
        ],
      },
    });
  });
  await page.route('https://www.googleapis.com/drive/v3/files/restore-file**', async (route) => {
    requests.push(route.request().method());
    expect(new URL(route.request().url()).searchParams.has('alt')).toBe(false);
    await route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/e2e/restore-harness.html');
  await page.getByRole('button', { name: 'ตรวจไฟล์ใน Drive', exact: true }).click();
  await expect(
    page.getByText('ตรวจข้อมูลอ้างอิง 1 ไฟล์ · พบข้อสังเกต 2 รายการ', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('private-proof.png: ไม่พบไฟล์หรือไม่มีสิทธิ์เข้าถึง', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('from-another-device.png: ยังไม่พบข้อมูลอ้างอิงในเครื่องนี้', { exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(async () => {
    const path = '/src/uploads.ts';
    return (await import(path)).listUploads('phase4-isolated');
  });
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ status: 'synced', driveId: 'restore-file' });
  expect(requests).toEqual(['GET', 'GET']);
});
