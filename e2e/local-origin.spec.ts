import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('an empty localhost redirects to the canonical origin and preserves navigation', async ({
  page,
}) => {
  await page.goto('http://localhost:5174/?review=1#daily');
  await expect(page).toHaveURL('http://127.0.0.1:5174/?review=1#daily');
  await expect(page.getByRole('navigation')).toBeVisible();
});

test('legacy localhost data is backed up and retained before opening the canonical workspace', async ({
  page,
  context,
}) => {
  await page.route('**/__seed_legacy', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Isolated legacy fixture</title>',
    }),
  );
  await page.goto('http://localhost:5174/__seed_legacy');
  await page.evaluate(async () => {
    const storagePath = '/src/storage.ts',
      fixturePath = '/src/test/syncFixtures.ts';
    const { persistData } = await import(storagePath);
    const { fixture } = await import(fixturePath);
    await persistData('local', fixture());
  });
  await page.goto('http://localhost:5174/');
  await expect(page.getByText('ใช้ 127.0.0.1 เป็นที่อยู่หลัก', { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ดาวน์โหลดข้อมูลก่อนล็อกอิน' }).click();
  const downloaded = await downloadPromise;
  const backup = JSON.parse(await readFile((await downloaded.path())!, 'utf8'));
  expect(backup.state.projects).toHaveLength(1);
  expect(backup.state.masters).toHaveLength(1);
  expect(backup.state.trips).toHaveLength(1);
  await page.getByRole('link', { name: 'เปิดที่อยู่หลัก 127.0.0.1' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5174/');
  await expect(page.getByText('เริ่มต้นโครงการแรก', { exact: true })).toBeVisible();
  const legacy = await context.newPage();
  await legacy.goto('http://localhost:5174/');
  await expect(legacy.getByRole('button', { name: 'ดาวน์โหลดข้อมูลก่อนล็อกอิน' })).toBeVisible();
  const retained = await legacy.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await import(path)).loadData('local');
  });
  expect(retained.projects).toEqual(backup.state.projects);
  expect(retained.masters).toEqual(backup.state.masters);
  expect(retained.trips).toEqual(backup.state.trips);
});
