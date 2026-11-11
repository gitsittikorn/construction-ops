# Google Sheets URL and tab discovery — 2026-11-11

Baseline/latest prior checkpoint `7de0e34`; initial working tree clean. The user reports that the supplied link reaches the Sheets-specific `Trucks`/range error after the previous identity fix. This is user-reported progress, not independently verified OAuth acceptance. BUG-019 records the defect: the input supplied the correct spreadsheet ID, while the read adapter hardcoded the tab name and ignored `gid`. The earlier renamed-sheet correction was limited to Excel workbooks.

## Correction

The panel derives both spreadsheet ID and optional query/fragment `gid` from the current input. Read-only requests retrieve tab properties, inspect header rows and read only matching data tables. A1 ranges quote/escape actual titles and respect the current grid dimensions; reads retain the 1,000-row/5 MB limits and cap automatic discovery at 50 tabs. Schema-matching populated tables are selected only when unambiguous. Empty `Trucks` templates and Examples/Instructions/Tags cannot replace the intended populated data. Multiple populated tables require a URL selecting a tab; an invalid/missing selected tab never falls back to another one. No remote sheet, title, permissions or header is changed by import.

The adapter uses Google's documented [spreadsheet and sheet IDs](https://developers.google.com/workspace/sheets/api/guides/concepts) and [batchGet range ordering](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchGet). Header inspection avoids downloading unrelated table contents. Concurrent tab rename/schema changes fail visibly rather than silently changing the selected file. Same-account checks and preview/confirmation remain in place.

The success notice names the actual source tab and count. Selected file/tab preferences are stored in one IndexedDB transaction under existing per-account settings. The old string file-ID key and old reader/load interfaces remain compatible; the additive tab key does not change the database version or operational records. Explicit abort preserves the original preference if either setting write fails. The ordinary pending outbox is used only after the user confirms vehicle import.

## Evidence

- Anonymous read-only export of the exact supplied Google file: **HTTP 401**, no cookies/tokens collected, no contents saved. The real tab title/data and authenticated API result remain **NOT VERIFIED**; no public sharing change is requested.
- Targeted unit suite: **49/49**, four files, exit **0**, before two additional URL-panel assertions. Tests cover Thai/apostrophe titles, explicit gid zero, missing/invalid/conflicting selectors, ambiguity, empty templates, reference exclusion, bad headers/metadata/ranges, size/row limits, HTTP/network errors, account-separated preference compatibility and quota rollback.
- Targeted browser suite: **2/2**, exit **0**, 25 seconds. Isolated synthetic identity/OAuth/provider routes exercise the actual panel, metadata/range adapter, preview, confirmation, pending local storage and preference reload. A different input file ID is asserted in all provider requests. Ambiguity fails, then explicit gid selects one table without merging another. These are simulated providers, not real Google account acceptance.
- An initial typecheck failed on a browser-only absolute dynamic import in the E2E test. Corrected the test's import path variable and retained all assertions; full-gate results follow after execution.

Task category: Sheets integration/data selection; account and pending-data boundaries retained. Project recommendation 6.1 Sol / High / Standard for the scoped implementation; no actual model switch claimed.

## Handoff

Full Windows `npm.cmd run check`, **exit 0**: frontend **378/378** (60 files), backend **15/15**, Rules **11/11**, emulator integration **10/10**, Playwright **71/71** (4.2 minutes), editor tooling **4/4**. Format/lint/typecheck/build/smoke PASS; 59 existing lint warnings/zero errors. No skipped or disabled tests. The full gate includes the corrected E2E import and both added URL-panel assertions.

`npm.cmd run clean` **exit 0**. Restored only the two regenerated Phase 2 screenshots from pre-test copies. Live localhost module responds **200** and contains the updated tab-discovery adapter. The local server is retained. Current code/test/documentation checkpoint is recorded in ROADMAP_PROGRESS.md. No private contents, credentials, environment, dependencies/lockfiles, cloud permissions or real records changed. No push, deployment, real Google write or browser-storage reset. Physical Android/tablet acceptance remains deferred/NOT VERIFIED.
