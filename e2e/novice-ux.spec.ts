import { test, expect } from '@playwright/test';
import { readSheet } from 'read-excel-file/universal';
import type { Data } from '../src/models';
const demoId = 'demo-construction-ops-v1';
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 800, height: 1280 },
  { width: 390, height: 844 },
]) {
  test(`novice workflow: complete demo, readable forms, report recovery and preserved data at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.evaluate(async () => {
      const storagePath = '/src/storage.ts',
        fixturePath = '/src/test/syncFixtures.ts';
      const { persistData } = await import(storagePath);
      const { fixture } = await import(fixturePath);
      await persistData('local', fixture());
    });
    await page.reload();
    const nav = page.getByRole('navigation');
    await expect(page.getByText('Site', { exact: true })).toBeVisible();
    expect(
      (await nav.getByRole('button').allTextContents()).slice(0, 3).map((s) => s.trim()),
    ).toEqual(['ภาพรวม', 'งานรายวันและตรวจยอด', expect.stringContaining('บันทึกเที่ยวรถ')]);
    await page.getByRole('button', { name: 'สร้างโครงการ DEMO และดูรายงาน', exact: true }).click();
    await expect(page.getByLabel('โครงการรายงาน', { exact: true })).toHaveValue(demoId);
    const summary = page.getByLabel('ยอดสรุปรายงาน');
    await expect(summary).toContainText('80');
    await expect(summary).toContainText('1,200');
    await expect(summary.locator('article').last()).toContainText('0');
    await expect(page.getByRole('cell', { name: 'ยอดไม่ตรงกัน', exact: true })).toHaveCount(1);
    const reportTable = page.getByRole('region', {
      name: 'ตารางรายงาน เลื่อนดูคอลัมน์เพิ่มเติม',
      exact: true,
    });
    await reportTable.focus();
    await reportTable.press('ArrowRight');
    await expect.poll(() => reportTable.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await reportTable.evaluate((el) => {
      el.scrollLeft = 0;
    });
    await page.evaluate(() => {
      document.documentElement.scrollTop = 0;
    });
    await page.screenshot({
      path: test.info().outputPath('reports.png'),
      fullPage: viewport.width === 390,
    });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'ส่งออกรายงาน Excel', exact: true }).click();
    const stream = await (await download).createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const sheet = await readSheet(new Uint8Array(Buffer.concat(chunks)).buffer, 'สรุปยอด');
    expect(sheet.find((r) => r[0] === 'เที่ยวรวม')?.[1]).toBe(80);
    expect(sheet.find((r) => r[0] === 'ปริมาตรที่ทราบ m³')?.[1]).toBe(1200);
    await page.getByLabel('รายงานตั้งแต่วันที่', { exact: true }).fill('2027-01-01');
    await page.getByLabel('รายงานถึงวันที่', { exact: true }).fill('2026-01-01');
    await expect(
      page.getByRole('button', { name: 'ส่งออกรายงาน Excel', exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('ช่วงวันที่รายงานไม่ถูกต้อง');
    await page.getByRole('button', { name: 'ล้างตัวกรองรายงาน', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByLabel('โครงการรายงาน', { exact: true }).selectOption(demoId);
    await nav.getByRole('button', { name: 'ภาพรวม', exact: true }).click();
    await expect(
      page.getByRole('button').filter({ hasText: 'DEMO · โครงการถมดินตัวอย่าง' }),
    ).toContainText('80 เที่ยว');
    await nav.getByRole('button', { name: 'รายงาน', exact: true }).click();
    const advanced = page.getByText(/^กรองเพิ่มเติม ·/);
    await advanced.focus();
    await advanced.press('Enter');
    await page.getByLabel('กรองรถ', { exact: true }).selectOption(`${demoId}-truck-a`);
    await expect(summary).toContainText('600');
    await expect(summary).toContainText('50');
    await page.getByRole('button', { name: 'ล้างตัวกรองรายงาน', exact: true }).click();
    await page.getByLabel('โครงการรายงาน', { exact: true }).selectOption(demoId);
    const labels = [
      'งานรายวันและตรวจยอด',
      'บันทึกเที่ยวรถ',
      'โครงการ',
      'ข้อมูลพื้นฐาน',
      'รายงาน',
      'การเงินโครงการ',
      'สำรวจและคำนวณ',
      'ซิงก์และสำรองข้อมูล',
      'การตั้งค่า',
    ];
    for (const label of labels) {
      await nav.getByRole('button', { name: label, exact: true }).click();
      await page.getByRole('heading', { level: 1, name: label, exact: true }).waitFor();
      const guide = page.locator('.page-guide');
      await guide.locator('summary').click();
      await expect(guide.getByRole('listitem')).toHaveCount(3);
      await expect(guide.getByRole('listitem').first()).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
        .toBe(true);
      const gaps = await page
        .locator('main label')
        .evaluateAll((labels) =>
          labels
            .filter(
              (label) =>
                label.querySelector('select, input:not([type="checkbox"]):not([type="radio"])') &&
                label.getBoundingClientRect().height > 0,
            )
            .map((label) => parseFloat(getComputedStyle(label).rowGap)),
        );
      expect(gaps.every((gap) => gap >= 8)).toBe(true);
      if (label === 'การเงินโครงการ') {
        await page.getByLabel('โครงการการเงิน', { exact: true }).selectOption(demoId);
        await expect(page.getByLabel('ยอดประมาณการโครงการ')).toContainText('49,200.00');
        if (viewport.width === 1440)
          await page.screenshot({ path: test.info().outputPath('finance.png'), fullPage: false });
      }
      if (label === 'ข้อมูลพื้นฐาน' && viewport.width === 1440)
        await page.screenshot({ path: test.info().outputPath('masters.png'), fullPage: false });
      if (label === 'สำรวจและคำนวณ') {
        await page.getByLabel('ประวัติงานสำรวจ', { exact: true }).selectOption(`${demoId}-survey`);
        await expect(page.getByText(/ถมแน่น 100.000 m³/)).toBeVisible();
      }
    }
    await nav.getByRole('button', { name: 'โครงการ', exact: true }).click();
    const demo = page.getByRole('article').filter({
      has: page.getByRole('heading', { name: 'DEMO · โครงการถมดินตัวอย่าง', exact: true }),
    });
    await expect(demo).toContainText('80 เที่ยวรถ');
    await demo.getByRole('button', { name: 'ดู / แก้ไข' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('สถานะโครงการ', { exact: true }).selectOption('draft');
    await dialog.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
    await expect(demo).toContainText('ฉบับร่าง');
    await nav.getByRole('button', { name: 'ภาพรวม', exact: true }).click();
    await page.getByRole('button', { name: 'เปิดรายงาน DEMO', exact: true }).click();
    await expect(page.getByLabel('ยอดสรุปรายงาน')).toContainText('1,200');
    const stored: Data = await page.evaluate(async () => {
      const path = '/src/storage.ts';
      return (await import(path)).loadData('local');
    });
    expect(stored.projects).toHaveLength(2);
    expect(stored.projects.find((p) => p.id === demoId)?.status).toBe('draft');
    expect(stored.trips).toHaveLength(1);
    expect(stored.trips[0].syncStatus).toBe('pending');
    expect(stored.workspaces?.filter((r) => r.recordType === 'daily')).toHaveLength(5);
  });
}
