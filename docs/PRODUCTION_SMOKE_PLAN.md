# Production smoke-test plan — no deployment performed

2026-11-08 (Asia/Bangkok). แผนนี้ไม่ใช่คำอนุญาต push/deploy หรือ migration. รันได้หลังมีคำสั่งอนุญาตแยก พร้อมระบุ Firebase project, Hosting/backend URLs และบัญชีทดสอบโดยชัดเจน

## Prerequisites

- เก็บ commit/build artifact, lockfiles, environment/runtime versions และผล full gate ที่ตรงกับ artifact
- สำรองข้อมูลและ pending originals; ทบทวน backward-compatible rules สำหรับ workspaces/documents/drive mappings ก่อน rollout ห้าม reset IndexedDB/Firestore หรือ hard delete เพื่อแก้ปัญหา
- ยืนยัน dedicated test project/account/origins แยกจากข้อมูล production. ตรวจ public VITE config, OAuth allowed origins/scope, enabled admin UID และ backend configuration ผ่าน secure settings; ไม่ส่ง secrets ผ่านแชตหรือ commit
- Current cloud has no VITE app config/OAuth/encryption bindings or .env.local files. GOOGLE_APPLICATION_CREDENTIALS selector is present, but was not assumed to authorize this application or used against an unknown project. Never infer production permission from an ambient credential
- ตรวจ outbound destinations สำหรับ Firebase Auth/Firestore, Google Identity/OAuth/Drive และ backend URL จริงใน environment settings. Do not broaden the network policy automatically
- ต้องมี Android tablet/browser จริงสำหรับ camera, touch/stylus, installability และ offline acceptance; desktop emulation ไม่แทน hardware

## Read-only checks after an authorized rollout

1. ตรวจ backend /health ที่ URL จริงต้องได้ expected service JSON และ frontend HTML/hashed assets/manifest/service worker status ปกติ ไม่เดา URL จากชื่อ service
2. ตรวจ TLS, console/runtime errors และ cache update โดยไม่ clear user data. Reload offline ต้องไม่สูญเสีย local pending work
3. ตรวจว่า frontend build ไม่มี service-account key, OAuth client secret หรือ encryption key. Verify rules default-deny, account boundary, admin gating และ backend exact-origin/CSRF/token verification

## Dedicated-account functional smoke

1. สร้าง test project/master/daily rows ที่มี prefix แยกชัดเจน; offline +1, restart, reconnect และ retry ต้องคง unique IDs/snapshots. เปรียบเทียบ master/trip/day totals
2. Upload controlled originals + signature, interrupt network/metadata step, retry with stable IDs และยืนยัน original bytes ก่อนเอา pending Blob ออก. ไฟล์ต้อง private ไม่เพิ่ม public permissions
3. ตรวจ OAuth expiry/revoke/reconnect, owner mismatch และ denied permissions โดย pending data ยังอยู่. ใช้ read-only inventory audit เทียบ missing/mismatch/unmapped candidates; ไม่ลบ orphan candidates อัตโนมัติ
4. Restore บัญชีเดิมบนอุปกรณ์อีกเครื่อง เปรียบเทียบ metadata, exact file bytes/hash ที่ควบคุมต้นทาง และ offline preview/download. บัญชีอื่นต้องเข้าถึงไม่ได้
5. ตรวจ discrepancy, correction reason/audit, verify→close→reopen→reverify→close และ snapshots เดิมไม่เปลี่ยน
6. ตรวจ daily/week/month filters, totals, loose-volume wording, CSV UTF-8, XLSX metadata/refs, Thai multipage PDF และเปิดไฟล์บน Android/Excel จริง
7. Survey: ตรวจ BM/datum/units กับข้อมูลวัดจริง, CSV/XLSX preview validation, Y-up coordinates, approximate contour labels, cut/fill/material-state assumptions และ history persistence. ไม่ใช้ภาพประมาณแทน measurement

## Stop / rollback criteria

หยุด rollout เมื่อมี data loss/cross-account access/silent overwrite/wrong totals หรือ original removed before verified metadata. เก็บเหตุการณ์/commit/ขั้นตอน reproduce โดยไม่ log credentials. Rollback artifact ต้องมีการอนุญาตและไม่ล้าง storage หรือย้าย schema ย้อนหลังแบบทำลายข้อมูล

Backup JSON currently supports account-scoped export of pending bytes and metadata; arbitrary JSON re-import/merge is not an implemented recovery UI. Do not clear data expecting that file to import automatically. Cloud restore and pending queue retention are independently tested; local JSON re-import remains a separate feature decision
