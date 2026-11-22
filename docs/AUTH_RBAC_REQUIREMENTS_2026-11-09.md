# Authentication and user management — supplied requirements

Received 2026-11-10 (Asia/Bangkok). The supplied update is dated 2026-11-09. Preserve the existing Phase 0–8 roadmap; this is an additive authorization requirement.

```text
PROJECT: Construction Operations
REQUIREMENTS UPDATE: 2026-11-09

Repository:
https://github.com/gitsittikorn/construction-ops

OBJECTIVE:
เพิ่มระบบ Authentication, Authorization และ User Management
สำหรับเว็บไซต์จัดการงานถมดิน โดยมี Super Admin
เป็นผู้ควบคุมสิทธิ์การเข้าถึงของทีมงานทั้งหมด

==================================================
1. EXISTING SYSTEM
==================================================

Technology Stack (ตรวจสอบจาก Repository ก่อน):
- React + TypeScript + Vite
- PWA / Offline Support
- Firebase Authentication
- Firebase Firestore
- IndexedDB
- Google Drive
- Google Sheets
- GitHub / Codex

IMPORTANT:
1. ตรวจสอบโครงสร้างและโค้ดปัจจุบันก่อนดำเนินการ
2. ห้ามสร้าง Authentication ซ้ำหากมีอยู่แล้ว
3. ห้ามเปลี่ยน Database จาก Firebase เป็น Supabase
4. ห้ามกระทบระบบบันทึกเที่ยวรถและการคำนวณดิน
5. รักษาการทำงาน Offline และ Data Sync เดิม
6. ห้ามลบหรือเปลี่ยนข้อมูล Production โดยพลการ

==================================================
2. GOOGLE AUTHENTICATION
==================================================

กำหนดให้ผู้ใช้งานทุกคน Login ผ่าน Google เท่านั้น

Requirements:
- ใช้ Firebase Authentication + Google Provider
- ตรวจสอบ Authentication UID
- ตรวจสอบสิทธิ์จากฐานข้อมูล
- Google Login สำเร็จไม่ได้หมายถึงได้รับสิทธิ์เข้าใช้งาน
- ผู้ไม่มีสิทธิ์ต้องไม่สามารถเข้าถึงข้อมูลระบบได้
- รองรับ Session Persistence
- รองรับ Logout
- ป้องกันการเข้าถึง Protected Routes

==================================================
3. ROLE-BASED ACCESS CONTROL (RBAC)
==================================================

กำหนด Roles:

1. super_admin
   - เข้าถึงระบบทั้งหมด
   - เพิ่ม/ลบ/แก้ไขสิทธิ์ทีมงาน
   - กำหนดบทบาทผู้ใช้งาน
   - เปิด/ปิดสิทธิ์บัญชี
   - ตรวจสอบ Audit Logs

2. admin
   - จัดการข้อมูลหน้างานตามสิทธิ์
   - เพิ่ม/แก้ไขข้อมูลเที่ยวรถ
   - ดูรายงาน
   - ไม่สามารถแต่งตั้ง Super Admin

3. staff
   - บันทึกข้อมูลเที่ยวรถตามสิทธิ์
   - อัปโหลดภาพและเอกสาร
   - ดูข้อมูลที่เกี่ยวข้องกับงานของตน

4. viewer
   - ดูข้อมูลและรายงานที่ได้รับอนุญาต
   - ไม่สามารถแก้ไขข้อมูล

ใช้หลัก Least Privilege และ Default Deny

==================================================
4. SUPER ADMIN BACK OFFICE
==================================================

เพิ่มหน้า User Management

Features:
- เพิ่มอีเมล Google ที่อนุญาต
- แสดงรายชื่อทีมงาน
- กำหนด Role
- เปลี่ยน Role
- เปิด/ปิดสิทธิ์
- ค้นหาผู้ใช้งาน
- แสดงสถานะบัญชี
- แสดง Last Login
- แสดง Created At / Updated At
- บันทึก Audit Logs

Workflow:

1. Super Admin เพิ่มอีเมลทีมงาน
2. ระบบบันทึกอีเมลใน Allowlist
3. ทีมงาน Login ผ่าน Google
4. Firebase ยืนยันตัวตน
5. Backend ตรวจสอบ Allowlist
6. ผูกบัญชีเข้ากับ Firebase UID
7. ระบบตรวจสอบ Role และ Account Status
8. อนุญาตให้เข้าหน้าเว็บตามสิทธิ์

Security:
- Normalize อีเมลก่อนตรวจสอบ
- ตรวจสอบ Verified Email
- ห้าม Public User แก้ไข Allowlist
- ห้ามกำหนด Role จาก Client โดยตรง
- ใช้ Firebase Admin SDK ผ่าน Trusted Backend
- พิจารณา Custom Claims สำหรับ Roles
- บังคับสิทธิ์ด้วย Firestore Security Rules
- ห้ามใช้การซ่อนเมนูเป็นมาตรการรักษาความปลอดภัยเพียงอย่างเดียว
- ป้องกันการลบหรือปิด Super Admin คนสุดท้าย
- ยกเลิกสิทธิ์ต้องมีผลต่อการเข้าถึงข้อมูลอย่างรวดเร็ว
- รองรับ MFA สำหรับบัญชีผู้ดูแลระบบตามความเหมาะสม

Initial Super Admin:
- ห้าม Hardcode อีเมลหรือ UID ใน Frontend
- เตรียม Secure Bootstrap Script
- ระบุขั้นตอนตั้งค่า Super Admin คนแรก
- ห้ามเปิด Public Registration เพื่อรับสิทธิ์ Admin

==================================================
5. DATABASE DESIGN
==================================================

ออกแบบ Firestore Collections ตามความเหมาะสม เช่น:

authorized_users
users
audit_logs

ตัวอย่าง Authorized User:
- uid
- email
- role
- status
- createdAt
- updatedAt
- lastLoginAt
- createdBy
- updatedBy

Allowlist ต้องรองรับอีเมลที่ยังไม่เคย Login
และผูก UID หลังการยืนยันตัวตนครั้งแรก

ออกแบบ Index และ Security Rules ให้เหมาะสม

==================================================
6. OFFLINE & SYNC
==================================================

ข้อกำหนด:
- ต้องไม่ทำลาย Offline Workflow เดิม
- ผู้ใช้ต้องเคยผ่านการยืนยันตัวตนและมีสิทธิ์
- ห้ามนำข้อมูลสิทธิ์ที่ Cache ไว้มาถือเป็นสิทธิ์ถาวร
- เมื่อ Online ต้องตรวจสอบสิทธิ์ล่าสุด
- ผู้ถูกระงับสิทธิ์ต้องไม่สามารถ Sync ข้อมูลใหม่
- ข้อมูลค้าง Sync ต้องไม่สูญหายโดยไม่แจ้งผู้ใช้
- ออกแบบวิธีจัดการข้อมูล Local เมื่อ Logout
  หรือเมื่อมีการเปลี่ยนบัญชีผู้ใช้
- ป้องกันข้อมูลของผู้ใช้คนก่อนรั่วไหลบนอุปกรณ์ร่วม

==================================================
7. TESTING REQUIREMENTS
==================================================

ใช้ Unit Test / Integration Test / E2E Test

Test Cases:
- Google Login สำเร็จ
- Google Login แต่ไม่ได้อยู่ใน Allowlist
- ผู้ใช้ถูก Disable
- Admin เข้าถึงหน้า Super Admin ไม่ได้
- Staff ไม่สามารถแก้ไข Role
- Viewer ไม่สามารถบันทึกข้อมูล
- Super Admin เพิ่มอีเมลใหม่ได้
- Super Admin เปลี่ยนและปิดสิทธิ์ได้
- ป้องกันการลบ Super Admin คนสุดท้าย
- Firestore Rules ปฏิเสธ Unauthorized Access
- Logout และ Session Persistence
- Offline / Online Reconnect
- ผู้ถูกปิดสิทธิ์ไม่สามารถ Sync ต่อ
- ไม่มี Regression ของระบบเที่ยวรถและรายงาน

==================================================
8. IMPLEMENTATION INSTRUCTIONS
==================================================

1. Audit Repository และสถานะ Phase ปัจจุบัน
2. สรุป Gap Analysis เทียบกับ Requirements
3. ออกแบบ Data Model และ Security Rules
4. แบ่ง Implementation Tasks
5. พัฒนา Authentication และ RBAC
6. พัฒนา User Management Back Office
7. สร้างและรัน Automated Tests
8. ตรวจสอบ Build / Lint / Typecheck
9. Update Documentation และ AGENTS.md
10. สรุปผล พร้อมรายการไฟล์ที่เปลี่ยนแปลง

Git Workflow:
- ทำงานบน Feature Branch
- ห้าม Force Push
- ห้ามแก้ Production Secrets
- สร้าง Pull Request พร้อม Test Results
- ห้าม Merge หรือ Deploy Production โดยไม่อนุมัติ

หากพบว่าส่วนใดพัฒนาไว้แล้ว
ให้ตรวจสอบและปรับปรุงแทนการสร้างซ้ำ

เริ่มจาก Audit และ Gap Analysis ก่อน
จากนั้นดำเนินการตามลำดับที่ปลอดภัย
โดยไม่ทำลายระบบเดิม
```
