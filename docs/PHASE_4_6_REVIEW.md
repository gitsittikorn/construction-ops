# Phase 4–6 review and continuation

วันที่ 2026-11-08 (Asia/Bangkok). Baseline `ad490a87075d178dd7db87a1cf4e79eedbb8bffe` ตรงกับ remote `main` เมื่อเริ่มตรวจ และไม่มี local changes ก่อนงานนี้

## ขอบเขตและผลตรวจ source

ไม่สามารถอ่านแชต GPT อื่นได้โดยตรง การตรวจรอบนี้อิง source, PHASE_4_REPORT.md, PHASE_3_REPORT.md, PHASE_0_AUDIT.md และ FEATURE_CHECKLIST.md ใน repository ไม่อ้างว่าครอบคลุมข้อกำหนดที่มีเฉพาะในแชตอื่น

| Phase | ผลตรวจ                                                                                                                                                                                                         | ขอบเขตที่ยังค้าง                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 4     | มี private original restoration, owner/reference validation และ IndexedDB cache อยู่แล้ว เพิ่ม E2E สอง browser profiles ซึ่งต้องดาวน์โหลดและเก็บต้นฉบับของตัวเองอย่างอิสระ ก่อนดาวน์โหลด bytes เดิมแบบ offline | Google/Drive/OAuth จริงและ Android จริงยัง NOT VERIFIED จึงยัง PARTIAL |
| 5     | มี reconcile, manual verify, close/reopen, immutable closure snapshots และ audit อยู่แล้ว ไม่ใช่ NOT STARTED เพิ่มการตรวจ owner, folder, context และ distinct Drive file IDs พร้อม regression tests            | การรับรองบริการจริงใช้ข้อจำกัดเดียวกับ Phase 4                         |
| 6     | มีรายงานเจ็ดรูปแบบ, filters, known/verified totals, CSV/XLSX และ A4 PDF อยู่แล้ว แก้รายงานตรวจยอดเมื่อมีหลายความจุ และเพิ่มการตรวจค่าจริงในไฟล์ส่งออก                                                          | การพิมพ์และเปิดไฟล์ด้วย Android/Excel บนอุปกรณ์จริงยัง NOT VERIFIED    |

## การแก้ไข

- Phase 5: ปฏิเสธหลักฐานของ owner อื่น, metadata ที่ไม่มี folder ID, project/date/truck/driver ไม่ตรง และ Drive ID ที่ถูกใช้แทนหลายไฟล์ ไม่สร้าง verification หรือ closure เมื่อข้อมูลไม่ผ่าน
- Phase 5 E2E: หลัง reopen จะปิดวันทันทีไม่ได้ ต้องยืนยันใหม่ จากนั้นปิดครั้งที่สองและ reload ได้ โดย snapshot ครั้งแรกยังเหมือนเดิมและมี snapshot สองรายการ
- Phase 6: daily detail ยังแยก snapshot รายเที่ยว ส่วน verification report รวมต่อรถต่อวัน ใช้ปริมาตรที่รวมจาก snapshot จริง ไม่คูณความจุปัจจุบันกับเที่ยวทั้งหมด และแสดงหลายความจุอย่างชัดเจน
- หากกรอง driver/source จนเหลือบางเที่ยวของรถ จะไม่เอายอดรายงานทั้งคันมาเทียบกับเที่ยวบางส่วน และแสดงคำอธิบายกำกับ
- UI, CSV และ XLSX ใช้ตารางเดียวกัน จึงคงยอดบันทึก ยอดรายงาน และผลต่างตรงกันทั้งสามช่องทาง ทดสอบกรณี 3 × 12 + 1 × 20 = 56 m³, บันทึก 4, รายงาน 5, ผลต่าง −1
- Playwright รองรับ `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` เป็นตัวเลือก เพื่อรันด้วย Chromium ที่ติดตั้งใน cloud โดยไม่แก้ config นอก repository ทุกครั้ง ค่าเริ่มต้นเดิมยังใช้ได้เมื่อไม่กำหนดตัวแปร

## คำสั่งตรวจบน cloud

รันจาก `/workspace/construction-ops`:

```sh
CI=true \
XDG_CONFIG_HOME=/workspace/.cache/config \
npm_config_cache=/workspace/.npm-cache \
FIREBASE_EMULATORS_PATH=/workspace/.cache/firebase/emulators \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
npm run check

npm run clean
```

`XDG_CONFIG_HOME` ทำให้ Firebase CLI เขียน config ในพื้นที่ที่อนุญาตได้ ไม่ได้ปิดการตรวจ TLS/checksum และไม่ใส่ credentials ปลอม Tests ใช้ demo Firestore emulator และ intercepted/synthetic Google responses เท่านั้น

## การตรวจรับ Phase 4 ที่ต้องใช้บริการและอุปกรณ์จริง

ใช้บัญชีและ Firebase/Drive สำหรับทดสอบแยกจาก production พร้อม origin ที่ได้รับอนุญาต และไม่ส่ง credentials ผ่านแชต:

1. บนอุปกรณ์แรก สร้างวันทำงาน รูปต้นฉบับ ใบเที่ยว และลายเซ็น จดชื่อไฟล์ ขนาด และ SHA-256 จากไฟล์ที่ควบคุมไว้ อัปโหลดจน metadata ยืนยันแล้ว แต่ยังไม่กดยืนยันยอดอัตโนมัติ
2. บนอุปกรณ์ที่สอง ลงชื่อบัญชีเดียวกัน กู้ metadata และต้นฉบับ ตรวจขนาด/bytes/hash เทียบไฟล์ต้นทาง จากนั้นตัด network และตรวจ preview/ดาวน์โหลดอีกครั้ง
3. ตรวจด้วยบัญชีอื่นว่าเข้าถึงเอกสารและ cache ของบัญชีแรกไม่ได้ โดยไม่เปลี่ยนไฟล์ให้เป็น public
4. ตรวจ OAuth หมดอายุ/ถอนสิทธิ์และการเชื่อมต่อใหม่ ข้อผิดพลาดต้องไม่ทำ pending originals หายหรือเปลี่ยนยอดเป็น VERIFIED
5. ตรวจ network หลุดระหว่าง restore และ storage quota ไม่พอ แล้ว retry ต้องไม่เขียนทับ pending upload หรือสร้างเอกสารซ้ำ
6. ตรวจ Android camera permission, ภาพจากกล้อง/แกลเลอรี, touch/stylus, PWA install/reload แบบ offline และการเปิดไฟล์ XLSX/PDF จริง บันทึกรุ่นอุปกรณ์/browser และผลแต่ละข้อ

สอง browser profiles ใน automated test ไม่เท่ากับสองอุปกรณ์จริง การตรวจ metadata ไม่รับรอง historical checksum ของไฟล์ legacy ที่ไม่มี checksum ต้นทาง Cache อยู่ภายใต้ browser quota/eviction และแยกจาก pending uploads

ไม่มี push, deploy, production migration หรือการแก้ environment draft/publication ในรอบนี้

## Current validated gate — 2026-11-08

รัน `npm run check` ด้วย cloud variables ใน PHASE_4_6_REVIEW.md: exit 0. Format, lint (4 tooling tests), typecheck, frontend 256/256 (40 files), backend 10/10, Firestore rules 7/7, emulator integration 8/8, build, HTTP smoke และ Playwright E2E 42/42 (1.5 minutes) ผ่าน ไม่มี tests failed/skipped/cancelled. ใช้ system Chromium; ไม่มี real Google/Drive/Android acceptance. ไม่ปิด assertion หรือ skip tests เพื่อให้ผ่าน
