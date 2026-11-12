# Phase 4 — Private original restoration

## Localhost and real-service reachability review — 2026-11-12

Baseline `f39c3ea`; no application/environment changes. Effective frontend configuration includes Render. Real health **200**, both local origins' company-header preflights **204**, unauthenticated session **401** and unlisted origin **403**; Firebase public configuration/handler **200**. Fresh Edge localhost loads configured login with zero page errors. ENV-003's CORS symptom is resolved; actual deployed OAuth pairing, user consent, membership, renewal and private-file restoration remain **NOT VERIFIED**. [Detailed evidence and next actions](LOCAL_CONNECTION_REVIEW_2026-11-12.md). Physical Android remains deferred; no production mutation/deployment or phase-completion claim.

Fresh Windows full `npm.cmd run check` **exit 0**: frontend **383**, backend **20**, Node Rules/storage emulator **14**, frontend emulator integration **10**, browser E2E **71** (3.7 minutes), tooling **4**; format/lint/typecheck/build/HTTP smoke PASS, 59 existing warnings/zero errors, no skips. `npm.cmd run clean` **exit 0** and pre-test Phase 2 screenshots restored. These isolated regressions do not replace authenticated real-service acceptance.

## Backend OAuth binding regression — 2026-11-11

BUG-021 fixed on baseline `978a1ae`: client-scoped encrypted storage retains legacy parents, encrypted attribution/frontend matching prevent cross-app reuse, and matching fresh grants retain restart/renewal. Full Windows `npm.cmd run check` **exit 0**: frontend **383/383**, backend **20/20**, Node Rules/storage emulator **14/14**, frontend emulator integration **10/10**, E2E **71/71** (3.6 minutes), tooling **4/4**; format/lint/typecheck/build/smoke PASS, 59 warnings/zero errors. Cleanup exit **0**, two generated Phase 2 images restored. [Detailed evidence](DRIVE_OAUTH_BINDING_2026-11-11.md). Original operational data/pending bytes/mappings retained. No new real Google/Firebase/Render/restore acceptance or deployment; Android deferred.

## OAuth project-switch regression gate — 2026-11-11

BUG-020 prevents browser token reuse across OAuth applications/transports without touching IndexedDB originals or Drive mappings. Local personal-client authorization uses the existing direct path pending backend/grant review (ENV-005/BUG-021). Windows `npm.cmd run check` **exit 0**: frontend **381**, backend **15**, Rules **11**, integration **10**, E2E **71** (5.6 minutes), tooling **4**; all prior restoration, denied/truncated-original and offline/pending preservation tests remain enabled. Format/lint/typecheck/build/smoke PASS, no skipped tests. Cleanup **exit 0** and prior screenshots restored. [Concrete handoff](PERSONAL_OAUTH_SWITCH_2026-11-11.md); actual personal-client access to old-app Drive files/refresh grants remains NOT VERIFIED. No cloud records, keys or originals deleted and no phase-completion claim.

Date: 2026-11-07 (Asia/Bangkok). Status: PARTIAL — isolated original-restoration implementation gate PASS; real-service/device acceptance NOT VERIFIED.

## Work resumed

Baseline `bd884dc`, clean working tree. Existing `documentRecovery.ts` restores authorized Firestore document references without overwriting local pending files. Existing Drive viewing/downloads did not persist downloaded originals for offline use. OAuth renewal and account checks already existed and were retained.

Implemented a separate original cache in the existing IndexedDB `state` store, keyed by owner/document ID. No schema upgrade, deletion or reset. Upload metadata and pending original Blobs stay unchanged. Drive downloads validate file ID, operation ID, owner, parent folder, MIME and size, and validate the downloaded size/MIME again before storing. Metadata matching does not provide a historical cryptographic checksum guarantee for legacy cloud files.

The Thai Drive UI now offers **เก็บต้นฉบับไว้ดูออฟไลน์**, shows whether a local original exists, and uses the saved copy for private image preview/download without a network request. Daily evidence previews also use these restored copies. Account checks, local record checks and atomic transactions prevent writes after account/reference changes. Concurrent requests share work and browser locks serialize tabs. Failed downloads or quota errors preserve existing records and allow retry.

## Automated evidence

- Cache unit tests: exact bytes, owner isolation, idempotency/concurrency, expired authorization retry, truncated/wrong MIME rejection, pending-file preservation, changed reference/account rejection and storage quota rollback.
- Drive transport test: matching private metadata/media, wrong owner, truncated media, missing Drive file and unverified local record rejection.
- Browser harness uses a synthetic identity and intercepted Google responses only. Success test verifies one metadata read/one media read despite double-click, persisted copy after online page reload, then offline image decoding and byte-identical downloaded PNG.
- Browser failure test rejects foreign metadata before requesting media, rejects truncated media without caching, then retries successfully.
- Existing Phase 1–3 and production PWA offline regression remain enabled. The new harness reloads while online before switching offline; it does not claim a new real-device offline installation test.

Targeted unit/UI suites passed 40/40 before adding the quota case; final cache suite 6/6. Targeted Playwright including daily workflows passed 13/13 (33.4 seconds).

Final `npm.cmd run check`: **exit 0**; frontend **235/235** (38 files), backend **10/10**, Firestore rules **7/7**, emulator integration **5/5**, Playwright **34/34** (1.1 minutes), **291 passing tests** overall. No failed/skipped/cancelled tests. Format, TypeScript, production build and HTTP smoke PASS. Full Phase 1–3 regression included. `git diff --check` passed. Cleanup runs after verification; no user data is removed.

## Boundaries and remaining acceptance

No real Google/Firebase/Drive account was contacted by tests, no production upload/write, no push/deploy, and no existing user IndexedDB or credentials cleared. Real OAuth revocation/renewal, private restore on a second physical device, Android camera/stylus and hardware PWA remain NOT VERIFIED. These cannot be represented as verified by synthetic responses.

Cached originals are separate from pending uploads. Existing JSON backups still contain pending upload files and metadata; they do not include this separate downloadable cache. Files already verified on Drive can be fetched again. This cache uses browser storage and is subject to device quota/eviction; no existing data is deleted to make room.

## Changed files

`src/documentCache.ts`, `src/drive.ts`, `src/DrivePanel.tsx`, `src/EvidencePanel.tsx`, `src/test/documentCache.test.ts`, `src/test/drive.test.ts`, `e2e/restore-harness.html`, `e2e/document-restore.spec.ts` and progress documentation. Existing React/TypeScript/Vite/Firebase/Drive/IndexedDB architecture retained. No new dependencies or secrets.

## Current validated gate — 2026-11-08

รัน `npm run check` ด้วย cloud variables ใน PHASE_4_6_REVIEW.md: exit 0. Format, lint (4 tooling tests), typecheck, frontend 256/256 (40 files), backend 10/10, Firestore rules 7/7, emulator integration 8/8, build, HTTP smoke และ Playwright E2E 42/42 (1.5 minutes) ผ่าน ไม่มี tests failed/skipped/cancelled. ใช้ system Chromium; ไม่มี real Google/Drive/Android acceptance. ไม่ปิด assertion หรือ skip tests เพื่อให้ผ่าน

เพิ่ม browser test สอง isolated profiles: profile ที่สองไม่มี inherited cache ต้อง restore references ที่ seed ใน fixture และดาวน์โหลด bytes ของตัวเอง; ตรวจ offline byte equality ทั้งสอง profile ใช้ synthetic identity/intercepted metadata/media ไม่ใช่การทดสอบ Google หรืออุปกรณ์จริง และไม่ได้แทนการทดสอบ metadata restore จาก Firestore

## Phase 4 continuation — read-only document audit

เพิ่ม documentAudit.ts และปุ่ม “ตรวจไฟล์ใน Drive”: อ่าน inventory เฉพาะ appProperties.owner ของบัญชีปัจจุบันผ่าน drive.file scope, อ่าน reference ที่ synced เพื่อตรวจ missing/trashed/size/MIME/owner/operation/folder mismatch และแสดง unreferenced candidates เฉพาะไฟล์ที่มองเห็นได้ใน scope นี้ ไม่อ้างว่าตรวจ Drive ทั้งบัญชี

Pending/metadata-pending records ใช้ป้องกัน false orphan หลัง upload สำเร็จแต่ metadata ยังไม่ acknowledged การพบไฟล์ที่ยังไม่มี reference ในเครื่องอาจเกิดจากอุปกรณ์อื่น จึงให้ซิงก์และตรวจใหม่ ไม่ลบไฟล์หรือเปลี่ยน verification/queue อัตโนมัติ pagination ที่ไม่ครบ/ซ้ำ, auth failure หรือ account change ต้องจบเป็น error ไม่แสดงผลสำเร็จบางส่วน

Coverage mapping: drive.test.ts ทดสอบ OAuth timeout/partial consent/expiry/account/private resumable verification, uploads.test.ts ทดสอบ durable bytes/metadata failure/stable ID/retry/locks, DrivePanel.test.tsx และ driveBackend.test.ts ทดสอบ renewal/revocation/reconnect/account change; documentCache/document-restore ทดสอบ cache/private bytes แยก browser profiles; documentAudit tests ทดสอบ inventory GET-only, missing/mismatch/unmapped, pending protection และ incomplete pagination. E2E audit ตรวจว่าไม่มี media download, write หรือ metadata deletion

Existing disconnect test รอปุ่ม enabled หลัง queue finalization ก่อนคลิก เพื่อทดสอบ user interaction จริงโดยยังคง assertion ว่า disconnect ปิด upload capability

Gate 2026-11-08: cloud npm run check exit 0, frontend 260, backend 10, rules 7, emulator integration 8, E2E 43 ผ่าน; format/lint/typecheck/build/HTTP smoke PASS. ไม่มี real-service/device tests.
