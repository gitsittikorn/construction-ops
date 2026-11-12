# Missing master data and canonical local origin — 2026-11-12

Baseline `f39c3ea`, application baseline `75f0a30`; earlier uncommitted connection-review documents preserved. User requested locating imported data, fixing actual sync failure and using only `http://127.0.0.1:5173/` for daily work.

## Actual findings and recovery

Authenticated server reads initially found **0 projects, 0 masters, 3 trips**. Both opened local origins' current account stores and migration backups were empty. The cloud trips referenced absent project/truck/driver/source records, so `mergeCloud` correctly rejected restoration without advancing cursors or replacing local data. No integrity validation was disabled and no trips deleted or parents invented.

Found original data in Chrome `Profile 2`, legacy origin `http://localhost:5173`, database `construction-ops`, store `state`. Original directory: `C:/Users/jane_/AppData/Local/Google/Chrome/User Data/Profile 2/IndexedDB/http_localhost_5173.indexeddb.leveldb`. Finding it on disk does not establish why the selected live storage was empty; no browser deletion/profile migration cause is inferred. Locked quota metadata and original app data were inspected using temporary copies, with external network blocked for the isolated browser. Original auth databases were not queried; original profiles/storage were not cleared.

Original snapshot: **2 projects, 92 masters, 3 trips**. Masters: **66 trucks, 1 driver, 1 source, 1 customer, 8 soil types, 15 tags**. All four missing parent IDs matched exactly; original/current ownership matched through a local comparison without printing UID/email/tokens. The snapshot lacked current master cloud acknowledgements; this must not be described as previously verified cloud storage.

Saved a create-only application-format backup outside Git, preserving historical attachment records:

`C:/Users/jane_/Documents/ConstructionOps-Recovery/2026-11-12/localhost-recovered-1.json`

Never commit or remove this user backup through cleanup. Validated existing `previewLocalRestore`/`applyLocalRestore` on an isolated copy first: **97 added, 3 attachment records added, zero conflicts; 97 pending, zero fabricated acknowledgements**. Applied the same validated missing-only restoration to the same authenticated owner's empty live canonical workspaces. Existing transaction, stale-preview, account-identity and missing-only guards remained active. The temporary local development command used only this fixed backup with exact same-owner/empty-target checks and was removed immediately afterward. Final diagnostics are read-only; no recovery command/backup payload/path is shipped in application source.

Normal sync then uploaded the missing parents and reconciled original trips. Subsequent authenticated server reads confirmed **2 projects, 92 masters, 3 trips**; both responding canonical contexts reported **97 acknowledged, 0 pending, 0 conflicts, 0 failed outbox entries** at approximately 20:54 Asia/Bangkok. These are real Firestore results, separate from emulator tests.

The three historical attachments had **no local original Blobs** in the recovered snapshot. Their Drive IDs are retained and restored records explicitly require Drive re-verification. Private-file access/download and original-byte recovery remain **NOT VERIFIED**; no bytes or Drive acknowledgements were invented.

## Prevention and verification

- `npm.cmd run dev` uses `127.0.0.1:5173` with `--strictPort`, preventing silent fallback to another port/data origin.
- `LocalOriginGate` prevents the business app from mounting on `localhost`. Empty legacy stores redirect to numeric loopback with path/query/hash retained. Existing account records, backups, outbox, attachments or Drive folder mappings show a recovery screen and remain intact.
- Recovery choices expose only the authenticated account's workspaces and unbound local-mode records. Failed inspection blocks automatic navigation and shows retry. Other domains/canonical URLs are unaffected.
- Read-only diagnostics report category and pending/acknowledged counts without raw owner keys or business payloads. Actual cloud reads do not write data or advance cursors.

Targeted command: `npx.cmd vitest run src/test/localOrigin.test.ts src/test/LocalOriginGate.test.tsx src/test/storageDiagnostics.test.ts src/test/cloudSync.test.ts`, **26/26**, exit **0**. Covers orphan cloud trip rejection, original-parent/all-category restoration, unchanged remote trip, idempotency, fresh-device fixtures, canonical/legacy/error cases, account filtering and diagnostic privacy/non-mutation. Initial targeted **7 passed / 1 failed**: jsdom Blob does not retain bytes through fake IndexedDB's native structured clone. Fixture corrected to Node Blob, matching existing backup tests; exact bytes and size remain asserted. Typecheck passed.

Full Windows command on 2026-11-12: `$env:CI = 'true'; $env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'construction-ops-firebase-config'; npm.cmd run check`, **exit 0**. Frontend **392/392** (63 files), backend **20/20**, Node Rules/storage emulator **14/14**, frontend emulator integration **10/10**, browser E2E **73/73** (2.9 minutes), editor tooling **4/4**. Format/lint/typecheck/build/HTTP smoke PASS; 59 existing warnings, zero errors, no skipped/disabled tests. Both new browser origin/backup tests pass. Emulator project `demo-construction-ops`; synthetic tests do not replace the actual Firestore evidence above. Application source unchanged during the full gate; documents added during E2E separately passed formatting.

Actual strict-port negative check: a second `npm.cmd run dev` exited **1** with `Port 5173 is already in use`, as intended; the first review server stayed running without a fallback port. `npm.cmd run clean` **exit 0**, known pre-test Phase 2 screenshots restored. No external backup, legacy database, user file or credentials were removed. Combined temporary gate log: `C:/Users/jane_/AppData/Local/Temp/construction-data-recovery-check-a946936773204d12ac88a7fb254d6e98/check.log`; do not assume it survives later sessions.

## Exact next actions and limits

Use **http://127.0.0.1:5173/** consistently and review restored master categories/Sync. Preserve the external backup and legacy database. Verify the three historical Drive files separately. Original full real-service/manual acceptance remains open and physical Android is deferred/**NOT VERIFIED**. No destructive reset, hard deletion, encryption-key rotation, OAuth revocation, environment publication, source push or deployment was performed. This is a data-repair/prevention milestone, not completion of an original roadmap phase.

Validated local source/documentation commit: **`31dfcaf`**. Final post-clean formatting/whitespace checks exit 0 and review server HTTP 200; repeated real server reads retain the complete 97-record result. Hash checkpoint is documentation only; no additional application changes after the passing full gate.
