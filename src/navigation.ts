/** Five main menus. Their sub pages keep the names users already know. */
export const mainMenu = [
  { id: 'record', title: 'บันทึกเที่ยวดิน', pages: ['record', 'daily', 'trips'] },
  { id: 'projects', title: 'โครงการ', pages: ['projects'] },
  { id: 'masters', title: 'ข้อมูลพื้นฐาน', pages: ['masters'] },
  { id: 'reports', title: 'รายงานและสรุปยอด', pages: ['reports'] },
  { id: 'settings', title: 'การตั้งค่า', pages: ['settings', 'sync'] },
] as const;
/** Less frequent tools, kept in a collapsible section. */
export const extraPages = ['overview', 'finance', 'survey'] as const;
export const pageTitles: Record<string, string> = {
  record: 'บันทึกเที่ยวดิน',
  daily: 'งานรายวันและตรวจยอด',
  trips: 'บันทึกเที่ยวรถ',
  projects: 'โครงการ',
  masters: 'ข้อมูลพื้นฐาน',
  reports: 'รายงานและสรุปยอด',
  settings: 'การตั้งค่า',
  sync: 'ซิงก์และสำรองข้อมูล',
  overview: 'ภาพรวม',
  finance: 'การเงินโครงการ',
  survey: 'สำรวจและคำนวณ',
};
/** Sub page labels shown under the open main menu. */
export const subTitles: Record<string, string> = {
  record: 'บันทึกเที่ยว',
  daily: 'งานรายวันและตรวจยอด',
  trips: 'บันทึกเที่ยวรถ',
  settings: 'ทั่วไปและบัญชี',
  sync: 'ซิงก์และสำรองข้อมูล',
};
