# Localhost and Render connection review — 2026-11-12

User request: check the supplied local configuration and whether to test on localhost first. Baseline/latest existing commit `f39c3ea`, application correction `75f0a30`; initial working tree clean. This is connection evidence, not completion of outstanding real-service phase acceptance.

## Configuration and browser

- Vite's effective development configuration contains all six expected frontend fields from ignored `.env.local`. The filename is correct; there is no `local.env`. No secret/private-key configuration name was found among the effective `VITE_*` names inspected; this is not a repository-wide secret scan.
- The frontend points to `https://construction-ops-backend.onrender.com`. Its OAuth client ID and Firebase project match the corresponding values in ignored `backend/.env.local`. This local comparison cannot establish Render's effective environment or the validity of its client secret.
- Local backend configuration has the client pair, Firebase project and encryption key present, but no effective `CORS_ORIGINS` or `GOOGLE_APPLICATION_CREDENTIALS`. A separate local backend requires those prerequisites. They are not required by the local frontend when calling Render; Render has separate runtime configuration.
- Started `npm.cmd run dev -- --port 5173 --strictPort`. At `http://127.0.0.1:5173/`, an independent fresh headless Edge context received HTTP **200**, displayed Google login and reported **zero page errors**. Live modules reported Firebase configured and backend configured. That isolated context was not signed in; the user's browser session was not inspected or reset.
- Both environment files remain Git-ignored. No environment, secret, application source, dependency, lockfile, permission or user data was changed.

## Read-only real-service probes

| Probe                                             | Actual result                                                                                      | Boundary                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Render `GET /health`                              | **PASS**, HTTP **200**, expected service JSON; first request approximately 22.4 seconds            | Process reachability only; no deployed revision/OAuth/Admin verification |
| Session preflight, origin `http://127.0.0.1:5173` | **PASS**, HTTP **204**, exact origin, POST and all four requested headers including `X-Company-ID` | Actual member authorization not exercised                                |
| Same preflight, origin `http://localhost:5173`    | **PASS**, HTTP **204**, required origin/method/headers                                             | Hostnames still have separate browser storage                            |
| Session without Firebase bearer                   | **PASS** negative check, HTTP **401**, `unauthorized`                                              | No user token or Google grant supplied                                   |
| Preflight from `https://untrusted.invalid`        | **PASS** negative check, HTTP **403**, `origin_denied`, no allowed-origin header                   | No policy relaxation                                                     |
| Firebase Auth public project configuration        | **PASS**, HTTP **200**, numeric identity matches Firebase app ID; both local hostnames authorized  | Not authenticated Firestore access                                       |
| Firebase Auth handler                             | **PASS**, HTTP **200**                                                                             | No interactive login/consent submitted                                   |

The Auth API returns a numeric `projectId`. An initial comparison with the textual Firebase slug was false; comparing with the configured app ID's project-number component passed. This was a diagnostic comparison issue, not a confirmed configuration defect.

ENV-003's missing CORS header is no longer reproduced on the configured remote service. This resolves that transport symptom only; health/preflight cannot establish an exact deployed revision or BUG-021 rollout.

## Automated verification

Full Windows `npm.cmd run check`, **exit 0** on 2026-11-12: frontend **383/383** (60 files), backend **20/20**, Node Rules/storage emulator **14/14**, frontend emulator integration **10/10**, browser E2E **71/71** (3.7 minutes), editor tooling **4/4**. Format/lint/typecheck/build/HTTP smoke **PASS**; 59 existing lint warnings, zero errors, no skipped/disabled tests. Application source remained unchanged during the gate; these review documents were added while E2E was running and separately passed full-tree formatting afterward.

```powershell
$env:CI = 'true'
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'construction-ops-firebase-config'
npm.cmd run check
```

The Rules runner selected its existing temporary Java 21 runtime; Java is not on the shell PATH. Emulator project: `demo-construction-ops`. Browser E2E uses isolated ports 5174/5175 and synthetic/local configuration. These checks cannot establish real consent, deployed Rules, remote Admin credentials, files or memberships. Temporary combined log: `C:/Users/jane_/AppData/Local/Temp/construction-connection-check-c63d2f94c9494ca69d3e5b19fb0f8dbf/check.log`; do not assume it survives another session.

`npm.cmd run clean`, **exit 0**, removed generated test results, TypeScript metadata and emulator log. Restored only the two known Phase 2 screenshots from pre-test temporary copies. No unknown files, credentials, user storage, original attachments or lockfiles were removed. The review server remains running on port 5173; final HTTP/format/whitespace checks are recorded in ROADMAP_PROGRESS.md.

## Remaining acceptance and exact next actions

1. Review desktop workflows at `http://127.0.0.1:5173/`, using the same origin consistently. The configured local frontend calls real Firebase/Google/Render services; a local backend process is unnecessary for this setup.
2. Sign in with the intended Firebase account and select its company. Actual current Rules/membership access is **NOT VERIFIED** by unauthenticated probes; historical permission reports do not establish today's remote state.
3. Connect Drive freshly with the same Google account. Check actual consent branding and authenticated exchange. The current frontend rejects missing/mismatched backend `clientId`; inspect the deployed revision and client pairing if that occurs. Do not reuse another application's grants.
4. Verify reload/renewal, then upload/download a controlled test file and check original bytes plus acknowledged metadata. Verify clean-profile restore and owner/member restrictions separately. Preserve pending originals and historical mappings on failure. Real Drive/Sheets consent, token refresh, private-file access and authenticated Firestore operations remain **NOT VERIFIED** in this review.
5. Physical Android/tablet acceptance remains deferred/**NOT VERIFIED**. Hosting deployment and remote environment publication remain separate authorized actions.

No phase completed; no commit, push or deployment performed. Documentation changes and cleanup are recorded in ROADMAP_PROGRESS.md.
