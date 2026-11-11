# Local branding and truck imports — 2026-11-11

Baseline `f0bb5de`; initial working tree had only the previous localhost session's BUG_TRACKER.md and ROADMAP_PROGRESS.md notes. Current request: restore login artwork/main logo, diagnose Sheets' Drive permission error, and read the supplied Excel workbook. Preserve existing pending records, namespaces, roles and original files. No dependency, environment, credential, Firestore/backend deployment or user-data change is required.

## Findings and corrections

1. The latest Vite change applied the GitHub Pages base to development, but runtime branding and worker URLs still assumed `/`. Development now serves at `/`, preserving the same browser origin/IndexedDB. Production retains `/construction-ops/`. Branding/worker registration use Vite's base. Manifest URLs are relative; the worker/precache use the actual worker scope and a separate cache prefix per base. Cache cleanup preserves other applications. Production smoke checks real image bytes and base-aware asset/manifest/precache URLs. Production PWA E2E now exercises the actual hosted subpath rather than a root-only build.
2. The supplied workbook contains one sheet `รถบรรทุก`, the complete current ten headers and **64** populated rows. The old reader always requested `Trucks`, masking a missing-sheet exception as a generic Excel failure. The reader still prioritizes `Trucks`; without it, exactly one table with all required headers can be selected. Reserved example/reference sheets are excluded and ambiguity is rejected. Existing archive/size limits, leading-zero handling, row validation, duplicate review, preview/confirmation and atomic pending storage stay in place.
3. The exact reported Drive message originates from the `/drive/v3/about` preflight in Sheets import. A Drive 403 does not establish that the Sheets API rejected the sheet, and the remote reason has not been independently verified. Sheets now requests its read or write scope plus OpenID/email, verifies the returned verified email against the signed-in account using Google's [UserInfo endpoint](https://developers.google.com/identity/openid-connect/reference), then calls Sheets directly. No Drive API call or Drive grant is required for this operation. The existing Drive upload/backend flow remains supported. Incomplete consent, account mismatch, changed account, HTTP failures and malformed identity stop before forwarding rows. The Sheets token is transient and is not saved into the Drive session or backend.

Task classification: integration/authentication bug fixes, critical account-isolation verification; project recommendation 6 Astra / High / Standard. No model switch is claimed.

## Actual file acceptance

Read the original workbook without modifying it or committing private contents. A Vite SSR diagnostic of the real parser returned **64 rows / zero row errors**. An isolated headless Edge context, with Firebase/Google/backend configuration blank only in that test-server process, selected the actual supplied file. The preview displayed **เพิ่ม 64 · อัปเดต 0 · ข้าม 0 · ผิดพลาด 0**, rendered 64 rows and enabled confirmation. Confirmation was **not clicked**. No real workspace/browser profile or cloud records were accessed. The isolated browser/server were closed afterward.

The live local page, original logo and login artwork each returned **HTTP 200**. Existing login artwork bytes are reused; no replacement image was generated.

## Validation and limits

Initial targeted unit run: **54/54**, six files, exit **0**. Typecheck exited **0**. Additional consent/account-change/branding regressions were then added and included in the full gate.

Final Windows command `npm.cmd run check`, **exit 0**: frontend **354/354** (59 files), backend **15/15**, Rules **11/11**, emulator integration **10/10**, Playwright **69/69** (4.4 minutes), editor tooling **4/4**. Format/lint/typecheck/build/HTTP smoke PASS; 59 lint warnings and zero errors. No tests skipped or disabled. Browser coverage includes actual built subpath image decoding, worker install, offline images/reload and pending originals, renamed-sheet import/confirmation/reload and ambiguity/corrupt-file rejection. Google/Firebase identities/provider responses in automated tests remain simulated or emulator based.

`npm.cmd run clean` exited **0**. Restored the two pre-existing Phase 2 screenshots from pre-test copies; no screenshot or private workbook changes are intended. Localhost remains running. Final documentation formatting/whitespace checks and source commit/checkpoint are recorded in ROADMAP_PROGRESS.md.

Real Google OAuth consent, current Cloud API configuration, real Sheets contents/access and real Drive/Firebase services remain **NOT VERIFIED**. The supplied error confirms the stage/message, not the remote 403 cause. The user must retry Sheets with their actual signed-in account after refresh; a subsequent Sheets-specific API/permission failure remains visible rather than being concealed. Physical Android/tablet acceptance remains deferred/NOT VERIFIED. No push or deployment is authorized by this fix task.
