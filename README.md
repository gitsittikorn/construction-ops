# Khok Kloi Backhoe Engineering · Construction Operations

ระบบบริหารงานถมดินรุ่นเริ่มต้น React / TypeScript / Vite ออกแบบสำหรับแท็บเล็ต ภาษาไทย

## เริ่มใช้งาน

Node.js 22.12 ขึ้นไป (เครื่อง Windows ที่จำกัด PowerShell scripts ให้ใช้ `npm.cmd`)

```sh
npm install
npm run dev
npm run check
```

## ฟีเจอร์ในรุ่นนี้

- ภาพรวมโครงการและจำนวนเที่ยวรถรายวัน ตามวันที่ประเทศไทย
- เพิ่ม แก้ไข ค้นหา และเปลี่ยนสถานะโครงการ รวมถึง Archive
- ข้อมูลรถ คนขับ แหล่งดิน ลูกค้า พร้อมปิดใช้งานแทนการลบ
- บันทึก/แก้ไขเที่ยวรถใน IndexedDB พร้อมประวัติและ UUID ป้องกัน retry ซ้ำ
- โหลดข้อมูลกลับหลัง refresh และแยกข้อมูลตามบัญชี
- รายงานกรองวันที่/โครงการ/ทะเบียน ส่งออก CSV ภาษาไทย และพิมพ์ A4 ผ่าน Browser PDF
- เครื่องคำนวณระดับจุดตั้งกล้องเดียวและปริมาตรความสูงสม่ำเสมอ (ยังไม่บันทึกผล)
- Firebase Google login และซิงก์เที่ยวรถแบบ transaction เมื่อมี configuration
- Web app manifest และ service worker สำหรับ production build

## ขอบเขตและข้อจำกัด

ยังไม่ใช่ระบบ production สมบูรณ์: ยังไม่มี Drive upload, รูปถ่าย, ลายเซ็น, evidence verification, grid survey, turning points, Excel, การดึงคืนข้อมูล cloud หรือการซิงก์ projects/master data การซิงก์อัตโนมัติเกิดเมื่อเปิดแอป/กลับมาออนไลน์เท่านั้น; ใช้ปุ่มซิงก์สำหรับรายการใหม่ระหว่างออนไลน์

โหมด local ไม่ใช่การยืนยันตัวตน เก็บข้อมูลบนอุปกรณ์ของผู้ใช้เท่านั้น การล้าง site data จะลบ IndexedDB และ CSV ไม่ใช่ full backup ใช้งานหนึ่งแท็บต่อบัญชีในรุ่นนี้เพื่อหลีกเลี่ยง concurrent local writes

## Firebase

คัดลอก `.env.example` เป็น `.env.local` แล้วกรอก public web app configuration เปิด Google provider ใน Firebase Authentication และเพิ่ม authorized domain

สร้างเอกสาร `admins/{uid}` ผ่าน Firebase Console สำหรับเจ้าของเพียงคนเดียว ก่อนใช้งานคลาวด์ ต้องตรวจสอบและ deploy `firestore.rules` ไปยังโปรเจกต์จริง (แอปไม่สร้างสิทธิ์ admin เอง) ห้ามใส่ service account private key หรือ OAuth client secret ใน `VITE_*`

กฎที่แนบเป็นจุดเริ่มต้น ยังต้องทดสอบด้วย Firebase Emulator และขยาย validation ของข้อมูลอ้างอิงเมื่อเพิ่ม project/master cloud sync ก่อนเปิด production

## คุณภาพและไฟล์ชั่วคราว

`npm run check` รัน format check, typecheck, tests, build และ HTTP smoke test ตามลำดับในทุกการเปลี่ยนแปลงฟีเจอร์ ทดสอบ duplicate retry, revision, validation, timezone, CSV injection, คำนวณ, IndexedDB และ flow UI โปรเจกต์→รถ→เที่ยวรถ→reload รวมถึง Firebase SDK จำลองและ service worker cache policy จำลอง

`npm run clean` ล้างเฉพาะ cache ติดตั้ง, coverage, test reports และ TypeScript build metadata ที่กำหนดไว้ โดยเก็บ production build ใน `dist/` ไว้สำหรับ preview คำสั่งปฏิเสธ symlink และ path ที่อยู่นอกโปรเจกต์

`node_modules/`, `dist/`, coverage, test reports, logs และ tsbuildinfo ถูก ignore ไม่เก็บใน Git ไม่ลบ IndexedDB หรือไฟล์ผู้ใช้ในขั้นตอน cleanup เก็บ lockfile สำหรับ reproducible installs ไม่สร้าง screenshot หรือไฟล์ debug ถาวรโดยไม่จำเป็น

ยังต้องทดสอบกับ Android Chrome จริง, installation/offline service worker, Firebase Emulator, Google login/permission denied และ server sync ก่อนใช้ข้อมูลจริง

## Roadmap

1. ทดสอบ Emulator rules และเพิ่ม cloud persistence ของ project/master/audit พร้อม restore และ conflict handling
2. Drive OAuth `drive.file`, durable file queue, idempotent uploads, token expiry/retry และ signatures
3. Daily evidence/reconciliation/verification และรายงานยืนยันที่แยกจาก pending
4. Survey sessions, turning points, grid/slope calculations, assumptions persistence
5. Excel export, PDF reports, Android E2E และ production security review

ยังไม่มีการ deploy หรือ commit อัตโนมัติ
