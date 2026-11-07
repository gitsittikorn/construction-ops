# Construction Ops — Master Roadmap (Phase 0–8)

แหล่งที่มา: Master Roadmap ที่ผู้ใช้ส่งใน session นี้ เก็บเนื้อหาทั้งหมดด้านล่างเพื่อใช้ต่อเนื่องทุก session คำสั่ง START NOW เป็นส่วนหนึ่งของต้นฉบับ; ให้ทำตามคำสั่งล่าสุดของผู้ใช้และ AGENTS.md เสมอ สถานะจริงอยู่ใน [ROADMAP_PROGRESS.md](ROADMAP_PROGRESS.md) ไม่ใช่เอกสารแผนนี้

ROLE: Senior Full-Stack Engineer, Solution Architect, QA Automation Engineer and Technical Lead.

PROJECT: https://github.com/gitsittikorn/construction-ops

## GOAL

Complete the Construction Ops PWA roadmap from Phase 0 through Phase 8, preserving existing work and progressing sequentially through validated phases.

## TECH STACK

React + TypeScript + Vite + PWA
IndexedDB offline-first
Firebase Authentication / Firestore
Google Drive integration
Playwright E2E + Vitest
GitHub repository

## GENERAL RULES

- Read AGENTS.md, README.md, QA.md and existing repository documentation first.
- Inspect actual Git history, working tree and source code.
- Never assume a phase is finished based only on previous messages.
- Never rebuild features already working correctly.
- Preserve existing user data and backward compatibility.
- Do not delete production data or use real accounts for destructive tests.
- Use Asia/Bangkok for business dates.
- Use Thai language for user-facing interfaces.
- Prefer reusable, maintainable modules and tablet-first design.
- Use real tests and report actual results, not invented PASS states.
- Run unit, integration and E2E testing at every phase gate.
- Fix critical/high-priority defects before starting dependent phases.
- Make separate commits and progress reports for each completed phase.
- Do not push or deploy without explicit authorization.

## PHASE 0 — REPOSITORY AUDIT

Inspect architecture, data models, routes, persistence, Firestore, Google Drive, dependencies, security rules, tests and unfinished code.
Document the current state, missing functionality, risks, test coverage and migration requirements.
Deliver docs/PHASE_0_AUDIT.md.

## PHASE 1 — DATA SAFETY / OFFLINE / SYNC

Audit and finish:

- IndexedDB persistence and safe migrations
- Project and master-data persistence
- Offline write and pending sync queue
- Firebase/Firestore synchronization
- Retry with idempotent operations
- Conflict detection without silent overwrites
- Account isolation and security rules
- Cloud restore to clean browser profile
- Safe handling of authentication expiry
- Recovery after refresh/restart/network failure

Run E2E for offline writes, reload, reconnect, duplicate prevention, multiple tabs, conflicts, permissions and clean-device restore.
Deliver docs/PHASE_1_REPORT.md.

## PHASE 2 — DAILY TRIP OPERATIONS

Recover existing incomplete Phase 2 work and finish:

- Daily sessions by project and date
- Truck/driver/soil source/soil type assignments
- Fast +1 trip recording
- Stable unique IDs and duplicate-tap prevention
- Edit/correction and audit history
- Trip counts by truck, driver and project
- Delivered loose volume using saved trip capacity
- Duplicate Next Day with reset counts
- Do not copy prior trip transactions, photos or signatures
- Historical daily summaries and filters
- Offline persistence and sync status
- Tablet-first Thai UI

E2E: multiple trucks, counts, corrections, duplicate-next-day idempotency, offline refresh, reconnect, timezone, rapid clicks and Phase 1 regression.
Deliver docs/PHASE_2_REPORT.md.

## PHASE 3 — DRIVER EVIDENCE / SIGNATURE

Implement:

- One normal driver photo per daily assignment
- One normal trip-slip summary photo, with optional extra pages
- Capture/upload and preview
- Offline evidence storage
- Digital signature canvas for touch/mouse/stylus
- Reject blank signatures
- Bind signatures to exact daily totals and version
- Invalidate confirmation when totals change
- Daily closeout evidence checklist
- Safe upload retry and correct assignment linkage
- Do not copy evidence into the next day
- Preserve original images and private file access

E2E: photo upload, slip upload, blank signature, valid signature, closeout, offline refresh, upload errors, duplicate prevention, changed totals and full regression.
Deliver docs/PHASE_3_REPORT.md.

## PHASE 4 — GOOGLE DRIVE / CLOUD DOCUMENT RESTORE

Inspect existing integration before implementing:

- Google OAuth integration and error handling
- Private folder structure by project/date/driver
- Stable file identifiers and metadata mapping
- Resumable/persistent upload queue where supported
- Retry and deduplication
- Recovery from token expiration and partial failures
- Restore file references and attachments on another device
- Orphan and missing-file detection
- Correct privacy and permission behavior
- Never delete local originals before verified upload

E2E/integration tests with isolated fixtures and simulated failures.
Separate emulator verification from real cloud verification.
Deliver docs/PHASE_4_REPORT.md.

## PHASE 5 — DAILY RECONCILIATION

Implement:

- Daily expected vs recorded trip comparison
- Totals by truck, driver, project and soil source
- Discrepancy and missing-evidence indicators
- Corrections with reason and audit history
- Review and confirmation workflow
- Reopen confirmed days with recorded reason
- Detect changes after confirmation
- Do not silently overwrite signed records
- Clear daily closeout/reconciliation status

Test discrepancies, corrections, reopening, authorization, synchronization and historical integrity.
Deliver docs/PHASE_5_REPORT.md.

## PHASE 6 — REPORTS / EXPORT

Implement:

- Daily, weekly and monthly summaries
- Trips and volumes per project/truck/driver/source
- Filterable operational dashboard
- Excel/XLSX export
- CSV export with proper UTF-8 handling
- PDF reports with readable Thai fonts
- Print-friendly layout
- Accurate date ranges and totals
- Clear distinction between loose delivered volume and compacted/design volume
- Export with appropriate metadata and optional evidence references

Test calculation consistency, Thai text, date filters, empty reports, spreadsheet exports, PDF rendering and offline behavior.
Deliver docs/PHASE_6_REPORT.md.

## PHASE 7 — SURVEY / GRID / CUT & FILL

Implement:

- Project survey setup and benchmark (BM) reference
- Survey point and grid entry
- Grid spacing and dimensions
- Ground elevation model
- Proposed finished grade
- Cut/fill depth by point
- Area and volume estimates with documented assumptions
- Slope calculations
- 2D grid/contour visualizations
- Optional 3D visualization when practical
- CSV/Excel import/export of survey points
- Unit tests for coordinate orientation, interpolation and volume math
- Separate loose soil, compacted soil and design volume assumptions

Do not silently substitute approximate calculations for engineering measurements.
Clearly label estimates and assumptions.
Deliver docs/PHASE_7_REPORT.md.

## PHASE 8 — TABLET UX / PERFORMANCE / PRODUCTION QA

Implement and verify:

- Responsive Android tablet UX
- Touch target sizing and practical field workflows
- Offline installability and service-worker behavior
- IndexedDB quota and storage failure handling
- Performance for large trip histories
- Accessibility and keyboard navigation
- Security and authentication review
- Dependency audit
- Full E2E regression on representative viewports
- Offline/online interruption tests
- Backup/restore validation
- Build and deployment readiness checks
- Production smoke-test plan without unauthorized deployment

Deliver docs/PHASE_8_FINAL_QA_REPORT.md.

## EXECUTION WORKFLOW

1. Determine current state of every phase from actual repository evidence.
2. Create docs/ROADMAP_PROGRESS.md with COMPLETE, PARTIAL, NOT STARTED, BLOCKED or NOT VERIFIED for each phase.
3. Resume from the earliest incomplete prerequisite, especially interrupted Phase 2 work.
4. Complete one phase at a time.
5. Run supported npm typecheck, unit, build, lint/check and Playwright E2E commands. Inspect package.json for actual scripts.
6. Fix critical/high-priority failures and rerun tests.
7. Create a report and a local Git commit after a validated phase.
8. Proceed automatically to the next phase only when prerequisites pass.
9. If tools, credentials or usage limits prevent verification, record a checkpoint and do not claim completion.
10. Never skip critical failures merely to advance the roadmap.

## FINAL REPORT IN THAI

- Phase-by-phase completion table
- Implemented and missing features
- Test counts, PASS/FAIL/BLOCKED/NOT VERIFIED
- Bugs fixed and unresolved defects
- Modified files and commit hashes
- Cloud/device verification limitations
- Exact next actions

START NOW: Inspect the working tree, recover interrupted Phase 2 work and continue through the roadmap without requesting routine confirmation.

## Phase gate / Acceptance Criteria

| Phase | Acceptance criteria                                                                                                                                                                                    | Required checks / E2E                                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | มี audit ของ Git/source/architecture/data/security/dependencies/coverage และ migration โดยไม่เขียนทับงานเดิม                                                                                           | ตรวจการมีอยู่และความถูกต้องของ test scripts/fixtures; ยังไม่อ้างว่า feature ผ่านจาก audit เพียงอย่างเดียว                                                                                             |
| 1     | pending writes คงอยู่หลัง reload/reconnect, retry ไม่ซ้ำ, conflicts ไม่ overwrite เงียบ, account/permission แยกกัน และ restore ใน profile สะอาดได้                                                     | offline write→reload→reconnect, duplicate retry, multiple tabs, conflict, expired auth, permission denial, clean-profile restore; rules และ emulator integration                                      |
| 2     | วันโครงการไม่ซ้ำ, +1 ไม่เพิ่มซ้ำ, IDs คงที่, แก้ไขมี audit, ใช้ capacity snapshot ย้อนหลัง, copy วันถัดไป reset ธุรกรรม/หลักฐาน, offline/tablet/วันที่ไทยถูกต้อง                                       | หลายรถ/คนขับ, rapid clicks, corrections, capacity history, copy preview/idempotency, refresh/reconnect, Bangkok midnight และ Phase 1 regression                                                       |
| 3     | เก็บภาพต้นฉบับ/ใบเที่ยวและลายเซ็นที่ไม่ว่าง, ผูกยอดและ version ถูกต้อง, เปลี่ยนยอดยกเลิก confirmation, ไม่ลบ pending ก่อน verify, ไม่ copy หลักฐานวันถัดไป                                             | photo/slip upload, touch/mouse signature, blank rejection, offline reload, upload failure/retry, duplicate prevention, changed totals และ full regression                                             |
| 4     | OAuth/queue/folder mappings private และ stable, partial failures retry ได้, กู้ references/bytes แยก profile, ตรวจ missing/orphan โดยไม่ลบข้อมูล และ originals ยังอยู่จน verified                      | isolated Drive fixtures: expiry/revocation, interrupted media/metadata, dedup, foreign owner, missing/orphan, fresh profile restore และ offline bytes; แยกผล real cloud/device                        |
| 5     | expected/recorded และผลต่างถูกต้อง, ยอดทุกมิติถูกต้อง, missing evidence ชัด, corrections/reopen มีเหตุผล/audit, เปลี่ยน signed totals ยกเลิก confirmation, closure history ไม่ถูกแก้เงียบ              | mismatch/missing proof, unauthorized context, correction→reconfirm, close→reopen→reclose, stale versions, sync/conflict และ historical snapshots                                                      |
| 6     | daily/weekly/monthly และ per project/truck/driver/source ถูกต้อง, filters/date ranges/totals ตรงกัน, CSV UTF-8/XLSX/PDF ไทยใช้ได้, metadata และ optional references, แยก loose/compacted/design volume | empty/invalid/date-boundary reports, combined filters, calculation/verified totals, parse exported XLSX/CSV, PDF Thai rendering/print pagination และ offline exports                                  |
| 7     | BM/datum/orientation/grid/ground/design/cut-fill และ slopes ถูกต้องภายใต้ assumptions ที่แสดง, 2D visualization และ CSV/XLSX survey import/export; 3D เป็น optional                                    | known planes/slopes/mixed cut-fill, coordinate orientation/interpolation/units, bad input/limits, persistence, import preview/validation/roundtrip และ export; ไม่แทน measurement ด้วยค่าประมาณเงียบ  |
| 8     | tablet/touch/keyboard/accessibility, PWA offline, quota/performance/security/dependency audit/backup-restore และ deployment readiness ผ่าน พร้อม production smoke plan                                 | representative viewports, interruption/restart/update, large histories, storage failure, backup roundtrip, full regression; physical Android/install และ real service แยก NOT VERIFIED ถ้ายังไม่ได้ทำ |

COMPLETE ต้องมีหลักฐานตรงเกณฑ์ทุกข้อ แยก automated acceptance จาก real-service/device acceptance; PASS ของ mock/emulator ไม่ใช่ PASS ของ production เมื่อ prerequisite ที่สำคัญไม่ผ่าน ห้ามข้ามเพื่อประกาศ phase ถัดไปเสร็จ แต่ทำงานอิสระที่ผู้ใช้อนุญาตได้โดยบันทึกข้อจำกัดชัดเจน
