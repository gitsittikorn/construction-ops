import { expect, test } from '@playwright/test';

test('company branding and login artwork load at the deployed subpath and remain cached offline', async ({
  page,
  context,
}) => {
  const root = 'http://127.0.0.1:5175/construction-ops/';
  await page.goto(root);
  const logo = page.getByRole('img', { name: 'Khok Kloi Backhoe Engineering' });
  await expect(logo).toBeVisible();
  await expect
    .poll(() => logo.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(await logo.getAttribute('src')).toBe('/construction-ops/company-logo.jpg');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  for (const file of ['company-logo.jpg', 'login-earthwork.png']) {
    const response = await page.request.get(root + file);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^image\//);
  }
  const manifest = await (await page.request.get(root + 'manifest.webmanifest')).json();
  expect(new URL(manifest.start_url, root).href).toBe(root);
  await context.setOffline(true);
  await page.reload();
  await expect(logo).toBeVisible();
  await expect
    .poll(() => logo.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const offlineArtwork = await page.evaluate(async () => {
    const image = new Image();
    image.src = '/construction-ops/login-earthwork.png';
    await image.decode();
    return image.naturalWidth;
  });
  expect(offlineArtwork).toBeGreaterThan(0);
});
