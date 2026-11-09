# Security and completeness review

Latest review: [SECURITY_SCAN_2026-11-09.md](SECURITY_SCAN_2026-11-09.md). Semgrep/Gitleaks were run in that follow-up; the 2026-11-08 scanner availability and 31-moderate counts below are historical. Current dependency audit: 23 moderate development findings, zero runtime findings. Confirmed sealed-evidence and GCM-tag findings were fixed and retested; production deployment/real-service acceptance remains separate.

วันที่ 2026-11-08 (Asia/Bangkok). Baseline `1591e17`; working tree clean before review. This is a scoped source/dependency/negative-test review, not proof that the product has no vulnerabilities or a penetration-test certification. No live production attack, push/deploy, credential rotation or data reset was performed

## Answer against the Master Roadmap

ไม่ควรประกาศว่าครบ 100% หรือพร้อม production: implementation/isolated gates มีแล้ว แต่ Phase 1/4 real Firebase/Drive/OAuth restore และ Phase 8 physical Android/manual acceptance ยัง NOT VERIFIED. Source/tests were compared with MASTER_ROADMAP and current reports rather than relying on old messages

| Phase | Evidence inspected                                                                                                                         | Remaining                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 0     | Git/source/models/persistence/rules/backend/manifests/scripts/phase reports                                                                | Scope and audit must be refreshed after changes                                  |
| 1     | storage/sync/conflict/account guards, failed-auth/retry/outbox and emulator clean-device restoration                                       | Real app identity expiry and production restore                                  |
| 2     | daily transactions/capacity snapshots/copy/reset/timezone/tablet regression                                                                | Physical-device field acceptance                                                 |
| 3     | evidence original preservation, unique IDs, one driver photo/signature, multi-page slips, blank rejection, proof invalidation and closeout | Actual camera/stylus and Drive consent                                           |
| 4     | OAuth/backend errors, private mappings, resumable locations, metadata verification, cache/restore and GET-only inventory                   | Google/second physical device acceptance; inventory limited to app-visible files |
| 5     | discrepancy/correction reasons/owner-context guards/close-reopen/audit and immutable historical records through rules/emulator             | Production authorization/rollout verification                                    |
| 6     | daily/week/month and grouped totals, combined filters, typed XLSX/CSV/PDF/context/references, loose-volume labeling                        | Native Excel/Android/printing and real cloud data                                |
| 7     | BM/TP/orientation/interpolation/cut-fill assumptions, import preview/validation/roundtrip, bounded 2D contours                             | Optional 3D deferred; engineering measurements not certified                     |
| 8     | quota/performance/touch/keyboard/PWA/backup export/cloud restore/security negative tests/audit and smoke plan                              | Physical Android, full manual accessibility and production smoke; dev advisories |

Backup JSON export and same-account missing-only preview/atomic JSON restore are now implemented and tested in the approved extensions; see EXTENSIONS_REPORT.md for limits, conflict/tombstone handling and original-byte retention. Preserve source backups and do not clear local storage to test restore. This supersedes the original export-only limitation; real production cloud acceptance remains separate.

## Confirmed issues fixed in this review

### SEC-001 — account switch while waiting for a Firebase ID token

Severity: Medium; account-action integrity. driveBackend.call captured owner A, awaited the ID token, then could send a mutation after the active user changed to B. The existing post-response check prevented using the response but did not prevent the request/side effect

Fix: check the active UID immediately after the token await and before fetch. Retain the existing post-response guard. Regression changes UID inside the token promise and asserts disconnect rejects as unauthorized with zero HTTP requests. Does not claim a server-side cross-owner authorization bypass

### SEC-002 — XLSX decompressed resource declarations were unbounded

Severity: Medium; local availability when opening an untrusted workbook. Both importers capped the compressed input at 5 MB, while the XLSX reader allocated ZIP output from directory declarations. A small file could declare extremely large worksheet/XML output before row validation ran

Fix: shared workbookSafety preflight before either parser. Require a consistent ordinary single-disk ZIP directory/local layout; reject encryption, ZIP64/sentinel counts, duplicate/unsafe paths, overlapping entries and inconsistent headers. Bound entries at 256, each declared expanded member at 20 MiB and total declared expansion at 40 MiB; retain 5 MB compressed input limits. Standard app-generated truck/survey workbooks and roundtrips remain tested. Unusual ZIP layouts are intentionally unsupported

Regression mutates only a tiny workbook's directory to declare 1 GiB output (does not allocate it), checks rejection through both import entry points, and checks encrypted/multi-disk/excessive/truncated declarations. Browser import test confirms rejection leaves measured levels intact and does not create a confirmation preview. This is structural preflight, not cryptographic authentication or a guarantee against every corrupt compression stream/CPU exhaustion case; hostile-file fuzzing/worker isolation remains possible further hardening

### BUG-006 — oversized JSON returned an incorrect backend status

Body parser already limited input at 8 KiB but its entity.too.large error was mapped to 503. Return 413 with a safe payload_too_large code instead. HTTP regression checks status/JSON and that provider exchange is never invoked. Generic internal/provider details remain suppressed

### SEC-003 — authenticated provider-call budget

Hardening: backend serialized refresh/disconnect operations but had no request budget for repeated authenticated calls. Added an in-memory per-UID fixed window (default 60/minute), bounded to 1,000 active owner entries, with expiration pruning and 429/Retry-After before provider calls. Unauthorized users do not populate this map. Tests cover per-owner isolation, limit, capacity, expiry and zero additional provider calls after throttling; frontend maps the safe retry code

This is per process, not shared across replicas, and runs after identity verification. It does not prevent unauthenticated verification floods or replace hosting/WAF/distributed controls

### DOC-001 — token storage description disagreed with source

README said access tokens were memory-only and did not survive reload, while driveSession.ts uses memory plus tab sessionStorage with owner/expiry checks. Documentation now states the actual behavior. This is not a change to credential persistence. Browser access tokens remain exposed to scripts executing in the same origin; sessionStorage is not an XSS defense. Refresh-token encryption at the backend is a separate control

## Attack-surface review and existing controls

- Backend verifies Firebase identity (including revocation in server wiring), verified email/admin, exact Origin/CSRF header, JSON body limit and no-store responses. Token vault uses fresh AES-256-GCM IVs, owner AAD and authenticated ciphertext. Tests reject foreign owner, revoked grants and credential/provider-error leakage
- Firestore uses owner + enabled-admin gates, default deny, tombstones and constrained envelope revisions/transitions; audit/metadata/mappings reject update/delete. Client validation is not described as a substitute for server rules. Authenticated owners still control their own records, so no claim of tamper-proof protection after full admin-account compromise
- Drive account match, stable IDs, private uploads, strict resumable HTTPS destination checks, size/MIME/operation/owner/folder verification and preservation of original bytes until metadata acknowledgement are covered. Private previews use image elements; report HTML is escaped; typed spreadsheet strings and CSV formula escaping remain covered
- No eval/new Function/dangerous HTML injection was found in production source during the targeted search. new Function in the service-worker unit harness is test-only. Report document.write receives escaped printableReport output; it is still reviewed as a sensitive HTML sink
- Cleanup script uses an explicit generated-path allowlist and realpath/symlink guards. It does not clear IndexedDB, credentials, arbitrary files, source or lockfiles. Dependency directories and useful dist build artifacts are retained

## Scans actually run — historical 2026-11-08

- Fresh npm audit: frontend runtime 0; backend runtime 0; full development tree 31 moderate, 0 high/critical. Exact advisories/remediation assessment remain in PHASE_8_FINAL_QA_REPORT. No forced downgrade/major override; lockfiles unchanged
- Initial redacted pattern scan: 197 tracked files, 190 decodable text files, 0 matches for selected private-key/GitHub/OAuth-secret/AWS/Stripe/Slack token formats. Only file/line/type would be emitted, never values. This is not a general secret-detection guarantee
- History search across available Git refs for selected PEM/GitHub/OAuth-secret patterns returned no matching commits. Unreachable Git objects, external vaults and arbitrary secret formats were not scanned
- Reviewed package scripts and seven scripts/ helpers used by build/test/clean. No tracked custom SKILL.md files found; none were executed as an audit target. Cloud runtime skill is an assistant workflow, not an application vulnerability scanner
- At that review Semgrep, Gitleaks and Trivy were not installed and were not run. The 2026-11-09 follow-up installs and runs Semgrep/Gitleaks under /tmp; see the linked report for actual scope, warnings and parser limitation. Trivy/DAST/live penetration testing remain unperformed

## Residual risks and external checks

- Current Hosting config sets nosniff/referrer policy but does not define a strict CSP/frame-ancestor policy; per-process authenticated request budgets are now implemented, while edge/distributed throttling is not configured. These are open hardening items, not demonstrated remote exploits in this review. Test CSP/Google Identity/Firebase helper-frame compatibility and deployment headers on a dedicated staging origin before rollout; do not blindly deploy a policy that breaks authentication
- 31 moderate development findings remain for compatible upstream remediation. Runtime audit 0 does not establish that application code is attack-proof
- Actual cloud permissions/rules deployments, OAuth consent/revocation, production URLs/headers, hardware, screen-reader behavior and malicious-file fuzzing require additional checks. Follow PRODUCTION_SMOKE_PLAN without using production data for destructive testing

Final command/test/cleanup evidence is recorded below after execution

Repeat scan after fixes included tracked + new review files: 200 files total, 193 decodable text files, 0 matches for the selected secret formats. No matched values or credentials were printed.

## Final verification and cleanup

`npm run check` with cloud variables: exit 0; frontend **275/275** (44 files), backend **11/11**, Firestore rules **7/7**, emulator integration **8/8**, Playwright **46/46** (1.6 minutes), lint tooling **4/4**, formatting/typecheck/build/HTTP smoke PASS. Targeted import browser regression (P7) also passed after adding the expansion-budget case. No tests/assertions disabled or skipped

Cleanup uses `npm run clean` and restores only the two tracked daily screenshots regenerated by our E2E (tree was clean initially). Retain source/lockfiles, credentials, uploads/IndexedDB, dependencies, shared caches, user attachments and the useful validated dist build. No whole-workspace deletion, git clean, production data cleanup or environment publication

## Shared company authorization review — 2026-11-09

Source `7fae411` retains the original company data namespace and grants access through explicit owner-controlled membership. Server Rules independently restrict financial reads/writes, member management, sealed-day edits and verification; a forged client role does not grant authority. Operator workspace list queries include only operational record types and have a deployable composite index. Actual Firebase actor UIDs are recorded in cloud audit entries.

Backend verifies current company ownership/membership before returning the authenticated caller’s own Drive session. Member requests never select the company owner's encrypted credential key. Frontend rejects a company switch while awaiting an ID token. Same-ID uploads in different actor/role caches use a compound key; additive upgrade leaves the legacy store/originals intact. Membership/profile listeners retain the latest role and stop after revocation/unsubscribe.

Evidence: complete gate exit 0 (310 frontend, 14 backend, 9 Rules, 10 integration, 58 browser E2E). Negative requests cover foreign/disabled/forged memberships, financial access, member escalation, close/reopen and audit actor forgery. No real production attack, OAuth acceptance, SAST/DAST certification or physical-device test is implied. Google Drive ACLs and offline knowledge of revocation remain separate documented boundaries; a disconnected device uses its last verified grant until reconnection. Previously recorded dependency/staging/manual acceptance follow-ups remain open; lockfiles unchanged.
