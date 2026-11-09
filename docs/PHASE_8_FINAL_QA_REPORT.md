# Phase 8 — tablet, performance and production QA checkpoint

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
