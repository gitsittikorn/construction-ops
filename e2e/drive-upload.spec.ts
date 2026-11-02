import { test, expect } from '@playwright/test';
test('browser uploads original image bytes and verifies the private Drive file', async ({
  page,
}) => {
  const expected = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
    'base64',
  );
  let uploaded: Buffer | null = null;
  let creates = 0;
  const headers = {
    'Access-Control-Allow-Origin': 'http://127.0.0.1:5174',
    'Access-Control-Allow-Headers':
      'authorization,content-type,x-upload-content-type,x-upload-content-length',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Expose-Headers': 'Location',
  };
  await page.route('https://www.googleapis.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (url.pathname === '/drive/v3/files/browser-file') {
      await route.fulfill({
        status: uploaded ? 200 : 404,
        headers,
        contentType: 'application/json',
        body: JSON.stringify(
          uploaded
            ? {
                id: 'browser-file',
                size: String(expected.length),
                mimeType: 'image/png',
                parents: ['browser-folder'],
                appProperties: { operationId: 'browser-operation', owner: 'browser-owner' },
              }
            : {},
        ),
      });
      return;
    }
    if (request.method() === 'POST' && url.pathname === '/upload/drive/v3/files') {
      creates++;
      expect(request.postDataJSON()).toMatchObject({
        id: 'browser-file',
        parents: ['browser-folder'],
        mimeType: 'image/png',
      });
      await route.fulfill({
        status: 200,
        headers: { ...headers, Location: 'https://www.googleapis.com/upload/browser-session' },
        body: '',
      });
      return;
    }
    if (request.method() === 'PUT' && url.pathname === '/upload/browser-session') {
      uploaded = request.postDataBuffer();
      await route.fulfill({ status: 200, headers, body: '{"id":"browser-file"}' });
      return;
    }
    await route.abort();
  });
  await page.goto('/e2e/upload-harness.html');
  await page.locator('#upload').click();
  await expect(page.locator('#result')).toHaveText('verified-upload');
  expect(uploaded).toEqual(expected);
  expect(creates).toBe(1);
  await page.locator('#upload').click();
  await expect(page.locator('#result')).toHaveText('verified-upload');
  expect(creates).toBe(1);
});
test('local diagnostics reports queue state without credentials and rejects other origins', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByText('เริ่มต้นโครงการแรก', { exact: true }).waitFor();
  const response = await request.post('/__dev/upload-diagnostics/request');
  expect(response.status()).toBe(200);
  const { id } = await response.json();
  await expect
    .poll(async () => {
      const response = await request.get(`/__dev/upload-diagnostics/result?id=${id}`);
      return (await response.json()).reports.length;
    })
    .toBeGreaterThan(0);
  const result = await (await request.get(`/__dev/upload-diagnostics/result?id=${id}`)).json();
  expect(result.reports[0]).toMatchObject({ signedIn: false, uploads: [] });
  for (const key of ['token', 'email', 'uid', 'name'])
    expect(result.reports[0]).not.toHaveProperty(key);
  expect(
    (
      await request.post('/__dev/upload-diagnostics/request', {
        headers: { Origin: 'https://other-site.test' },
      })
    ).status(),
  ).toBe(403);
});
