import { expect, test } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true });
for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 820, height: 1180 },
])
  test(`touch record form: focus, rotation, cancel and offline save at ${viewport.width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:5175/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.getByText('เริ่มต้นโครงการแรก', { exact: true }).waitFor();
    const add = page.getByRole('button', { name: 'เพิ่มโครงการ', exact: true });
    await add.tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => el.matches(':modal'))).toBe(true);
    const formMetrics = await dialog.locator('input, select').evaluateAll((fields) =>
      fields.map((el) => ({
        font: parseFloat(getComputedStyle(el).fontSize),
        height: el.getBoundingClientRect().height,
      })),
    );
    expect(formMetrics.filter((m) => m.font < 16 || m.height < 48)).toEqual([]);
    await page.getByRole('navigation').getByRole('button', { name: 'รายงาน', exact: true }).focus();
    expect(
      await page.getByRole('navigation').evaluate((el) => el.contains(document.activeElement)),
    ).toBe(false);
    await dialog.getByLabel('ชื่อโครงการ', { exact: true }).fill('Cancelled draft');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(add).toBeFocused();
    await expect(page.getByText('เริ่มต้นโครงการแรก', { exact: true })).toBeVisible();
    await add.tap();
    await dialog.getByLabel('ชื่อโครงการ', { exact: true }).fill('Touch offline project');
    await dialog
      .getByLabel('รายละเอียด', { exact: true })
      .fill('Preserve after rotation and reload');
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
    await expect(dialog.getByLabel('ชื่อโครงการ', { exact: true })).toHaveValue(
      'Touch offline project',
    );
    await context.setOffline(true);
    await dialog.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).tap();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('Touch offline project', { exact: true })).toBeVisible();
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: 'โครงการ', exact: true }).tap();
    await page.getByRole('button', { name: 'ดู / แก้ไข', exact: true }).tap();
    await expect(dialog.getByLabel('รายละเอียด', { exact: true })).toHaveValue(
      'Preserve after rotation and reload',
    );
    await expect(dialog.getByLabel('ชื่อโครงการ', { exact: true })).toHaveValue(
      'Touch offline project',
    );
    await page.screenshot({ path: test.info().outputPath('touch-form.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
      true,
    );
  });
