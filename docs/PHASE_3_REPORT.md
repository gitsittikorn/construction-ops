# Phase 3 — Driver evidence, signature and daily closeout

Date: 2026-11-07 (Asia/Bangkok). Status: COMPLETE — implementation and isolated automated acceptance gate. Real-service/device acceptance remains NOT VERIFIED.

## Existing implementation and completed work

Resumed after Phase 2 commit `d13a2fb`. Evidence upload/camera controls, original Blob persistence, content-derived IDs, private Drive queue, signature canvas, manual verification and closure snapshots already existed. They were retained and tested, rather than reimplemented.

Added persisted-image previews that work offline, per-category checklist, driver/truck/date/current-total context before signing, and signer ID/name/time bound to the evidence fingerprint and signature upload ID. Existing evidence remains readable with additive optional metadata; no IndexedDB version change or destructive migration.

Fixed stationary pointer events passing blank-signature checks; added save locks, clear/redraw, pointer-capture cancellation and retry after storage failure. Evidence writes also have a synchronous lock. Upload status refreshes on queue events and displays IndexedDB read errors.

Fixed replacement of confirmed photos/signatures leaving old confirmation valid. Changed references now invalidate manual confirmation atomically and preserve previous files/audit. Identical references are idempotent regardless of category ordering. Closeout checks the precise evidence/file IDs confirmed earlier, rejects foreign evidence references and duplicate confirmations, and requires all current proof to be uploaded/metadata-verified before closing. Local READY is never cloud VERIFIED or a completed day.

Bulk confirmation preserves trucks already confirmed and confirms only the remaining trucks. A regression test covers this common mixed state while retaining rejection of an entirely duplicate confirmation.

## Scenario evidence

| Cases               | Automated evidence                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P3-01, P3-02, P3-03 | Browser gallery upload, two distinct slip images, original bytes in IndexedDB and synthetic Drive upload harness                                                                                             |
| P3-04, P3-05, P3-06 | Mouse and CDP touch signatures; blank/cleared rejection, redraw, signer identity/time; unit stationary-point and concurrent-save checks                                                                      |
| P3-07, P3-08        | Incomplete day rejected; complete 4-trip/48 m³ closure with one snapshot despite double-click; baseline touch close/reopen scenario                                                                          |
| P3-09               | Production-build offline trip/photo/slip/signature save, truly offline reload and all three original previews persist as local READY                                                                         |
| P3-10               | Real queue code in browser with simulated OAuth/interrupted metadata; original Blob retained through both failures, stable ID across retry, removed only on successful verification/metadata acknowledgement |
| P3-11               | SHA-256 deduplication, identical proof is a no-op, replacement retains originals; no duplicate queue entries                                                                                                 |
| P3-12               | Assertions on project/session/date/driver/truck and signer; domain rejects wrong truck and evidence ID; cloud workspace validation checks signer association                                                 |
| P3-13, P3-14        | Browser count change invalidates prior proof/verification; new signature/photos reconcile and close updated totals; replacement after confirmation also invalidates it                                       |
| P3-15               | Next day has zero trips and no evidence references; previous close snapshot unchanged                                                                                                                        |
| P3-16               | 800×1280 portrait workflow, baseline touch/tablet scenario and landscape regression; physical Android remains NOT VERIFIED                                                                                   |
| P3-17               | Full Phase 1/2 regression, rules/integration, build and smoke                                                                                                                                                |

## Actual results

Final `npm.cmd run check`: **exit 0**. Frontend **228/228** (37 files), backend **10/10**, Firestore rules **7/7**, emulator integration **5/5**, Playwright **32/32** (1.1 minutes). Format, TypeScript, production build and HTTP smoke PASS. Total **282 passing tests**, zero failures, cancellations or skips. Phase 1/2 regression is included. Targeted daily-workflow Playwright suite also passed **11/11** (34.7 seconds); the final daily unit suite passed **12/12**.

An added idempotency test caught reference-array order differences incorrectly invalidating confirmation. Comparison now sorts a copy by upload ID. No failing tests were skipped or suppressed.

## Unverified and next phase

Real Firebase/Drive/OAuth, revoked real tokens, native Android camera permissions, physical touch/stylus and installation remain NOT VERIFIED. Drive success/failure acknowledgements are controlled fixtures; Firestore rules/integration use only the local `demo-construction-ops` emulator. Browser servers clear real cloud configuration. No production uploads, writes, deletes, push or deployment.

Phase 4 dependency: verify private original-file restoration on a new device, production OAuth lifecycle, camera/stylus and device acceptance in a separately isolated real-service environment. Metadata recovery/private viewing already exist, but cloud restoration of original file bytes is not claimed by these tests. Legacy signatures without the new optional signer snapshot retain their original fingerprint/driver association; no historical identity or signing timestamp was fabricated.

Known limits: 200 trucks/session, 1,000 new transactions/truck/day, 100 closure snapshots, 750 KB workspace record and 100 MB/image. Development dependency audit reported 14 moderate advisories, runtime backend install reported 0 vulnerabilities; no force upgrades were applied.

## Changed files

Implementation: `src/EvidencePanel.tsx`, `src/SignaturePad.tsx`, `src/evidence.ts`, `src/daily.ts`, `src/workspaceModels.ts`, `src/workspaceValidation.ts`. Tests: `e2e/daily-workflow.spec.ts`, `src/test/SignaturePad.test.tsx`, `src/test/EvidencePanel.test.tsx`, `src/test/daily.test.ts`, `src/test/evidence.test.ts`. Reports/checkpoints: this report, Phase 2 report wording, FEATURE_CHECKLIST.md, DEVELOPMENT_PROGRESS.md and README.md. No dependency or credential files changed in Phase 3.

## Current validated gate — 2026-11-08

รัน `npm run check` ด้วย cloud variables ใน PHASE_4_6_REVIEW.md: exit 0. Format, lint (4 tooling tests), typecheck, frontend 256/256 (40 files), backend 10/10, Firestore rules 7/7, emulator integration 8/8, build, HTTP smoke และ Playwright E2E 42/42 (1.5 minutes) ผ่าน ไม่มี tests failed/skipped/cancelled. ใช้ system Chromium; ไม่มี real Google/Drive/Android acceptance. ไม่ปิด assertion หรือ skip tests เพื่อให้ผ่าน
