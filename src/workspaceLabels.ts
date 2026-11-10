export const verificationLabels: Record<string, string> = {
  PENDING: 'รอตรวจ',
  MATCHED: 'ยอดตรงกัน รอผู้จัดการยืนยัน',
  MISMATCHED: 'ยอดไม่ตรงกัน',
  VERIFIED: 'ตรวจสอบยืนยันแล้ว',
  REOPENED: 'เปิดวันเพื่อแก้ไข',
};
export const evidenceLabels: Record<string, string> = {
  INCOMPLETE: 'หลักฐานยังไม่ครบ',
  READY: 'พร้อมอัปโหลด',
  UPLOADING: 'กำลังอัปโหลด',
  UPLOADED: 'อัปโหลดแล้ว ยังไม่ตรวจยอด',
  FAILED: 'อัปโหลดไม่สำเร็จ',
  VERIFIED: 'ตรวจสอบยืนยันแล้ว',
};
