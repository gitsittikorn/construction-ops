# Phase 4 — Private original restoration

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
