# Approved extensions implementation and checkpoint

2026-11-08 (Asia/Bangkok). Baseline `cebef1c`. Additive work for [APPROVED_EXTENSIONS.md](APPROVED_EXTENSIONS.md); original Phase 0–8 requirements and real-service acceptance remain separate.

## Where to use the features

- **การเงินโครงการ**: choose project/date range; enter revenue, truck or driver rates per trip/m³; enter fuel/repair/other expenses; inspect provisional totals, truck/driver payable estimates, rate history, expense reversals and calculation CSV
- **การตั้งค่า → กู้คืนไฟล์สำรอง JSON**: select a same-account version-1 backup, inspect counts/collisions/reopened days, confirm missing-only merge. Cancel is read-only. Keep the original file
- **การตั้งค่า → ตรวจเที่ยวที่อาจซ้ำ**: search legacy-trip candidates, open individual trips, record distinct/needs-correction with a reason. A review never deletes or voids a trip
- **การตั้งค่า → โครงการเริ่มต้น**: set an active project for new forms on this browser/account. Existing daily drafts and edited historical records keep their project

## Data safety and calculation rules

Financial events are separate `workspaces` records with `recordType: finance`, not mutable totals. The client validates every event; Firestore Rules validate currency integers, actor, project/party scope and matching deterministic reversals. Originals cannot be updated, hard deleted or tombstoned through these rules. Local changes append an audit event and durable outbox atomically using existing storage. Project/master deletion protects finance references. Multiple offline events can sync without collapsing into a mutable ledger.

Rates are dated by the Bangkok work date. Specific truck/driver rates take precedence over eligible defaults. Same scope/effective date adds a higher immutable revision and a mandatory reason; this explicitly recalculates historical estimates and retains prior terms. Concurrent equal highest revisions stop calculation with a conflict message until the user adds a reasoned higher revision. There is no automatic choice between conflicting amounts. m³ uses saved per-trip capacity, rounds half up to satang per trip, then sums integers with BigInt bounds. Missing rates/capacity/driver identity remain unknown; an explicit zero rate is distinct from unknown. Trip verification and cloud synchronization remain different concepts.

Expense correction uses a positive original plus a deterministic negative reversal on the original work date/category/truck/amount. One original can be reversed only once. No bank payment, payroll settlement, tax/VAT/withholding, invoice approval or certified profit calculation is implied. Margin is known estimated revenue minus known truck/driver amounts and recorded net expenses. The UI marks incomplete totals and separately shows amounts from verified trips. Legacy and daily records remain separate origins; recording the same physical work in both still requires human reconciliation.

Restore validates account, backup format/version, entity schemas, IDs, relations and attachment bytes before preparing an in-memory plan. Confirmation checks the latest state/upload manifest and writes state, migration backups and new files in one IndexedDB transaction. Failure rolls everything back; retry retains the preview when safe. Existing live records/files/audit IDs and tombstones win. Backup deletions, sync cursors/acknowledgements, Drive folder mappings and credentials are never applied. Restored file destinations are resolved through the normal Drive workflow; imported uploads require reconciliation, rather than inheriting a successful-upload claim.

Imported daily sessions with current verifications/closed state reopen for fresh checks. Closure snapshots remain intact; original imported daily records are also retained in the restore audit. Existing sessions are never changed by missing-only restore. Workspace pushes put prerequisites before evidence and expense reversals, so shuffled backup arrays cannot permanently block their own dependencies.

Preferred-project and duplicate-review settings are account/browser scoped. A duplicate review fingerprints trip content/revision, so later edits require a new review; synchronization-only flag changes do not invalidate the review. No automatic correction is applied. New backup exports include these settings/review histories for retention. This restore currently merges operational records/audit/files only; it preserves current device preferences, daily drafts, review settings, truck-sheet settings and Drive mappings rather than replacing them from a file.

## Restore limits and release prerequisites

- Automatic JSON restore supports at most 150 MiB, 100,000 entities and 100,000 audit entries; attachment original limit remains 100 MiB each. Larger exports remain usable as retained originals but are rejected for this automatic restore. No file is truncated or deleted
- Tombstones in the backup are not replayed as remote deletes. An active imported record that needs an unavailable deleted dependency blocks the merge with a relationship error; no partial restore is claimed
- Same-account restore only; no local-to-Google/cross-account ownership migration. Upload ID collisions with another namespace reject without exposing that namespace
- Financial rules must be released with the updated web client through the separately authorized deployment process. Until then old production rules can keep new finance records pending. This work does not deploy rules, backend or hosting
- Google/Firebase/Drive production acceptance and physical Android camera/stylus/install/printing remain NOT VERIFIED. Simulated mobile/tablet layouts are implemented/tested independently
- Existing dependency audit findings and manual/security acceptance in SECURITY_REVIEW.md remain open. No dependency changes, new credentials or production data resets

## Actual validation

Targeted tests before the full gate: preference/review browser workflow passed; seven new extension E2E cases passed across desktop/tablet/mobile, including offline restore, wrong account, no overwrite, stale preview, quota rollback/retry, financial rates/revisions/reversals and reload. Finance/restore unit tests passed. Eight Firestore Rules tests passed (including immutable finance/reversal validation); integration test for multiple shuffled offline finance events added for the final gate.

The first full command stopped at lint errors in new test variable declarations; fixed without changing test assertions. The next run passed 293 frontend assertions but reported an unhandled late App sync update after unmount and correctly failed. Added mounted-session cancellation guards plus a deferred-pull/unmount regression. Targeted App/auth tests: 13 passed without unhandled errors. Final complete command exited **0** on source commit `246a174`:

```sh
CI=true XDG_CONFIG_HOME=/workspace/.cache/config \
npm_config_cache=/workspace/.npm-cache \
FIREBASE_EMULATORS_PATH=/workspace/.cache/firebase/emulators \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run check
```

- Frontend **294/294** in 48 files; backend **11/11**
- Firestore Rules **8/8**; Firestore integration **9/9**, including shuffled finance dependency order, idempotent retry and independent-device restore
- Browser E2E **55/55** (2.0 minutes), including financial CSV values after correction
- Formatting, lint/tooling (4 tests), typecheck, production build and HTTP smoke PASS. Lint retains 56 warnings; no errors, skipped tests or unhandled rejections in the final gate
- `npm run clean` completed; only known generated Phase 2 screenshots were restored to their original tracked versions. No user records, credentials or unknown files were deleted. Lockfiles unchanged

No source push, hosting/backend/rules deploy or environment publication was performed for this extension milestone. Source commit `246a174`; the later documentation checkpoint records these results.

## Resume checkpoint

Item 4 remains pending the asynchronous question: should owner/manager/operator accounts share one company dataset or keep isolated datasets? Current `users/{uid}` and backend encrypted Drive credentials are bound to each UID. Implement membership, rules/backend enforcement, account transitions and abuse tests together once the answer arrives. Do not implement only hidden buttons or expose old user namespaces.

Preserve completed extensions and compare Git/source/tests with these documents. Read AGENTS, Master, progress and bug tracker. Finish any failed gate before new scope; do not repeat the earlier implementation. Inspect `git log -1 -- docs/EXTENSIONS_REPORT.md` for the documentation checkpoint. No usage-limit event has been reported.
