import { test, expect, type Page } from '@playwright/test';
import { openMenu } from './nav';
import type { Data } from '../src/models';

const stored = (page: Page) =>
  page.evaluate(async () => {
    const path = '/src/storage.ts';
    const { loadData } = await import(path);
    return (await loadData('local')) as Data;
  });
const todayTrips = async (page: Page) => {
  const data = await stored(page);
  return (data.workspaces ?? []).flatMap((record) =>
    record.recordType === 'daily'
      ? record.body.rows.flatMap((row) => (row.transactions ?? []).filter((t) => !t.voidedAt))
      : [],
  ).length;
};

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 375, height: 812 },
]) {
  test(`one-tap recording, undo, reload and bulk delete at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.evaluate(async () => {
      const path = '/src/storage.ts';
      const { persistData } = await import(path);
      const stamp = { createdAt: 'x', updatedAt: 'x' };
      const master = (id: string, kind: string, name: string, extra = {}) => ({
        ...stamp,
        id,
        kind,
        name,
        detail: '',
        capacity: 0,
        active: true,
        ...extra,
      });
      await persistData('local', {
        projects: [
          {
            ...stamp,
            id: 'p',
            name: 'โครงการทดสอบ',
            customer: '',
            location: '',
            startDate: '',
            endDate: '',
            status: 'active',
            description: '',
          },
        ],
        masters: [
          master('team', 'tag', 'ทีมทดสอบ'),
          master('driver', 'driver', 'หนึ่ง'),
          master('t1', 'truck', '80-0001', { capacity: 6, driverId: 'driver', tagIds: ['team'] }),
          master('t2', 'truck', '80-0002', { capacity: 12 }),
          master('s1', 'source', 'บ่อหนึ่ง'),
          master('s2', 'source', 'บ่อสอง'),
        ],
        trips: [],
        audit: [],
      });
    });
    await page.reload();
    const fits = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
    const record = page.getByRole('button', { name: 'บันทึก 1 เที่ยว 80-0001', exact: true });
    await expect(record).toBeVisible();
    expect((await record.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole('button', { name: 'ทุกทีม', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await record.click();
    await expect(page.getByLabel('เที่ยวทั้งหมดของวัน')).toHaveText('1');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'บันทึก 1 เที่ยว 80-0002', exact: true }).click();
    await expect(page.getByLabel('เที่ยวทั้งหมดของวัน')).toHaveText('2');
    await page.getByRole('button', { name: 'เลิกทำ', exact: true }).click();
    await expect(page.getByLabel('เที่ยวทั้งหมดของวัน')).toHaveText('1');
    expect(await todayTrips(page)).toBe(1);
    await page.getByRole('button', { name: 'ทีมทดสอบ', exact: true }).click();
    await expect(page.getByRole('article', { name: 'รถ 80-0002' })).toHaveCount(0);
    await page.getByRole('button', { name: 'ทุกทีม', exact: true }).click();
    await page.getByRole('searchbox', { name: 'ค้นหารถหรือคนขับ' }).fill('หนึ่ง');
    await expect(page.locator('.vehicle-card')).toHaveCount(1);
    await page.getByRole('searchbox', { name: 'ค้นหารถหรือคนขับ' }).fill('');
    expect(await fits()).toBe(true);
    await page.screenshot({ path: test.info().outputPath('record.png'), fullPage: true });
    await page.context().setOffline(true);
    await expect(page.getByText('ออฟไลน์ — ยังบันทึกได้')).toBeVisible();
    await page.getByRole('button', { name: 'บันทึก 1 เที่ยว 80-0002', exact: true }).click();
    await expect(page.getByLabel('เที่ยวทั้งหมดของวัน')).toHaveText('2');
    await page.context().setOffline(false);
    await page.reload();
    await expect(page.getByLabel('เที่ยวทั้งหมดของวัน')).toHaveText('2');

    const history = page.getByRole('region', { name: 'ประวัติเที่ยวล่าสุด' });
    await history.getByRole('checkbox', { name: 'เลือกทั้งหมดในหน้านี้' }).check();
    await history.getByRole('button', { name: 'ลบ (2)', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    const confirm = dialog.getByRole('button', { name: 'ยืนยันการลบ 2 รายการ', exact: true });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole('textbox').fill('ทดสอบ');
    await confirm.click();
    await expect(page.getByText('ลบสำเร็จ 2 รายการ')).toBeVisible();
    await expect(page.getByLabel('เที่ยวทั้งหมดของวัน')).toHaveText('0');

    await openMenu(page, 'ข้อมูลพื้นฐาน');
    await page.getByRole('button', { name: 'แหล่งดิน', exact: true }).click();
    const box = page.getByRole('checkbox', { name: 'เลือก แหล่งดิน บ่อหนึ่ง', exact: true });
    await box.check();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'เลือกทั้งหมดในหน้านี้' }).check();
    expect(await fits()).toBe(true);
    await page.getByRole('button', { name: 'ลบ (2)', exact: true }).click();
    await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
    expect((await stored(page)).masters.filter((m) => m.kind === 'source')).toHaveLength(2);
    await page.getByRole('button', { name: 'ลบ (2)', exact: true }).click();
    await page.getByRole('button', { name: 'ยืนยันการลบ 2 รายการ', exact: true }).click();
    // The voided trips of this day still reference the first source, so it must stay.
    await expect(page.getByText(/ลบสำเร็จ \d รายการ/)).toBeVisible();
    expect((await stored(page)).trips).toHaveLength(0);
  });
}
