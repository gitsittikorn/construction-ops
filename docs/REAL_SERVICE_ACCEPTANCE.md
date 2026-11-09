# Real-service acceptance — desktop Phase 0–8

Prepared 2026-11-09 (Asia/Bangkok), source `ba6ad8c`, checkout baseline `5001edd`. The user requested all-phase testing with real Firebase and Google Drive. This document records prerequisites and actual evidence separately; preparing the checklist is not a passing real-service test. Physical Android acceptance remains deferred by the earlier explicit instruction.

## Initial connection checkpoint (before configuration)

- **WAITING FOR CONFIGURATION:** `.env.local` and `backend/.env.local` were absent at inspection. No relevant VITE/Firebase/OAuth/backend settings were present in the shell. Firebase CLI has no signed-in account; Google application-default credentials were not found at the standard Windows path
- Created an ignored `.env.local` from `.env.example`, without inventing configuration or credentials. Existing local browser data and pending originals remain intact
- The project named in `backend/README.md` is `khok-kloi-backhoe-engineering`. The actual target project and test account/company await the user's answer; no authenticated cloud requests or test-data writes have been made
- Read-only HTTP probes of `https://khok-kloi-backhoe-engineering.web.app/` and `/__/firebase/init.json` returned **404**. This means public Hosting configuration could not be retrieved at those URLs; it does not establish whether Firebase Auth/Firestore exist. Hosting deployment is not required to test the local frontend against real Firebase
- Desktop app remains available at **http://127.0.0.1:5173/** in local mode until valid configuration and user login are supplied. Local records are not silently transferred to a Google account or marked cloud-verified
- The earlier same-day full Windows automated gate passed: frontend 314, backend 15, Rules 10, emulator integration 10, E2E 58; see ROADMAP_PROGRESS.md. That run used isolated fixtures/emulator and is not real-service evidence

## Supply the existing configuration securely

Use the intended Firebase project's **Project settings → Your apps → Web app → SDK setup and configuration**. Copy these public browser values into `.env.local`:

| Environment key             | Existing configuration value |
| --------------------------- | ---------------------------- |
| `VITE_FIREBASE_API_KEY`     | `apiKey`                     |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain`                 |
| `VITE_FIREBASE_PROJECT_ID`  | `projectId`                  |
| `VITE_FIREBASE_APP_ID`      | `appId`                      |
| `VITE_GOOGLE_CLIENT_ID`     | Google OAuth Web client ID   |
| `VITE_DRIVE_BACKEND_URL`    | Existing backend base URL    |

An existing environment-file path is sufficient; credentials need not be pasted into chat. Keep OAuth client secrets, service-account private keys and the token-encryption key on the backend only. Preserve the existing encryption key when an existing encrypted credential store is used.

The existing frontend supports direct Google Drive authorization when a backend URL is absent. That can exercise real Drive uploads/downloads, but cannot establish backend refresh-token persistence/renewal acceptance. Complete backend acceptance needs either the actual existing backend URL or the valid existing server configuration in `backend/.env.local` plus backend-only application credentials. Do not guess a Render subdomain, generate replacement keys or downgrade to direct OAuth and claim backend acceptance.

Before signing in, verify Google provider and the correct authorized domains in Firebase Auth, a Firestore database, Google Drive API and the OAuth consent/test-user configuration in the selected project. Register the exact browser origin in the OAuth Web client and the backend's CORS configuration. Keep the existing `127.0.0.1:5173` origin where supported; switching between `localhost` and `127.0.0.1` changes browser storage. Do not clear storage to address origin/configuration errors.

The user completes Google login and consent in the browser. Use an already enabled owner or a correctly admitted member; do not grant frontend self-admin privileges. Inspect existing deployed Rules/index/backend compatibility before writing shared-company/finance/evidence records. A required Rules/index/backend deployment must be prepared for review and explicitly authorized separately; connecting to an existing service is not permission to publish code or replace access rules.

References: [Firebase web setup](https://firebase.google.com/docs/web/setup), [Google OAuth Web client setup and authorized origins](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid), backend/README.md and COMPANY_ACCESS.md.

## Controlled desktop scenario

Use a confirmed test account/company and new names prefixed `QA-REAL-20261109-<run-id>`. Do not modify existing operational projects, trips, evidence or membership to manufacture failures. Keep test fixtures after the run unless cleanup is separately requested. Denied/revoked permission scenarios must use test accounts and test-owned records.

Suggested independent numeric oracle: truck A records three trips at 12 m³, truck B records two trips at 20 m³. Expected total is **5 trips, 76 m³**. A saved-capacity correction from 12 to 20 m³ for one A trip changes volume to **84 m³** while retaining five trips and an audit reason. Copying the next day produces zero trips without proof/signatures from the source day. Record the exact state used before each signature/report assertion.

For a five-trip finance fixture with explicit eligible rates, revenue 100 baht/trip, truck cost 50 baht/trip, driver cost 20 baht/trip and fuel expense 30 baht yield known revenue **500**, truck **250**, driver **100**, expense **30** and provisional margin **120 baht**. Missing prices must remain unknown. This is a calculation check, not a payment or profit certification.

Use controlled nonsensitive image/PDF originals and compute SHA-256 before upload. Download via a second fresh browser context after independently signing in and compare exact bytes/hash. Do not copy tokens between contexts. Keep pending originals until the actual upload and Firestore metadata acknowledgements complete. Network interruption must affect only the test context, not the whole workstation or other applications.

## Phase matrix and evidence to collect

All real-service entries below are **NOT VERIFIED** until the named scenario actually runs with real accounts. Existing unit/emulator/browser acceptance remains recorded separately.

| Phase | Real desktop acceptance                                                                                                                                            | Current result |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| 0     | Record target project, authorized origin, selected company/roles, source/build and actual backend health; inspect deployed compatibility without changing services | NOT VERIFIED   |
| 1     | Real Google login; offline save/reload/reconnect; acknowledged sync; idempotent retry; two-context restore/conflict; expired-auth pending preservation             | NOT VERIFIED   |
| 2     | Multiple trucks, saved capacities, rapid-tap prevention, reasoned corrections, Bangkok date and next-day copy; verify actual restored cloud totals                 | NOT VERIFIED   |
| 3     | Original photo/slip and nonblank signature; exact totals/version binding; interrupted upload/retry; change invalidation; metadata acknowledgement before closure   | NOT VERIFIED   |
| 4     | Real OAuth, private folders/permissions, stable file IDs, read-only audit, independently restored byte-identical originals and offline preview                     | NOT VERIFIED   |
| 5     | MATCHED/MISMATCHED; reason/audit; verify/close/reopen/new proof/reclose; immutable previous closure; server permission denials on test-owned data                  | NOT VERIFIED   |
| 6     | Daily/week/month filtered totals; known versus verified/pending; CSV/XLSX metadata/references; Thai desktop PDF and actual download/readback                       | NOT VERIFIED   |
| 7     | Known BM/grid/grade numeric fixtures, CSV/XLSX preview/roundtrip, Y-up/contour assumptions and survey-history cloud restore; field measurements remain separate    | NOT VERIFIED   |
| 8     | Production-build offline/update/quota/backup recovery, manual keyboard/accessibility, actual OAuth renewal/revocation/backend and cross-account/company isolation  | NOT VERIFIED   |

For every execution record local date/time, case, source, browser/context, test-owned record IDs, expected/actual result and sanitized errors. Use **PASS**, **FAIL**, **BLOCKED** and **NOT VERIFIED** precisely. Do not put tokens, authorization codes, private keys, personal images or full account data in tracked reports. Save only the minimum references needed to reproduce the test.

Multi-account/company role cases require authorized owner/manager/operator test identities and appropriate real Drive folder sharing. Real OAuth expiry/revocation may require another interactive consent cycle; an in-memory mock, changing the clock or overriding a status in DevTools cannot close those acceptance cases. Original snapshots/files remain retained when proof is invalidated or days reopen.

## Actual public-service preflight — 2026-11-09

The user populated `.env.local` and requested a connection check. All five required frontend/Firebase/OAuth fields plus the backend URL are present and have plausible formats. The file remains ignored and its values were not copied into reports. The configured Firebase project is the documented project. No configuration value, service credential, token or authorization code was changed.

| Check                                              | Actual result                                                                                                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Firebase public Identity Toolkit configuration GET | **PASS**, HTTP 200; returned numeric project identity matches the Firebase app's project number. Both `127.0.0.1` and `localhost` are authorized domains                                         |
| Firebase Auth handler                              | **PASS**, HTTP 200 with Firebase authentication HTML                                                                                                                                             |
| Optional hosted SDK configuration                  | HTTP **404**; cannot independently compare all SDK fields through Hosting. This does not prevent the Auth handler or local frontend from responding                                              |
| Existing backend `/health`                         | **PASS**, HTTP 200 with `ok: true` and the expected `construction-ops-backend` service name. This is process availability, not proof of Firebase credential validity or OAuth token exchange     |
| Owner-request CORS preflight                       | **PASS**, HTTP 204, exact current origin, POST and all requested owner headers allowed                                                                                                           |
| Shared-company CORS preflight                      | **FAIL**, HTTP 204 but `Access-Control-Allow-Headers` omits `X-Company-ID`; browsers cannot issue the shared-member request. Recorded as ENV-003 in BUG_TRACKER.md                               |
| Fresh Edge context at port 5173                    | **PASS**, real Firebase/Drive/backend settings loaded, Google login button visible, no local-mode banner and zero page errors. The test context is not signed in; no user session was fabricated |
| Read-only diagnostic request to existing tabs      | No connected tabs responded during the observation window. Existing user login, role, Drive connection and cloud synchronization cannot be inferred from that result                             |

The public Identity Toolkit endpoint returns its project identity numerically here; comparing it to the human-readable project ID would give a misleading mismatch. Its numeric identity matches `VITE_FIREBASE_APP_ID`. The supplied Google OAuth client has a different project-number prefix. That observation alone does not establish that the client is invalid; its actual consent configuration and pairing with the existing backend client/secret remain **NOT VERIFIED** until real authorization succeeds. No client ID was silently replaced.

Current local backend source already includes `X-Company-ID` in the CORS header list. The remote response differs; the exact remote revision/configuration is unknown. No source change or deployment was performed to hide the mismatch. A reviewed, explicitly authorized backend rollout may be needed for full shared-company acceptance. Owner-origin CORS passed independently; actual owner Firebase authorization and Drive exchange still require interactive login.

The preflight performed real read-only HTTP GET/OPTIONS requests and rendered the actual configured app. It did not authenticate as a user, read/write Firestore operational data, create Drive files, grant roles or complete a phase. Login, membership, actual sync, token exchange/renewal, private upload/restore and all remaining real-service cases remain **NOT VERIFIED**. Earlier automated gate results apply to unchanged application source and are separate from this evidence.

## Interactive login report — 2026-11-09

The user reports a successful real Google login followed by the company-selection screen displaying their own Firebase identity and the generic Firestore permission message. **Google login: PASS (user-reported browser evidence)**; the agent has not inspected tokens or independently authenticated as that user. **Company access: BLOCKED pending permission/bootstrap diagnosis**. This is not evidence that Drive consent, Firestore sync or the remaining phase matrix passed.

Source `resolveCompany` first checks `admins/{ownUid}` when selecting one's own company. An absent/disabled owner record produces the same generic permission message as an actual Firestore denial. An enabled owner then reads `companies/{ownUid}`; older deployed Rules without company access can deny that read even when the admin record is valid. The current deployed Rules and actual admin document have not been inspected, so neither cause is confirmed. A member instead requires an existing owner's company code and enabled membership; entering their own UID does not create membership.

For the intended first owner, the project administrator must inspect the existing `admins/{ownerUid}` document in Firebase Console and, if appropriate, create or update only boolean `enabled: true`, preserving existing fields/data. The frontend intentionally cannot grant this permission. If that record already exists and is enabled, compare deployed Rules with the reviewed repository Rules before any separately authorized rollout. Do not add global public read/write rules or automatically promote a member to owner. Owner identity is the existing namespace identity; replacing it with another UID does not migrate data.

No owner/member permission, Rules, credential or operational data was changed during this diagnosis. The user-facing explanation provides distinct owner/member instructions; the exact next step depends on the intended role and the administrator's inspection.

Screenshot follow-up: the user's Firestore screenshot is open at `_driveCredentials/{ownUid}` and shows an `enabled: true` field there. This is the encrypted Drive credential document, not the `admins/{ownUid}` owner authorization record read by the app. The screenshot shows that an `admins` collection exists, but does not show its document contents; owner enablement is therefore still unconfirmed. Direct the user to select `admins`, copy the exact UID from the signed-in app, and inspect/create that matching document with boolean `enabled: true` only for the intended owner. Preserve the existing credential document and all encrypted fields. Do not reproduce ciphertext, IVs, tags or personal identifiers in this report. If the correct admin document is already enabled and access still fails, inspect deployed company Rules next; do not assume this screenshot proves the only cause.

## Enabled owner confirmed; supplied Rules identify the blocker — 2026-11-09

The next screenshot shows the matching owner document under `admins` with boolean `enabled: true`. The user then supplied the published Rules text: it explicitly denies all client reads of `admins`, has no company permission and supports only the older flat-trip operational path. This explains the current owner access failure without changing the admin record again. Recorded as ENV-004 in BUG_TRACKER.md. The text is user-supplied Console evidence; no authenticated Rules export was independently performed.

Prepared `docs/deployment/FIRESTORE_COMPANY_UPDATE_2026-11-09.md` and an archived copy of the supplied old Rules. The unchanged current root `firestore.rules` is the reviewed publication candidate. Fresh isolated `npm.cmd run test:rules` exited **0**, Rules **10/10** and emulator integration **10/10**, including self-admin-read/privilege-denial, company access and legacy trip migration. Production Rules publication and the user's retry are not yet verified. No frontend fallback was added to conceal a server denial, and no cloud access policy was changed by the agent.

## Exact next actions

1. Administrator reviews and publishes the exact current root `firestore.rules` following the concrete deployment handoff, then retries the owner's company access without changing the already enabled admin record or clearing storage
2. Once company access succeeds, user opens Settings and completes Drive consent; read actual errors/role/pending counts without collecting tokens and verify OAuth client/backend pairing without granting frontend self-admin rights
3. Resolve ENV-003 through a concrete reviewed backend configuration/artifact and separately authorized rollout before claiming shared-member/backend acceptance; repeat the real preflight afterward
4. Run the phase matrix in order on the controlled fixture, preserving failures and originals; fix application defects with meaningful regressions, rerun the full automated gate after changes, then perform affected real-service retests
5. Record results in this file, relevant phase reports and ROADMAP_PROGRESS.md. Leave real-service/device acceptance open wherever it did not run; keep Android deferred, and keep deployment authorization separate
