import { expect, test } from '@playwright/test';
for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 800, height: 1280 },
  { name: 'mobile', width: 390, height: 844 },
])
  test(`${viewport.name}: simulated company operator entry and role-cache changes preserve data and restrict controls`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/e2e/company-harness.html');
    const nav = page.getByRole('navigation');
    await expect(page.getByLabel('สิทธิ์บริษัทปัจจุบัน', { exact: true })).toContainText(
      'พนักงานบันทึกข้อมูล',
    );
    await expect(page.getByLabel('สิทธิ์บริษัทปัจจุบัน', { exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'การเงินโครงการ', exact: true })).toHaveCount(0);
    await nav.getByRole('button', { name: 'ซิงก์และสำรองข้อมูล', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'กู้คืนไฟล์สำรอง JSON', exact: true }),
    ).toHaveCount(0);
    await nav.getByRole('button', { name: 'การตั้งค่า', exact: true }).click();
    await expect(page.getByRole('region', { name: 'สมาชิกบริษัท', exact: true })).toHaveCount(0);
    await nav.getByRole('button', { name: 'งานรายวันและตรวจยอด', exact: true }).click();
    await page.getByRole('button', { name: 'สร้างวันทำงาน', exact: true }).click();
    await page.getByLabel('รถทำงาน', { exact: true }).selectOption('truck');
    await page.getByLabel('คนขับทำงาน', { exact: true }).selectOption('driver');
    await page.getByLabel('เที่ยวบันทึก', { exact: true }).fill('2');
    await page.getByLabel('เที่ยวรายงาน', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'บันทึกยอดรถ', exact: true }).click();
    await expect(page.getByRole('cell', { name: /^ยอดตรงกัน รอผู้จัดการยืนยัน/ })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'ยืนยันยอดทั้งวัน', exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: 'ปิดวันทำงาน', exact: true })).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'เปิดวันใหม่พร้อมเหตุผล', exact: true }),
    ).toBeDisabled();
    await nav.getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
    await page.getByLabel('วันที่เที่ยวรถ', { exact: true }).fill('2026-11-06');
    await page.getByRole('button', { name: 'แก้ไขเที่ยวรถ 10:00', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'ลบรายการโดยเก็บประวัติ', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'ปิดฟอร์ม', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
      true,
    );
    await page.goto('/e2e/company-harness.html?role=manager');
    await expect(nav.getByRole('button', { name: 'การเงินโครงการ', exact: true })).toBeVisible();
    await nav.getByRole('button', { name: 'การเงินโครงการ', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'ยอดประมาณการโครงการ', exact: true }),
    ).toContainText('รายรับที่คำนวณได้ 123.00 บาท');
    await nav.getByRole('button', { name: 'การตั้งค่า', exact: true }).click();
    await expect(page.getByRole('region', { name: 'สมาชิกบริษัท', exact: true })).toHaveCount(0);
    await page.goto('/e2e/company-harness.html');
    await expect(nav.getByRole('button', { name: 'การเงินโครงการ', exact: true })).toHaveCount(0);
    await nav.getByRole('button', { name: 'งานรายวันและตรวจยอด', exact: true }).click();
    await expect(page.getByRole('cell', { name: /^ยอดตรงกัน รอผู้จัดการยืนยัน/ })).toBeVisible();
    await expect(page.getByText(/เที่ยวบันทึก 2/).first()).toBeVisible();
  });
