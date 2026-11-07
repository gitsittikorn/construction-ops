# Bug tracker

อัปเดต 2026-11-08 (Asia/Bangkok). เก็บข้อบกพร่องแยกจากงานตาม roadmap และข้อจำกัดบริการจริง ห้ามปิด test หรือเดา PASS เพื่อปิดรายการ

| ID      | Phase / priority | Reproduction / impact                                                                                                                               | Fix / regression                                                                                                                                                                      | Status                                                        |
| ------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| BUG-001 | 5 / High         | ส่ง synced upload ที่ owner อื่น, folder ว่าง หรือ context ไม่ตรงให้ verifyDaily/closeDaily; เดิม domain ไม่ตรวจครบ แม้ UI จะ listUploads แยก owner | `aa18632`: daily.evidenceFiles ตรวจ owner/project/date/truck/driver/folder และ distinct upload/Drive IDs; daily.test.ts ปฏิเสธก่อน verification/closure                               | FIXED; final npm run check exit 0; frontend 256 + E2E 42 PASS |
| BUG-002 | 6 / High         | รถมี 3 เที่ยว capacity 12 แล้วเพิ่ม 1 เที่ยว capacity 20, reported 5; segmented verification report ซ่อน reported count/difference                  | `4ad0958`: รวม reconciliation ต่อรถ/วันโดย sum snapshots, แสดง 4 vs 5, −1, 56 m³; partial driver/source filter ไม่เทียบยอดทั้งคัน; reports.test + daily-workflow E2E อ่านค่า CSV/XLSX | FIXED; final npm run check exit 0; frontend 256 + E2E 42 PASS |
| ENV-001 | tooling / Medium | Firebase CLI จบด้วย unexpected error แม้ emulator tests ผ่าน เพราะ config path เขียนไม่ได้                                                          | ใช้ XDG_CONFIG_HOME=/workspace/.cache/config; documented command; emulator exit 0                                                                                                     | RESOLVED on current cloud instance                            |
| ENV-002 | tooling / Medium | Default Playwright browser download ถูก network policy บล็อก แต่ system Chromium ใช้งานได้                                                          | `f7a6266`: optional PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ใน playwright.config.ts; ไม่เปลี่ยน default browser ของเครื่องอื่น                                                            | FIXED; system Chromium E2E PASS                               |

## Open roadmap work / verification gaps

- GAP-P4: inventory-level orphan detection และ coverage ของ OAuth/partial failures ต้อง audit ต่อ; มี on-demand missing-file/metadata validation แล้ว ไม่ถือว่าขาดทั้งระบบ
- GAP-P5: open-day correction reason policy และ role/sync scenarios ต้องเทียบ Master อย่างเจาะจง
- GAP-P6: weekly/monthly grouping, export metadata/optional evidence refs, loose/compacted/design volume wording
- GAP-P7: survey import/2D visualization/orientation and interpolation acceptance mapping
- GAP-P8: current dependency audit, accessibility/performance/security review, production smoke-test plan
- EXT-001: real OAuth revocation/renewal, Google/Drive restore และ physical Android ยัง NOT VERIFIED; mock/emulator ไม่ปิดรายการนี้

## Updating an issue

บันทึก expected/actual behavior, safe isolated reproduction, baseline/affected files, severity, regression command, pass/fail counts และ commit hashเมื่อมี แก้ไขอัตโนมัติเฉพาะใน scope ที่ได้รับอนุญาต; ถ้าต้องใช้ credentials/hardware/deployment ให้บันทึก prerequisite จริงโดยไม่ขอ secret ในแชต
