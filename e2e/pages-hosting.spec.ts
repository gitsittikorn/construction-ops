import { expect, test } from '@playwright/test';

test('Pages subpath serves scoped assets, offline lazy reports and preserved pending work on touch', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:5176/construction-ops/');
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!;
      return { url: link.href, json: await (await fetch(link.href)).json() };
    });
    expect(new URL(manifest.json.start_url, manifest.url).pathname).toBe('/construction-ops/');
    expect(new URL(manifest.json.scope, manifest.url).pathname).toBe('/construction-ops/');
    expect(
      manifest.json.icons.every((icon: { src: string }) =>
        new URL(icon.src, manifest.url).pathname.startsWith('/construction-ops/'),
      ),
    ).toBe(true);
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(new URL(scope).pathname).toBe('/construction-ops/');
    await page.reload();
    const logo = page.locator('img.company-logo');
    await expect
      .poll(() => logo.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
    await context.setOffline(true);
    await page.getByRole('button', { name: 'สร้างโครงการ DEMO และดูรายงาน', exact: true }).tap();
    await expect(page.getByLabel('ยอดสรุปรายงาน')).toContainText('1,200');
    await page.reload();
    await page.getByRole('button', { name: 'เปิดรายงาน DEMO', exact: true }).tap();
    await expect(page.getByLabel('ยอดสรุปรายงาน')).toContainText('1,200');
    await expect(page.getByLabel('ยอดสรุปรายงาน').locator('article').last()).toContainText('0');
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'ซิงก์และสำรองข้อมูล', exact: true })
      .tap();
    await expect(page.getByText('ออฟไลน์', { exact: true }).first()).toBeVisible();
    const cacheNames = await page.evaluate(() => caches.keys());
    expect(
      cacheNames.some((name) => name.startsWith('construction-shell-%2Fconstruction-ops%2F-')),
    ).toBe(true);
    expect(cacheNames.some((name) => name.startsWith('construction-shell-%2F-'))).toBe(false);
    await page.screenshot({ path: test.info().outputPath('pages-offline.png') });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
