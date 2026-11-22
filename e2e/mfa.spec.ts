import { expect, test } from '@playwright/test';
test.use({ isMobile: true, hasTouch: true });
for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 820, height: 1180 },
])
  test(`synthetic TOTP setup and challenge retry, cancel and completion at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/e2e/mfa-harness.html');
    await page.getByRole('button', { name: 'ตั้งค่าแอปยืนยันตัวตน', exact: true }).tap();
    await expect(page.getByLabel('คีย์ตั้งค่า Authenticator')).toHaveValue('TEST_ONLY_SETUP_KEY');
    await page.getByRole('button', { name: 'ยกเลิกการตั้งค่า', exact: true }).tap();
    await expect(page.getByLabel('คีย์ตั้งค่า Authenticator')).toHaveCount(0);
    await page.getByRole('button', { name: 'ตั้งค่าแอปยืนยันตัวตน', exact: true }).tap();
    await page.getByLabel('รหัสยืนยันตั้งค่า 6 หลัก').fill('123456');
    await page.getByRole('button', { name: 'ยืนยันและเปิดใช้แอปยืนยันตัวตน', exact: true }).tap();
    await expect(page.getByRole('status')).toContainText('ออกจากระบบและเข้าใหม่');
    await expect(page.getByLabel('คีย์ตั้งค่า Authenticator')).toHaveCount(0);
    await page.getByRole('button', { name: 'ทดสอบหน้ากรอกรหัส', exact: true }).tap();
    await page.getByRole('button', { name: 'ยกเลิกการยืนยัน', exact: true }).tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'ทดสอบหน้ากรอกรหัส', exact: true }).tap();
    const code = page.getByLabel('รหัสยืนยันเข้าสู่ระบบ 6 หลัก');
    await code.fill('000000');
    await page.getByRole('button', { name: 'ยืนยันเข้าสู่ระบบ', exact: true }).tap();
    await expect(page.getByRole('alert')).toContainText('รหัสไม่ถูกต้อง');
    await expect(code).toHaveValue('');
    await code.fill('123456');
    await page.getByRole('button', { name: 'ยืนยันเข้าสู่ระบบ', exact: true }).tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('ยืนยันสำเร็จแบบจำลอง', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
      true,
    );
  });
