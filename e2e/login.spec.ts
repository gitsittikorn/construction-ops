import { test, expect } from '@playwright/test';

test('desktop login button covers the artwork button and activates the login handler', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto('/e2e/login-harness.html');
  const image = page.locator('.login-artwork');
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(1536);
  const button = page.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' });
  const bounds = (await button.boundingBox())!;
  expect(Math.abs(bounds.x - 597)).toBeLessThan(4);
  expect(Math.abs(bounds.y - 464)).toBeLessThan(4);
  await page.screenshot({ path: 'test-results/login-desktop.png' });
  await button.click();
  await expect(page.getByRole('heading', { name: 'Signed in' })).toBeVisible();
});
test('mobile login fits the viewport and supports keyboard login', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/login-harness.html');
  const image = page.locator('.login-artwork');
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(1536);
  const button = page.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' });
  const bounds = (await button.boundingBox())!;
  expect(bounds.height).toBeGreaterThanOrEqual(48);
  expect(bounds.x).toBeGreaterThanOrEqual(16);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(374);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(button).toBeFocused();
  await page.screenshot({ path: 'test-results/login-mobile.png' });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Signed in' })).toBeVisible();
});
test('login failures appear above the artwork and the button remains usable for retry', async ({
  page,
}) => {
  await page.goto('/e2e/login-harness.html?fail');
  const button = page.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' });
  await button.click();
  await expect(page.getByRole('alert')).toContainText('เพิ่มโดเมนใน Firebase Authentication');
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole('heading', { name: 'Signed in' })).toBeVisible();
});
