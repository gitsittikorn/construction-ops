# Phase 5 — daily reconciliation checkpoint

2026-11-08 (Asia/Bangkok). Current status: COMPLETE for implementation and isolated automated acceptance; real-service/device acceptance remains NOT VERIFIED. Earlier gap notes below are historical.

มี expected/reported vs recorded, status PENDING/MATCHED/MISMATCHED/VERIFIED/REOPENED, manual verification, audit, reason-required reopen และ immutable closure history ใน daily.ts/DailyPanel.tsx อยู่แล้ว

รอบนี้แก้ BUG-001: ตรวจ owner ของ uploads เทียบ active owner, evidence context, folder และ unique Drive IDs ก่อน verify/close พร้อม negative unit tests ทั้งสอง entry points ขยาย E2E วงจร close→reopen→reject close before reverify→verify→close→reload ตรวจ snapshot แรกไม่เปลี่ยนและมีสอง snapshots

คำสั่งและขอบเขต: PHASE_4_6_REVIEW.md. Targeted daily/reports/cache unit tests 25 ผ่านก่อน final edits; full gate ล่าสุดก่อน final edits ผ่าน frontend 256, backend 10, rules 7, emulator integration 8 และ E2E 42 รายการ ไม่ใช่จำนวนเฉพาะ Phase 5 ต้องดูผล final ใน TEST_RESULTS.md

ยังต้องตรวจ open-day correction reason policy และ authorization/sync coverage ตาม Master ให้ครบ รายงานนี้ไม่ประกาศ Phase 5 COMPLETE และไม่ได้พิสูจน์ Google/Drive จริง

## Current validated gate — 2026-11-08

รัน `npm run check` ด้วย cloud variables ใน PHASE_4_6_REVIEW.md: exit 0. Format, lint (4 tooling tests), typecheck, frontend 256/256 (40 files), backend 10/10, Firestore rules 7/7, emulator integration 8/8, build, HTTP smoke และ Playwright E2E 42/42 (1.5 minutes) ผ่าน ไม่มี tests failed/skipped/cancelled. ใช้ system Chromium; ไม่มี real Google/Drive/Android acceptance. ไม่ปิด assertion หรือ skip tests เพื่อให้ผ่าน

## Correction reasons — 2026-11-08

แก้ GAP-P5 ใน saveDailyRow: ลดเที่ยวที่บันทึกไว้ หรือแก้/ล้าง reported total ที่เคยกรอกแล้ว ต้องระบุเหตุผล แม้วันยัง open; first report และ +1 ตามปกติไม่ต้องมีเหตุผล ส่วน reopened day และ per-trip correction คง guard เดิม เหตุผลถูกบันทึกใน daily history/audit transaction เดียวกัน

ตรวจ version ก่อน correction reason เพื่อไม่ให้ข้อความใหม่บัง stale-edit conflict; invalid negative/noninteger input ยังผ่านไปยัง validation เดิมและไม่เขียนข้อมูล ทดสอบปฏิเสธ missing reason โดย data ไม่เปลี่ยน, increment สำเร็จ, correction พร้อมเหตุผลสำเร็จ และ E2E form retry หลังระบุเหตุผล โดยไม่เปลี่ยน assertion เดิมให้ข้ามกรณีผิด

Phase 5 gate: npm run check exit 0 (cloud command), frontend 261, backend 10, rules 7, emulator integration 8, E2E 43; format/lint/typecheck/build/smoke PASS. Authorization/sync evidence includes actual Firestore rules rejecting unauthorized reopening and restoring the immutable closure/verification audit on an independent fake device in src/emulator-test/cloudSync.test.ts. Real services/devices remain NOT VERIFIED.

Open-day reason and role/sync coverage gaps listed in the initial review are resolved by the continuation above. Current status is tracked in ROADMAP_PROGRESS.md; production acceptance is still separate.
