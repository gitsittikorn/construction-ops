import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 800, height: 1280 },
  { width: 390, height: 844 },
]) {
  test(`task panels have one home and preserve pending records at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.evaluate(async () => {
      const storagePath = '/src/storage.ts',
        fixturePath = '/src/test/syncFixtures.ts';
      const { persistData } = await import(storagePath);
      const { fixture } = await import(fixturePath);
      const data = fixture();
      data.trips.push({ ...data.trips[0], id: 'duplicate-trip' });
      await persistData('local', data);
    });
    await page.reload();
    await expect(page.getByText('Site', { exact: true })).toBeVisible();
    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('button', { name: 'รายงานธุรกิจ', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'รายงาน', exact: true })).toHaveCount(1);
    await nav.getByRole('button', { name: 'รายงาน', exact: true }).click();
    await expect(page.getByLabel('รูปแบบรายงาน', { exact: true })).toBeVisible();
    await page.getByLabel('รายงานตั้งแต่วันที่', { exact: true }).fill('2027-01-01');
    await page.getByLabel('รายงานถึงวันที่', { exact: true }).fill('2026-01-01');
    await expect(page.getByRole('alert')).toContainText('ช่วงวันที่รายงานไม่ถูกต้อง');
    await expect(
      page.getByRole('button', { name: 'ส่งออกรายงาน CSV', exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: /แก้ไขเที่ยวรถ/ })).toHaveCount(0);
    await expect(
      page.getByRole('columnheader', { name: 'วันที่ / เวลา', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('main').getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }),
    ).toHaveCount(0);
    await nav.getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
    await page.getByRole('checkbox', { name: 'ทุกวันที่' }).check();
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await expect(page.getByRole('button', { name: /แก้ไขเที่ยวรถ/ })).toHaveCount(2);
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV', exact: true }).click();
    const stream = await (await event).createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const exported = Buffer.concat(chunks).toString('utf8');
    expect(exported).toContain('2026-11-06');
    expect(exported.match(/AB123/g)).toHaveLength(2);
    await nav.getByRole('button', { name: 'การตั้งค่า', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'กู้คืนไฟล์สำรอง JSON', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'ตรวจเที่ยวที่อาจซ้ำ', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('main').getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('.local-banner')).toHaveCount(0);
    await nav.getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
    await page.getByLabel('มุมมองเที่ยวรถ', { exact: true }).selectOption('duplicates');
    const duplicates = page.getByRole('region', { name: 'ตรวจเที่ยวที่อาจซ้ำ', exact: true });
    await expect(duplicates).toContainText('พบ 1 กลุ่ม');
    await duplicates
      .getByLabel('เหตุผลตรวจเที่ยวซ้ำ', { exact: true })
      .fill('ตรวจตั๋วแล้ว เป็นคนละเที่ยว');
    await duplicates.getByRole('button', { name: 'บันทึกผลตรวจเที่ยวซ้ำ', exact: true }).click();
    await expect(duplicates.getByRole('status')).toContainText('ยืนยันว่าเป็นคนละเที่ยว');
    await nav.getByRole('button', { name: 'ซิงก์และสำรองข้อมูล', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'ดาวน์โหลดข้อมูลสำรองพร้อมไฟล์แนบ' }),
    ).toBeVisible();
    const restore = page.getByRole('region', { name: 'กู้คืนไฟล์สำรอง JSON', exact: true });
    await restore.getByLabel('เลือกไฟล์สำรอง JSON').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{'),
    });
    await expect(restore.getByRole('alert')).toBeVisible();
    const stored = await page.evaluate(async () => {
      const path = '/src/storage.ts';
      return (await import(path)).loadData('local');
    });
    expect(stored.trips).toHaveLength(2);
    expect(
      stored.trips.every((trip: { syncStatus: string }) => trip.syncStatus === 'pending'),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
      true,
    );
  });
}
