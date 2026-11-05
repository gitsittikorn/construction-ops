import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('เริ่มต้นโครงการแรก', { exact: true })).toBeVisible();
  // Seed only the isolated test browser's IndexedDB, never the user's profile.
  await page.evaluate(async () => {
    const storagePath = '/src/storage.ts';
    const domainPath = '/src/domain.ts';
    const { persistData } = await import(storagePath);
    const { workDate } = await import(domainPath);
    const base = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
    await persistData('local', {
      projects: ['A', 'B'].map((name) => ({
        ...base,
        id: name,
        name: `Project ${name}`,
        status: 'active',
        customer: '',
        location: '',
        startDate: '',
        endDate: '',
        description: '',
      })),
      masters: ['11-1111', '22-2222'].map((name) => ({
        ...base,
        id: name,
        name,
        kind: 'truck',
        detail: '',
        capacity: 12,
        active: true,
      })),
      trips: [
        { id: 'today', date: workDate(), projectId: 'A', truckId: '11-1111' },
        { id: 'historic-a', date: '2000-01-01', projectId: 'A', truckId: '11-1111' },
        { id: 'historic-b', date: '2000-01-02', projectId: 'B', truckId: '22-2222' },
      ].map((trip) => ({
        ...base,
        ...trip,
        time: '08:30',
        driverId: '',
        sourceId: '',
        soilType: '',
        notes: trip.id,
        revision: 1,
        syncStatus: 'pending',
      })),
      audit: [],
    });
  });
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^บันทึกเที่ยวรถ/ })
    .click();
});

test('all dates reveals historical trips and can switch back to today or a specific date', async ({
  page,
}) => {
  const rows = page.locator('tbody tr');
  const allDates = page.getByRole('checkbox', { name: 'ทุกวันที่' });
  const date = page.getByLabel('วันที่เที่ยวรถ');
  const today = await date.inputValue();
  await expect(rows).toHaveCount(1);
  await allDates.check();
  await expect(date).toBeDisabled();
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText('2000-01-01');
  await allDates.uncheck();
  await expect(date).toBeEnabled();
  await expect(date).toHaveValue(today);
  await expect(rows).toHaveCount(1);
  await date.fill('2000-01-02');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('22-2222');
});

test('all-date searches combine with project filters and empty results preserve saved trips', async ({
  page,
}) => {
  const rows = page.locator('tbody tr');
  await page.getByRole('checkbox', { name: 'ทุกวันที่' }).check();
  await page.getByLabel('ค้นหาเที่ยวรถ').fill('22-2222');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('2000-01-02');
  await page.getByLabel('กรองโครงการ').selectOption('A');
  await expect(rows).toHaveCount(0);
  await expect(
    page.getByText('ยังไม่มีเที่ยวรถตามเงื่อนไขที่เลือก', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('กรองโครงการ').selectOption('');
  await page.getByLabel('ค้นหาเที่ยวรถ').fill('');
  await expect(rows).toHaveCount(3);
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^บันทึกเที่ยวรถ/ })
    .click();
  await page.getByRole('checkbox', { name: 'ทุกวันที่' }).check();
  await expect(rows).toHaveCount(3);
});

test('reports share the all-date filter and export historical rows', async ({ page }) => {
  await page.getByRole('navigation').getByRole('button', { name: 'รายงาน', exact: true }).click();
  await page.getByRole('checkbox', { name: 'ทุกวันที่' }).check();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.getByText(/วันที่ทำงาน: ทุกวัน/)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('2000-01-01');
  expect(csv).toContain('2000-01-02');
});
