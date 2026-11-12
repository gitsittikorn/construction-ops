import { test, expect, type Page } from '@playwright/test';

async function searchChoose(page: Page, label: string, query: string, result: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  const search = page.getByRole('combobox', { name: 'ค้นหาตัวเลือก', exact: true });
  await search.fill(query);
  await page.getByRole('listbox').getByRole('option', { name: result, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}
async function createMaster(page: Page, tab: string, name: string, field = 'ชื่อ') {
  await page.getByRole('button', { name: tab, exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มข้อมูล', exact: true }).click();
  await page.getByLabel(field, { exact: true }).fill(name);
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('searchable controls link fleet records, autofill a trip and preserve the original after changing the assignment', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'เพิ่มโครงการ', exact: true }).click();
  await page.getByLabel('ชื่อโครงการ', { exact: true }).fill('ไซต์ค้นหาทะเบียน');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มรถพร้อมคนขับ', exact: true }).click();
  await page.getByLabel('ทะเบียนรถ', { exact: true }).fill('81-1234');
  await page.getByLabel('ชื่อเล่น', { exact: true }).fill('ชาย');
  await page.getByLabel('เบอร์โทร', { exact: true }).fill('0812345678');
  await page.getByLabel('ชื่อคนขับใหม่ (ถ้ายังไม่มีรายชื่อ)', { exact: true }).fill('สมชาย');
  await page.getByLabel('ความจุ (m³)', { exact: true }).fill('12');
  await searchChoose(page, 'ประเภทรถ', 'สิบ', 'สิบล้อ');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(page.getByRole('button', { name: /81-1234.*คนขับประจำ: สมชาย/ })).toBeVisible();
  await page.getByRole('button', { name: 'คนขับรถ', exact: true }).click();
  await expect(page.getByRole('button', { name: /สมชาย.*รถประจำ: 81-1234/ })).toBeVisible();
  await page.getByRole('button', { name: 'รถบรรทุก', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มข้อมูล', exact: true }).click();
  await page.getByLabel('ทะเบียนรถ', { exact: true }).fill('82-9999');
  const driver = page.getByRole('combobox', { name: 'คนขับประจำรถ', exact: true });
  await driver.click();
  await page.getByRole('combobox', { name: 'ค้นหาตัวเลือก' }).fill('สมชาย');
  await expect(page.getByRole('listbox').getByRole('option', { name: /สมชาย/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'ปิดฟอร์ม', exact: true }).click();
  await nav.getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
  await searchChoose(page, 'รถบรรทุก *', '811234', '81-1234');
  await expect(page.getByRole('combobox', { name: 'คนขับรถ', exact: true })).toHaveValue(/.+/);
  await searchChoose(page, 'คนขับรถ', 'ชาย', 'สมชาย');
  const searchControl = page.getByRole('combobox', { name: 'รถบรรทุก *', exact: true });
  await searchControl.click();
  await page.getByRole('combobox', { name: 'ค้นหาตัวเลือก' }).fill('ไม่พบแน่นอน');
  await expect(page.getByRole('status').filter({ hasText: 'ไม่พบตัวเลือก' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('หมายเหตุ', { exact: true }).fill('ประวัติคนขับเดิม');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await page.reload();
  await nav.getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true }).click();
  await page.getByRole('button', { name: /81-1234.*คนขับประจำ: สมชาย/ }).click();
  await page.getByRole('combobox', { name: 'คนขับประจำรถ', exact: true }).selectOption('');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await nav.getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
  await page.getByRole('button', { name: /แก้ไขเที่ยวรถ/ }).click();
  await expect(
    page.getByRole('combobox', { name: 'คนขับรถ', exact: true }).locator('option:checked'),
  ).toHaveText('สมชาย');
});

test('source-specific soil prices retain descending history after offline writes and reconnected reload, and reject invalid amounts', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true })
    .click();
  await createMaster(page, 'แหล่งดิน', 'บ่อหนึ่ง');
  await createMaster(page, 'แหล่งดิน', 'บ่อสอง');
  await createMaster(page, 'ชนิดดิน', 'ดินลูกรัง', 'ชื่อชนิดดิน');
  const panel = page.getByRole('region', { name: 'ราคาดินตามแหล่ง' });
  await searchChoose(page, 'ชนิดดินสำหรับราคา', 'ลูกรัง', 'ดินลูกรัง');
  await searchChoose(page, 'แหล่งดินสำหรับราคา', 'หนึ่ง', 'บ่อหนึ่ง');
  await context.setOffline(true);
  async function price(amount: string) {
    await panel.getByLabel('ราคาดิน (บาท)', { exact: true }).fill(amount);
    await panel.getByRole('button', { name: 'บันทึกราคาดินใหม่' }).click();
  }
  await price('120.50');
  await expect(panel.getByRole('status')).toContainText('ในเครื่อง');
  await price('130.10');
  const rows = panel.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('130.10');
  await expect(rows.nth(0).locator('td').first()).toHaveText('2');
  await expect(rows.nth(1)).toContainText('120.50');
  await price('-1');
  await expect(panel.getByRole('alert')).toContainText('ตั้งแต่ศูนย์');
  await expect(rows).toHaveCount(2);
  await searchChoose(page, 'แหล่งดินสำหรับราคา', 'สอง', 'บ่อสอง');
  await price('85.25');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('85.25');
  await context.setOffline(false);
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true })
    .click();
  await page.getByRole('button', { name: 'ชนิดดิน', exact: true }).click();
  await searchChoose(page, 'ชนิดดินสำหรับราคา', 'ลูกรัง', 'ดินลูกรัง');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('85.25');
  await expect(panel.getByText(/บันทึกราคาทั้งหมด/)).toContainText('3 ครั้ง');
  await context.setOffline(false);
});

test('search picker stays inside a narrow viewport and supports keyboard cancellation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true })
    .click();
  await page.getByRole('combobox', { name: 'กรองประเภทรถ' }).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('สิบ');
  const search = page.getByRole('combobox', { name: 'ค้นหาตัวเลือก' });
  await expect(search).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox', { name: 'กรองประเภทรถ' })).toHaveValue('ten-wheel');
  await page.getByRole('combobox', { name: 'กรองประเภทรถ' }).click();
  const bounds = await page.locator('.search-select-popup').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox', { name: 'กรองประเภทรถ' })).toBeFocused();
});
