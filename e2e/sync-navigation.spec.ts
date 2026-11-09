import { test, expect } from '@playwright/test';
import type { Data } from '../src/models';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 800, height: 1280 },
  { width: 390, height: 844 },
]) {
  test(`sync details use a dedicated menu and an accessible error dot at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'ภาพรวมการทำงาน' })).toBeVisible();
    const nav = page.getByRole('navigation');
    const syncMenu = nav.getByRole('button', { name: 'ซิงก์และสำรองข้อมูล', exact: true });
    const panel = page.getByRole('region', { name: 'ความปลอดภัยและซิงก์ข้อมูล' });
    const indicator = nav.getByRole('status', { name: 'มีปัญหาการซิงก์หรือข้อมูลที่ต้องตรวจสอบ' });
    await expect(panel).toHaveCount(0);
    await expect(indicator).toHaveCount(0);
    await page.evaluate(async () => {
      const storagePath = '/src/storage.ts',
        fixturePath = '/src/test/syncFixtures.ts',
        syncPath = '/src/syncModel.ts';
      const { persistData } = await import(storagePath);
      const { fixture } = await import(fixturePath);
      const { prepareSync } = await import(syncPath);
      await persistData('local', prepareSync(fixture(), fixture()));
    });
    await page.reload();
    await expect(page.getByText('Site', { exact: true })).toBeVisible();
    await expect(indicator).toHaveCount(0);
    await page.evaluate(async () => {
      const path = '/src/storage.ts';
      const { updateData } = await import(path);
      await updateData('local', (data: Data) => {
        data.sync!.entries['projects/p'].error = 'Synthetic sync failure';
        return data;
      });
    });
    await expect(indicator).toBeAttached();
    await expect(page.getByText(/Synthetic sync failure/)).toHaveCount(0);
    await syncMenu.click();
    await expect(panel).toBeVisible();
    await expect(syncMenu).toHaveAttribute('aria-current', 'page');
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveCSS('background-color', 'rgb(198, 40, 40)');
    await expect(panel.getByRole('alert')).toContainText('Synthetic sync failure');
    await expect(
      panel.getByRole('button', { name: 'ดาวน์โหลดข้อมูลสำรองพร้อมไฟล์แนบ' }),
    ).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }),
    ).toHaveCount(0);
    await nav.getByRole('button', { name: 'โครงการ', exact: true }).click();
    await expect(panel).toHaveCount(0);
    await syncMenu.click();
    await expect(panel.getByRole('alert')).toContainText('Synthetic sync failure');
    const state = await page.evaluate(async () => {
      const path = '/src/storage.ts';
      return (await import(path)).loadData('local');
    });
    expect(state.trips[0].syncStatus).toBe('pending');
    expect(state.sync.entries['projects/p'].error).toBe('Synthetic sync failure');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
