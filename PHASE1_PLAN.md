# Phase 1: Data safety, cloud sync and restore

วันที่ตรวจ: 2026-11-05

สถานะ: ผู้ใช้อนุมัติให้ดำเนินการแล้ว รวมถึงการเริ่มใหม่หากจำเป็นในรอบนี้ การพัฒนาเลือกคงข้อมูลและ IDs เดิมไว้ ไม่ได้ reset ฐานข้อมูล ดูผลการพัฒนาและข้อจำกัดใน `PHASE1_REPORT.md` ไม่มีการ commit, push หรือ deploy

## ผลตรวจ implementation เดิม

| ส่วน           | สิ่งที่มี                                                                                                                                                   | ช่องว่างและความเสี่ยง                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| IndexedDB      | `src/storage.ts`: database `construction-ops` version 2; stores `state`, `uploads`, `driveSettings`; state แยกตาม owner; read-modify-write เป็น transaction | ไม่มี durable outbox, cloud baseline, cursor หรือ conflict store; ห้ามเปลี่ยน owner key หรือทิ้ง state เดิม                                         |
| Authentication | `src/firebase.ts`: Google popup, auth observer, ตรวจ UID ก่อนเขียน                                                                                          | UI รับผู้ล็อกอินโดยไม่ได้ตรวจ admin ก่อนเปิดข้อมูล; rules เป็นตัวบังคับสิทธิ์จริง                                                                   |
| Security rules | `firestore.rules`: UID ตรง owner และ `admins/{uid}.enabled == true`; deny hard delete และ deny paths ที่ไม่กำหนด                                            | ยังไม่มี rules สำหรับ projects/masters; client อ่าน admin ไม่ได้ จึงต้องเพิ่มวิธีตรวจสิทธิ์ที่จำกัดเฉพาะบัญชีตัวเอง; ยังไม่มี emulator rules tests  |
| Projects       | `src/App.tsx`: stable UUID, timestamps, local audit                                                                                                         | ไม่มี cloud sync, revision หรือ cloud restore; customer เป็นข้อความ ไม่ใช่ customer ID                                                              |
| Master data    | `src/models.ts`, `src/masterData.ts`: truck, driver, source, customer, soilType, tag; ป้องกันทะเบียนรถ/ชื่อแท็กซ้ำภายในข้อมูลเครื่อง                        | ไม่มี cloud sync; ทีมใช้ tag/tagIds อยู่แล้ว ไม่ควรสร้างระบบทีมซ้ำ; การป้องกันชื่อซ้ำข้ามอุปกรณ์ยังไม่มี                                            |
| Trips          | `src/firebase.ts`: transaction เขียน `users/{uid}/trips/{id}` และ audit; stable ID, retry payload เดิม, revision; UI ยืนยัน synced หลัง transaction สำเร็จ  | ไม่มี base revision: remote revision ต่ำกว่า local จะถูกเขียนทับ แม้ remote มีการแก้ไขจากอุปกรณ์อื่น; ไม่มีการเก็บ conflict ทั้งสองฉบับ             |
| Offline queue  | pending/error อยู่ใน trip ใน IndexedDB; เริ่ม sync ตอนพร้อมใช้งานหรือ online                                                                                | ไม่ครอบคลุม masters/projects; ไม่ retry ตามเวลา; การสร้างข้อมูลหลัง ready ไม่ได้กระตุ้น sync โดยตรง; lock จำกัดเฉพาะ component                      |
| Deletion       | `src/deletion.ts`: ตรวจ references; trips เก็บใน deletedTrips และ audit                                                                                     | projects/masters ถูกนำออกจาก active arrays เหลือสำเนาใน audit; deletedTrips ไม่เข้า sync loop และ rules ไม่รับ deletedAt จึงยังส่ง tombstone ไม่ได้ |
| Restore        | โหลดเฉพาะ IndexedDB ของ owner                                                                                                                               | ไม่มี Firestore download, schema validation, merge, cursor, integrity report หรือ restore status                                                    |
| Google Drive   | metadata, stable folder mappings, upload queue แยกจาก state                                                                                                 | ต้องคง uploads/driveSettings และขั้นตอนยืนยัน metadata เดิมไว้                                                                                      |

การตรวจนี้อ่าน source เท่านั้น ไม่ได้เปิดฐานข้อมูลของผู้ใช้หรือสำรวจข้อมูล production จึงยังยืนยันความครบถ้วนของข้อมูลเก่าจริงไม่ได้

## แผนดำเนินงานตามลำดับ

1. สร้าง fixtures ของ schema เดิมและทดสอบ backup/restore แบบ round trip ก่อนเปลี่ยน schema: สำรอง state, audit, deletedTrips, upload records พร้อม Blob และ driveSettings โดยไม่ส่ง credentials ลง repository; สำรอง Firestore ผ่านผู้ดูแลในสภาพแวดล้อมที่ได้รับอนุมัติ ตรวจ counts, IDs และ references
2. เพิ่ม sync metadata และ durable outbox แบบ additive โดยคง owner, IDs และ stores เดิม จัดเก็บ mutation กับข้อมูลใน IndexedDB transaction เดียวกัน เก็บ base revision, operation ID, retry state และสำเนา conflict; เพิ่ม migration journal และ backup ก่อน migration ไม่ล้างฐานข้อมูล
3. ใช้ projects, masters และ trips ตามโครงสร้างเดิม โดย masters.kind แทน customers/trucks/drivers/teams/sources/soil types; เพิ่ม versioned cloud envelope และ soft-delete สำหรับทุก entity โดยไม่เปลี่ยนความหมายฟิลด์เดิม เก็บ customer/soilType แบบข้อความเดิมและรายงานกรณีอ้างอิงกำกวม ไม่เดา ID
4. เปลี่ยน adapter เดิมเป็น transaction ที่ตรวจ base revision และ operation ID: replay เดิมต้องคืนผลเดิม, remote เปลี่ยนต้องสร้าง conflict พร้อมทั้งสองฉบับ ห้าม last-write-wins; legacy trip ที่ไม่มี baseline ต้องอ่าน server และเทียบ payload ก่อนกำหนด baseline ห้ามถือว่า local revision สูงกว่าคือปลอดภัย
5. เพิ่ม sync coordinator สำหรับ auth/online/local mutations พร้อม backoff และการประสานหลายแท็บ ตรวจ owner ก่อนและหลัง network calls ยืนยัน outbox เฉพาะ operation ที่ server ยอมรับและยังตรง local version; error/timeout ต้องคง pending เพื่อ replay ได้
6. Restore หลังตรวจสิทธิ์: อ่าน server แบบแบ่งหน้าและตรวจ schema ก่อน merge ใช้ server timestamp กับ document ID เป็น cursor และบันทึก cursor พร้อม merge transaction; กรณี unknown schema ให้หยุดโดยไม่เปลี่ยน state; initial restore ต้องอ่านครบก่อนรายงานสำเร็จ
7. Merge โดยไม่ล้าง IndexedDB และไม่ทับ pending; ตรวจ references จากผลรวม local/cloud รวม tombstones เก็บรายการผิดปกติและ conflict ให้ตรวจสอบ; manual resolution ต้องแสดงทั้งสองฉบับและตรวจ remote revision อีกครั้งก่อนยอมรับ เก็บประวัติการตัดสินใจ
8. เพิ่ม UI สถานะ pending/syncing/error/conflict/restoring/verified พร้อมรายละเอียดแยก collection และปุ่ม retry/resolve; refresh Dashboard จาก IndexedDB หลัง merge ไม่ประกาศ success จาก cache หรือก่อน server acknowledgement
9. เพิ่ม rules เฉพาะ paths ที่ใช้ ตรวจ owner/admin, schema, immutable ID/createdAt, revision และ tombstone; เพิ่ม emulator tests สำหรับ anonymous, non-admin, disabled admin, cross-owner และ invalid writes โดยไม่ deploy rules อัตโนมัติ
10. รัน automated checks และทดสอบ staging หลายอุปกรณ์ตามตารางด้านล่าง จัดทำรายงานผลจริงก่อนขออนุมัติใช้ migration กับข้อมูลจริง

## Migration และ rollback

- ผู้ใช้อนุมัติการเปลี่ยนผ่านข้อมูลในรอบนี้แล้ว แต่ไม่ได้สั่ง deploy ระบบจริง ก่อนนำรุ่นนี้ขึ้นใช้งานต้องสำรอง Firestore และข้อมูลแต่ละเครื่อง ตรวจข้อมูลจำลองและ staging ตามรายการด้านล่าง
- ไม่เปลี่ยน primary keys ไม่ reset/delete IndexedDB ไม่ clear localStorage ไม่ลบ Firestore collections ไม่ hard delete records
- การเปิด app รุ่นใหม่ต้องไม่เริ่มอัปโหลด legacy records ทั้งหมดก่อนจัดทำ baseline และตรวจ conflicts
- รักษา state เดิมจนตรวจ migration integrity ครบ; เก็บ migration journal เพื่อ resume หลังปิด browser โดยไม่ทำซ้ำ
- หาก migration ล้มเหลว ให้ abort transaction และเก็บ backup/source เดิม เปิดโหมดอ่าน/ส่งออกพร้อมข้อความผิดพลาด ห้ามย้อน app ไปใช้ writer เก่าที่ไม่เข้าใจ metadata ใหม่
- ตรวจและรายงานข้อมูลที่เคยลบจาก audit; ห้ามสร้างรายการกลับมาอัตโนมัติเพราะอาจทำให้ข้อมูลที่ตั้งใจลบกลับมาใช้งาน

## แผนทดสอบ

| ข้อในคำขอ | Automated coverage ที่ต้องเพิ่ม                                                          | การยืนยันบนบริการจริง                       |
| --------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- |
| 01, 03    | server acknowledgement, replay, pending ไม่ถูก acknowledge เมื่อ local เปลี่ยน           | Firestore staging และการตัดต่อเครือข่าย     |
| 02, 04    | fake IndexedDB: atomic mutation/outbox, close/reopen, interrupted sync, migration resume | refresh/ปิดเปิด browser ขณะ offline         |
| 05        | restore ทุกชนิด, pagination, unknown schema, pending preservation, account switch        | login บนอุปกรณ์ใหม่                         |
| 06        | สอง client ใช้ base revision เดียวกัน, เก็บสองฉบับ, stale manual resolution              | สองอุปกรณ์แก้รายการเดียวกัน                 |
| 07, 08    | retry/backoff, timeout หลัง commit, partial failure, double submit, cross-tab replay     | เครือข่ายไม่เสถียร                          |
| 09        | Firestore emulator ทดสอบ allow/deny จริง ไม่ใช้ SDK mock แทน rules tests                 | ตรวจ deployment rules ใน staging            |
| 10        | references, tombstones, legacy text fields, counts/IDs, backup round trip และ rollback   | เปรียบเทียบ backup กับข้อมูลจริงโดยไม่แก้ไข |

ชุดทดสอบเดิม `src/test/firebase.test.ts` mock Firebase SDK จึงไม่ยืนยัน Firestore rules หรือความสำเร็จบน server จริง ชุด storage ใช้ fake IndexedDB จึงไม่แทนการทดสอบอุปกรณ์จริง

## ขอบเขตที่ได้รับอนุมัติ

พัฒนาและทดสอบ additive migration, outbox, baseline/conflict handling, soft delete และ restore ผู้ใช้ยอมรับการเริ่มใหม่หากจำเป็นสำหรับรอบนี้ แต่ implementation ไม่ต้องล้างข้อมูลหรือเปลี่ยน primary keys งานนี้ไม่รวม commit/push/deploy อัตโนมัติ
