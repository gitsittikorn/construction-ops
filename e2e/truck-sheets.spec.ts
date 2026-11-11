import { test, expect, type Page } from '@playwright/test';
import { truckHeaders } from '../src/truckImport';

async function provider(page: Page, ambiguous = false) {
  const requests: URL[] = [];
  await page.route('**/src/firebase.ts*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const getSessionIdentity=()=>({uid:'sheet-owner',email:'sheet@example.com'});`,
    }),
  );
  await page.route('**/src/drive.ts*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const loadGoogleIdentity=async()=>{};export const requestGoogleToken=async()=>({token:'synthetic-token',expiresAt:Date.now()+3600000});`,
    }),
  );
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization',
    'access-control-allow-methods': 'GET,OPTIONS',
  };
  await page.route('https://openidconnect.googleapis.com/v1/userinfo', (route) =>
    route.fulfill({
      headers,
      json: { sub: 'synthetic-id', email: 'sheet@example.com', email_verified: true },
    }),
  );
  await page.route('https://sheets.googleapis.com/v4/spreadsheets/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    expect(request.method()).toBe('GET');
    const url = new URL(request.url());
    requests.push(url);
    expect(url.pathname.startsWith('/v4/spreadsheets/custom_book')).toBe(true);
    const tabs = [
      { sheetId: 0, title: 'Trucks' },
      { sheetId: 17, title: 'รถบรรทุก' },
    ];
    if (!url.pathname.endsWith('/values:batchGet')) {
      await route.fulfill({
        headers,
        json: {
          sheets: tabs.map((properties) => ({
            properties: { ...properties, gridProperties: { columnCount: 10, rowCount: 65 } },
          })),
        },
      });
      return;
    }
    const ranges = url.searchParams.getAll('ranges');
    const valueRanges = ranges.map((range) => ({
      values:
        range.endsWith(':J1') || (!ambiguous && range.startsWith("'Trucks'"))
          ? [truckHeaders]
          : [
              truckHeaders,
              [
                '',
                range.startsWith("'Trucks'") ? '81-0002' : '81-0001',
                '',
                'หกล้อ',
                '0812345678',
                '',
                '',
                '6',
                '',
                '',
              ],
            ],
    }));
    await route.fulfill({ headers, json: { spreadsheetId: 'custom_book', valueRanges } });
  });
  return requests;
}

test('the URL input selects the file, discovers a Thai tab and requires confirmation before pending local storage', async ({
  page,
}) => {
  const requests = await provider(page);
  await page.goto('/e2e/truck-sheets-harness.html');
  const input = page.getByRole('textbox', { name: 'ลิงก์ Google Sheets สำหรับข้อมูลรถ' });
  await expect(input).not.toHaveValue('');
  await input.fill('https://docs.google.com/spreadsheets/d/custom_book/edit');
  await page.getByRole('button', { name: 'นำเข้าจาก Google Sheets', exact: true }).click();
  await expect(
    page.getByText('อ่านจากแท็บ “รถบรรทุก” จำนวน 1 รายการ กรุณาตรวจรายการก่อนยืนยัน', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('เพิ่ม 1 · อัปเดต 0 · ข้าม 0 · ผิดพลาด 0', { exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(3);
  const state = () =>
    page.evaluate(async () => {
      const storagePath = '/src/storage.ts';
      const { loadData } = await import(storagePath);
      return loadData('sheet-owner');
    });
  expect((await state()).masters).toHaveLength(0);
  await page.getByRole('button', { name: 'ยืนยันนำเข้ารถ', exact: true }).click();
  await expect(
    page.getByText('นำเข้าสำเร็จ เพิ่ม 1 แก้ไข 0 ข้าม 0 รายการ', { exact: true }),
  ).toBeVisible();
  expect((await state()).masters[0].phone).toBe('0812345678');
  expect(Object.keys((await state()).sync!.entries)).not.toHaveLength(0);
  await page.reload();
  await expect(input).toHaveValue('https://docs.google.com/spreadsheets/d/custom_book/edit#gid=17');
  expect((await state()).masters).toHaveLength(1);
});

test('multiple populated tabs require gid and an explicit selected tab succeeds without merging another tab', async ({
  page,
}) => {
  await provider(page, true);
  await page.goto('/e2e/truck-sheets-harness.html');
  const input = page.getByRole('textbox', { name: 'ลิงก์ Google Sheets สำหรับข้อมูลรถ' });
  await expect(input).not.toHaveValue('');
  await input.fill('https://docs.google.com/spreadsheets/d/custom_book/edit');
  await page.getByRole('button', { name: 'นำเข้าจาก Google Sheets', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('พบหลายแท็บข้อมูลรถ');
  await expect(page.getByRole('button', { name: 'ยืนยันนำเข้ารถ', exact: true })).toHaveCount(0);
  await input.fill('https://docs.google.com/spreadsheets/d/custom_book/edit#gid=17');
  await page.getByRole('button', { name: 'นำเข้าจาก Google Sheets', exact: true }).click();
  await expect(
    page.getByText('อ่านจากแท็บ “รถบรรทุก” จำนวน 1 รายการ กรุณาตรวจรายการก่อนยืนยัน', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('.import-preview tbody tr')).toHaveCount(1);
  await expect(page.locator('.import-preview')).toContainText('81-0001');
  await expect(page.locator('.import-preview')).not.toContainText('81-0002');
});
