# Google allowlist and user management

Requirements: [AUTH_RBAC_REQUIREMENTS_2026-11-09.md](AUTH_RBAC_REQUIREMENTS_2026-11-09.md). Baseline `b5b046f`, initially clean; validated source **`1b4c21d`**, branch `feat/google-allowlist-rbac`. The new feature-branch/PR/no-production-merge requirement supersedes the previous task's push-to-main instruction. No production permission, secret or operational data is changed by implementing this branch.

## Audit / gap analysis — 2026-11-10

| Requirement                               | Existing evidence                                                      | Gap / implementation                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Google identity, persistent login/logout  | Firebase Google provider and CompanyGate already exist                 | Reuse them; require verified Google identity on trusted access endpoints                                                  |
| Google sign-in does not grant data access | Enabled owner/member checks and default-deny Rules exist               | Add email allowlist and first-login UID binding through Admin SDK                                                         |
| Four roles                                | Owner/manager/operator enforce company scope                           | Add viewer; map public super_admin/admin/staff to existing owner/manager/operator cache aliases to preserve namespaces    |
| Super-admin back office                   | Existing owner manages members by UID directly                         | Add email-before-login, explicit roles/status/search/timestamps/audit via backend, never trust a client-supplied UID/role |
| Last super-admin protection               | Original owner cannot be edited through the legacy form                | Add transactional active-bound-super-admin count; unaccepted invitations cannot substitute for the last working admin     |
| Revocation/offline/shared device          | Role/actor/company caches, live listeners, preserved pending originals | Expire offline grants, revalidate on reconnect, live Rules denial and token revocation; viewer never pushes or mutates    |
| Bootstrap/migration                       | Console-enabled legacy owner                                           | Prepare dry-run-first Admin SDK bootstrap/migration that preserves all business documents; do not run against production  |
| Testing/rollout                           | 330 frontend, 15 backend, 11 Rules, 10 integration, 67 E2E baseline    | Add positive/negative/race/emulator/browser cases; full gate; feature PR with results, no production merge/deploy         |

## Safe architecture

- Preserve Firebase Auth, Firestore, IndexedDB, Google services and original `users/{companyId}` namespaces. Introduce an explicit `companies/{companyId}.accessPolicy = allowlist-v1` activation only through the trusted bootstrap; legacy companies remain compatible until their reviewed migration. Protected-policy companies fail closed when the access backend is unavailable.
- Canonical roles in `companies/{companyId}/authorized_users/{sha256(normalizedEmail)}` are `super_admin`, `admin`, `staff`, `viewer`. A backend-only member mirror keeps existing cache aliases and independently enforced Rules. Client writes to policy allowlists/mirrors/counters/audit logs are denied. Email normalization is trim/lowercase; do not remove Gmail dots or plus suffixes.
- UID binds only after a revoked-token-checked, verified Google identity matches an enabled allowlist email. It cannot be supplied by the caller or automatically rebound to a different Firebase account. Status, grant revision, creator/updater, login timestamp and audit events are server-owned.
- Administrative changes recheck the actor in the transaction, serialize the active bound super-admin count, preserve removed users as tombstones and revoke sessions after changes. Live Rules read the authoritative grant/mirror, not long-lived custom claims. MFA may be enforced explicitly after the administrator configures and verifies compatible Firebase MFA; do not claim enrollment was performed by this branch.
- Offline access requires an earlier verified grant, is time-bounded and cannot discover a remote suspension while disconnected. Reconnect revalidates before sync. Preserve previous role caches and pending originals; do not clear IndexedDB on logout or revocation. Hide and unmount the previous workspace on account changes.
- Local demonstrations remain separate from configured production access. No public registration or client-side self-admin bootstrap. No credentials in frontend/reports. Real Firebase/Google/MFA acceptance and coordinated deployment require the existing separately authorized rollout process.

## Implementation order

1. Persist requirements and inspect current flows (complete).
2. Trusted access service, transactional store, bootstrap/migration and negative tests.
3. Rules, viewer restrictions and offline/reconnect safeguards.
4. Existing-gate integration, email-based back office and accessible errors/status.
5. Emulator/API/browser regression, full check, safe cleanup and documentation.
6. Feature-branch push and PR with actual test evidence; no merge/deploy.

## Delivered permission matrix

| Public role   | Preserved cache alias | Business records                                                | Finance / closeout                 | User management / access audit   |
| ------------- | --------------------- | --------------------------------------------------------------- | ---------------------------------- | -------------------------------- |
| `super_admin` | `owner`               | Read/write in the authorized company                            | Yes                                | Yes, through trusted API         |
| `admin`       | `manager`             | Read/write in the authorized company                            | Yes                                | No; cannot appoint a super admin |
| `staff`       | `operator`            | Operational records and original evidence for open company work | No finance; no verify/close/reopen | No                               |
| `viewer`      | `viewer`              | Authorized company operational data/reports, read-only          | No finance                         | No                               |

Roles are company-scoped, not global authority over other companies. Staff/viewer access is to permitted operational record categories in that company; this branch does not introduce individual project-assignment ACLs. Additional per-person/project grants would require explicit data-model/query design. Google Drive folder sharing is still controlled separately in Google.

Viewer is denied by Rules and the trusted Drive backend as well as UI/domain/outbox guards. Synchronization may pull permitted records but never pushes viewer pending entries or resolves conflicts. Existing queues from an earlier higher-role cache remain retained in that cache. The member mirror includes the normalized email hash and canonical role; Rules read the matching live grant and verified Google token and ignore forged client/custom-claim role flags.

## Bootstrap and rollout — administrator review required

The following commands are prepared, **not run against production**. Use the existing trusted service-account/ADC configuration and the correct Firebase project. Never paste a key or token into chat or regenerate the existing Drive encryption key. The initial email must already be a verified Google Firebase identity whose UID equals the original company/founder namespace. Sign-in creates identity only; it does not grant data access. For an existing company, bootstrap that original founder first, then invite additional super admins through the back office.

From `backend`, replace the placeholders with the reviewed project, original founder UID and email:

```sh
node --env-file-if-exists=.env.local scripts/bootstrap-access.mjs \
  --project-id YOUR_FIREBASE_PROJECT_ID \
  --company-id EXISTING_FOUNDER_UID \
  --email owner@example.com \
  --name "Your company"
```

Default is **dry-run**: reads and checks identities/membership but writes nothing. Review the reported migration count and all unsupported/stale-member errors. At most 100 legacy members are supported in this atomic migration; larger organizations require a reviewed staged plan. Enabled legacy members must be valid verified Google identities. Duplicate emails/UIDs, unsupported roles, stale previews, existing grants and disabled original company registration stop the migration without overwrites. It does not silently drop a member to make bootstrap succeed.

Only after separate rollout authorization and a reviewed metadata backup, repeat the exact command with **`--apply`**. That performs one access-only transaction: preserves the company ID and all projects/masters/trips/workspaces/Drive credentials, migrates old member grants to canonical allowlist records, binds known verified UIDs, writes the protected count/mirrors/audit and activates `accessPolicy`. Repeating bootstrap on an active policy does not reset it or grant another super admin. `--emulator` must be explicit and match emulator environment settings for isolated testing.

Deployment order:

1. Review the feature PR, tests, access-metadata backup and existing founder/member identities. Keep pending originals and existing encryption keys intact.
2. Deploy the reviewed backend with access endpoints, Rules and the supplied email collection-group index, and the frontend through a separately authorized coordinated rollout. Current source supports legacy companies; a legacy-only backend's explicit 404 capability response falls back only for non-policy companies. A policy company cannot bypass the backend by choosing the legacy UI.
3. Keep `VITE_ACCESS_BACKEND_URL` empty to use the existing `VITE_DRIVE_BACKEND_URL`, or configure an exact reviewed HTTPS access-service URL. Add the correct frontend origin to the backend's existing CORS configuration. No client secret belongs in either frontend variable.
4. Dry-run/review/apply bootstrap **last**, after all deployed components support the policy. Test founder login, invited email binding, all four roles, revoked-user denial, cross-account/company isolation and real offline/reconnect behavior on dedicated test records.
5. Keep the policy flag in place for reviewed recovery. Do not replay old Rules or remove the flag over live four-role data. For an activated company, `admins/{companyId}.enabled` is the organization registration gate; disable a person through the allowlist UI, not by toggling the organization gate. A trusted console/ADC operator remains responsible for out-of-band Firebase Auth disable/delete or emergency metadata repair.

## Offline, logout and session boundaries

- Offline grants last at most **12 hours** after verified access; future/invalid timestamps are rejected. A known denial writes a revocation marker so the old legacy admin timestamp cannot revive access. Reconnect revalidates and real-time membership/Rules denial closes the workspace promptly. Offline clients cannot learn a remote change until connectivity returns; this limitation is explicit.
- Logout/account/role changes unmount the previous workspace and isolate actor/company/role caches. Data and pending originals are retained; they are not silently transferred to another account or destroyed. Browser cache partitioning protects normal application use; it is not encryption against someone controlling the device, browser storage or same-origin scripts.
- Firebase Auth's existing persistent Google session is reused. The backend verifies ID tokens with revocation checking, verified email and the Google sign-in provider. Role/status changes update grant/mirror/audit atomically before requesting Firebase refresh-token revocation. If that external call fails, the UI reports it; live Rules/API grant checks still deny removed/disabled privileges. Google Drive ACLs and external OAuth grants are separate controls.
- Production with missing Firebase settings fails closed. An intentionally separate local-demo build may set `VITE_ALLOW_LOCAL_DEMO=true`; it is not an authorized company session. Isolated production-PWA tests explicitly set that flag and clear every live backend/Firebase setting.

## MFA and custom claims

Custom role claims were considered but deliberately not used as authority: claims can remain stale until refresh. The live Firestore grant and protected mirror decide access. `ACCESS_REQUIRE_ADMIN_MFA=true` optionally requires a Firebase `sign_in_second_factor` claim for super-admin sessions and administrative calls. Default is false. Enable it only after a compatible Firebase MFA enrollment/sign-in solution is deployed and tested; this branch does **not** claim to provision MFA or provide a complete TOTP/SMS enrollment/challenge UI. Google account two-step verification alone does not establish that Firebase claim. Real MFA acceptance remains open.

## Actual verification and remaining acceptance

Full cloud gate (`npm run check` with documented cloud variables), exit **0**: frontend **343/343** in 59 files; backend **24/24**; emulator Node suite **15/15** (13 Rules + 2 real backend transaction integrations); Firestore client integration **10/10**; E2E **73/73** (2.6 minutes); editor tooling **4/4**. Formatting/lint/typecheck/build/HTTP smoke pass; 59 pre-existing lint warnings, zero errors. Production build reports an approximately 503 kB minified main chunk; no warning threshold was raised.

Supplemental policy matrix retest passes: finance read/write for authorized managers/super admins, viewer/staff finance denial, operational day/proof creation by staff, viewer write denial and constrained viewer list queries. The initial expanded Rules hit Firebase's 1,000-expression budget; centralizing role evaluation fixed the regression and retained the previous sealed-evidence rules/tests. No tests, assertions or security checks were disabled.

Browser tests use explicitly synthetic identities and the production access-service policies; HTTP middleware and real Firestore transactions/Rules are tested separately. They do not sign into a real Google account. Real OAuth/MFA, deployed component compatibility, production revocation timing, physical devices and browser-device encryption are not certified. Existing Phase 1/4/8 real-service/manual acceptance and the independent Google Sheets account error remain open. Preserve the original Phase 0–8 numbering.

Security scan: Semgrep **1.184.0**, pinned community rules `16b9e6d45f10649f6a531ec4838ed9924372c3bc`, **176 rules / 98 production targets**, including all new access-service/model/store/bootstrap/script/frontend API/back-office files. Four pre-existing escaped-HTML warnings remain at two `src/reports.ts` locations; manual review/injection regressions are retained. One pre-existing parser limitation remains in `src/models.ts`. No new auth finding was reported within this scope; this is not a penetration-test or vulnerability-free certification. Gitleaks **8.30.1**, redacted `git --log-opts=--all` scan at `1b4c21d`: **43 commits, zero findings**. The 2026-11-09 dependency audit is historical (runtime zero / development 23 moderate); both lockfiles are unchanged, and no fresh dependency audit is claimed.

`npm run clean` completed. Only the two regenerated Phase 2 screenshots were restored. Source, lockfiles, unknown files, credentials, original business data, local caches and pending original bytes were preserved. No deployment workflow exists under `.github` in this checkout; source push is separate from release.

## Delivery and next-session checkpoint

Implementation source is `1b4c21d`; documentation commits can be located with `git log -1 -- docs/ROADMAP_PROGRESS.md`. Read the actual branch/remote state before continuing. PR description: [AUTH_RBAC_PR.md](AUTH_RBAC_PR.md). Latest push/PR result is recorded in [ROADMAP_PROGRESS.md](ROADMAP_PROGRESS.md).

Source `1b4c21d` and documentation `243990d` were successfully pushed to `origin/feat/google-allowlist-rbac`. `origin/main` remains `b5b046f`. Actual `gh pr create` exited **1** with `Post "https://api.github.com/graphql": Forbidden`; **no PR was created**. Preflight CLI authentication also could not be verified. Git remote access works through the existing environment broker, while API access is blocked. [Open the prepared PR](https://github.com/gitsittikorn/construction-ops/compare/main...feat/google-allowlist-rbac?expand=1) with the title/body/test results in AUTH_RBAC_PR.md, or retry the same command after authorized API access is restored. Do not print/change tokens or publish an environment to bypass this. No force push, main merge or production deployment was performed or authorized by this requirements update.

Next actions after review: separately authorize coordinated release, configure a dedicated test environment/real Google identities, dry-run bootstrap with reviewed founder/member identities, and verify all four roles, real revocation/reconnect and Google services. Keep MFA enforcement off until compatible Firebase MFA enrollment/sign-in is configured and tested. Existing Phase 1/4/8 real-service/manual checks and the independent Sheets-account error remain open; do not rebuild the delivered feature or mark those checks PASS from synthetic evidence.
