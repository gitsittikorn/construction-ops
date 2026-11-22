# Local and Cloud integration review — 2026-11-22

## Verified baseline and preservation

Task: reconcile both developed histories and the Windows WIP in the existing VS Code checkout, without deploying or changing production data/configuration. Category: architecture/authentication/data integrity; critical risk; project recommendation 6 Astra / High / Standard. No actual model switch was performed.

- Initial checkout: clean `backup/local-review-20261122` at **`14ca9d3`**. Inspected the actual commit, not an assumed successful backup command. Its seven files are ReportsPanel.tsx, SoilPricesPanel.tsx, search-fleet-prices.spec.ts, BUG_TRACKER.md, PHASE_8_FINAL_QA_REPORT.md, ROADMAP_PROGRESS.md and SESSION_REVIEW_2026-11-13.md. The source edits are formatting; the test waits for persistence and preserves original driver/note/pending assertions. All seven are retained.
- Fresh `git fetch origin`: `main` / `origin/main` **`b8452d3`**; remote feature **`31c2f46`**; common ancestor **`b5b046f`**. `git rev-list --left-right --count` confirms 12 main-exclusive / 11 Cloud-feature-exclusive commits. Recency is not a completeness criterion.
- Created **`feat/integrate-local-cloud-20261122`** from the verified backup. Merged `origin/feat/google-allowlist-rbac` with `--no-commit --no-ff`; no worktree, main merge, rebase, reset, force push or deployment. Nineteen conflicted files reviewed by behavior. Existing backup/main/remote feature refs stay intact.

## Reconciliation decisions

| Area                         | Retained behavior / integration                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth / backend              | Windows UID + OAuth-client credential store, sealed client attribution, browser transport/client session isolation; Cloud trusted allowlist service and company-authorized actual caller. Never select the company owner's credentials for a member.                                                                                                                                   |
| Local data                   | Canonical `http://127.0.0.1:5173/`, strict port, LocalOriginGate, guarded legacy recovery, existing namespaces, pending originals and additive IndexedDB stores. No browser data read/reset/cleared.                                                                                                                                                                                   |
| Sheets                       | Windows OpenID/email verification independent of Drive, gid/tab discovery and atomic remembered selection; Cloud stage-specific errors and stale-account/workspace guards, including checks before template writes. Both sides' regressions retained.                                                                                                                                  |
| Permissions / prices / fleet | Cloud four-role policy and viewer guards combined with Windows driver claim transactions and append-only integer-satang soil prices. Extended emulator matrix exercises these features together under allowlist roles.                                                                                                                                                                 |
| Dialog / search              | Windows searchable selectors and full assignment forms inside Cloud native modal/focus restoration. Popup portal targets the enclosing dialog, so it remains in the modal's interactive layer. Existing non-modal pickers still use body.                                                                                                                                              |
| PWA / release                | Cloud pinned installed shell, release-content hashing, scoped cache cleanup, TOTP/mobile and explicit update acceptance. Windows artwork/signature smoke retained. Root build uses `/`; dedicated Pages build uses `/construction-ops/`. Existing Pages deploy workflow now consumes `build:pages` / `dist-pages` so a later authorized release retains its base. No workflow was run. |
| Dependencies / documentation | Retained Cloud TypeScript ESLint 8.72.2 lockfile update; `npm.cmd ci --no-audit --no-fund` exit 0. Preserved both histories' dated reports. Repeated historical BUG-017–020 identifiers refer to different branch findings; use their date/report/source to disambiguate. New integration findings use INT identifiers.                                                                |

## Findings and focused verification

- **INT-001 (Medium, Phase 1/8):** combining the body-level searchable picker with a native modal makes the picker outside the interactive/focus boundary. Attach the portal to its nearest dialog. Added unit regression for selection/focus/Escape without dismissing the dialog; existing real Edge fleet E2E covers pointer search and preservation after reassignment. Existing empty/disabled/error cases retained.
- **INT-003 (Medium, Phase 8 verification):** the first combined gate found an automatically merged test-topology mismatch. Windows subpath tests and readiness probe still referenced port 5175 for `/construction-ops/`; the Cloud server intentionally builds root at 5175 and Pages at 5176. Asset-paths read root branding and offline subpath navigation was outside the root worker's scope. Align the existing Pages fixtures with port 5176 and root readiness with `/`; keep both builds, workers and all offline/pending/original-byte assertions. These are isolated test ports, not a daily-work origin migration.
- Initial targeted frontend run: **82 passed / 2 failed**, exit **1**. The old assertions omitted the new template-operation callback and expected no cache cleanup for a cache now explicitly belonging to the tested subpath. Updated exact callback/owned-cache expectations; explicitly retain sibling/root-cache preservation assertions. Retest **84/84**, exit **0**. Backend **29/29**, exit **0**.
- After modal integration and extra Sheets failure/race tests: targeted SearchableSelect/TruckSheetsPanel/PWA **27/27**, exit **0**. Targeted Edge E2E fleet/pricing + allowlist + touch dialogs **13/13**, exit **0** (35 seconds). Synthetic users/provider responses, not real Google/MFA/device acceptance.
- Initial `npm.cmd run test:rules` exit **1** before tests: cached Java directory exists but its `bin/java.exe` is missing. No claim that historical Java setup still works. Prepared a separate temporary Temurin **21.0.13.1+2 JRE** from the official Adoptium API and verified the archive SHA-256. Retry with process-only JAVA_HOME/PATH: Node emulator **20/20** (15 Rules + 3 OAuth credential/storage + 2 access-service transactions), client integration **11/11**, exit **0**. No production/environment draft changes.
- First full `npm.cmd run check`: **exit 1**. Frontend **446/446** (70 files), backend **29/29**, release **5/5**, Node emulator **20/20**, client integration **11/11**, editor tooling **4/4**, root/Pages build + HTTP smoke, format/lint/typecheck all PASS. Browser E2E **89 passed / 5 failed** (3.9 minutes), all five from INT-003. Changed only the affected fixture URLs/readiness probe; focused retest **5/5**, exit **0** (24.7 seconds). No tests disabled or assertions reduced.
- Node **26.3.1**, npm **11.16.0**, isolated Edge on Windows; install warns that superstatic declares Node 20/22/24 support. Lint retains **61 warnings / zero errors**, normal bundle-size warning retained. No fresh dependency audit/security scanner run is claimed.

## Final integrated gate — PASS

2026-11-22, Windows, **`npm.cmd run check` exit 0** on the final integrated application/test source:

| Stage                              | Actual result                                                 |
| ---------------------------------- | ------------------------------------------------------------- |
| Format / lint / typecheck          | PASS; 61 lint warnings, zero errors                           |
| Frontend Vitest                    | **446/446**, 70 files                                         |
| Backend Node                       | **29/29**                                                     |
| Release preflight / editor tooling | **5/5** / **4/4**                                             |
| Node emulator                      | **20/20**: 15 Rules + 3 OAuth storage + 2 access transactions |
| Client emulator integration        | **11/11**                                                     |
| Root + Pages builds / HTTP smoke   | PASS at `/` and `/construction-ops/`                          |
| Edge browser E2E                   | **94/94**, 3.4 minutes, no failed/skipped/disabled tests      |

Command (process-only runtime settings; no credentials):

```powershell
$env:CI = 'true'
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'construction-ops-firebase-config'
$env:JAVA_HOME = Join-Path $env:TEMP 'construction-ops-review-java-20261122/jdk-21.0.13.1+2-jre'
$env:PATH = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:PATH
npm.cmd run check
```

`npm.cmd run clean` **exit 0**. Restored only the two known Phase 2 screenshots from pre-test copies, with no screenshot diff left. `git diff --check` exit **0**; canonical dev URL returns **200** after cleanup. No user IndexedDB, original bytes, unknown files, source, lockfiles or credentials removed. Hidden strict-port dev process remains for review; logs are in the temporary review directory. Full logs outside Git: `check-first-failed.log` and `check-final.log`; their survival across sessions is not guaranteed.

## Hosting evidence and login boundary

Read-only public GitHub REST checks on 2026-11-22: deploy workflow run **43236056580** succeeded for **`b8452d3`**. Deployment **7739805134**, environment `github-pages`, has a success status with `environment_url` **https://gitsittikorn.github.io/construction-ops/**. The URL returns HTTP **200**, expected app title and `/construction-ops/assets/` modules. This is deployment evidence, not an inference from a sample URL or Firebase authDomain. The unauthenticated `/pages` API returned 404; deployment/status APIs returned 200.

An isolated new Edge context opened that exact hosted page read-only. It displays **โหมดในเครื่อง / พื้นที่ทำงานในเครื่อง** and no Google-login button. The loaded application/auth/store bundles contain no configured Firebase API key or Google client identifier. Therefore **the hosted URL is confirmed, but an operational production company-login URL is NOT VERIFIED**. No login, consent, DEMO creation or cloud mutation was attempted. The user confirmed this is the hosted URL previously tested, but is unsure whether the earlier Google login happened on localhost. This is user-reported historical context, not independent hosted-login acceptance. Continue daily local review at the canonical origin; retain all legacy-origin data. Do not change credentials or publish to fix hosting under integration authorization.

Evidence: [successful workflow](https://github.com/gitsittikorn/construction-ops/actions/runs/43236056580), [deployment status](https://api.github.com/repos/gitsittikorn/construction-ops/deployments/7739805134/statuses).

## Resume / delivery checkpoint

Source merge commit and final documentation commit: to be recorded immediately after this verified source is committed. Modified files are the intentional union of both histories plus the reconciliation and regressions above; inspect both-parent diffs. ReportsPanel.tsx, SoilPricesPanel.tsx, search-fleet-prices.spec.ts and SESSION_REVIEW_2026-11-13.md have no diff from the WIP backup; all dated WIP entries in the other three reports are retained. No unrelated starting work existed; the verified WIP backup is retained.

Delivery: commit the validated merge and an evidence checkpoint, normal push only this feature branch, then compare remote SHA. Baseline screenshots and temporary logs are outside the repository at `$env:TEMP/construction-ops-integration-20261122`. Exact next review actions: compare the feature with main and both parents; review desktop at the canonical origin using the existing account/session; verify actual local Google/Sheets/Drive errors before changing configuration. A hosted company release needs separate authorization, reviewed public configuration and compatible backend/Rules/index/access policy; do not bootstrap, merge main or deploy as part of this source handoff.

Original Phase 1/4/8 real-service/manual acceptance stays PARTIAL. Real Google/Firebase/Drive/Sheets account/renewal/original bytes, MFA enrollment/login/recovery, deployed Rules/backend compatibility, Safari/iPhone and historical Drive originals remain NOT VERIFIED in this task. Physical Android/tablet stays deferred. No production access-policy bootstrap, environment/credential change, data migration/deletion, main merge or deployment is authorized/performed.
