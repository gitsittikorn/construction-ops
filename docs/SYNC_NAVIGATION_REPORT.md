# Dedicated sync navigation — 2026-11-09

Baseline commit: `5001edd`; implementation before this task: `ba6ad8c`. User request: remove the large sync/security panel from every business page, provide a dedicated menu and show a small red indicator when attention is needed.

## Behavior

- **ซิงก์และสำรองข้อมูล** opens **ความปลอดภัยและซิงก์ข้อมูล**, containing cloud status, pending/conflict counts, retry/restore, backup download, integrity diagnostics and explicit conflict choices.
- Other pages omit the panel. Existing background sync remains in `App`; page navigation does not pause cloud synchronization or change stored records.
- A red dot on the menu indicates cloud failures, queued errors, conflicts or broken references. It has an accessible status label and the menu references its description. Ordinary pending, local-only and offline states do not become cloud errors or verified data.
- Retrying successfully removes the failure indicator when no problems remain. Switching pages preserves cloud errors for inspection. Conflict-resolution errors use the same sync error channel.
- Navigation labels can wrap; the desktop sidebar scrolls on short screens. Narrow layouts keep horizontally scrollable navigation. Daily/survey notices point to the new menu.

## Verification checkpoint

Targeted command `npm.cmd exec vitest -- run src/test/App.syncNavigation.test.tsx src/test/App.auth.test.tsx src/test/CloudSyncPanel.test.tsx`: **14 PASS, exit 0** before the full gate.

Initial full checks exited **1**: first, new Testing Library selectors mistakenly used Playwright's `exact` option and failed typecheck; second, an existing unmount test observed a late prior-test `pull` call before its own deferred callback was installed (`finish is not a function`, 318 PASS / 1 FAIL). Removed unsupported selector options, awaited the preceding account-switch test's completed sync and asserted the current deferred callback exists before unmounting. Assertions remain enabled. The corrected standalone auth suite passed **8/8, exit 0**.

Full gate command on Windows:

```powershell
$env:CI = 'true'
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'construction-ops-firebase-config'
npm.cmd run check
```

Final full gate on **2026-11-09 (Asia/Bangkok), exit 0**: frontend **319/319** (54 files), backend **15/15**, Rules **10/10**, emulator integration **10/10**, browser E2E **61/61** (3.4 minutes), editor/lint tooling **4/4**. Formatting, lint, typecheck, production build and HTTP smoke **PASS**. Lint retains **59 warnings, zero errors**. No tests skipped or disabled. New browser cases pass at **1440×900**, **800×1280** and **390×844**, verifying the red dot, hidden business-page details, preserved errors/pending status and no document overflow. Existing production-offline backup tests still verify pending records and original attachment bytes.

The final gate log is a temporary file `construction-ops-sync-nav-check-20261109.log` under the Windows temporary directory. Two earlier failed attempts were retained there with `attempt1`/`attempt2` suffixes; these files are not assumed to survive a later session. No additional security/dependency scan was performed in this task.

After verification, `npm.cmd run clean` exited **0**, removing only generated test results, TypeScript build metadata and the emulator log. Both generated Phase 2 screenshots were restored from their pre-test copies. `git diff --check` passed. Source, lockfiles, local configuration, user data and pending originals were preserved.

## Boundaries and existing work

Pre-existing modified files: `docs/BUG_TRACKER.md`, `docs/ROADMAP_PROGRESS.md`; pre-existing untracked acceptance/deployment documents remain preserved. Environment files, Firestore Rules, credentials, user browser profiles, IndexedDB and pending originals are unchanged. No dependency changes, push, deployment or environment publication.

All automated cloud identities/responses are isolated fixtures or the Firestore demo emulator. This UI change does not repair the user's cloud records missing project/truck/driver/source references. Real Firebase/Google/Drive recovery is **NOT VERIFIED in this task** and remains a separate acceptance requirement. Physical Android/tablet acceptance remains **deferred / NOT VERIFIED**. Browser viewport simulation does not close hardware acceptance.
