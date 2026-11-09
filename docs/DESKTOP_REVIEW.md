# Desktop web — feature review first

อัปเดต 2026-11-08 (Asia/Bangkok). ผู้ใช้ให้โฟกัสเว็บบนเดสก์ท็อปก่อน และเลื่อนการตรวจอุปกรณ์ Android ออกไป งาน Android ที่ยังไม่ตรวจไม่ขวางการดูฟีเจอร์ desktop และไม่ถูกเปลี่ยนสถานะเป็น PASS โดยไม่มีหลักฐาน

## “บริการจริง” ต่างจาก Android อย่างไร

บริการจริงคือ Firebase Authentication/Firestore และ Google Drive/OAuth/backend ที่แอปติดต่อบน Internet เดสก์ท็อปก็ใช้บริการเหล่านี้เมื่อล็อกอิน ซิงก์ อัปโหลด หรือกู้ไฟล์จริง การเลื่อน Android ไม่ได้แปลว่าต้องรอ Android เพื่อเชื่อม Cloud

| ดูและลองในเครื่องได้                                                              | ต้องเชื่อมบริการจริงจึงยืนยันได้                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| โครงการ/พิกัด/ข้อมูลพื้นฐาน/รถ/คนขับ/แหล่งดิน/ชนิดดิน/ทีม                         | Google login และ enabled admin จริง                                      |
| บันทึกเที่ยวรถ งานรายวัน +1 แก้ไขพร้อมเหตุผล คัดลอกวันถัดไป                       | Firestore sync/conflicts/restore ข้ามอุปกรณ์จริง                         |
| เก็บภาพ/ใบเที่ยว/ลายเซ็นในเครื่องและดู pending checklist                          | Private Drive upload, metadata acknowledgement, token renewal/revocation |
| ดู MATCHED/MISMATCHED โดยไม่อ้างเป็น VERIFIED                                     | ยืนยันยอดและปิดวันหลังหลักฐานปัจจุบันผ่าน upload/metadata จริง           |
| รายงาน daily/week/month, CSV/XLSX และ print/PDF                                   | กู้ต้นฉบับ/ตรวจ inventory ของไฟล์ใน Google Drive จริง                    |
| สำรวจ BM/TP/grid/slope/cut-fill, preview CSV/XLSX import, 2D contours และ history | Deployment/production headers/security acceptance ที่ URL จริง           |

## เปิดบนคอมพิวเตอร์ของผู้ใช้

ต้องมี Node.js 22.12 ขึ้นไป และ checkout ล่าสุดของ repository:

```sh
npm ci
npm --prefix backend ci
npm run dev
```

เปิดแอปจาก address ที่ Vite แสดงใน terminal ของเครื่องนั้น ไม่มีขั้นตอน Android ในการเปิดเว็บ หาก PowerShell บล็อก npm.ps1 ให้ใช้ npm.cmd

ถ้ามี .env.local สำหรับบริการจริงอยู่แล้ว แต่ต้องการดู local-only โดยไม่แก้/ลบไฟล์ configuration เดิม ให้ใช้ process สำหรับ isolated local review ที่มีอยู่ใน repository แทน:

```sh
node scripts/e2e-server.mjs
```

คำสั่งนี้ blank เฉพาะ VITE cloud configuration ใน process ของมัน ไม่แก้ .env.local ไม่สร้าง credentials และไม่เชื่อม production. ใช้ browser profile แยกเมื่อทดลองข้อมูลตัวอย่าง เพราะการใช้ origin เดิมใน browser profile เดิมยังเข้าถึง IndexedDB ของ origin นั้นได้ อย่าล้าง site data เพื่อเริ่มใหม่

Backend server จริงยังไม่ต้องเปิดสำหรับดู local UI; ต้องเตรียม Firebase/OAuth/encryption/CORS configuration ที่ถูกต้องก่อนใช้ backend จริง ห้ามใส่ secrets ใน frontend เพื่อทำให้ปุ่มเชื่อมต่อใช้งานได้

## ลำดับลองฟีเจอร์บน desktop

1. โครงการ: เพิ่มโครงการ active, ระบุพิกัด และดูการแก้ไข/Archive
2. ข้อมูลพื้นฐาน: เพิ่มรถและความจุ คนขับ แหล่งดิน ชนิดดิน และทีม ลอง truck Excel template/import preview/export
3. บันทึกเที่ยวรถ: เลือกโครงการ รถ คนขับ และวันที่ บันทึกแล้ว refresh ตรวจรายการเดิม
4. งานรายวัน: สร้างวัน เพิ่มหลายคัน กด +1 แก้รายเที่ยว/ยอดพร้อมเหตุผล ตรวจ snapshot ปริมาตรและคัดลอกวันถัดไป
5. หลักฐาน: เปิดหลักฐานรายรถ แนบภาพ/ใบเที่ยว วาดลายเซ็นด้วย mouse และดู checklist หลัง refresh. ข้อมูล local READY ไม่ใช่ cloud VERIFIED
6. ตรวจยอด: เปรียบเทียบยอดตรง/ต่าง ลองยืนยันเมื่อหลักฐานยังไม่ครบ แอปต้องอธิบายและคงข้อมูลเดิม ห้ามใช้ DevTools เปลี่ยน status เป็น synced เพื่อให้ดูเหมือนเชื่อม Cloud สำเร็จ
7. รายงานธุรกิจ: เลือก daily/week/month/project/truck/driver/source/verification/cumulative รวม filters; ลอง CSV/XLSX พร้อม metadata/references และ print/PDF
8. สำรวจ: กำหนด BM/datum/ขนาด/ระยะกริด ดู slope/cut-fill และ estimated contours; export CSV/XLSX, ทดลอง import preview/cancel/confirm, บันทึกและโหลด history
9. ซิงก์และสำรองข้อมูล: ดูสถานะ pending/ข้อผิดพลาด/ข้อมูลขัดแย้ง ซิงก์และกู้คืนจาก Cloud หรือดาวน์โหลดข้อมูลสำรองพร้อมไฟล์แนบ จุดแดงที่เมนูบอกว่ามีปัญหาต้องตรวจสอบ โดยรายละเอียดอยู่ในหน้านี้
10. การตั้งค่า/Drive: จัดการการเชื่อมต่อ Drive/ไฟล์แนบและนำเข้าข้อมูลสำรอง การอัปโหลด/restore/audit จริงต้องตั้งค่าบริการเพิ่มเติม ไม่ใช่งานที่ต้องรอ Android

## Current review evidence

ตรวจหน้าจอ desktop ที่ 1440×1000 ด้วย Playwright/system Chromium ใน browser context ใหม่ ใช้ข้อมูลตัวอย่างเฉพาะในเครื่อง: project 1, trucks 2, daily recorded trips 13, legacy example trip 1, no verified cloud totals, simulated survey grid. Captured 10 actual application screens (overview/projects/masters/trips/daily/evidence/reports/monthly/survey/settings); no browser page errors. No authenticated Firebase/Drive operation, fake cloud verification, upload to production or user IndexedDB deletion

เครื่องมือ shared Chrome/Desktop control ไม่ถูกเสนอให้เรียกใช้ใน session นี้ จึงตรวจผ่าน automated Chromium และจัด gallery ที่ฝังภาพในไฟล์เดียวใน session artifacts แทน ไม่ได้สร้าง public hosted preview. Gallery เป็นภาพสำหรับรีวิว ไม่ใช่เว็บ interactive ที่ deploy แล้ว

GitHub source push และเว็บที่ deploy เป็นคนละขั้นตอน ยังไม่ได้ deploy โค้ดรอบนี้ขึ้น Firebase/Render/Hosting. หากต้องการ URL ให้หลายคนเปิดร่วมกัน ต้องเตรียม concrete staging configuration/artifact และได้รับคำสั่ง deploy ก่อน โดยไม่เขียนทับเว็บ production ที่อาจใช้อยู่

Desktop review found UX-002: wide business-report columns expanded the whole page at desktop widths. The table now scrolls within its container, including the optional reference column; screenshot checks retain the 1440px document width. The first report capture was taken during lazy loading; captures were regenerated after waiting for actual controls/content

Desktop-control diagnostic: environment ccarenv_b64_Y2NhcmVudl9kMzMxMjI4Y2EzYTg4MTkxODUyZmUyNTI1NmVlMDY3Yg reports remote_desktop enabled with state unknown, but cua_repl/js and open_in_codex are not callable in this session. Automated system Chromium worked; the shared viewer was not opened by the agent

Desktop-first final validation 2026-11-08: cloud npm run check exit 0; frontend 275, backend 11, rules 7, emulator integration 8, E2E 47 (1.7 minutes), format/lint/typecheck/build/smoke PASS. Gallery: 10 actual desktop screens at 1440×1000 with synthetic local data, no page errors, no cloud verification or production upload. Android hardware remains deferred/NOT VERIFIED
