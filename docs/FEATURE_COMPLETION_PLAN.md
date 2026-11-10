# แผนปิดงานฟีเจอร์และทดสอบเป็นชุด

อัปเดต 2026-11-10 (Asia/Bangkok). ตรวจจาก source `8755d76`, checkpoint `dbe5213`, branch `feat/google-allowlist-rbac` และโค้ดจริง ก่อนจัดแผนนี้ ผู้ใช้ต้องการพัฒนาฟีเจอร์ให้จบเป็นชุด ลดการรัน regression เต็มซ้ำระหว่างแก้ และยังรักษาข้อมูล/สิทธิ์เดิม

## ขอบเขตรุ่นใช้งานแรก

ใช้ workflow ที่มีแล้วให้ครบวงจร: สร้างโครงการ → เตรียมรถ/คนขับ/แหล่งดิน → บันทึกเที่ยวรายวัน → เก็บรูป/ลายเซ็น → ตรวจยอด/ปิดวัน → ดูรายงาน/ประมาณต้นทุน → ซิงก์/สำรอง/กู้คืน โดยหลายบัญชีทำงานร่วมกันตามสิทธิ์บริษัท

| Workflow                | โค้ดและความสามารถที่มีแล้ว                                                                                                                      | สิ่งที่เหลือก่อนตรวจรับจริง                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| โครงการและข้อมูลพื้นฐาน | `App.tsx`, `TruckExcelPanel.tsx`, `TruckSheetsPanel.tsx`: CRUD, สถานะ, ค้นหา, tags, Excel preview/import/export, Sheets import                  | วินิจฉัย Sheets account error ที่ผู้ใช้รายงาน ไม่สร้าง importer ซ้ำ                              |
| งานรายวัน               | `DailyPanel.tsx`, `dailyTrips.ts`, `dailyDrafts.ts`: เพิ่มเที่ยว/แก้พร้อมเหตุผล, capacity snapshot, copy วันถัดไป, draft/offline                | รีวิว workflow ด้วยข้อมูลทดสอบที่เป็นตัวแทนงานจริง                                               |
| หลักฐานและตรวจยอด       | `EvidencePanel.tsx`, `daily.ts`: ต้นฉบับ, ลายเซ็น, invalidation, verify/close/reopen และประวัติ                                                 | กล้อง/ลายเซ็นบนอุปกรณ์จริง และ Drive upload/restore จริง                                         |
| รายงาน                  | `ReportsPanel.tsx`: วัน/สัปดาห์/เดือน, filters, CSV/XLSX/พิมพ์ PDF และอ้างอิงหลักฐาน                                                            | เปิด Excel/พิมพ์จริงและยืนยันรูปแบบที่ใช้ส่งงาน                                                  |
| ต้นทุน                  | `FinancePanel.tsx`, `finance.ts`: ราคาต่อเที่ยว/ปริมาตร, เจ้าหนี้ประมาณการ, ค่าใช้จ่าย/reversal, ส่วนต่าง                                       | ตรวจรูปแบบรายงานกับวิธีทำงานจริง เป็นประมาณการ ไม่ใช่ระบบโอนเงินจริง/บัญชีเต็มรูปแบบ             |
| สำรวจ                   | `SurveyPanel.tsx`, `surveying.ts`, `surveyImport.ts`: BM/grid/slope/cut-fill, CSV/XLSX, 2D/contour                                              | ตรวจสมมติฐาน/หน่วย/รูปแบบเอกสารกับผู้ใช้งานจริง ไม่ต้องเพิ่ม 3D เพื่อปิดรุ่นนี้                  |
| ทีมและความปลอดภัย       | `UserManagementPanel.tsx`, `companyAccess.ts`, `AccountSecurityPanel.tsx`: Google allowlist, 4 roles, offline grant, TOTP setup/login           | บัญชีจริงทุกบทบาท, revoke/reconnect, MFA enrollment/login/recovery; ไม่เปิด enforcement ล่วงหน้า |
| Offline/สำรอง/PWA       | `CloudSyncPanel.tsx`, `BackupRestorePanel.tsx`, `public/sw.js`: outbox/retry/conflict, missing-only restore, pending originals, explicit update | รับรอง Safari/iPhone/Home Screen จริง; หลายแท็บ/คนละ bundle release เป็นรอบเสริมเฉพาะ PWA        |

ตารางนี้ยืนยันการมี implementation จาก source และผล isolated gate เดิม ไม่ใช่การรับรองบริการหรืออุปกรณ์จริง ทั้ง 9 approved extensions มี implementation แล้ว จึงไม่เปิดงานเดิมซ้ำจาก checklist เก่า

## ลำดับทำงาน

| ลำดับ | ชุดงาน                      | ผลส่งมอบที่ต้องได้                                                                                                     | สถานะ/เงื่อนไข                                                                                               |
| ----- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1     | ปิดอุปสรรคการเตรียมข้อมูล   | Sheets import เชื่อมบัญชี/preview/import ได้ หรือระบุ error และ prerequisite ที่ทำซ้ำได้ชัดเจน                         | OPEN: ต้องมีข้อความผิดพลาดที่เห็นและ origin จากเครื่อง VS Code; ไม่ขอ token/secret และไม่เดาแก้ OAuth config |
| 2     | ปิด workflow รุ่นแรกเป็นชุด | รีวิวเส้นทางในตารางด้วยโครงการทดสอบเดียว บันทึกเฉพาะขั้นตอนที่ทำงานไม่ได้/ข้อมูลขาด แล้วพัฒนาเฉพาะช่องว่างที่ยืนยันได้ | READY FOR REVIEW: ใช้ DEMO ที่มีอยู่หรือ dedicated local fixtures ไม่ seed/reset ข้อมูลผู้ใช้อัตโนมัติ       |
| 3     | แก้ช่องว่าง/บั๊กของชุดงาน   | แก้ทุก issue ของชุดเดียว พร้อม targeted checks และ regression ที่จำเป็น                                                | เริ่มเมื่อมี issue ที่ทำซ้ำได้; ไม่เพิ่มฟีเจอร์จากการคาดเดา                                                  |
| 4     | รอบตรวจรับรวม               | full check ครั้งเดียวบน source ชุดสุดท้าย แล้วตรวจ Google/Drive/Sheets/MFA จริง และ iPhone แยกตาราง                    | บริการ/อุปกรณ์ต้องพร้อมและได้รับอนุญาต; การ deploy เป็นคำสั่งอนุมัติแยก                                      |
| 5     | ส่งมอบ source               | checkpoint, intended commits และ push เฉพาะ feature branch                                                             | ไม่ merge/deploy/แก้ production และไม่ clear IndexedDB                                                       |

ชุดที่ 2 เป็นการตรวจเส้นทางใช้งานและหาฟีเจอร์ที่ขาด ไม่ใช่รัน automated suite ทั้งหมดซ้ำทุกหน้า ถ้าไม่มีช่องว่างที่ยืนยันได้ ให้รายงานว่ารุ่นแรกมี implementation ครบและไปตรวจรับตาม prerequisite โดยไม่ประดิษฐ์ฟีเจอร์ให้มีงานเพิ่ม

## ฟีเจอร์เสริมที่ยังไม่ทำ — นอกขอบเขตรุ่นแรก

- สิทธิ์รายโครงการ: ตอนนี้กำหนดสิทธิ์ระดับบริษัท ต้องกำหนดการมองเห็น/สิทธิ์ offline/คิวเดิมก่อนเพิ่ม ACL
- SMS MFA, recovery codes, self-service factor removal: ตอนนี้มี TOTP; ผู้ดูแลใช้กระบวนการกู้บัญชีที่เชื่อถือได้
- สำรวจ 3D: ตัวเลือกเสริมจาก 2D/contour ที่มีอยู่
- Background Sync เมื่อปิดแอป: ปัจจุบันทำงานเมื่อเปิดแอป/ออนไลน์ ข้อจำกัด browser ยังต้องพิจารณา
- Shared Drive และ Google Workspace native documents: นอกขอบเขต file upload เดิม

รายการนี้เป็น backlog สำหรับตัดสินใจภายหลัง ไม่ใช่คำอนุมัติให้พัฒนาทุกข้อหรือเงื่อนไขว่าต้องทำก่อนใช้งาน

## รอบทดสอบที่ประหยัดและยังตรวจจับความเสียหายได้

1. ระหว่างพัฒนาแต่ละส่วน: `npm run typecheck` และ unit/integration เฉพาะไฟล์ที่เปลี่ยน เพิ่มกรณีสำเร็จ/ผิดพลาดที่มีความหมาย พร้อม E2E เฉพาะ workflow เมื่อมีการเปลี่ยนพฤติกรรม UI
2. ถ้าแตะสิทธิ์/Rules/backend: รัน permission/backend/emulator ที่เกี่ยวข้องทันที ถ้าแตะ sync/storage/เงิน/สูตรสำรวจ: รันกรณีข้อมูลคงอยู่/ข้ามบัญชี/ข้อผิดพลาด/ตัวเลขที่เกี่ยวข้องทันที ไม่รอจบทุกฟีเจอร์
3. เมื่อจบชุดฟีเจอร์ก่อนประกาศเสร็จหรือส่ง checkpoint ที่เปลี่ยน source: `npm run check` ครั้งเดียว แก้ failure แล้วรันส่วนที่เสียก่อน จึงกลับมารัน gate เต็มเมื่อพร้อมส่ง ไม่ปิด/skip test เพื่อผ่าน
4. เอกสารอย่างเดียว: ตรวจ formatting/whitespace/ลิงก์และเทียบกับ source อ้างอิง ใช้ผล source gate เดิมที่ระบุ hash/วันที่ ไม่รันเต็มซ้ำและไม่อ้างว่าเพิ่งทดสอบ source ใหม่
5. หลังตรวจเสร็จ: `npm run clean` เฉพาะ artifacts ที่กำหนด รักษาข้อมูลจริง/credentials/pending originals; บันทึกคำสั่ง ผลจริง hash และข้อจำกัดใน checkpoint

ตัวอย่าง targeted commands ที่ใช้ scripts/ไฟล์ที่มีจริง:

```sh
npm run typecheck
npx vitest run src/test/TruckSheetsPanel.test.tsx
npx vitest run src/test/daily.test.ts src/test/dailyTrips.test.ts
npx vitest run src/test/finance.test.ts src/test/surveying.test.ts
npm run test:rules
```

เลือกเฉพาะคำสั่งที่สัมพันธ์กับงาน ไม่รันทุกบรรทัดทุกครั้ง `npm run check` ยังคงเดิม ไม่ถอด gate ออก ส่วน browser/emulator ใช้ runtime flags ที่ตรวจแล้วจาก AGENTS.md; Windows ใช้ `npm.cmd` เมื่อจำเป็น

## สถานะจริงและจุดเริ่มใน VS Code

- Source gate ล่าสุด `8755d76`: frontend 356/backend 24/release 5/emulator Node 15/client 10/E2E 85/tooling 4, exit 0 ตาม checkpoint เดิม ไม่มี fresh application test ในการเขียนแผนนี้
- ผู้ใช้เคยรายงาน Firebase/Drive เชื่อมได้บนเครื่อง VS Code; เก็บเป็น user-reported evidence ไม่ใช่ independent PASS ของ flow ทั้งหมด ส่วน Sheets account error ยังไม่ทราบสาเหตุ อย่าเหมารวมว่าทุกบริการไม่เคยเชื่อม หรือว่า Sheets ถูกแก้แล้ว
- Real Google/MFA/iPhone acceptance ยังเปิด; Phase 1/4/8 คง PARTIAL, physical Android deferred
- เริ่มจากอ่าน checkpoint ล่าสุด/ตรวจ Git แล้วเปิด Sheets import บนเครื่องที่มี config เดิม เก็บข้อความ error, origin และขั้นตอนก่อนเกิดโดยไม่แชร์ tokens ถ้าทำต่อไม่ได้ ให้เดินชุด local workflow review ไปพร้อมกัน ไม่ขยายสิทธิ์หรือเปลี่ยน provider/production เพื่อเลี่ยง blocker
