import type { Page } from '@playwright/test';

const parents: Record<string, string> = {
  งานรายวันและตรวจยอด: 'บันทึกเที่ยวดิน',
  บันทึกเที่ยวรถ: 'บันทึกเที่ยวดิน',
  ซิงก์และสำรองข้อมูล: 'การตั้งค่า',
  ภาพรวม: 'เครื่องมือเพิ่มเติม',
  การเงินโครงการ: 'เครื่องมือเพิ่มเติม',
  สำรวจและคำนวณ: 'เครื่องมือเพิ่มเติม',
};

/** Opens a page from the sidebar, expanding its main menu first when needed. */
export async function openMenu(page: Page, name: string) {
  const nav = page.getByRole('navigation', { name: 'เมนูหลัก' });
  const label = name === 'รายงาน' ? 'รายงานและสรุปยอด' : name;
  const target = nav.getByRole('button', { name: label, exact: true });
  await nav.getByRole('button', { name: 'โครงการ', exact: true }).waitFor();
  if (!(await target.isVisible()))
    await nav.getByRole('button', { name: parents[label], exact: true }).click();
  await target.click();
}

/** Shows the extra tools so their presence or absence can be asserted. */
export async function expandExtra(page: Page) {
  const toggle = page.getByRole('button', { name: 'เครื่องมือเพิ่มเติม', exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}
