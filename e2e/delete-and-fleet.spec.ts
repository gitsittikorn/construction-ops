import { expect, test } from '@playwright/test';
import writeExcel from 'write-excel-file/node';
import { truckHeaders } from '../src/truckImport';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`imports drivers, shows them with plates, deletes and resets at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true })
      .click();
    // Adding and importing are reachable at the top, without scrolling past the list.
    await expect(
      page.getByRole('button', { name: 'เพิ่มรถและคนขับ', exact: true }),
    ).toBeInViewport();
    const importToggle = page.getByRole('button', {
      name: 'นำเข้า / ซิงก์ Google Sheets',
      exact: true,
    });
    await importToggle.click();
    await expect(page.getByLabel('ลิงก์ Google Sheets สำหรับข้อมูลรถ')).toBeVisible();

    const file = await writeExcel(
      [
        truckHeaders,
        ['', '80-1234', 'พังงา', '6 ล้อ', '0810000001', 'สมชาย', 'เคน', 6, '', ''],
        ['', '81-5678', 'ภูเก็ต', '6 ล้อ', '0810000002', 'สมศักดิ์', 'เคน', 6, '', ''],
      ],
      { sheet: 'Trucks' },
    ).toBuffer();
    const upload = () =>
      page.getByLabel('นำเข้ารถ Excel (.xlsx)', { exact: true }).setInputFiles({
        name: 'trucks.xlsx',
        buffer: file,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    await upload();
    await page.getByRole('button', { name: 'ยืนยันนำเข้ารถ', exact: true }).click();
    await expect(page.getByText('80-1234 พังงา — สมชาย', { exact: true })).toBeVisible();
    await expect(page.getByText('81-5678 ภูเก็ต — สมศักดิ์', { exact: true })).toBeVisible();

    await upload();
    await expect(
      page.getByText('เพิ่ม 0 · อัปเดต 0 · ข้าม 2 · ผิดพลาด 0', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'ยืนยันนำเข้ารถ', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'ยกเลิกนำเข้า', exact: true }).click();

    await page.reload();
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true })
      .click();
    await expect(page.getByText('80-1234 พังงา — สมชาย', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'ลบ 80-1234', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: 'ยกเลิกการลบ', exact: true }).click();
    await expect(page.getByText('80-1234 พังงา — สมชาย', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'ลบ 80-1234', exact: true }).click();
    await dialog.getByRole('button', { name: 'ยืนยันลบรายการ', exact: true }).click();
    await expect(page.getByText('80-1234 พังงา — สมชาย', { exact: true })).toHaveCount(0);

    await importToggle.click();
    await page.getByText('ตรวจข้อมูลรถและคนขับ / ล้างเพื่อซิงก์ใหม่').click();
    const reset = page.getByRole('button', { name: '2. ล้างข้อมูลรถและคนขับ' });
    await expect(reset).toBeDisabled();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '1. ดาวน์โหลดไฟล์สำรองก่อนล้าง' }).click();
    await download;
    await reset.click();
    const confirm = dialog.getByRole('button', { name: 'ยืนยันล้างข้อมูล', exact: true });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole('textbox').fill('ล้างข้อมูลรถ');
    await confirm.click();
    await expect(page.getByText('ยังไม่มีข้อมูลรถและคนขับ', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}
