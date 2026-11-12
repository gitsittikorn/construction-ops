# Phase 8 — tablet, performance and production QA checkpoint

## Canonical local origin and real recovery — 2026-11-12

Daily use is fixed to 127.0.0.1:5173 with strict port. Empty localhost redirects; existing records/backups/attachments retain a dedicated backup screen, account isolation and read-error protection. Actual restored Firestore operational data verified separately from synthetic tests. Targeted 26/26 PASS. Full Windows gate **exit 0**: frontend 392/backend 20/Rules-storage 14/integration 10/E2E 73/tooling 4; format/lint/typecheck/build/smoke PASS, 59 existing warnings/zero errors, no skips. Cleanup **exit 0**. [Recovery, reproduction and acceptance boundaries](DATA_RECOVERY_2026-11-12.md). Three historical Drive files and physical Android remain NOT VERIFIED/deferred; no deployment or phase-completion claim.

## Backend OAuth binding gate — 2026-11-11

BUG-021 fixed on baseline `978a1ae`: additive client/UID isolation, encrypted attribution and frontend rejection of mismatched/old backend responses. Legacy originals/key, operational data and pending bytes retained. Full Windows `npm.cmd run check` **exit 0**: frontend **383/383**, backend **20/20**, Node Rules/storage emulator **14/14**, frontend emulator integration **10/10**, E2E **71/71** (3.6 minutes), tooling **4/4**; format/lint/typecheck/build/smoke PASS, 59 warnings/zero errors. Cleanup exit **0**, two generated Phase 2 images restored. [Commands, negative-test diagnosis and rollout prerequisites](DRIVE_OAUTH_BINDING_2026-11-11.md). Production services/device/manual acceptance remains separate and NOT VERIFIED; Android deferred. No environment edit, push or deployment.

## OAuth project and cached-authorization gate — 2026-11-11

BUG-020 local session fix and personal-client configuration: Windows `npm.cmd run check` **exit 0**, frontend **381**, backend **15**, Rules **11**, integration **10**, E2E **71** (5.6 minutes), tooling **4**; format/lint/typecheck/build/smoke PASS, 59 warnings/zero errors, no skipped tests. Targeted session/Drive/identity/UI suite **60/60** and a later same-context reload assertion are included in the full gate. Actual unauthenticated Google popup used the supplied client; sign-in/consent, branding, real APIs/devices and backend/grant migration remain NOT VERIFIED or OPEN (ENV-005/BUG-021). [Detailed handoff](PERSONAL_OAUTH_SWITCH_2026-11-11.md). Cleanup **exit 0**, pre-test screenshots restored; no production deployment, credential deletion or overall phase completion.

## Google Sheets discovery regression gate — 2026-11-11

BUG-019 full Windows `npm.cmd run check` **exit 0**: frontend **378**, backend **15**, Rules **11**, emulator integration **10**, E2E **71** (4.2 minutes), tooling **4**; format/lint/typecheck/build/smoke PASS, 59 warnings/zero errors, no skipped tests. Current-URL/gid discovery, ambiguous-table rejection and atomic per-account preference rollback are covered; all existing asset/PWA/pending-original regressions remain enabled. [Detailed report](SHEETS_TAB_DISCOVERY_2026-11-11.md). Real Google/Firebase/Drive/Sheets and hardware are not inferred from mocks/emulator. `npm.cmd run clean` exit **0**, prior generated screenshots restored; no push/deployment or overall phase-completion claim.

## Hosted-subpath and import regression gate — 2026-11-11

BUG-015/016 fix local/production base handling for logo, login artwork, manifest, scoped worker and precache. Production smoke and PWA browser tests now exercise `/construction-ops/`, including real image decoding and offline/pending-original preservation. Windows `npm.cmd run check` exit **0**: frontend **354/354**, backend **15/15**, Rules **11/11**, emulator integration **10/10**, E2E **69/69** (4.4 minutes), tooling **4/4**; format/lint/typecheck/build/smoke PASS, 59 lint warnings/zero errors. No skipped tests. Includes truck Excel and Google identity regressions; [detailed report](LOCAL_IMPORT_FIXES_2026-11-11.md). `npm.cmd run clean` exit **0** and the two regenerated historical screenshots restored. Real Google/Firebase/Drive/Sheets, physical devices and production hosting remain NOT VERIFIED or deferred; no deployment performed and no original phase gate declared complete.

## Latest novice UX / DEMO gate — 2026-11-10

Source `222ab69`, baseline `48adc66` (application `aec9592`). Final cloud `npm run check` exit **0**: frontend **330/330** (57 files), backend **15/15**, Rules **11/11**, emulator integration **10/10**, E2E **67/67** (2.5 minutes); tooling **4/4**, formatting/lint/typecheck/build/HTTP smoke PASS. 59 lint warnings/zero errors; no skipped/disabled tests or unhandled rejections. Full evidence, initial failure/retest history and screenshots: [UX_UI_REPORT.md](UX_UI_REPORT.md). Upstream model-routing documentation merged afterward as `7a5fd71` with no application changes.

Tests cover novice help/navigation, visible label/control gaps at 1440/800/390 px, report keyboard scrolling, empty/invalid filter recovery, retained 48 px daily targets, immutable real records and pending queues, idempotent DEMO creation/draft retention, 80-trip/1,200 m³ Excel readback, 49,200-baht provisional difference and 100 m³ fictitious survey fill. No evidence acknowledgement/verification was fabricated. The generic project count now includes daily work. Security formulas/permissions/schema and dependency lockfiles are unchanged.

Safe cleanup completed; restored two regenerated Phase 2 screenshots and retained four reviewed synthetic example screenshots. Commit/push authorized; no deployment/environment publication or real Google/Drive/Sheets/device acceptance. Original manual/service limitations and the actual Sheets account error remain separate open work. The historical Phase 8 evidence below remains dated.

2026-11-08 (Asia/Bangkok). Automated gate results recorded below after execution. Real-service/hardware acceptance remains NOT VERIFIED; no push/deploy, credential changes or data reset.

## Changes and evidence

- Coarse-pointer controls use minimum 44×44 CSS pixels; existing daily workflow controls remain at least 48 px high. Checkbox label targets are enlarged. Browser test uses 800×1280 touch context, verifies rendered bounds, keyboard Space activation and no document horizontal overflow
- Report evidence references are indexed once by session/row/fingerprint, not rescanned across all workspaces for every segment. Verification state is computed once per daily row. Benchmark validates totals/reference association for 5,000 daily records plus 5,000 evidence records, within the existing 5-second test budget
- Existing regression covers 10,000 trips, near-limit 2,401-point survey, bounded rendering, production PWA offline/lazy loading/update behavior, IndexedDB quota rollback, cross-tab stale edits, safe account backup export, independent-device cloud restore and private original cache
- Existing rules/emulator tests reject anonymous/non-admin/disabled/foreign-owner operations and unauthorized reopening; backend tests verify Firebase identity, CSRF, exact CORS origins, encryption and provider failure handling. No credentials are copied to frontend/source or logs
- Production/read-only smoke and dedicated-account/hardware acceptance plan: [PRODUCTION_SMOKE_PLAN.md](PRODUCTION_SMOKE_PLAN.md)

## Dependency audit

Commands run on current lockfiles: `npm audit --omit=dev --json` (root), `npm audit --json` (root), `npm audit --omit=dev --json` (backend). Parsed registry audit metadata, not just shell exit status:

| Scope                      | Moderate | High | Critical |
| -------------------------- | -------- | ---- | -------- |
| Frontend runtime           | 0        | 0    | 0        |
| Backend runtime            | 0        | 0    | 0        |
| Full root development tree | 31       | 0    | 0        |

Development findings include glob traversal cancellation (GHSA-3g3m-2fjr-6pw4), minimatch amplification (GHSA-g3hv-75wg-m249), OpenTelemetry baggage allocation (GHSA-8988-4f7v-96qf) and uuid buffer bounds (GHSA-w5hq-g745-h8pq). Direct eslint/firebase-tools chains include packages with no available compatible fix according to audit metadata. No force downgrade/major override was applied merely to remove the warning; track upstream patches and rerun this audit before release. Some nested fixes are available and should be assessed with dependency constraints rather than assuming every finding is unfixable

Lockfile SHA-256 at audit:

- root: `669f16a55721806ace8732c1cc522764d00fdde542f5713082216486e0ff5acf`
- backend: `cb780d0840c9bb91c3dadedd1bd662a018eebec517142315e17004f763895766`

## Remaining limits

Physical Android camera/stylus/install/printing, real Google/Firebase/Drive/OAuth expiry/revocation and cross-device acceptance require dedicated configured accounts and devices. Browser tests/emulator do not close those gates. Accessibility checks cover labels/focus/keyboard/touch workflows; no full screen-reader or certified contrast audit is claimed. Backup JSON export was verified at the original Phase 8 gate. Same-account missing-only JSON import/merge is now implemented in the approved extensions; see EXTENSIONS_REPORT.md for validation, atomic rollback, limits and verification reset behavior. Users must still preserve originals and avoid clearing site data. Production readiness is conditional on this acceptance and explicit rollout authorization

## Validated final gate

Cloud `npm run check` exit 0: frontend 270/270 (43 files), backend 10/10, rules 7/7, emulator integration 8/8, Playwright 46/46 (1.7 minutes); format, lint (4 tooling tests), typecheck, build and HTTP smoke PASS. No disabled/skipped/failed tests. Previous phase gates and production-build offline regression are included

Safe dependency remediation was also assessed with `npm audit fix --dry-run --ignore-scripts` and a targeted `npm update @opentelemetry/core --dry-run`: installed core is 1.30.1 and uuid is 9.0.1. The targeted plan makes no compatible version change; the general plan adds 13 missing optional native-tool packages but reports no package version changes. No plan was applied; the actual installed audit remains 31 moderate development findings. Upgrading core to the fixed major line or forcing uuid across majors requires upstream compatibility review rather than a blind override. Both lockfiles remain unchanged

## Follow-up security review

See SECURITY_REVIEW.md: fixed pre-fetch owner-switch race, added shared XLSX ZIP resource preflight and per-process authenticated request budgets, corrected oversized body response and token-storage documentation. Final full gate frontend 275/backend 11/rules 7/integration 8/E2E 46 PASS. Remaining staging CSP/edge controls and real acceptance are explicitly open; full SAST/DAST or live penetration tests were not performed

## Approved extension follow-up — 2026-11-08

Source `246a174`: same-account JSON preview/atomic missing-only restore, duplicate review, preferred projects and immutable financial estimates/reversals are implemented. Full gate exit 0: frontend 294, backend 11, rules 8, integration 9, browser E2E 55. New browser workflows cover 1440×1000, 800×1280 and 390×844 layouts, quota/retry, offline reload and reviewed corrections. See EXTENSIONS_REPORT.md for boundaries. Production Google/Drive and physical Android remain NOT VERIFIED; the user subsequently confirmed shared-company roles; new implementation and validation are tracked in COMPANY_ACCESS.md.

## Shared company final gate — 2026-11-09

Source `7fae411`, full `npm run check` exit 0: frontend 310/310 (53 files), backend 14/14, Rules 9/9, emulator integration 10/10, browser E2E 58/58 (2.2 minutes). Formatting, lint/tooling (4 tests), typecheck, production build and HTTP smoke PASS; 59 lint warnings, zero errors. No skipped tests or unhandled rejections remain.

Company roles, member disable/downgrade, actor auditing, finance restrictions, per-user backend credentials, additive IndexedDB 3 isolation and original-byte retention are now covered. Details, setup steps and offline membership limitations: COMPANY_ACCESS.md. All nine approved extensions have implementation and isolated acceptance; original production-service/device/manual limits remain NOT VERIFIED or deferred. No push, deploy or environment publication; safe generated-artifact cleanup completed.

## Bug/security final gate — 2026-11-09

Source `ba6ad8c`, initially clean baseline `cbef922`. Final cloud `npm run check` exit **0**: frontend **314/314** (53 files), backend **15/15**, Rules **10/10**, emulator integration **10/10**, Playwright **58/58** (2.3 minutes). Format/lint/tooling (4 tests)/typecheck/build/HTTP smoke PASS, 59 lint warnings and zero errors, no skipped tests or unhandled rejections. The previously successful sealed-proof reparent request is denied after the fix. New-generation reclose and historical-restore permission cases pass; original bytes and closure history remain retained. Report/reference/performance targeted checks: 11 passed. AES-GCM short-tag and malformed-IV regressions pass without changing valid version-1 credentials.

Actual Semgrep/Gitleaks scan versions, rule pin, reproductions and residual findings are in [SECURITY_SCAN_2026-11-09.md](SECURITY_SCAN_2026-11-09.md). Fresh audit: frontend/backend runtime **0**, full development **23 moderate**, **0 high/critical** on unchanged lockfiles; earlier 31 is historical. Semgrep retains four reviewed escaped-HTML warnings and one parser limitation; secret scans found zero matches within scope. No assertion of complete penetration testing or vulnerability-free production.

`npm run clean` completed; restored only the two regenerated Phase 2 screenshots. No user data, unknown files, pending originals, credentials or lockfiles deleted. The user authorized source commit/push to GitHub for this task, including pending shared-company commits. No hosting/Rules/index/backend deployment or environment publication. Original production-service/device/manual limits remain open.

## Dedicated sync navigation — 2026-11-09

UX-005: move the large security/sync panel to **ซิงก์และสำรองข้อมูล** and retain a red, accessibly labeled menu indicator for problems. Keep business pages free of the panel while automatic sync continues in App. Desktop sidebar supports wrapping/scrolling; narrow layouts retain horizontal navigation. Daily/survey guidance now points to the menu.

Windows final `npm.cmd run check` exit **0**: frontend **319/319** (54 files), backend **15/15**, Rules **10/10**, emulator integration **10/10**, E2E **61/61** (3.4 minutes), lint tooling **4/4**. Format/lint/typecheck/build/smoke PASS; 59 lint warnings, zero errors. No skipped/disabled tests. New desktop/tablet/mobile viewport cases verify red-dot styling, navigation, pending/error preservation and no horizontal document overflow. Existing offline backup and original-byte assertions remain enabled. Initial type-selector/deferred-callback test failures were diagnosed and corrected; see [SYNC_NAVIGATION_REPORT.md](SYNC_NAVIGATION_REPORT.md) for the command and evidence boundaries.

This task does not complete original Phase 1/4/8 real-service/manual acceptance. Real Firebase/Google/Drive recovery is NOT VERIFIED here; physical Android/tablet remains deferred/NOT VERIFIED. No new security scan, dependency upgrade, credential/rule change or deployment.

## Task ownership and duplicate UI audit — 2026-11-09

UX-006 consolidates report menus, keeps the original trip table/editing/CSV/PDF only in Trips, puts JSON restore beside backup export in Sync and moves duplicate review into Trips. Remove unrelated trip-create actions and the large repeated local-mode banner; retain a compact status and contextual summaries. Completed-task notices clear on navigation; unresolved cloud failures keep their sync indicator. Initial storage-load errors are preserved while the workspace is not ready. All ten current navigation areas were reviewed; distinct daily/evidence, survey and financial workflows are retained without merging records.

Final Windows `npm.cmd run check` **exit 0**: frontend **322**, backend **15**, Rules **10**, emulator integration **10**, E2E **64** (3.1 minutes), tooling **4**; formatting/lint/typecheck/build/HTTP smoke PASS, 59 lint warnings/zero errors, no skipped/disabled tests. Browser ownership tests pass at 1440×1000, 800×1280 and 390×844; restored backup/duplicate/role workflows, invalid-file/range failures, unchanged pending originals and original print metadata remain covered. The new exact-label select failure was fixed and the full gate restarted, retaining every assertion. [PAGE_OWNERSHIP_REPORT.md](PAGE_OWNERSHIP_REPORT.md) records the audit, commands and intermediate outcomes.

No new production-service/device/manual acceptance, security scan, dependency, credential, Rules or environment change. Physical Android/tablet remains deferred/NOT VERIFIED. No push/deployment.
