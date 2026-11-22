# Add Google allowlist, TOTP and mobile web readiness

Existing access required a UID after login and offered only three roles. Add trusted Google-email invitations and four company roles, then make the resulting workflows usable on touch screens and deployable at either a root or GitHub Pages project path while preserving business data and pending originals.

## Result

- Reuse Firebase Google Auth, sessions, original company namespaces and queues. Trusted Admin SDK binds a verified first UID; super admins manage invites/role/status/search/paging/timestamps/audit. Transactions reject stale edits and protect the last enabled UID-bound super admin; live grants/Rules reject revoked privileges.
- Enforce company roles `super_admin/admin/staff/viewer` in backend/Rules/domain/sync/UI. Viewer is read-only without finance access; staff retains operational evidence access without finance/closeout. Offline grants expire after 12 hours and revalidate online, preserving previous queues/caches.
- Add verified-Google own-account Firebase TOTP setup and login challenge/retry/cancel. Keys/codes stay ephemeral; identity is checked around async operations. This does not assign roles or replace the allowlist.
- Replace record overlays with native focus-contained dialogs; restore focus/body scrolling, retain drafts through rotation, use 16 px touch inputs/48 px targets and expose logout on small screens.
- Support root and `/construction-ops/` assets/manifest/PWA/offline reports. Scope caches to each path, constrain shell navigation and reject manifest traversal. Add public-config/secret/HTTPS release preflight and a manual-only Pages artifact workflow with contents read permission and no deployment job.
- Preserve opt-in dry-run-first `allowlist-v1` bootstrap and legacy compatibility. No business-data reset, credential rotation or silent migration.

## Verification — source `ef2564b`, 2026-11-10

Full `npm run check` with the documented cloud settings exited **0**:

| Gate                                                                         | Passed |
| ---------------------------------------------------------------------------- | -----: |
| Frontend                                                                     |    355 |
| Backend                                                                      |     24 |
| Release preflight                                                            |      5 |
| Node emulator (13 Rules + 2 real backend Firestore transaction integrations) |     15 |
| Firestore client integration                                                 |     10 |
| Playwright desktop/tablet/mobile                                             |     81 |
| Editor tooling                                                               |      4 |

Formatting/lint/typecheck, root and Pages builds and both HTTP smokes pass; 59 pre-existing warnings/zero errors. No assertions were disabled. Cases retain trips/reports/originals/restore/security behavior, last-super-admin races, invalid/disabled/foreign identities, staff/viewer denials and offline/reconnect boundaries. Touch tests cover 320/390/844/820 px, focus/cancel/rotation/offline save; synthetic TOTP tests cover setup/cancel/incorrect-code retry and completion.

Fresh npm audits: frontend/backend runtime **0/0**; compatible TypeScript ESLint 8.72.1→8.72.2 patch reduces development advisories **31→23 moderate**, zero high/critical. No forced incompatible downgrade. Root lockfile updated; backend lockfile unchanged. Semgrep 1.184.0 / 176 pinned rules / 104 targets reports only four known escaped-HTML warnings and one prior models parser limitation. Redacted Gitleaks non-ignored working snapshot zero findings; history through source: 46 commits, zero findings. Safe generated-artifact cleanup completed.

## Release and acceptance limits

This PR does **not** authorize merge/deploy, production bootstrap, provider/billing/secrets/environment changes. Review AUTH_RBAC_IMPLEMENTATION.md, MOBILE_WEB_READINESS.md and WEB_RELEASE_PREPARATION.md for coordinated backend/Rules/index/client rollout and activation. Existing `admins/{companyId}.enabled` remains the organization gate; individual suspension uses the allowlist. Drive ACLs remain separate.

Real Google/Drive/Sheets/TOTP and deployed revocation/recovery are **NOT VERIFIED**. Firebase Identity Platform/TOTP must be configured and accepted before enabling optional backend `ACCESS_REQUIRE_ADMIN_MFA`; that flag does not independently require MFA for every Firestore/offline read. SMS enrollment/recovery-code/factor-removal UI is not included. Staff/viewer authorization is company/category scoped, not individual project assignments. WebKit installation was attempted but blocked by 403 Domain forbidden; Chromium emulation does not certify Safari/physical iPhone/iPad/keyboard/notch/Home Screen. Original Phase 1/4/8 external/manual acceptance remains open; physical Android is deferred.

Main bundle approximately 509.8 kB retains its normal warning threshold. PWA cache namespaces isolate paths, but IndexedDB/browser security remains origin-based; recommend a dedicated origin for company offline data. The Pages workflow prepares artifacts only and does not publish a URL.
