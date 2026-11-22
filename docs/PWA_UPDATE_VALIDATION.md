# PWA update with pending offline data — 2026-11-10

Baseline **`f074bc0`**, validated source **`8755d76`**, branch **`feat/google-allowlist-rbac`**. Scope: Phase 1/8 PWA release lifecycle and preservation of pending originals. No business schema, authentication, membership, cloud acknowledgement or production change.

## BUG-019 — active worker overwrites its shell with a newer release

**Medium / Phase 8**, also affects Phase 1 offline continuity. Install release A, save offline data, publish release B to a local fixture server, wait for B's worker, then reload before choosing the update button. The network-first navigation handler returns B's HTML and writes it into A's cache. The active worker and cached shell no longer describe the same release. If B's hashed modules are unavailable offline, navigation can fail despite A having been fully precached.

Reproduced before the fix in Chromium at both `/` and `/construction-ops/`: expected shell `old`, received `new` (**0/2 passed**, exit **1**). A focused worker regression also failed (**8 passed / 1 failed**, exit **1**). An earlier browser-fixture attempt failed before this reproduction because it asserted a Projects heading while on Overview; the fixture now navigates to Projects explicitly. No application assertion was removed.

`public/sw.js` now returns its own installed cached shell first. The new worker precaches its release independently and activation still requires the existing explicit update action. Network HTML recovery remains available when the shell is missing; offline absence returns an error. API/sibling navigation and cache cleanup boundaries remain unchanged. The build plugin already hashes worker content, so this change generates a new cache version without manually changing a release constant.

## Browser scenarios and limits

`e2e/pwa-update.spec.ts` runs four isolated local Chromium scenarios: root and Pages paths, each starting from either the archived `f074bc0` worker or the fixed worker. `e2e/fixtures/sw-f074bc0.txt` is byte-identical to `git show f074bc0:public/sw.js` (SHA-256 `93b3edc5bba06c4eefa6a562569f48d3ee5d764014818afd4b87d7d212c4156b`). Only the served version identifier is replaced to distinguish fixture releases.

The shell-only release fixtures share current production JS/CSS bundles and IndexedDB schema, with distinct HTML markers and worker versions. This validates the real browser worker/install/wait/activate/reload lifecycle, not an arbitrary historical application/schema migration. The baseline worker retains its known network-first behavior until replaced; a source patch cannot retroactively change an already installed worker. The fixed-worker scenarios separately require that waiting updates cannot replace the active shell.

Each scenario saves a project through the actual UI while offline, stores a synthetic pending binary original in real IndexedDB, then checks:

- A missing precache asset makes a replacement worker become redundant, without altering saved state or pending original bytes.
- A subsequent valid worker reaches waiting; the page exposes the existing update button.
- Activating through that button while offline reloads the new shell successfully.
- Project state, audit/outbox IDs, revisions and pending statuses remain exactly equal to the pre-update snapshot; original bytes `[0, 255, 13, 10, 128]` and empty Drive ID remain unchanged.
- First offline navigation to the lazy Reports module works; another offline reload preserves the same snapshot and produces no page errors.

No synthetic cloud acknowledgement is used. This test does not exercise a real Google account, online Firebase/Drive sync, MFA, Safari/WebKit, Home Screen installation or physical iPhone/iPad. Those remain **NOT VERIFIED**; physical Android remains deferred. Existing isolated sync/auth/Rules suites remain part of the full gate.

## Verification checkpoint

Focused post-fix worker tests: `npx vitest run src/test/pwa.test.ts`, **9/9**, exit **0**. Initial fixed-worker Chromium pair: **2/2**, exit **0**. Final full documented cloud `npm run check`: exit **0**, frontend **356**, backend **24**, release preflight **5**, Node emulator **15**, client integration **10**, Playwright **85/85** (including all **4/4** new scenarios, 2.9 minutes), tooling **4**. Format/lint/typecheck, root/Pages build and HTTP smoke PASS. Lint: **61 warnings / zero errors** (59 prior + 2 fixture typing warnings); normal bundle-size warning retained. No skipped/disabled tests. `npm run clean` completed and only the two known regenerated Phase 2 screenshots were restored. Delivery/checkpoint: ROADMAP_PROGRESS.md.

The first sandboxed browser run could not bind localhost (`listen EPERM 127.0.0.1:5174`); the same test was retried through the approved executor outside that sandbox. Git fetch likewise needed the approved executor because the sandbox could not reach its inherited proxy. Neither failure established an application defect.
