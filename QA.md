# Verification — 2026-11-02

ตรวจสอบรุ่นเริ่มต้นบน Windows / Node.js 26.3.1

## ผลที่รันจริง

- `npm run check`: ผ่าน formatting, TypeScript, 33 tests ใน 4 files, production build และ HTTP smoke
- HTTP smoke: Vite preview ตอบ 200 สำหรับ HTML, 4 JavaScript/CSS assets, manifest, PNG icons 192/512 และ service worker จากนั้นปิด server
- npm install หลังอัปเดต dependencies: audit รายงาน 0 vulnerabilities

## ขอบเขตทดสอบ

- UI: สร้างโครงการและรถ บันทึกเที่ยวรถ โหลดข้อมูลกลับหลังเปิดใหม่ แก้ไข/Archive โครงการ ค้นหา เพิ่ม/ปิดข้อมูลพื้นฐานคนขับ แหล่งดิน และลูกค้า คำนวณระดับและปริมาตร และสั่งพิมพ์รายงาน
- Domain: duplicate ID/retry, conflicting payload, revision conflicts, edit history, active references, invalid calendar date/time, negative capacities, timezone ไทย, CSV formula injection, cut/fill และ volume factors
- Persistence: IndexedDB แบบจำลอง เก็บ pending ข้ามการเปิดใหม่และแยกบัญชี
- Cloud adapter: Firebase SDK แบบจำลอง ทดสอบ atomic write/audit, retry, หลาย offline revisions, stale/conflicting data, permission error และ missing authentication/configuration
- PWA policy: worker จำลอง ทดสอบ cache recovery, refresh HTML, ไม่แตะ cloud API/write requests และไม่ลบ cache ของแอปอื่น

## แก้ไขระหว่างตรวจสอบ

- แก้ revision ของข้อมูลที่แก้ไขออฟไลน์หลายครั้งก่อน sync ครั้งแรก
- ป้องกันการยอมรับ payload ขัดแย้งที่ใช้ operation ID/revision เดิม
- ป้องกันวันปฏิทินที่ไม่มีจริง เช่น 30 กุมภาพันธ์
- แก้ cache HTML ให้ปรับตามเวอร์ชันที่เปิดออนไลน์
- จำกัด cleanup ของ service worker ให้เฉพาะ cache ของแอปนี้
- อัปเดต Vitest และ override dependency ของ gRPC ตามช่องโหว่ที่ audit พบ
- แยก Firebase bundles เพื่อลดขนาด entry bundle

## ยังไม่ได้ยืนยัน

- Rendering, touch interaction และการติดตั้ง/เปิดออฟไลน์บน Android Chrome จริง
- Google login/logout จริง, Firestore transactions/Rules กับ Emulator หรือ cloud จริง และการข้ามอุปกรณ์
- PDF rendering/การพิมพ์ภาษาไทยจริง (ทดสอบเพียงเรียก browser print และมี A4 CSS)
- Google Drive, รูป/เอกสาร/ลายเซ็น, reconciliation, survey grid/turning points และ Excel ยังไม่พัฒนา
- เครื่องคำนวณยังเป็นผลชั่วคราว และ project/master data ยังไม่มี cloud sync

ผลทดสอบนี้ไม่ใช่การยืนยันว่าระบบพร้อม production หรือครบ Master Prompt ทุกเฟส
