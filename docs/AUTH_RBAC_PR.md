# Add Google email allowlist and company user management

Existing company access required users to provide a Firebase UID after login and exposed only three roles. Add a trusted Google-email allowlist so a super admin can invite an email before first login, bind its verified UID on the backend, and assign `super_admin`, `admin`, `staff` or read-only `viewer` within the company.

## Result

- Reuse existing Firebase Google Auth, sessions, original company data namespaces and offline queues. No duplicate identity system or database replacement.
- Add a Super Admin back office for invites, role/status changes, search, paging, last-login timestamps and access audit. Backend transactions protect the last enabled UID-bound super admin, reject stale edits and recheck the actor. Live grants/Rules remain authoritative after revocation.
- Enforce viewer restrictions across UI/domain/sync/Rules/backend; preserve staff operational evidence access without finance or closeout privileges. Preserve pending originals on role changes, logout and account switches.
- Expire offline grants after 12 hours, record known denials and revalidate before online sync. Missing production Firebase configuration fails closed; local demos require explicit production opt-in.
- Add dry-run-first Admin SDK bootstrap/migration. The explicit `allowlist-v1` activation preserves legacy company IDs/data and compatibility until an authorized migration. Never remove the policy flag as a blind rollback.

## Verification — source `1b4c21d`, 2026-11-10

Full `npm run check` with the documented cloud runtime settings exited **0**:

| Gate                                                                          | Passed |
| ----------------------------------------------------------------------------- | -----: |
| Frontend                                                                      |    343 |
| Backend                                                                       |     24 |
| Node emulator suite (13 Rules + 2 backend Firestore transaction integrations) |     15 |
| Firestore client integration                                                  |     10 |
| Playwright desktop/tablet/mobile                                              |     73 |
| Editor tooling                                                                |      4 |

Formatting, lint, typecheck, build and HTTP smoke pass; 59 existing lint warnings and zero errors. Supplemental emulator role-matrix retest also passes, including finance/staff/viewer positive and negative paths. Race tests retain at least one working super admin. Existing trips, reports, originals, restore and offline regressions remain enabled.

Semgrep 1.184.0: 176 rules / 98 production targets; four pre-existing reviewed escaped-HTML warnings in reports and one existing parser limitation remain, with no new auth finding. Redacted Gitleaks scan through the implementation commit: 43 commits, zero findings. Lockfiles unchanged; prior dependency audit is not a fresh result. Safe generated-artifact cleanup completed.

## Release and acceptance limits

This PR does **not** authorize merge or deploy. Review [AUTH_RBAC_IMPLEMENTATION.md](AUTH_RBAC_IMPLEMENTATION.md) for coordinated backend/Rules/index/frontend rollout and dry-run bootstrap **before** applying access metadata. No production data, credentials, encryption keys or environment publication were changed. `admins/{companyId}.enabled` remains an organization gate; individual suspension belongs in the allowlist.

Automated identities are synthetic or emulator identities; real Google/OAuth/Drive/Sheets and deployed revocation are not verified. The optional Firebase MFA claim gate is implemented, but complete enrollment/challenge UI and real MFA are not. Keep enforcement off until a compatible flow is configured and accepted. Staff/viewer grants are company/category scoped; individual project-assignment ACLs are outside this change. Original Phase 1/4/8 real-service/manual acceptance remains open; physical Android is deferred. The main build chunk is approximately 503 kB with its existing warning threshold preserved.
