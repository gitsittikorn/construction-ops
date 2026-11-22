import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('localhost stays on the requested origin and preserves navigation', async ({ page }) => {
  await page.goto('http://localhost:5174/?review=1#daily');
  await expect(page).toHaveURL('http://localhost:5174/?review=1#daily');
  await expect(page.getByRole('navigation')).toBeVisible();
});

test('existing localhost data stays usable and backed up without crossing into another origin', async ({
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
  await expect(page).toHaveURL('http://localhost:5174/');
  await expect(page.getByRole('navigation')).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'ซิงก์และสำรองข้อมูล', exact: true })
    .click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ดาวน์โหลดข้อมูลสำรองพร้อมไฟล์แนบ' }).click();
  const downloaded = await downloadPromise;
  const backup = JSON.parse(await readFile((await downloaded.path())!, 'utf8'));
  expect(backup.state.projects).toHaveLength(1);
  expect(backup.state.masters).toHaveLength(1);
  expect(backup.state.trips).toHaveLength(1);
  const separate = await context.newPage();
  await separate.goto('http://127.0.0.1:5174/');
  await expect(separate.getByText('เริ่มต้นโครงการแรก', { exact: true })).toBeVisible();
  const legacy = await context.newPage();
  await legacy.goto('http://localhost:5174/');
  await expect(legacy).toHaveURL('http://localhost:5174/');
  await expect(legacy.getByRole('navigation')).toBeVisible();
  const retained = await legacy.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await import(path)).loadData('local');
  });
  expect(retained.projects).toEqual(backup.state.projects);
  expect(retained.masters).toEqual(backup.state.masters);
  expect(retained.trips).toEqual(backup.state.trips);
});
