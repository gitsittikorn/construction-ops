# Mobile web, TOTP and release preparation — 2026-11-10

User authorized continued work while using an iPhone: mobile/tablet forms, workflow regressions, security review, remaining MFA UI and release preparation without merge/deploy. Validated source **`ef2564b`**; baseline `2c74288`, clean working tree, existing branch `feat/google-allowlist-rbac`. Phase 0–8 numbering and existing business/auth/cache namespaces are preserved.

## Changes and reproduced defects

- **UX-008:** record dialogs used 14 px inputs on a 390 px mobile viewport. Increase mobile/coarse-pointer inputs to 16 px and controls to 48 px; keep browser zoom available. Initial retest found the old `.shell input:not(...)` rule overriding several controls to 44 px minimum/46 px actual height. Correct selector specificity without reducing test thresholds.
- **BUG-017:** the only signed-in logout button was inside `.sidebar-bottom`, which is hidden below 760 px. Move it to the workspace header with an accessible label and 44–48 px target; retain logout/account guards and pending data. Unit coverage uses the existing isolated signed-in auth fixture, not a live Google identity.
- **UX-009:** record overlays did not create a native modal focus boundary. Use native `dialog.showModal()`, inert background, explicit Escape/cancel behavior, preserved body-scroll style and focus restoration. Initial touch test exposed missing focus return during React unmount; explicitly restore the connected invoker. Forms scroll inside the dynamic viewport; sticky headings and safe-area padding keep controls reachable through rotation/keyboard-sized viewports.
- **BUG-018:** absolute asset/manifest/worker URLs assumed hosting at `/`. Build and verify both `/` and `/construction-ops/`; scope PWA start URL/icons/precache/worker accordingly. Cache namespaces include the base path. Root upgrades remove only recognized legacy cache names; subpath workers do not remove sibling/root app caches. Cache version includes shell/worker/public-asset changes as well as bundled asset names. API/sibling navigations and manifest traversal cannot become an offline shell.

No production data/schema/role changes are required to apply these UI/build fixes. The earlier allowlist activation remains explicitly reviewed and opt-in.

## TOTP implementation and limits

Reuse Firebase Google authentication. The Settings page now offers **ยืนยันตัวตน 2 ขั้นตอน** for the signed-in user's own account. It reauthenticates with Google from an explicit button, obtains a Firebase MFA session, creates an ephemeral setup key, and enrolls only after a valid six-digit TOTP assertion. Account identity/verified Google provider are rechecked around asynchronous operations. Setup keys and codes are not written to IndexedDB, local/session storage, logs, company audit or backups; cancel/unmount removes the UI state, and submitted codes clear immediately, including failed attempts.

Login handles `auth/multi-factor-auth-required` with a native modal, offered-factor selection, numeric/one-time-code input, retry and cancellation. Firebase's resolver completes identity verification; the existing CompanyGate/backend/Rules still decide company authorization. Selecting a factor or completing MFA never assigns a company role. In-flight duplicate submissions and stale-account challenges are rejected.

**TOTP is implemented and tested in isolation; real Firebase enrollment/sign-in remains NOT VERIFIED.** This is not SMS enrollment, recovery-code generation or a self-service factor-removal tool. Losing an authenticator requires the organization's reviewed trusted Firebase recovery process. Do not disable a final super admin or reset access grants to recover a factor.

Before enabling production enforcement, follow [WEB_RELEASE_PREPARATION.md](WEB_RELEASE_PREPARATION.md): enable Firebase Authentication with Identity Platform/TOTP, verify real Google popup/authorized origins, enroll working administrators, then sign out/sign in with TOTP and test recovery. Only then consider `ACCESS_REQUIRE_ADMIN_MFA=true`. The backend flag enforces the Firebase MFA claim on super-admin access-service operations; it does not independently add a new MFA requirement to every Firestore rule or existing offline cache. Firebase token/revocation behavior and the 12-hour offline-grant boundary must be accepted explicitly. No provider settings or backend flags were changed in this task.

## Verification

Full documented cloud `npm run check` on this implementation exited **0** on 2026-11-10: frontend **355/355** (61 files), backend **24/24**, release preflight **5/5**, Node emulator suite **15/15** (13 Rules + 2 real backend Firestore transaction integrations), client integration **10/10**, Playwright **81/81** (3.0 minutes), editor tooling **4/4**. Formatting/lint/typecheck, both root and Pages builds, and both HTTP smoke tests pass. Lint retains **59 pre-existing warnings / zero errors**. No tests/assertions were skipped/disabled; production main-chunk warning remains approximately 509.8 kB and was not hidden by changing thresholds.

Focused browser suite: **8/8**, including 320×568, 390×844, 844×390 and 820×1180 touch forms/rotation/cancel/offline save, subpath offline lazy reports, and synthetic TOTP setup/challenge retry/cancel/completion. Browser tests run on system Chromium with mobile/touch emulation. TOTP UI fixtures return explicit synthetic responses; SDK/identity guards and backend claims have separate tests. No real Google identity or provider secret is used.

WebKit installation was actually attempted with Playwright. Both `cdn.playwright.dev` and `playwright.download.prss.microsoft.com` returned **403 Domain forbidden**. No network-policy/environment changes were made. Safari/WebKit, physical iPhone/iPad, real software keyboard/notch and Home Screen installation are **BLOCKED/NOT VERIFIED**; Chromium emulation is not equivalent acceptance. Physical Android remains deferred.

## Security and dependencies

Fresh npm audits: frontend/backend runtime zero findings; development initially **31 moderate**, zero high/critical. Reviewed compatible dry-run, then `npm audit fix --ignore-scripts` without force reduced the development findings to **23 moderate**; TypeScript ESLint packages moved from 8.72.1 to 8.72.2. Remaining advisories include Firebase CLI/ESLint tooling chains; proposed force solutions include incompatible downgrade, so those were not applied. Root lockfile is updated; backend lockfile unchanged. Audit exit 1 denotes the remaining findings, not a clean audit.

Semgrep **1.184.0**, pinned community rules `16b9e6d45f10649f6a531ec4838ed9924372c3bc`, **176 rules / 104 targets** with metrics/version checks disabled. All new MFA/dialog/release-config source files were confirmed scanned. Four existing escaped-HTML findings in `src/reports.ts` and one existing parser limitation in `src/models.ts` remain; no new finding in the added code. No suppressions were added. Gitleaks **8.30.1**, redacted non-ignored working-tree snapshot: zero findings; history through `ef2564b`: **46 commits / zero findings**. Exact Git delivery state is in ROADMAP_PROGRESS.md. This is bounded scanning, not penetration-test certification.

## Handoff

Release preparation includes `build:pages`, `smoke:pages`, a fail-closed `release:check`, and a manual-only artifact workflow with `contents: read` and no deployment job. See [WEB_RELEASE_PREPARATION.md](WEB_RELEASE_PREPARATION.md). Source push does not publish a website. Source `ef2564b` and reports `fc0d34f` were pushed to `origin/feat/google-allowlist-rbac`; main remains `b5b046f`. Actual updated `gh pr create` again exited 1 with `Post "https://api.github.com/graphql": Forbidden`; no PR was created. Prepared compare link/body are in ROADMAP_PROGRESS.md; retry only after supported API access is restored. No main merge, Rules/index/backend/hosting deployment, production bootstrap, MFA provider enablement or environment publication is authorized/performed here.

Existing real Google Sheets account error and Phase 1/4/8 real-service/manual acceptance remain open. Resume from actual Git/test evidence; preserve original pending data and do not rebuild the delivered allowlist, UX or demo features.

`npm run clean` removed only the defined generated test/build-metadata artifacts. Restored two regenerated Phase 2 screenshots; retained source/lockfiles/data/credentials/pending originals. Root and Pages build outputs remain ignored review artifacts. A standalone static screenshot gallery was prepared at `/workspace/artifacts/mobile-review.html`; it contains only synthetic screenshots and is not a deployed interactive app. Temporary scan logs and this local gallery are not assumed to survive another environment/session.

## PWA pending-data upgrade follow-up — 2026-11-10

Resumed from `f074bc0` on the same feature branch. BUG-019 fixed: an active worker now keeps its own cached HTML until the replacement is explicitly activated, avoiding a shell/module release mismatch. Root and Pages Chromium release fixtures exercise failed install, retry and offline activation with pending IndexedDB state/binary originals; archived baseline-worker and fixed-worker paths are separate. See [PWA_UPDATE_VALIDATION.md](PWA_UPDATE_VALIDATION.md) for reproduction, fixture limits and [ROADMAP_PROGRESS.md](ROADMAP_PROGRESS.md) for the final gate/checkpoint. This is local browser lifecycle evidence, not real Firebase/Drive synchronization, MFA or iPhone/Safari/Home Screen acceptance. No deployment/provider/production data changes.
