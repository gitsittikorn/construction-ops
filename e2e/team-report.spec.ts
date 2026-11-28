import { openMenu } from './nav';
import { test, expect } from '@playwright/test';

test('a picked truck brings its team, +1 counts trips and the team report totals pay', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const fixtures = '/src/test/syncFixtures.ts',
      storage = '/src/storage.ts',
      finance = '/src/finance.ts';
    const { fixture, truck, project } = await import(fixtures);
    const { addFinanceRate, financeVersion } = await import(finance);
    const data = fixture();
    data.trips = [];
    data.masters = [
      { ...truck, id: 'team', kind: 'tag', name: 'ทีมเหนือ' },
      { ...truck, id: 'truck', name: '70-1234', tagIds: ['team'] },
    ];
    const priced = addFinanceRate(
      data,
      project.id,
      financeVersion(data, project.id),
      {
        side: 'truck',
        partyId: '',
        effectiveFrom: '2026-01-01',
        unit: 'trip',
        satang: 50000,
        reason: 'ค่าเที่ยว',
      },
      'local',
    );
    await (await import(storage)).persistData('local', priced);
  });
  await page.reload();
  await openMenu(page, 'งานรายวันและตรวจยอด');
  await page.getByLabel('วันที่ทำงาน', { exact: true }).fill('2026-11-05');
  await page.getByRole('button', { name: 'สร้างวันทำงาน', exact: true }).click();
  await page.getByLabel('รถทำงาน', { exact: true }).selectOption('truck');
  await expect(page.getByLabel('ทีมทำงาน', { exact: true })).toHaveValue('team');
  await page.getByLabel('เที่ยวบันทึก', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'บันทึกยอดรถ', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มเที่ยว 70-1234', exact: true }).click();
  await expect(page.getByText(/เที่ยวบันทึก 3 ·/)).toBeVisible();
  await openMenu(page, 'รายงาน');
  await page.getByLabel('รูปแบบรายงาน', { exact: true }).selectOption('team');
  const report = page.getByRole('region', { name: /ตารางรายงาน/ });
  await expect(report.getByRole('row', { name: /รวมทั้งหมด/ })).toContainText('3');
  await expect(report.getByRole('row', { name: /ทีมเหนือ 70-1234/ })).toContainText('1500');
  const plate = page.getByRole('combobox', { name: 'กรองทะเบียนรถ / คนขับ', exact: true });
  await plate.fill('701');
  await page.getByRole('option', { name: '70-1234', exact: true }).click();
  await expect(plate).toHaveValue('70-1234');
  const teamBox = page.getByRole('combobox', { name: 'กรองทีม', exact: true });
  await teamBox.fill('เหนือ');
  await teamBox.press('Enter');
  await page.getByLabel('รายงานตั้งแต่วันที่', { exact: true }).fill('2027-01-01');
  await expect(report.getByRole('row', { name: /รวมทั้งหมด/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'ทุกวันที่', exact: true }).click();
  await expect(report.getByRole('row', { name: /รวมทั้งหมด/ })).toContainText('1500');
  await teamBox.click();
  await page.screenshot({ path: 'test-results/team-report.png', fullPage: true });
});
