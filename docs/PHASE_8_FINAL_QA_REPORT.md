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

Physical Android camera/stylus/install/printing, real Google/Firebase/Drive/OAuth expiry/revocation and cross-device acceptance require dedicated configured accounts and devices. Browser tests/emulator do not close those gates. Accessibility checks cover labels/focus/keyboard/touch workflows; no full screen-reader or certified contrast audit is claimed. Backup JSON export is verified; local arbitrary JSON import/merge is not implemented, and users must not clear storage expecting an automatic local-file restore. Production readiness is conditional on this acceptance and explicit rollout authorization

## Validated final gate

Cloud `npm run check` exit 0: frontend 270/270 (43 files), backend 10/10, rules 7/7, emulator integration 8/8, Playwright 46/46 (1.7 minutes); format, lint (4 tooling tests), typecheck, build and HTTP smoke PASS. No disabled/skipped/failed tests. Previous phase gates and production-build offline regression are included

Safe dependency remediation was also assessed with `npm audit fix --dry-run --ignore-scripts` and a targeted `npm update @opentelemetry/core --dry-run`: installed core is 1.30.1 and uuid is 9.0.1. The targeted plan makes no compatible version change; the general plan adds 13 missing optional native-tool packages but reports no package version changes. No plan was applied; the actual installed audit remains 31 moderate development findings. Upgrading core to the fixed major line or forcing uuid across majors requires upstream compatibility review rather than a blind override. Both lockfiles remain unchanged
