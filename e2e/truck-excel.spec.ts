import { test, expect } from '@playwright/test';
import writeExcel from 'write-excel-file/node';
import { readSheet } from 'read-excel-file/node';
import { truckHeaders } from '../src/truckImport';
async function bytes(download: { createReadStream: () => Promise<NodeJS.ReadableStream> }) {
  const stream = await download.createReadStream();
  const parts: Buffer[] = [];
  for await (const chunk of stream) parts.push(Buffer.from(chunk));
  return Buffer.concat(parts);
}
test('truck details, team tags, XLSX export and reviewed import work together in the browser', async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.goto('/');
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true }).click();
  await page.getByRole('button', { name: 'แท็กทีม', exact: true }).click();
  for (const name of ['ทีม A', 'ทีม B']) {
    await page.getByRole('button', { name: 'เพิ่มข้อมูล', exact: true }).click();
    await page.getByLabel('ชื่อแท็ก / ทีม', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'รถบรรทุก', exact: true }).click();
  for (const [plate, province, phone, type, tag] of [
    ['81-1111', 'ภูเก็ต', '0812345678', 'six-wheel', 'ทีม A'],
    ['82-2222', 'พังงา', '0898765432', 'ten-wheel', 'ทีม B'],
  ]) {
    await page.getByRole('button', { name: 'เพิ่มข้อมูล', exact: true }).click();
    await page.getByLabel('ทะเบียนรถ', { exact: true }).fill(plate);
    await page.getByLabel('จังหวัดทะเบียน', { exact: true }).fill(province);
    await page.getByLabel('เบอร์โทร', { exact: true }).fill(phone);
    await page.getByLabel('ชื่อเล่น', { exact: true }).fill('รถ ' + plate);
    await page.getByRole('combobox', { name: 'ประเภทรถ', exact: true }).selectOption(type);
    await page.getByRole('checkbox', { name: tag, exact: true }).check();
    await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page
    .getByRole('combobox', { name: 'กรองแท็กทีม', exact: true })
    .selectOption({ label: 'ทีม A' });
  await expect(page.getByText('81-1111', { exact: true })).toBeVisible();
  await expect(page.getByText('82-2222', { exact: true })).toHaveCount(0);
  const exportPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /ส่งออกรถ Excel/ }).click();
  const exported = await readSheet(await bytes(await exportPromise), 'Trucks');
  expect(exported).toHaveLength(2);
  expect(exported[1][4]).toBe('0812345678');
  expect(exported[1][5]).toBe('รถ 81-1111');
  expect(exported[1][6]).toBe('ทีม A');
  const stableId = String(exported[1][0]);
  const templatePromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ดาวน์โหลด Excel ตัวอย่าง', exact: true }).click();
  const template = await bytes(await templatePromise);
  expect((await readSheet(template, 'Trucks'))[0]).toEqual(truckHeaders);
  await page.getByRole('combobox', { name: 'กรองแท็กทีม', exact: true }).selectOption('');
  const file = await writeExcel(
    [
      truckHeaders,
      [
        stableId,
        '81-1111',
        'ภูเก็ต',
        'สิบล้อ',
        '0899999999',
        'รถใหญ่',
        'ทีม A',
        12,
        'updated',
        'ใช้งาน',
      ],
      [
        '',
        '83-3333',
        'ภูเก็ต',
        'หกล้อ',
        '0800000000',
        'เสี่ยเล็ก',
        'ทีม C, ทีม A',
        6,
        'imported',
        'ใช้งาน',
      ],
    ],
    { sheet: 'รถบรรทุก' },
  ).toBuffer();
  await page.getByLabel('นำเข้ารถ Excel (.xlsx)', { exact: true }).setInputFiles({
    name: 'trucks.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: file,
  });
  await expect(
    page.getByRole('heading', { name: 'ตรวจรายการก่อนนำเข้า', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('เพิ่ม 1 · อัปเดต 0 · ข้าม 1 · ผิดพลาด 0', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('83-3333', { exact: true })).toHaveCount(0);
  await page.getByRole('checkbox', { name: /อัปเดตรถเดิมด้วยข้อมูลทุกคอลัมน์/ }).check();
  await page.getByRole('button', { name: 'ยืนยันนำเข้ารถ', exact: true }).click();
  await expect(
    page.getByText('นำเข้าสำเร็จ เพิ่ม 1 แก้ไข 1 ข้าม 0 รายการ', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'กรองแท็กทีม', exact: true })
    .selectOption({ label: 'ทีม C' });
  await expect(page.getByText('83-3333', { exact: true })).toBeVisible();
  await page.getByLabel('ค้นหาข้อมูลพื้นฐาน', { exact: true }).fill('เสี่ยเล็ก');
  await expect(page.getByText('83-3333', { exact: true })).toBeVisible();
  await page.getByLabel('ค้นหาข้อมูลพื้นฐาน', { exact: true }).clear();
  await expect(page.getByText('81-1111', { exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'กรองแท็กทีม', exact: true }).selectOption('');
  await page.getByLabel('ค้นหาข้อมูลพื้นฐาน', { exact: true }).fill('0899999999');
  await expect(page.getByText('81-1111', { exact: true })).toBeVisible();
  await page.getByLabel('ค้นหาข้อมูลพื้นฐาน', { exact: true }).clear();
  const bad = await writeExcel(
    [
      truckHeaders,
      ['', '84-4444', 'ภูเก็ต', 'หกล้อ', '0811111111', '', '', 6, '', 'ใช้งาน'],
      ['', '84-4444', 'ภูเก็ต', 'หกล้อ', '0822222222', '', '', 6, '', 'ใช้งาน'],
    ],
    { sheet: 'Trucks' },
  ).toBuffer();
  await page.getByLabel('นำเข้ารถ Excel (.xlsx)', { exact: true }).setInputFiles({
    name: 'duplicates.xlsx',
    buffer: bad,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await expect(page.getByRole('button', { name: 'ยืนยันนำเข้ารถ', exact: true })).toBeDisabled();
  await expect(page.getByText('ทะเบียนและจังหวัดซ้ำภายในไฟล์', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ยกเลิกนำเข้า', exact: true }).click();
  await expect(page.getByText('84-4444', { exact: true })).toHaveCount(0);
  await page.reload();
  await nav.getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true }).click();
  await expect(page.getByText('83-3333', { exact: true })).toBeVisible();
  await expect(page.getByText('81-1111', { exact: true })).toBeVisible();
});
test('an invalid XLSX reports an error without importing any records', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true })
    .click();
  await page.getByLabel('นำเข้ารถ Excel (.xlsx)', { exact: true }).setInputFiles({
    name: 'corrupt.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('invalid'),
  });
  await expect(page.getByRole('alert')).toContainText('อ่านไฟล์ Excel ไม่สำเร็จ');
  await expect(page.getByRole('button', { name: 'ยืนยันนำเข้ารถ', exact: true })).toHaveCount(0);
});

test('ambiguous renamed truck sheets require an explicit selection and never enable import', async ({
  page,
}) => {
  const data = [truckHeaders, ['', '81-9001', '', 'หกล้อ', '0812345678', '', '', 6, '', 'ใช้งาน']];
  const buffer = await writeExcel([
    { sheet: 'Fleet A', data },
    { sheet: 'Fleet B', data },
  ]).toBuffer();
  await page.goto('/');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true })
    .click();
  await page.getByLabel('นำเข้ารถ Excel (.xlsx)', { exact: true }).setInputFiles({
    name: 'ambiguous.xlsx',
    buffer,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await expect(page.getByRole('alert')).toContainText('พบหลายชีตข้อมูลรถ');
  await expect(page.getByRole('button', { name: 'ยืนยันนำเข้ารถ', exact: true })).toHaveCount(0);
  await expect(page.getByText('81-9001', { exact: true })).toHaveCount(0);
});
