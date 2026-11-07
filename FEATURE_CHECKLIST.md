# Feature checklist — V4.0

อัปเดต Phase 4 วันที่ 2026-11-07: private original restore/offline cache ผ่าน isolated automated gate แล้ว (291 tests รวม E2E 34) แต่ real OAuth/Drive/Android ยัง NOT VERIFIED จึงคงสถานะ PARTIAL ดู docs/PHASE_4_REPORT.md

สถานะเริ่มงานจาก source audit วันที่ 2026-11-06

| Phase | Status      | Acceptance ที่ยังไม่ผ่าน/ยังไม่ยืนยัน                                                                  |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------ |
| 0     | COMPLETE    | audit source และ diff บันทึกใน PHASE_0_AUDIT.md                                                        |
| 1     | PARTIAL     | production sync/restore และชนิดข้อมูลของ phase ใหม่                                                    |
| 2     | COMPLETE    | implementation/isolated acceptance passed; real services/devices NOT VERIFIED — docs/PHASE_2_REPORT.md |
| 3     | COMPLETE    | implementation/isolated acceptance passed; real services/devices NOT VERIFIED — docs/PHASE_3_REPORT.md |
| 4     | PARTIAL     | daily folders, metadata restore/viewer; real OAuth/Drive                                               |
| 5     | NOT STARTED | reconcile/verify/close/reopen/snapshots/audit                                                          |
| 6     | PARTIAL     | business XLSX, filters, 7 reports, print PDF, verified split                                           |
| 7     | PARTIAL     | BM/TP/grid/slope/persisted history/export/tests                                                        |
| 8     | PARTIAL     | new workflow tablet/PWA/security/performance/E2E/manual QA                                             |

COMPLETE หมายถึง acceptance ครบจริง ไม่ใช่เพียงมี UI ส่วนผลที่ต้องอาศัยบริการหรืออุปกรณ์จริงให้คง UNVERIFIED
