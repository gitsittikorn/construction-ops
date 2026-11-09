# Firestore company access — reviewed Rules update

Prepared 2026-11-09 (Asia/Bangkok), baseline `5001edd`, application source `ba6ad8c`. No deployment has been performed by the agent. This is a concrete manual publication handoff for the project administrator.

## Confirmed cause

The user supplied their published Rules after showing an enabled owner document in the correct `admins` collection. Those Rules explicitly deny every client read/write of `admins`, so the current frontend's first `getDocFromServer(admins/{ownUid})` is denied even for an enabled owner. The Rules also contain no `companies` permission, so the next company-profile read would independently fail. They omit current project/master/workspace paths and validate only legacy flat trip writes. Adding a single permissive rule for the first read would leave those subsequent failures unresolved.

The exact supplied old Rules are retained as `firestore-before-company-2026-11-09.rules` in this directory. They are an archived operator-supplied snapshot, not an active configuration file or an independently authenticated export. No operational data, private keys, OAuth tokens or encrypted credential values are included. Preserve the old publication in the Firebase Console history as well.

## Publication candidate

Use the repository's existing **root `firestore.rules`**, unchanged from validated source `ba6ad8c`, not the archived file beside this report. Its SHA-256 at review:

```text
3640e5f158da8821b8463dcc815155eac95934d05994a178164effd3649d519e
```

The candidate permits an authenticated user to get their own admin status, without listing admins or writing their own privileges. Enabled owners and enabled company members receive the scoped company/data permissions enforced by the current app; operator financial/closeout restrictions remain server-enforced. Unknown collections, including frontend access to `_driveCredentials`, remain denied. Existing data namespaces and document IDs are retained. Publishing Rules does not itself rewrite documents or move data.

The current client can decode old flat trip documents. The existing emulator regression upgrades a controlled legacy trip only after its baseline matches, retaining its ID; that regression passes with this candidate. This does not certify all existing production records or permit continuing old-client writes under the old flat schema. Use the current reviewed frontend; older clients should not be used to write during the rollout. Do not delete or reset old documents, pending originals or browser storage.

Fresh isolated command on 2026-11-09:

```powershell
$env:CI = 'true'
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'construction-ops-firebase-config'
npm.cmd run test:rules
```

Actual exit **0**, Firestore Rules **10/10**, emulator integration **10/10**, no skipped tests. Checks include self-only admin reads, client privilege-write denial, company roles, namespace isolation, immutable evidence/finance and legacy trip migration. The temporary log is `construction-ops-company-rules-20261109.log`. Earlier same-day full Windows gate on unchanged application source: frontend 314, backend 15, Rules 10, integration 10 and E2E 58 PASS; these are isolated tests, not a production publication or real user acceptance.

## Manual publication and immediate acceptance

1. Confirm the Firebase Console project is `khok-kloi-backhoe-engineering` and the database is `(default)`; keep the existing owner admin document unchanged
2. Open the root `firestore.rules` in the IDE and copy its complete contents. In the Console's **Firestore Database → Rules**, replace the old Rules draft with that exact candidate and review the differences before publication
3. **Publish** is the actual cloud permission-change step, performed only by the authorized project administrator. It does not publish Hosting, backend or indexes; none of those are included in this manual step
4. After publication takes effect, refresh the local app normally, retain the same `127.0.0.1:5173` origin, and retry opening the owner's company with the exact UID shown by the signed-in app
5. Confirm company access and the actual sync outcome. Do not mark pending records synced manually. If denied, retain the current console error and inspect the denied path and published revision; do not broaden access or clear storage

Real member incremental workspace queries also need the reviewed `firestore.indexes.json` composite index. That is a separate publication, not performed here. The existing remote backend has ENV-003 (`X-Company-ID` missing from CORS allowed headers); it also requires a separately authorized reviewed backend update and real retest for complete shared-member Drive acceptance. Neither issue is solved by pretending the owner login gate is the entire phase matrix.

Current status: candidate locally validated and ready for administrator review/publication; actual Rules publication, owner-company retry, Drive consent and real all-phase acceptance remain **NOT VERIFIED**. Any rollback must be deliberately reviewed against client/data versions; an archived old Rules file is not permission to restore it automatically over newer data.
