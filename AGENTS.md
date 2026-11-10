# Project workflow

- Respond in Thai. Use English for code, identifiers and filenames.
- Preserve React, TypeScript, Vite, Firebase, Google Drive and IndexedDB architecture.
- Every new feature needs meaningful automated tests for successful operation and errors. Run `npm run check` before reporting completion; report what has not been tested on real services or devices.
- Use `npm.cmd` on Windows if PowerShell blocks npm.ps1.
- Keep UI, domain calculations and persistence separate. Never mark pending local data as verified cloud data.
- No frontend service-account keys, OAuth client secrets, or committed credentials.
- After verification run `npm run clean` for temporary generated artifacts. Do not delete user data, unknown files, credentials, source, lockfiles or IndexedDB to clean up.
- User has authorized project creation, dependency changes and fixes. Do not request conversational approval for routine implementation. Native sandbox permissions still apply.

## Persistent roadmap and session workflow

- Current delivery priority (2026-11-08): desktop web usability and feature review first. The user explicitly deferred physical Android/tablet acceptance. Keep responsive support and record those checks as deferred/NOT VERIFIED; do not use Android acceptance as a blocker for desktop review. Firebase/Google/Drive integration is a separate desktop requirement, not an Android-only concern. Local-only demonstrations must retain pending/unverified status and must not fabricate cloud acknowledgements. Hosting deployment remains separate from source pushes and requires explicit authorization.

- At the start of every session read this file, `README.md`, `QA.md`, `docs/MASTER_ROADMAP.md`, `docs/ROADMAP_PROGRESS.md`, `docs/BUG_TRACKER.md`, and the relevant phase reports. Inspect `git status`, recent history, actual source and package scripts before choosing work. Preserve existing changes and distinguish them from your own.
- Treat `docs/MASTER_ROADMAP.md` as the persistent Phase 0–8 requirements. Check progress against code and current test evidence; never infer completion from old messages or a checklist alone. Do not rebuild working features. Latest explicit user instructions take precedence, including requests to pause.
- Resume the earliest incomplete prerequisite. Validate Phase 2, then proceed immediately to Phase 3 when its gate passes, and continue sequentially through the remaining roadmap without routine confirmation. Fix critical/high defects before dependent work. Never skip or disable tests to advance a phase.
- When a bug is found, record its reproduction, severity, affected phase and regression test in `docs/BUG_TRACKER.md`; fix safely and retest automatically within the authorized scope. Preserve backward compatibility, pending originals, account isolation and real user data. Do not clear IndexedDB or reset production to make tests pass.
- Run the supported unit, integration, typecheck, build and E2E checks for each phase gate. Record command, date, counts and actual exit status. Separate PASS/FAIL/BLOCKED/NOT VERIFIED, emulator/mock results, real cloud results and physical-device results. Never claim credentials, OAuth or Android were tested by synthetic fixtures.
- Update `docs/ROADMAP_PROGRESS.md` and real `docs/PHASE_X_REPORT.md` evidence after each milestone; keep historical results dated. Make a separate local Git commit for each validated completed phase, stage only intended files, and record the commit hash in progress. Partial work may be committed as an explicitly labeled checkpoint. Do not fabricate reports for unexamined phases.
- Before ending a session, approaching a usage/context/tool limit, or encountering a blocker, save a checkpoint: current phase/task, baseline and latest commits, modified files, commands/results, unresolved bugs, external prerequisites and exact next actions. Do not claim a usage limit unless reported by the platform. Resume from this checkpoint after comparing it with Git/source.
- Never delete real data or secrets, disable tests, push or deploy without explicit authorization. Do not change environment drafts or publish environments unless requested. Each cloud task is already isolated; use its existing checkout and do not create a Git worktree unless explicitly requested.
- Cloud validation (when Node/Java/system Chromium are available): `CI=true XDG_CONFIG_HOME=/workspace/.cache/config npm_config_cache=/workspace/.npm-cache FIREBASE_EMULATORS_PATH=/workspace/.cache/firebase/emulators PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run check` from `/workspace/construction-ops`. Inspect runtime paths before reusing this command on other machines. Browser override is optional; omit it to use the repository's default Playwright browser. Do not put credentials in these commands or tracked files.

## Approved extension checkpoint

- Read `docs/APPROVED_EXTENSIONS.md` and `docs/EXTENSIONS_REPORT.md` when continuing the nine user-approved additions. Item 4 scope was answered: multiple Google accounts share company data. Read `docs/COMPANY_ACCESS.md` for the implementation checkpoint and permission matrix; preserve existing namespaces and enforce membership in Firestore/backend. All nine additions have implementation and isolated acceptance evidence (latest source `ba6ad8c`; full gate frontend 314/backend 15/rules 10/integration 10/E2E 58). Read `docs/SECURITY_SCAN_2026-11-09.md` for sealed-evidence generations, company proof identity, report references, GCM tag enforcement and actual scanner scope. Compare with current Git/source before further work; do not repeat completed features. Original roadmap real-service/manual acceptance remains open. Physical Android remains deferred.

## AI model recommendations (project-level)

- Read `docs/MODEL_ROUTING.md` when planning or starting a substantial task. Classify the task and its risk, and recommend an appropriate model/intelligence/speed setting without interrupting authorized implementation.
- These recommendations **do not switch the actual Codex model or UI settings**. Never claim a model switch unless supported by a real routing capability and verified. Continue with the available model when switching is unsupported.
- High-risk earthwork calculations, Google/Firebase/Drive/Sheets sync, account permissions and data migrations require the additional verification in `docs/MODEL_ROUTING.md`; preserve the project’s existing automated gates and evidence requirements.

## Google allowlist and RBAC update — 2026-11-10

- Read `docs/AUTH_RBAC_REQUIREMENTS_2026-11-09.md` and `docs/AUTH_RBAC_IMPLEMENTATION.md` before changing authentication, roles, membership, Rules, offline authorization or bootstrap. These additive requirements preserve Phase 0–8. Latest validated source and delivery state are in `docs/ROADMAP_PROGRESS.md`.
- Reuse Firebase Google Auth and the original company namespaces. Canonical roles are `super_admin/admin/staff/viewer`; existing cache aliases are `owner/manager/operator/viewer`. They grant authority within the selected company only. Viewer must remain read-only in UI, domain, synchronization, Rules and backend; staff has no finance or verification/closeout authority.
- For `allowlist-v1` companies, only the trusted Admin SDK service may mutate allowlists, UID binding, member mirrors, counters and access audit. Require verified Google identity and live enabled grants, serialize last bound super-admin protection, and never trust client/custom-claim role flags. Preserve the organization registration gate and distinguish it from individual account status.
- Offline access requires a previously verified grant no older than 12 hours. Preserve known-revocation markers, account/company/role cache isolation and pending originals. Revalidate before online synchronization; never delete IndexedDB or transfer a previous actor's queue to make role changes pass.
- Bootstrap is dry-run-first and opt-in. Implementation authorization does not authorize production access-metadata migration. Preserve existing company/data IDs, credentials and encryption keys. Read the newer mobile/TOTP checkpoint below before changing MFA; enforcement stays optional pending real provider configuration/acceptance.
- The latest requirements authorize a feature branch and PR with test results. No force push, main merge, production deployment or environment publication without explicit authorization. This supersedes earlier task-specific instructions to push directly to main.

## Novice UX and DEMO checkpoint

- For internal-page UX changes, read `docs/UX_UI_GUIDE.md` and `docs/UX_UI_REPORT.md`. Preserve workflow menu groups, clear Thai labels, keyboard focus, readable form spacing and 48 px daily-work controls. Source `222ab69` passed the complete 2026-11-10 gate: frontend 330/backend 15/Rules 11/integration 10/E2E 67; upstream model-routing documentation was then merged without application changes.
- The overview DEMO action is explicit, owner/manager-only and idempotent. It adds a separate fictitious project through the existing atomic pending-outbox path, retains draft edits and originals, and never invents cloud acknowledgements or verified evidence. Keep the report warning when DEMO is included; do not auto-seed/reset a user's data or repeat this completed implementation.

## Mobile / TOTP / static release preparation — 2026-11-10

- Read `docs/MOBILE_WEB_READINESS.md` and `docs/WEB_RELEASE_PREPARATION.md` before continuing mobile, MFA, PWA or hosting work. Preserve native record-dialog focus/inert background/scroll restoration, 16 px touch input text, 48 px record controls, safe areas, rotation and pending originals. Logout must remain reachable outside desktop-only UI.
- Preserve both root and `/construction-ops/` builds and the extended `npm run check` gates. Base-aware worker/precache/icons and cache namespaces must not intercept API/sibling navigation or remove another path's caches. Browser storage isolation is by origin, not deployment path; do not claim path-scoped PWA caches isolate IndexedDB from sibling sites.
- TOTP setup and challenge UI now exist using Firebase's own MFA SDK, verified Google reauthentication and account guards. Keys/codes are ephemeral; never persist/log them or add public QR services. Real Firebase Identity Platform/TOTP, Safari/WebKit and physical iPhone/iPad acceptance remain unverified. SMS enrollment/recovery-code/self-service factor removal are not implemented. Do not enable `ACCESS_REQUIRE_ADMIN_MFA` before reviewed real enrollment/login/recovery acceptance; its enforcement scope is the access backend, not every Firestore/offline read.
- The Pages workflow is manual artifact preparation only, with contents read permission and no deployment job. Do not add automatic publish/merge or change provider/billing/secret/environment settings under preparation authorization. Source remains on the existing feature branch until approved review.
