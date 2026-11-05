# Phase 1 implementation report

วันที่: 2026-11-06

พัฒนาระบบซิงก์และกู้คืนครบตามชนิดข้อมูลเดิม พร้อม automated checks ในสภาพแวดล้อมทดสอบ การยืนยัน production และอุปกรณ์จริงยังเป็นงานก่อนนำขึ้นใช้งาน ไม่ได้ commit, push, deploy หรือแตะข้อมูล production

## พฤติกรรมที่เพิ่ม

- Projects และ masters ทั้งหกประเภท (ลูกค้า รถ คนขับ ทีม/แท็ก แหล่งดิน ชนิดดิน) ใช้ IDs เดิมใน `users/{uid}/projects` และ `users/{uid}/masters`; เที่ยวรถคง path `users/{uid}/trips/{id}`
- IndexedDB เป็น working storage: บันทึกข้อมูลและ durable outbox พร้อมกันใน transaction ของ `state` เดิม คิวอยู่ใน `Data.sync.entries` ไม่พึ่ง memory ของ component
- ซิงก์หลัง login, กลับ online, มี local operation ใหม่ และทุก 30 วินาทีเมื่อเปิดแอป โดย retry errors มี exponential backoff สูงสุด 5 นาที และผู้ใช้กดลองใหม่ได้ทันที
- ตรวจ Admin บน server และ UID ของ session; ออฟไลน์ใช้ข้อมูลของบัญชีที่เคยผ่านการตรวจ Admin ในเครื่องนี้ การเพิกถอนสิทธิ์ต้องตรวจเมื่อออนไลน์ กรณีได้รับ permission-denied จะปิดการเข้าถึง UI
- ใช้ Web Locks เมื่อ browser รองรับ และ transaction/base revision/operation ID ป้องกันการเขียนซ้ำแม้ไม่มี Web Locks; รอ server acknowledgement ก่อนเปลี่ยนสถานะ synced
- ตรวจ base revision พร้อม operation ID และเนื้อหา ไม่อาศัยเลข revision ของ local ที่สูงกว่า; local changes ระหว่างรอ response ยังคง pending
- Restore อ่านจาก server แบบแบ่งหน้า ตรวจ schema/ชนิดฟิลด์และ references แล้ว merge ใน IndexedDB transaction เดียว ไม่ล้างข้อมูลและไม่ทับ pending ที่ต่างจาก Cloud
- Incremental pull ใช้ server timestamp แบบ inclusive และ document ID สำหรับแบ่งหน้า หลัง initial scan จะอ่าน timestamped records ซ้ำจาก epoch หนึ่งครั้งเพื่อไม่ตกหล่นการเพิ่มระหว่างแบ่งหน้า; cursor ย้ายเมื่อ merge สำเร็จเท่านั้น
- Conflicts เก็บ local และ remote พร้อมแสดงข้อมูลให้ผู้ใช้เลือก ตรวจ remote ล่าสุดก่อนตัดสินใจ และบันทึกทั้งสองฉบับใน local audit เมื่อแก้ไข หากเลือก local จะตรวจ base ใหม่อีกครั้งตอน transaction ส่ง Cloud
- ลบจากฟอร์มโดยเก็บ tombstone/audit และซิงก์ soft delete; ยังห้ามลบรายการที่มี references หรือเอกสารตามข้อจำกัดเดิม
- สำรองข้อมูลเป็น JSON พร้อมไฟล์แนบ base64, migration source, Drive folder settings และลิงก์ Truck Sheets ของบัญชีนั้น ไม่ส่ง OAuth credentials หรือข้อมูลบัญชีอื่น
- Security Rules จำกัด enabled admin/owner, valid schema, immutable ID/createdAt, exact next revision, server timestamp, append-only audit และห้าม hard delete; uniqueness claims ป้องกันรถทะเบียน/จังหวัดและชื่อทีมซ้ำผ่าน transaction ของแอป

## Files changed

| กลุ่ม                 | ไฟล์                                                                                                                                                                                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model และ persistence | `src/models.ts`, `src/storage.ts`, `src/syncModel.ts`, `src/cloudValidation.ts`, `src/backup.ts`, `src/deletion.ts`                                                                                                                                                                                                        |
| Cloud services        | `src/firebase.ts`, `src/cloudFirestore.ts`, `src/cloudSync.ts` — แทนเส้นทาง syncTrip เดิม ไม่เก็บ writer เดิมคู่กัน                                                                                                                                                                                                        |
| UI                    | `src/App.tsx`, `src/CloudSyncPanel.tsx`, `src/styles.css`                                                                                                                                                                                                                                                                  |
| Tests                 | `src/test/cloudSync.test.ts`, `src/test/cloudFirestore.test.ts`, `src/test/backup.test.ts`, `src/test/CloudSyncPanel.test.tsx`, `src/test/deletionSafety.test.ts`, `src/test/syncFixtures.ts`, `src/test/App.auth.test.tsx`, `src/test/firebase.test.ts`, `src/emulator-test/cloudSync.test.ts`, `e2e/data-safety.spec.ts` |
| Rules และ tooling     | `firestore.rules`, `firebase.emulator.json`, `vitest.emulator.config.ts`, `rules-test/firestore.test.mjs`, `scripts/rules-test.mjs`, `scripts/clean.mjs`, `package.json`, `package-lock.json`                                                                                                                              |
| เอกสาร                | `PHASE1_PLAN.md`, `PHASE1_REPORT.md`                                                                                                                                                                                                                                                                                       |

## Migration notes

1. ไม่เปลี่ยน IndexedDB version 2, store names หรือ owner keys และไม่เปลี่ยน entity IDs
2. ก่อน local mutation แรกที่เปิดใช้ metadata จะเก็บ state เดิมที่ key แบบ array `['phase1-backup', owner]` ภายใน transaction เดียวกัน ทำครั้งเดียวต่อ owner และไม่ทับสำเนานี้ การอัปโหลดคิวและ Drive settings ไม่ถูกเปลี่ยน การ export สำรองรวมข้อมูลเหล่านี้ด้วย
3. โครงสร้าง Cloud ใหม่ใช้ envelope `schemaVersion: 1` พร้อม payload, revision, operationId และ tombstone เที่ยวรถ Cloud เดิมแบบ flat ยังอ่านได้ ถ้าตรงกับ local จะกำหนด baseline; ถ้าต่างจะเก็บ conflict การเขียนครั้งถัดไปจึงเปลี่ยนเป็น envelope ใน document เดิม
4. ไม่แปลง customer/soilType ที่เป็นข้อความเดิมเป็น IDs โดยเดา; teams คงใช้ tag/tagIds ไม่มีการสร้างระบบทีมซ้ำ
5. ถ้า schema ในเครื่องหรือ Cloud ใหม่กว่าที่แอปรองรับ ให้หยุดและเก็บข้อมูลเดิม ไม่ reset, clear, ลบ collections หรือเดา migration
6. ต้องนำ rules และ frontend รุ่นนี้ขึ้นใช้งานอย่างประสานกันหลัง staging เนื่องจาก writer เดิมแบบ flat จะถูก rules ใหม่ปฏิเสธ ห้าม downgrade กลับ writer เดิมเพื่อแก้ปัญหา

## Test results

`npm.cmd run check` ผ่าน: frontend tests 187, backend tests 10, Security Rules tests 7, adapter integration tests 4 และ browser tests 20 รายการ รวม 228 รายการ พร้อม format, TypeScript, production build และ HTTP smoke ผ่าน ไม่มีการใช้ credentials จริงใน unit/browser tests และ emulator ใช้ project `demo-construction-ops` ที่ `127.0.0.1:9089` เท่านั้น หลังตรวจรัน `npm.cmd run clean` เพื่อลบ artifacts ที่กำหนดไว้

`npm.cmd run check` รวม format, TypeScript, frontend/backend tests, rules emulator, adapter integration, build, HTTP smoke และ Playwright ต้องมี Java 21+ สำหรับ emulator; runner รองรับ JAVA_HOME หรือ portable runtime ใน temporary tool cache ตาม `scripts/rules-test.mjs` การติดตั้ง runtime ครั้งนี้ใช้แพ็กเกจจาก [Eclipse Adoptium](https://adoptium.net/installation/ci-scripts) พร้อมตรวจ SHA-256

## Known issues และงานก่อนใช้งานจริง

- ยังไม่ได้ทดสอบ Google sign-in, Firestore production, Drive จริง หรืออุปกรณ์จริงหลายเครื่อง; emulator integration ใช้ Firestore SDK/rules จริงกับ auth context จำลอง และ browser tests ใช้ profile แยก
- ยังไม่ได้ deploy rules/frontend สำรอง Firestore production หรือ migrate ข้อมูลของผู้ใช้จริง ต้องตรวจ allowlist และสำรองแต่ละเครื่องก่อน rollout
- การกู้คืน legacy cloud trips ที่ไม่มีโครงการ/ข้อมูลหลักอ้างอิงครบจะหยุดพร้อมรายงาน integrity แทนการสร้างข้อมูลขึ้นเอง ต้องซิงก์จากเครื่องต้นทางที่ยังมีข้อมูลครบ
- local workspace (`owner = local`) และบัญชี Google ต่าง UID ยังคงแยกข้อมูลตามสถาปัตยกรรมเดิม ไม่มีการย้ายข้อมูลข้ามบัญชีอัตโนมัติ
- Restore ครอบคลุม business entities ที่ขอ ไม่ดาวน์โหลดไฟล์จาก Drive หรือคิวไฟล์แนบจากเครื่องอื่นอัตโนมัติ ไฟล์ที่ยังไม่ขึ้น Drive ต้องเก็บ backup ของเครื่องต้นทาง
- Backup JSON มีไฟล์แนบทั้งชุด จึงใช้หน่วยความจำตามขนาดคิว และยังไม่มี UI นำเข้าไฟล์ backup ทั่วไป; การกู้คืนที่เพิ่มรอบนี้ใช้ Cloud ส่วนสำเนาก่อน migration เก็บไว้สำหรับ recovery โดยผู้ดูแล
- ต้องเปิดหน้าแอปเพื่อ retry/sync ไม่มี background sync หลังปิด browser

Phase 1 ส่วน implementation และการตรวจในเครื่องพร้อมให้ทดสอบ staging; acceptance ด้านบริการจริงและอุปกรณ์จริงยังไม่ยืนยัน
