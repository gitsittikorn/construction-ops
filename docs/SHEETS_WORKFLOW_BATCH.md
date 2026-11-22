# Sheets workflow completion batch — 2026-11-10 (Asia/Bangkok)

Baseline `130ac5b`, validated source **`1861097`**, branch `feat/google-allowlist-rbac`. Continued the first batch in FEATURE_COMPLETION_PLAN.md by inspecting `TruckSheetsPanel.tsx`, `truckSheets.ts`, the OAuth helpers and existing tests. Existing Sheets read/preview/import and non-overwriting template preparation were reused. No new importer, provider setting, credential, permission policy or production mutation was introduced.

## BUG-020 — stale Sheets operation continues across an identity change

**Medium / Phase 1 and shared-account workflow.** Start a Sheets action, defer Google SDK loading, then switch the session identity before loading completes. Previously the component still requested consent for the captured old identity. Similarly a consent result after logout still triggered the Drive-account verification request. Finally, template preparation read metadata/headers asynchronously and then submitted its write without checking whether the original account/company operation remained active.

Three guard regressions reproduced these paths before the fix. The first two-suite run exited 1 with 10 passed/4 failed: the fourth failure was the existing template success test's expected call signature after adding the new guard contract. After implementation and signature adjustment the focused three-file suite passes 29/29, exit 0; typecheck also exits 0. These are synthetic identities and mocked Google HTTP responses, not live-account authorization tests.

The component now captures its original UID/email/generation and rechecks current workspace/account after SDK loading, consent, account verification, Sheets completion and local settings persistence. The template helper receives a synchronous operation guard and checks it immediately before each request, including the final write after metadata/header reads. Stale actions cannot forward rows to preview or claim template completion. Requests already sent before an identity change cannot be retroactively recalled; this is a pre-request guard, not server-side cancellation or a replacement for Google permissions.

## Connection progress and actionable failure stages

The existing status/error UI now names the active step: link/account validation, loading Google, requesting Sheets consent, checking the selected Google account, preparing headers, reading rows or remembering the link locally. Existing error details and retry buttons remain. A failed read is asserted to include its stage and does not forward/save vehicle data. No OAuth token, authorization response, secret or public QR/diagnostic endpoint is added.

This narrows the next real-machine diagnosis: capture the complete visible error plus browser origin on the configured VS Code machine. The previously reported account-connection error is still **OPEN / NOT VERIFIED**; the reproduced race is not established as its root cause. User-reported Firebase/Drive connection success remains separate from independent real-service acceptance. Do not change OAuth clients/scopes/provider/billing settings or re-bootstrap production to guess at the cause.

## Verification and remaining scope

Focused command: `npx vitest run src/test/TruckSheetsPanel.test.tsx src/test/truckSheetTemplate.test.ts src/test/truckSheets.test.ts` → 29 passed, exit 0. `npm run typecheck` → exit 0. One full gate is run at the end of this source batch; actual final results/source hash are recorded in ROADMAP_PROGRESS.md.

No changes to existing IndexedDB schema, business records, queued originals, Rules, backend or dependency lockfiles. The original read-only import still produces a preview; only the existing explicit template action can send a Sheets write. Real Google/Sheets/OAuth/MFA and physical iPhone/Safari/Home Screen remain NOT VERIFIED by this batch. Physical Android remains deferred. No merge/deploy/production/config changes are performed.

## Resumed validation and PWA test synchronization

The first complete batch gate reached 360 frontend/24 backend/5 release/15 Node emulator/10 client integration passes, but ended with 84/85 E2E and exit 1. The archived baseline-worker case could already display the new HTML marker before activation. Its post-click marker assertion therefore did not establish that the activation reload had completed; reading IndexedDB then raced the navigation and failed with `Execution context was destroyed`.

The browser fixture now starts waiting for `domcontentloaded` before clicking the update button and reads the snapshot only after that actual reload. No production worker code or pending-state/byte assertions were changed. Focused retest: all four PWA upgrade cases passed (21.5 seconds), exit 0. Resumed full-gate evidence and source checkpoint follow in ROADMAP_PROGRESS.md; the initial failed full run remains recorded rather than being presented as a pass.

## Final gate and handoff

Resumed full documented cloud `npm run check` exited **0**: frontend **360/360** (61 files), backend **24/24**, release preflight **5/5**, Node emulator **15/15**, client integration **10/10**, E2E **85/85** (2.8 minutes), editor tooling **4/4**. Formatting/lint/typecheck, root/Pages builds and both HTTP smokes PASS; 61 lint warnings/zero errors and the normal bundle warning retained. No skipped/disabled tests or relaxed assertions. Source commit **`1861097`** includes the PWA test synchronization. Cleanup completed; restored only two known generated Phase 2 screenshots. No fresh security/dependency audit. Feature-only delivery and exact next actions: ROADMAP_PROGRESS.md.
