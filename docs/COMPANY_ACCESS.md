# Shared company access — validated implementation

2026-11-08. User answered the scope question: **multiple Google accounts share the same company dataset**. Existing extensions source `246a174`, documentation `ef7d344`; complete isolated gate 294 frontend / 11 backend / 8 rules / 9 integration / 55 E2E remains the validated baseline.

Validated 2026-11-09 (Asia/Bangkok), source `7fae411`: implementation and isolated automated acceptance are complete. Production Google/Firebase/Drive and physical-device acceptance remain separate and NOT VERIFIED.

## Intended permission matrix

| Capability                                               | Owner    | Manager  | Operator  |
| -------------------------------------------------------- | -------- | -------- | --------- |
| Shared project/master/trip/daily/evidence/report reading | Yes      | Yes      | Yes       |
| Finance reading, rates and expenses                      | Yes      | Yes      | No        |
| Project/master/survey management                         | Yes      | Yes      | Read only |
| Trip entry, open/reopened daily entry and evidence       | Yes      | Yes      | Yes       |
| Verify, close, reopen, business soft deletion            | Yes      | Yes      | No        |
| Company profile and member roles/enable/disable          | Yes      | No       | No        |
| Own Google Drive credentials                             | Own only | Own only | Own only  |

The initial company ID is the existing enabled owner's Firebase UID. Shared operational data stays in `users/{companyId}`; no automatic copy, rename or deletion of existing namespaces. Company metadata and memberships use `companies/{companyId}` and `members/{actorUid}`. Bootstrap requires an existing enabled admin; no client self-admin signup. Owner membership is implicit and cannot be disabled through the member UI.

Local state/settings/Drive sessions are partitioned by actor, company and role. Legacy owner/company identity keeps its existing cache. Shared-member uploads use an additive compound-key store to prevent two member caches with the same cloud operation ID from overwriting each other's pending originals. IndexedDB upgrade preserves the existing uploads store and all original data.

Cloud paths use company ID; authorization and audit actors use the actual authenticated UID. Operator workspace queries exclude financial records because Firestore Rules do not filter query results. Server Rules independently enforce membership and writes even if UI is bypassed. A role change invalidates/reloads the workspace and selects a different local cache; old pending data is preserved.

Drive credentials remain encrypted per actual Google UID. Membership may authorize use of one's own Drive backend session, but does not grant another member's tokens. Company Drive folders must be shared with the actual participating Google accounts; production OAuth/Drive acceptance is separate and unverified. No automatic external invitations/messages or Google permission grants.

## Completed implementation steps

1. Scope/actor/cache helpers and additive upload partitioning; prove same-ID originals survive in separate member caches
2. Company metadata/membership Firestore Rules, scope selection and live membership check; owner member-management UI
3. Route shared Firestore paths, actual actor auditing, operator query/write restrictions and role-aware UI
4. Backend company-membership verification while keeping credentials per actual UID; tests for forged/disabled/foreign memberships
5. Multi-account emulator, browser and regression gate; update all checkpoints with actual results. No deployment/environment publication

## Implemented scope and targeted evidence

The scope above is committed in `7fae411`. The complete gate passed after Workspace recovery on 2026-11-09; the earlier milestone counts describe the preceding extension commit only.

- Company selection verifies server membership; owner/member listeners handle role changes, disablement and company-name updates. Scope callbacks stop on unmount/switch and cannot revive a revoked scope through an interleaved name update
- The company name/profile and member add/change/enable/disable controls live under **การตั้งค่า → บริษัทและสิทธิ์สมาชิก**, for the owner only. Member changes append an owner-readable company audit event. Member UIDs are copied from the authenticated selection screen; no external invitations are sent
- Existing operational namespaces remain at `users/{ownerUid}`. Shared members query those same documents. Financial workspace queries are filtered for operators, with a deployable composite index in firestore.indexes.json. Server Rules reject finance reads/writes, member escalation, sealed-day writes, verification and root-folder management by operators
- Actor/company/role local cache keys keep legacy owner keys unchanged. IndexedDB version 3 adds `scopedUploads` with compound `[owner,id]` keys; the legacy store is untouched. Upgrade and same-ID two-member tests preserve original bytes and separate account-scoped backups
- Backend authorization reads current company ownership/membership before issuing the actual caller's own Drive session. It never uses the company owner's credential key for a member. A selected-company change while awaiting an ID token cancels a backend mutation
- Targeted Rules 9/9 and Firestore integration 10/10 pass, including shared project visibility, manager finance, operator exclusion, forged client roles, membership downgrade, preserved old caches and disabled-member pending queues
- Three role-UI browser simulations pass at desktop/tablet/mobile sizes. These use a synthetic local harness; no real Google identity is claimed. Separate emulator identities exercise real server Rules. Existing isolated frontend/backend gates remain required

## Owner and member workflow

1. Deploy the reviewed web client, Firestore Rules/index and backend together through a separately authorized rollout. Existing app/OAuth/Drive configuration and an enabled original owner are prerequisites
2. Owner opens **การตั้งค่า**, saves the company name, and copies the displayed company code. Existing projects are already the company's data; no migration/reset is needed
3. Each member signs in using their own Google account and copies their user code from **เลือกบริษัท**. Owner adds that code/name and chooses manager or operator
4. Member enters the company code. Members use their own Google Drive connection and need the appropriate Google sharing permissions on the company folders. Owner prepares shared root/project folders first
5. Owner can change or disable membership. An online client reloads/blocks the workspace accordingly; previous pending originals/caches are retained. Google Drive sharing must be managed separately in Google

## Acceptance limits

Offline startup can use the last locally verified membership, just as legacy owner offline access did. A disconnected device cannot learn a later server revocation until reconnection; it cannot bypass server Rules on return. Role/actor/company caches prevent UI mixing but are not encryption against somebody controlling the browser/device. Offline pending work under a prior role is retained and may require that role's restoration or supervised recovery before synchronization.

Rules enforce membership and role transitions and preserve the existing client schema validation. This is not a full hostile-file/data fuzzing or penetration-test certification. Existing manual accessibility/security and production Firebase/OAuth/Drive/device acceptance remain open. New company code does not grant Google folder permissions or expose another user's encrypted OAuth tokens.

Shared-backup provenance: if a missing financial event was authored by another member, Preview explicitly lists it for recreation by the current restoring actor. Amount, work/effective date, revision and ID are retained; the recreation receives the current actor/time and the full original is retained in the local restore audit. It never impersonates the previous author. Any existing local ID wins; a differing existing cloud version produces the normal explicit conflict review. Source backups remain unchanged.

## Final validated gate — 2026-11-09

Command from `/workspace/construction-ops` on source `7fae411`:

```sh
CI=true XDG_CONFIG_HOME=/workspace/.cache/config \
npm_config_cache=/workspace/.npm-cache \
FIREBASE_EMULATORS_PATH=/workspace/.cache/firebase/emulators \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run check
```

Exit **0**: frontend **310/310** (53 files), backend **14/14**, Firestore Rules **9/9**, Firestore integration **10/10**, Playwright **58/58** (2.2 minutes). Formatting, lint/tooling (4 tests), typecheck, production build and HTTP smoke passed. Lint retains 59 warnings and zero errors. No skipped tests, failed assertions or unhandled rejections remain in this run.

The new cases cover member admission/disablement, actual audit actor, finance exclusion, manager/worker views of the same project, role forgery, downgrade, revoked-member pending work, cache separation, additive database upgrade, same-ID original bytes and backup provenance. Browser company-role cases are explicitly synthetic UI simulations; separate authenticated emulator contexts verify server permission enforcement. Neither establishes production Google login or real-device acceptance.

`npm run clean` completed. Only the two known generated Phase 2 screenshots were restored; original user data, unknown files, credentials and lockfiles were preserved. No source push, rules/index/backend/hosting deployment or environment publication was performed.

## Resume from this checkpoint

All nine approved extensions have implementation and isolated acceptance evidence. Do not rebuild the completed role or finance/restore workflows. Inspect Git/source and this report before further changes. Next acceptance work requires a configured dedicated Firebase/Google/Drive test setup and a separately authorized rollout of web client, backend, Rules and index together. Follow PRODUCTION_SMOKE_PLAN.md, verify company-folder Google sharing for each member, and record actual production-service results. Physical Android remains deferred by the user. The original roadmap's Phase 1/4/8 real-service/manual limitations stay open.
