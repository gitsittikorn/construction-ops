# Drive backend OAuth client binding — 2026-11-11

Baseline `978a1ae`; initial tracked tree clean. User authorized fixing BUG-021 before continuing Render setup. The user independently selected a newly created dedicated personal client in ignored `.env.local` and reports entering the new pair in Render. Read-only local comparison confirms the supplied ID and inactive optional backend URL. Remote settings are user-reported, not independently verified. No environment file, credential or cloud service was edited by this task.

Task: authentication / cloud data safety; critical risk. Project recommendation: 6 Astra / High / Standard. Work continues with the available model; no model switch is claimed.

## Reproduction and correction

Before-fix `npm.cmd --prefix backend test`: exit **1**, **15 passed / 5 failed** after adding regressions. Valid response attribution/configuration, legacy/other-client rejection, refresh fallback/overwrite protection and provider-attribution enforcement failed. Queued disconnect passed against the baseline. All credentials were synthetic.

New grants live at `_driveCredentials/{uid}/oauthClients/{sha256(clientId)}`. Legacy `_driveCredentials/{uid}` is never read for authorization, overwritten or deleted; other-client children remain separate. This is additive storage requiring fresh consent, not automatic relabeling. No bulk migration, operational namespace/mapping changes or pending-original/IndexedDB deletion.

The configured client is sealed as `oauth_client_id` inside AES-256-GCM; UID authentication, key and format remain unchanged. Session checks binding before cached-token return or provider refresh. Exchange reuses a refresh grant only from a matching current-client record. Misplaced unbound/mismatched child documents are rejected and retained, even if new consent supplies a refresh token. Provider payloads cannot override locally assigned attribution. Valid records retain restart/cached access, omitted-refresh consent, force/expiry renewal and per-user serialization.

Disconnect/invalid-grant removal affects only the current client/UID child. Legacy/other-client originals remain. Google grants are not revoked, and distributed multi-instance races are not addressed by this change.

Backend responses carry public `clientId`. The frontend rejects old/unattributed or mismatched responses with a configuration/deployment message instead of returning their tokens as ready. Existing Google-email/Firebase-account checks and company authorization remain enforced.

## Verification checkpoint

- Backend targeted: `npm.cmd --prefix backend test`, **20/20**, exit **0** after implementation.
- Initial four-suite frontend run: **55 passed / 2 failed**, exit **1**. The two negative tests reused a consumed mock Response on their second request. Corrected the fixture to create one per call without relaxing assertions. Adapter rerun `npx.cmd vitest run src/test/driveBackend.test.ts`: **13/13**, exit **0**.
- `npm.cmd run test:rules`: **14/14 Node emulator tests** (11 existing Rules, 2 Admin SDK credential-store/service integration, 1 credential-namespace Rules denial) and **10/10 frontend emulator integration**, exit **0**. Coverage: legacy retention, failed consent, matching fresh grant/restart/renewal, encrypted binding, copied-client rejection, member isolation, invalidation/disconnect boundaries and browser read/write/list/delete denial. Guarded host `127.0.0.1:9089`, project `demo-construction-ops`; Google provider synthetic.
- Full Windows `npm.cmd run check`: **exit 0**, frontend **383/383** (60 files), backend **20/20**, Node Rules/storage emulator **14/14**, frontend emulator integration **10/10**, Playwright **71/71** (3.6 minutes), tooling **4/4**. Format/lint/typecheck/build/HTTP smoke PASS; 59 existing lint warnings, zero errors, no skipped/disabled tests. No source edits occurred during the full gate. Temporary combined log: `C:/Users/TQM/AppData/Local/Temp/construction-oauth-binding-zMhEvk/check.log`; do not assume it survives later sessions. PowerShell renders native stderr color warnings as NativeCommandError records in the redirected log; actual gate exit is **0** and every test/check passed.
- `npm.cmd run clean`: **exit 0**. Restored only the two pre-test Phase 2 screenshots from temporary copies. Credentials, unknown files, lockfiles, operational data and pending originals were not deleted. Final documentation formatting/whitespace checks and local source commit are recorded in ROADMAP_PROGRESS.md.

## Render continuation after validated source

1. Keep the dedicated personal Web Client ID identical in frontend build variables and Render `GOOGLE_OAUTH_CLIENT_ID`; its matching secret stays server-only. Preserve the existing encryption key, Firebase project/Admin secret file and Firebase's auto-created client/secrets.
2. Verify exact CORS and Google authorized JavaScript origins for actual URLs, API enablement and audience/scopes. Local source supports `X-Company-ID`; deployed revision/real preflight still require checking.
3. After separately authorized source push/backend deployment, confirm the reviewed revision is Live, `/health` responds and actual browser preflight succeeds. Save-only environment changes require deployment. Health does not verify OAuth, Admin credentials or membership.
4. After backend rollout verification, restore the existing commented backend URL in ignored `.env.local` and restart Vite. Sign in with Firebase and authorize Drive freshly with the matching account. Missing refresh consent with no matching grant returns reconnect-required; never borrow legacy credentials or clear storage.
5. Verify actual personal branding, exchange, reload/expiry renewal, private upload/download/restore, pending retry and owner/member restrictions. Verify old-file access independently under the new app's `drive.file` scope; retain denied/missing results, pending bytes and mappings.

Real OAuth/Render/private-file acceptance remains **NOT VERIFIED**; physical Android is deferred. No push, deployment, cloud environment publication, Google authorization/revocation, actual account/file writes or data deletion. Local backend URL remains inactive. This correction does not complete original roadmap real-service acceptance.
