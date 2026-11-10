# Phase 1 — evidence index

## Allowlist/offline access follow-up — 2026-11-10

Validated source **`1b4c21d`** adds email-based Google allowlist access through a trusted backend, protected first UID binding, four canonical roles, a read-only viewer and transactional last-super-admin protection. Offline grants expire after 12 hours; known revocation cannot fall back to a legacy owner timestamp, and reconnect revalidates before synchronization. Account/company/role cache isolation and pending originals are preserved; an interleaved reconnect/revocation regression cannot reopen the old workspace or leave selection busy.

Full gate exit **0**: frontend **343**, backend **24**, Node emulator **15** (13 Rules + 2 backend transactions), client integration **10**, E2E **73**, tooling **4**. Supplemental role-matrix retest also passes. Real Google login, deployed access expiry/revocation, original-cloud restore and MFA remain **NOT VERIFIED**. Phase 1 remains **PARTIAL** for those real-service checks. See [AUTH_RBAC_IMPLEMENTATION.md](AUTH_RBAC_IMPLEMENTATION.md) for policy activation and preserved-data rollout; no production migration/deployment was performed.

2026-11-08 (Asia/Bangkok). Status: PARTIAL overall; isolated regression PASS ใน final gate 2026-11-08 ดู current run ใน TEST_RESULTS.md.

รายงานรายละเอียดจริง: [PHASE_1_E2E_REPORT.md](PHASE_1_E2E_REPORT.md). รายงาน historical implementation: [PHASE1_REPORT.md](../PHASE1_REPORT.md).

Source: storage.ts, syncModel.ts, cloudSync.ts, cloudFirestore.ts, cloudValidation.ts, firestore.rules. Existing tests cover IndexedDB, outbox/retry, account isolation, conflicts, multiple tabs, rules and demo-emulator cloud restore. รอบ final validation รัน frontend 256, backend 10, rules 7, emulator integration 8 และ E2E 42 ผ่าน โดยผลรวมไม่ใช่จำนวน tests ของ Phase 1 เพียง phase เดียว

ยังไม่ใช้ผล local/emulator รับรอง real authentication expiry, production cloud restore หรืออุปกรณ์ Android จริง ข้อจำกัดยังอยู่ใน ROADMAP_PROGRESS และ BUG_TRACKER

## Phase 1 continuation — 2026-11-08

ตรวจ durable outbox, additive backups, account guards, server acknowledgements, conflict preservation, clean-profile restore, rules และ emulator suites จาก source จริง ไม่พบความจำเป็นต้องเขียนระบบ sync ใหม่ เพิ่ม regression auth หมดอายุกลาง batch: project ที่ acknowledged คง synced, master/trip ยัง pending, ไม่แจ้งซิงก์ครบ และ reauthorize/retry ใช้ operation ID เดิมโดยไม่ซ้ำ

Real authentication/production restore ยัง NOT VERIFIED เพราะ environment ไม่มี configured secret/runtime bindings สำหรับบริการจริง ไม่ได้ขอหรือสร้าง credentials ปลอม การผ่าน isolated gate ใช้เดินงาน implementation ที่ไม่พึ่ง production ต่อได้ โดยไม่ปิด acceptance บริการจริง

Gate 2026-11-08: cloud npm run check exit 0, frontend 260, backend 10, rules 7, emulator integration 8, E2E 43 ผ่าน; format/lint/typecheck/build/HTTP smoke PASS. ไม่มี real-service/device tests.

## Dedicated sync menu — 2026-11-09

User-requested UX-005 fix: sync/backup/conflict details now belong to **ซิงก์และสำรองข้อมูล**, with a red menu indicator for failures/conflicts/integrity issues. App-level automatic sync and account/data guards remain active across navigation. Ordinary pending data stays unverified. Retry, failure persistence and unchanged stored state have automated coverage; production-offline backups still include pending records and original attachment bytes.

Windows `npm.cmd run check` exit **0**: frontend **319**, backend **15**, Rules **10**, emulator integration **10**, E2E **61** (3.4 minutes), lint tooling **4**; format/lint/typecheck/build/smoke PASS, 59 lint warnings/zero errors. Initial failed attempts and full command are in [SYNC_NAVIGATION_REPORT.md](SYNC_NAVIGATION_REPORT.md). Actual Firebase/Google/Drive restore was not exercised; Phase 1 overall remains PARTIAL. Physical Android remains deferred/NOT VERIFIED.
