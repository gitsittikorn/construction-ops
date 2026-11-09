# Roadmap progress — Construction Ops

## Current delivery priority — Desktop web first

ผู้ใช้กำหนดให้รีวิวฟีเจอร์บนเว็บ/เดสก์ท็อปก่อน และเลื่อน physical Android acceptance ออกไป ไม่ต้องรอ Android เพื่อเปิดดู desktop features. คงสถานะ hardware เป็น deferred/NOT VERIFIED โดยไม่อ้างว่า PASS. Real Firebase/Drive integration เป็นงานแยกที่ยังจำเป็นสำหรับ login/sync/upload/restore จริงบน desktop. ดู DESKTOP_REVIEW.md สำหรับ workflow, local mode และข้อจำกัดการเผยแพร่เว็บ ไม่ได้ deploy จากการ push GitHub โดยอัตโนมัติ

อัปเดต 2026-11-09 (Asia/Bangkok). Latest implementation `7fae411`; Requirements: [MASTER_ROADMAP.md](MASTER_ROADMAP.md). Session baseline `949711e`; original upstream baseline `ad490a8`. ตรวจ Git/source และเดินจาก Phase 1 ตามคำสั่งผู้ใช้ ไม่มี push/deploy หรือ environment draft/publication changes

## Approved additions after the original roadmap

ผู้ใช้อนุมัติข้อเสนอเพิ่มเติม 9 ข้อแล้ว ดู [APPROVED_EXTENSIONS.md](APPROVED_EXTENSIONS.md) และ [EXTENSIONS_REPORT.md](EXTENSIONS_REPORT.md). ข้อ 1–3 และ 5–9 มี implementation และผ่าน full regression gate ใน commit `246a174` (frontend 294, backend 11, rules 8, integration 9, E2E 55). ข้อ 4 ใช้ข้อมูลบริษัทเดียวกันตามคำตอบผู้ใช้แล้ว โค้ด membership, Rules/backend enforcement และ actor/company/role cache อยู่ใน `7fae411` และผ่าน full gate: frontend 310, backend 14, Rules 9, integration 10, E2E 58. ทั้ง 9 ข้อมี implementation/isolated acceptance; รายละเอียดใน COMPANY_ACCESS.md. Baseline ของงานเพิ่มเติมคือ `cebef1c`; ห้ามตีความ Android ที่เลื่อนออกไปว่า PASS

## Current phase matrix

COMPLETE หมายถึง implementation + isolated automated gate ตามขอบเขต phase นั้น ไม่ใช่คำรับรอง production ทั้งระบบ ผล mock/emulator/browser simulation ต้องแยกจากบริการและอุปกรณ์จริงเสมอ

| Phase | Status   | Current evidence                                                                                                                                                                | Remaining limitations                                                                                                                         |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | COMPLETE | Git/source/architecture/data/security/dependency audit and durable roadmap established                                                                                          | Re-audit when source/scope changes                                                                                                            |
| 1     | PARTIAL  | Offline/outbox/idempotency/conflict/account/clean-profile restore pass; new mid-sync auth expiry preserves acknowledged and pending records                                     | Real application auth expiry/cloud restore NOT VERIFIED; app config/approved test identity not available                                      |
| 2     | COMPLETE | Stable daily trips, saved capacities, rapid taps, corrections, next-day copy, offline/tablet/timezone tests retained in every full gate                                         | Real service/device claims remain separate                                                                                                    |
| 3     | COMPLETE | Evidence/signature/blank rejection/replacement/changed totals/offline/closeout regression passes                                                                                | Real Android camera/stylus and OAuth not verified                                                                                             |
| 4     | PARTIAL  | Read-only owner-scoped inventory, missing/mismatch/unmapped candidates, pending protection, OAuth/queue/retry/cache and independent-profile tests pass                          | Real Google/Drive/second physical device not verified; inventory only sees files granted to this app                                          |
| 5     | COMPLETE | Correction reasons enforced on open days, normal increments stay fast; owner/context guards, verify/close/reopen/reclose, audit and historical sync/rules pass                  | Production service acceptance remains unverified                                                                                              |
| 6     | COMPLETE | Daily/week/month and project/truck/driver/source/reconciliation/cumulative reports, filters, CSV/XLSX/PDF/offline, metadata/optional references and loose-volume semantics pass | Real Android/Excel/printing acceptance not verified                                                                                           |
| 7     | COMPLETE | BM/TP/grid/slope/cut-fill/history, validated CSV/XLSX preview/import/export, Y-up grid and bounded linear contours pass                                                         | Optional 3D deferred; estimates are not field certification, physical inputs require measurement checks                                       |
| 8     | PARTIAL  | Tablet target/keyboard/overflow tests, 10k trips/5k daily+evidence indexing, PWA/quota/backup-export/cloud-restore/security regression and dependency audit pass                | Physical Android/real cloud, screen-reader/manual accessibility and production acceptance pending; 31 moderate dev dependency findings remain |

## Current validated gate

From `/workspace/construction-ops`:

```sh
CI=true XDG_CONFIG_HOME=/workspace/.cache/config \
npm_config_cache=/workspace/.npm-cache \
FIREBASE_EMULATORS_PATH=/workspace/.cache/firebase/emulators \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run check
```

Latest complete command on `7fae411`, 2026-11-09, exit **0**: frontend **310/310** (53 files), backend **14/14**, rules **9/9**, emulator integration **10/10**, Playwright **58/58** (2.2 minutes); lint tooling **4/4**, formatting/typecheck/build/HTTP smoke PASS. No skipped tests, failed assertions or unhandled rejections in the final run. Lint retains 59 warnings. Previous extension checkpoint `246a174`: 294 frontend / 11 backend / 8 rules / 9 integration / 55 E2E. See COMPANY_ACCESS.md and EXTENSIONS_REPORT.md for scope and boundaries. Original real-service and physical-device acceptance remains open.

Audit: frontend/backend runtime zero findings. Full dev tree 31 moderate, zero high/critical. Compatible remediation dry-runs did not propose a safe installed core/uuid version update; no forced major override or lockfile changes. See PHASE_8_FINAL_QA_REPORT.md

## Local commit checkpoints

| Commit    | Scope                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `7fae411` | Shared company membership/roles, preserved namespaces, isolated caches/uploads, per-user credential authorization and restore provenance |
| `246a174` | Approved extensions: immutable finance, safe JSON merge, duplicate review, preferred project and sync cancellation                       |
| `94671ba` | P1 mid-batch auth expiry preserves durable queue and idempotency                                                                         |
| `5dd6722` | P4 read-only private Drive document audit and tests                                                                                      |
| `f1de5ac` | P5 correction reasons, stale guards and audit regression                                                                                 |
| `3c1612a` | P6 calendar summaries, export metadata/reference context                                                                                 |
| `6d2dcc4` | P7 validated imports, orientation and bounded contours                                                                                   |
| `83fb12d` | P8 tablet target/report scaling/QA and production smoke plan                                                                             |

Earlier work: P2 `d13a2fb`, P3 `bd884dc`, original restore `335daa2`; previous local fixes `aa18632`, `4ad0958`, `f7a6266`; roadmap persistence `949711e`. Final checkpoint documentation commit is discoverable using `git log -1 -- docs/ROADMAP_PROGRESS.md` rather than embedding its own hash

## Resume checkpoint and exact next actions

- Current phase/task: all nine approved extension implementations are validated, latest source `7fae411`. No role-scope question remains. Original Phase 8 real-service/release acceptance and Phase 1/4 production checks remain open
- Preserve current local commits. Inspect `git status`, recent log, AGENTS, Master, Bug Tracker, phase reports and actual source before proceeding. Do not rebuild working features or repeat obsolete fixes
- Remaining external prerequisites: no public VITE app config, OAuth client/secret/encryption bindings or .env.local files were present. GOOGLE_APPLICATION_CREDENTIALS selector exists but was not treated as authorization for this app/unknown project. Do not print credentials or request their values in chat
- Configure a dedicated Firebase/Google/Drive test project/account and authorized origins through secure settings, verify precise network destinations and consent, then follow PRODUCTION_SMOKE_PLAN.md and the Phase 4 physical-device checklist. Keep production and real user data intact
- Run actual real-service expiry/revocation/restore and Android camera/stylus/PWA/printing checks. Record device/browser, exact test outcome and failures. Update PARTIAL/NOT VERIFIED only after those checks actually run
- Follow upstream compatible development dependency fixes, especially core/uuid/glob/minimatch; runtime audit currently has no findings. Do not force incompatible upgrades or disable verification/tests just to remove audit output
- Same-account JSON preview/atomic missing-only restore is implemented, including attachment bytes, conflict/tombstone preservation, quota retry, daily re-verification and explicit financial provenance. Preserve source backups and heed documented file/count/ownership limits; do not clear site storage to test restoration
- Before new phase acceptance run affected checks/full gate, then update reports/bugs and commit locally. Any push/deploy remains unauthorized until explicitly requested
- Final cleanup: run npm run clean and restore only generated screenshots changed by our E2E; never remove user files/data. Snapshot processes are not assumed to survive a new task
- No usage limit was reported. This checkpoint records completed independent work and external acceptance prerequisites, not a fabricated quota event

แชตใหม่ที่ใช้ checkout นี้อ่านเอกสารได้ทันที; clone ใหม่จาก GitHub จะยังไม่เห็น local commits จนมีคำอนุญาตให้ push

## Security checkpoint — 2026-11-08 (historical)

Follow-up review after `1591e17`: pre-fetch UID guard, XLSX structural/expanded-resource preflight, per-process authenticated request budgets, correct 413 response and truthful token-storage docs. Full gate 275 frontend / 11 backend / 7 rules / 8 integration / 46 E2E PASS; source/scan/completeness details in SECURITY_REVIEW.md. Current phase statuses and external acceptance remain unchanged; this is not a vulnerability-free certification. No push/deploy; use git log for the new local review commit.

Desktop-first final validation 2026-11-08: cloud npm run check exit 0; frontend 275, backend 11, rules 7, emulator integration 8, E2E 47 (1.7 minutes), format/lint/typecheck/build/smoke PASS. Gallery: 10 actual desktop screens at 1440×1000 with synthetic local data, no page errors, no cloud verification or production upload. Android hardware remains deferred/NOT VERIFIED

## Latest extension handoff

Source `7fae411`, preceding extensions `246a174`, baseline `cebef1c`. Complete full gate exit 0 on 2026-11-09; counts and command above. `npm run clean` completed; only generated Phase 2 screenshots were restored. No new source push, deployment or environment publication. Next: configure/verify dedicated real-service acceptance through secure settings and a separately authorized coordinated release of client, Rules/index and backend. Member Google Drive sharing and physical-device acceptance are separate. Do not repeat the completed nine-item implementation or interpret browser/emulator PASS as production acceptance.
