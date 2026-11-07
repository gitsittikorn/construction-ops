# Phase 6 — reports and export checkpoint

2026-11-08 (Asia/Bangkok). Current status: COMPLETE for implementation and isolated automated acceptance. Real-device/service acceptance remains NOT VERIFIED. Earlier gap notes below are historical.

Existing source reports.ts/ReportsPanel.tsx มีรายงาน daily/project/truck/driver/source/verification/cumulative, combined filters, known/verified totals, Thai UTF-8 CSV, typed XLSX และ print-friendly A4 PDF; survey exports แยกใน surveying.ts/SurveyPanel.tsx

รอบนี้แก้ BUG-002: verification report รวมหลาย capacity snapshots ต่อรถต่อวันโดยรักษายอดรายงานและผลต่าง ใช้ 3×12 + 1×20 = 56 m³ ไม่ใช้ 4×20; แสดง mixed capacity ชัดเจน และไม่เปรียบเทียบยอดรายงานทั้งคันเมื่อ filter เหลือเพียงบางเที่ยว

เพิ่ม unit tests และ E2E ที่อ่านค่าจริงจาก UI/CSV/XLSX พร้อม invalid range ปิด export; retained existing Thai multipage PDF/offline production PWA export regression ผล full suite ก่อน final source edits: 42 E2E ผ่าน ดู final run ใน TEST_RESULTS.md

Initial missing requirements (resolved by the continuation below): explicit weekly/monthly summaries, export filter/generated metadata และ optional evidence references, consistent loose delivered vs compacted/design volume labels; real Android/Excel/PDF acceptance ยัง NOT VERIFIED ห้ามประกาศ COMPLETE จากการมีเจ็ด report forms เพียงอย่างเดียว

## Current validated gate — 2026-11-08

รัน `npm run check` ด้วย cloud variables ใน PHASE_4_6_REVIEW.md: exit 0. Format, lint (4 tooling tests), typecheck, frontend 256/256 (40 files), backend 10/10, Firestore rules 7/7, emulator integration 8/8, build, HTTP smoke และ Playwright E2E 42/42 (1.5 minutes) ผ่าน ไม่มี tests failed/skipped/cancelled. ใช้ system Chromium; ไม่มี real Google/Drive/Android acceptance. ไม่ปิด assertion หรือ skip tests เพื่อให้ผ่าน

## Calendar summaries and export context — 2026-11-08

เพิ่ม weekly/monthly reports โดย weekly ใช้วันจันทร์เริ่มสัปดาห์ตาม business date ที่เก็บในรูป YYYY-MM-DD; จัดกลุ่มหลังใช้ date/project/master filters แล้ว จึงไม่ดึงยอดนอกช่วงวันที่กลับเข้ามา ทดสอบ week ที่ข้ามปีและ leap day

CSV แนบ metadata columns; XLSX มีชีต “ข้อมูลรายงาน” เก็บ report type, เวลาสร้าง Asia/Bangkok, filters และ volume assumptions; print/PDF แสดง context ใน subtitle เพิ่ม checkbox แนบ evidence/Drive reference IDs เมื่อมีข้อมูล โดยไม่สร้าง public links หรือเดาเลขอ้างอิงให้ legacy rows ตัวเลขรายงานไม่เปลี่ยนจากการแนบ references

UI และ metadata ระบุ delivered loose volume ตาม saved truck snapshots แยกจาก compacted fill/design quantities ของ survey ไม่เอายอดต่าง material state มารวมเงียบ

Phase 6 isolated gate: npm run check exit 0, frontend 263, backend 10, rules 7, emulator integration 8, E2E 44; lint/typecheck/build/smoke PASS. The earlier missing calendar/export-context items are now implemented and covered. Real Android/Excel printing and Google services remain NOT VERIFIED.
