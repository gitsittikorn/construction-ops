# Phase 0 — repository audit

ตรวจวันที่ 2026-11-06 เทียบ Master Prompt V4.0, source, Git working tree และ PHASE1_REPORT.md ก่อนแก้ source ของงาน V4 ไม่มีการ checkout/reset/commit/push/deploy

Repository remote ตรงกับคำขอ Git diff มีงาน Phase 1 ที่ยังไม่ commit จึงต้องรักษาไว้ทั้งหมด ไม่พบ DEVELOPMENT_PROGRESS.md, FEATURE_CHECKLIST.md, TEST_RESULTS.md, KNOWN_ISSUES.md ณ เริ่มงาน จัดทำใหม่จากหลักฐาน ไม่ใช่ resume จากสถานะที่คาดเดา

| Feature                     | Existing implementation / source                                              | Status     | Missing / recommended fix                                                                        | Priority | Risk |
| --------------------------- | ----------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ | -------- | ---- |
| App navigation/state        | App.tsx ใช้ React page state, storage subscriptions; ไม่ใช้ router library    | COMPLETE   | คงโครงสร้างเดิม เพิ่มหน้า domain แยก component                                                   | P1       | ต่ำ  |
| Projects/master CRUD        | App.tsx, domain.ts, masterData.ts, deletion.ts                                | COMPLETE   | ไม่ทำซ้ำ; เพิ่ม reference guards ให้ entity ใหม่                                                 | P1       | กลาง |
| IndexedDB                   | storage.ts version 2: state/uploads/driveSettings, atomic state updates       | COMPLETE   | เพิ่ม optional business records แบบ additive และ backup ก่อนเริ่มใช้                             | P0       | สูง  |
| Cloud sync/restore/conflict | cloudSync.ts, cloudFirestore.ts, syncModel.ts, cloudValidation.ts             | PARTIAL    | business entities เดิมพร้อม; เพิ่มชนิดข้อมูลใหม่ใน pipeline เดิม; production UNVERIFIED          | P0       | สูง  |
| Authentication/security     | firebase.ts, firestore.rules, backend/app.mjs, tokenVault.mjs                 | PARTIAL    | rules/emulator พร้อม; new collections ต้องมี rules/tests; real OAuth และ deployment UNVERIFIED   | P0       | สูง  |
| Legacy trip entry           | domain.ts, App.tsx                                                            | COMPLETE   | รักษาประวัติรายเที่ยว; ไม่แทนที่ด้วยยอดรายวันโดยเงียบ                                            | P0       | สูง  |
| Daily work/counts/copy/undo | ไม่มี persisted daily session model                                           | MISSING    | เพิ่ม daily aggregate พร้อม capacity snapshot และ optimistic version                             | P1       | สูง  |
| Original upload/retry       | uploads.ts, drive.ts, DrivePanel.tsx, driveSession.ts                         | PARTIAL    | มี original bytes/ID/retry/metadata; ขาด roles, evidence context, signature และ document restore | P1       | สูง  |
| Folder mappings             | DrivePanel.tsx/resolveDriveFolders: project/Documents                         | PARTIAL    | ต่อ hierarchy รายวัน/คนขับ/รถ โดย Folder ID เดิม                                                 | P1       | กลาง |
| Daily verification/close    | ไม่มี                                                                         | MISSING    | manual verification ผูก evidence fingerprint, immutable close snapshot, reopen reason            | P1       | สูง  |
| Reports                     | App.tsx CSV/print; truckExcel.ts XLSX รถ                                      | PARTIAL    | 7 report types, date range/multi-filter, verified separation, business XLSX/print PDF            | P1       | สูง  |
| Survey                      | domain.ts single-setup HI/RL และ uniform volume                               | PARTIAL    | persisted BM/TP/grid/slope/history/export พร้อม cut/fill integration                             | P1       | สูง  |
| Tablet layout               | styles.css media queries, modal/table scrolling, browser login tests          | PARTIAL    | เพิ่ม viewport/touch tests ให้ workflow ใหม่; hardware UNVERIFIED                                | P1       | กลาง |
| PWA                         | public/manifest.webmanifest, public/sw.js                                     | PARTIAL    | root paths ตาม config เดิม; offline lazy assets/update QA; installation real device UNVERIFIED   | P1       | กลาง |
| Hosting                     | firebase.json hosting; ไม่พบ .github workflow                                 | UNVERIFIED | คง config เดิม ไม่เปลี่ยนเป็น GitHub Pages โดยเดา                                                | P2       | สูง  |
| Dependencies                | package.json: existing Excel/Firebase/idb, test tooling                       | COMPLETE   | ใช้ของเดิม ไม่เพิ่ม UI/canvas/report libraries โดยไม่จำเป็น                                      | P2       | ต่ำ  |
| QA                          | QA.md, src/test, src/emulator-test, rules-test, e2e; Phase 1 ล่าสุด 228 tests | PARTIAL    | ใช้ผลเดิมเป็น baseline ไม่อ้างเป็นผล V4; รัน check หลังแต่ละ milestone                           | P0       | กลาง |

Phase 0 read-only source audit เสร็จแล้ว เอกสาร audit ไม่ถือเป็นการยืนยัน production ทุก phase ที่มี acceptance ต้องทดสอบจริงหรือระบุ UNVERIFIED/BLOCKED อย่างชัดเจน
