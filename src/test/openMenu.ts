import { fireEvent, screen, within } from '@testing-library/react';

const parents: Record<string, string> = {
  งานรายวันและตรวจยอด: 'บันทึกเที่ยวดิน',
  บันทึกเที่ยวรถ: 'บันทึกเที่ยวดิน',
  ซิงก์และสำรองข้อมูล: 'การตั้งค่า',
  ภาพรวม: 'เครื่องมือเพิ่มเติม',
  การเงินโครงการ: 'เครื่องมือเพิ่มเติม',
  สำรวจและคำนวณ: 'เครื่องมือเพิ่มเติม',
};

/** Opens a page from the sidebar, expanding its main menu first when needed. */
export function openMenu(name: string) {
  const nav = within(screen.getByRole('navigation', { name: 'เมนูหลัก' }));
  const label = name === 'รายงาน' ? 'รายงานและสรุปยอด' : name;
  if (!nav.queryByRole('button', { name: label }))
    fireEvent.click(nav.getByRole('button', { name: parents[label] }));
  fireEvent.click(nav.getByRole('button', { name: label }));
}
