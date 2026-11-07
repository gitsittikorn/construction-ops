# Roadmap progress — Construction Ops

อัปเดต 2026-11-08 (Asia/Bangkok). ข้อกำหนด: [MASTER_ROADMAP.md](MASTER_ROADMAP.md). ตรวจ Git/source จริงจาก baseline `ad490a87075d178dd7db87a1cf4e79eedbb8bffe` ซึ่งตรง remote main ตอนตรวจ; งาน local รอบนี้ยังไม่ push/deploy

## สถานะจากหลักฐาน

COMPLETE ในคอลัมน์ automated gate หมายถึง implementation และ automated acceptance ที่ระบุผ่าน ไม่ใช่ production acceptance ทั้งระบบ คอลัมน์ overall รวมข้อที่ยังขาดตาม Master; ห้ามนับผล mock/emulator เป็นบริการจริง รายงานเก่าใช้เป็นประวัติ ไม่แทนผลรอบใหม่

| Phase | Overall  | Automated gate / evidence                                                                                                           | Remaining / next action                                                                                                                 |
| ----- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | COMPLETE | ตรวจ Git, architecture, persistence, security, dependencies/scripts และรายงานเดิมแล้ว; docs/PHASE_0_AUDIT.md                        | ตรวจใหม่เมื่อ scope/source เปลี่ยน                                                                                                      |
| 1     | PARTIAL  | sync/outbox/conflict/account/rules/clean-profile regression ผ่าน; docs/PHASE_1_REPORT.md                                            | real auth expiry/cloud restore บริการจริงยัง NOT VERIFIED                                                                               |
| 2     | COMPLETE | baseline implementation commit d13a2fb; daily-workflow + phase2-daily E2E ผ่านในชุดเต็มล่าสุด; docs/PHASE_2_REPORT.md               | regression ต้องคงผ่าน; real service/device acceptance แยก NOT VERIFIED                                                                  |
| 3     | COMPLETE | baseline implementation commit bd884dc; image/signature/changed totals/offline/verify-close-reopen E2E ผ่าน; docs/PHASE_3_REPORT.md | camera/stylus/Android และ Google จริง NOT VERIFIED                                                                                      |
| 4     | PARTIAL  | private restore/cache, foreign metadata, interrupted media และ independent profiles ผ่าน; docs/PHASE_4_REPORT.md                    | OAuth/partial failure coverage mapped; read-only missing/mismatch/unmapped inventory ผ่าน; real cloud/device ยัง NOT VERIFIED           |
| 5     | PARTIAL  | reconcile, proof guards, close/reopen/reclose/audit/snapshots ผ่าน; docs/PHASE_5_REPORT.md                                          | ตรวจ correction-reason policy บน open days, role/sync coverage เทียบ Master และ real service acceptance ก่อนประกาศครบ                   |
| 6     | PARTIAL  | seven report forms, filters, mixed capacity reconciliation, CSV/XLSX/PDF/offline regression ผ่าน; docs/PHASE_6_REPORT.md            | weekly/monthly summaries, export metadata/optional evidence refs และ loose-vs-compacted/design labels ต้องตรวจ/เติมให้ครบ               |
| 7     | PARTIAL  | surveying.ts/SurveyPanel.tsx มี BM/TP/grid/slope/cut-fill/history/export และ tests                                                  | ยังไม่ยืนยัน survey CSV/XLSX import และ contour/2D visualization ตาม Master; 3D optional; ยังไม่มี phase acceptance report              |
| 8     | PARTIAL  | PWA/offline, viewports, quota, PDF, keyboard/data-safety suites มีและผ่าน regression                                                | dependency/security/performance/accessibility/backup audit ต้องทบทวนรอบสุดท้าย; hardware/production smoke plan และ acceptance ยังไม่ครบ |

เฟส 2 ผ่านแล้ว จึงตรวจเฟส 3 ต่อทันทีด้วย suite เดียวกันและผ่าน ไม่ได้เริ่มทำฟีเจอร์ที่มีอยู่ใหม่ ตอนนี้ prerequisite ถัดไปคือ Phase 4; งานแก้ Phase 5–6 ใน working tree มาจากการตรวจอิสระก่อนรับ Master ไม่ใช่หลักฐานว่า phase gate ถัดไปครบ

## Checkpoint / resume

- Current phase: Phase 5 correction-reason audit หลัง Phase 1–4 isolated gate ผ่าน
- Task: เดิน Master ต่อจาก earliest gaps; Phase 1 auth-expiry regression และ Phase 4 read-only inventory audit ผ่านแล้ว
- Baseline: `ad490a8`; previous phase commits: P2 `d13a2fb`, P3 `bd884dc`, P4 cache `335daa2` ดู `git log` ประกอบ
- Reviewed changes: AGENTS/docs; daily proof owner/context/folder/duplicate guards; reconciliation report grouping; Playwright executable override; related unit/E2E tests source/test fixes committed locally; ดูรายการ commits ด้านล่างและ `git status` สำหรับงานที่ยังไม่ commit
- Latest validation: ดู TEST_RESULTS.md และ PHASE_4_6_REVIEW.md; final full check exit 0: frontend 256, backend 10, rules 7, integration 8, E2E 42; lint/typecheck/build/smoke PASS
- No user files/data/credentials cleared. Generated screenshots overwritten by E2E must be restored only if produced by our tests; preserve pre-existing changes. Run npm run clean after validation
- Missing external prerequisites: ไม่มี real Firebase/Google/Drive test account/approved test origin หรือ physical Android available; ไม่ขอ secret values ผ่านแชต ไม่แตะ production
- No usage limit was reported. This is a durable milestone checkpoint, not a claim that platform quota was reached

## Exact next actions

1. Read AGENTS, Master, this progress file, BUG_TRACKER and relevant reports; inspect git status/log/source. Preserve local changes before any edit
2. Complete Phase 4 read-only audit and isolated tests for OAuth lifecycle, interrupted upload/reference recovery, missing files and orphan inventory. Implement only missing behavior. Run unit + emulator + E2E gate and update PHASE_4_REPORT
3. Record separately the real-cloud/device acceptance from PHASE_4_6_REVIEW; require secure configuration and a dedicated test account before external integration. Do not deploy or use production to remove a blocker
4. After prerequisite gate, continue Phase 5 (reason/authorization/sync audit), then Phase 6 (calendar summaries, export metadata/reference and volume semantics), Phase 7 and Phase 8 against the full Master
5. For each validated completed phase: report, local commit, record hash, continue automatically; if genuinely blocked, save reproduction/prerequisite and checkpoint instead of inventing PASS

คำสั่งเริ่ม session ใหม่: “อ่าน AGENTS.md และเอกสารที่เกี่ยวข้อง ตรวจ ROADMAP_PROGRESS.md เทียบ Git/source แล้วทำ phase ที่ค้าง พร้อม E2E แก้บั๊กและอัปเดต progress” เอกสารนี้ต้องอยู่ใน checkout นั้น; local commits ไม่ปรากฏใน clone จาก remote จนมีการ push ที่ผู้ใช้ออกคำสั่งอนุญาต

## Local commits in this checkpoint

| Commit    | Scope                                                                               |
| --------- | ----------------------------------------------------------------------------------- |
| `aa18632` | Phase 5 proof owner/context/folder guards, reclose regression และ report checkpoint |
| `4ad0958` | Phase 6 mixed capacity reconciliation, export regression และ report checkpoint      |
| `f7a6266` | Phase 4 independent browser profiles, cloud Chromium override และ evidence report   |

Roadmap/AGENTS/documentation commit ดู `git log -1 -- AGENTS.md docs/MASTER_ROADMAP.md`; ไม่ใส่ self-referential commit hash ในไฟล์เดียวกับที่ต้อง commit ไม่ได้ push commits เหล่านี้ขึ้น remote

## Continuation gate — 2026-11-08

Phase 1 auth expiry mid-batch retains queue/idempotency; Phase 2–3 full regression retained; Phase 4 read-only inventory audit now implemented. Full gate exit 0: frontend 260, backend 10, rules 7, integration 8, E2E 43. Next: Phase 5 open-day correction reasons, then Phase 6 calendar reports/export metadata, Phase 7 import/visualization and Phase 8 audit. Real cloud/device acceptance stays NOT VERIFIED, not a reason to invent credentials or claim production readiness.
