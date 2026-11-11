# Khok Kloi Backhoe Engineering · Construction Operations

## การทำงานต่อทุก Codex session

อ่าน [AGENTS.md](AGENTS.md), [Master Roadmap Phase 0–8](docs/MASTER_ROADMAP.md),
[สถานะและ checkpoint](docs/ROADMAP_PROGRESS.md), [Bug Tracker](docs/BUG_TRACKER.md)
และรายงาน phase ที่เกี่ยวข้อง แล้วตรวจ Git/source ก่อนทำงานต่อ เอกสารเหล่านี้เก็บข้อกำหนดถาวร
แต่ต้องเทียบผลทดสอบจริงเสมอ ไม่ใช้สถานะจากแชตเก่าแทนหลักฐาน และห้าม push/deploy โดยไม่ได้รับอนุญาต

ระบบบริหารงานถมดินรุ่นเริ่มต้น React / TypeScript / Vite ออกแบบสำหรับแท็บเล็ต ภาษาไทย

ผลตรวจ Phase 1 ล่าสุด (2026-11-06): ดู [Phase 1 audit and E2E report](docs/PHASE_1_E2E_REPORT.md) สำหรับ coverage, บั๊กที่แก้ และข้อจำกัด ข้อความขอบเขต/roadmap ด้านล่างบางส่วนเป็นบันทึกรุ่นเก่า: ปัจจุบันมี project/master sync, durable outbox, conflict handling และ cloud restore แล้ว การผ่าน Emulator ไม่ใช่การยืนยันบริการจริงหรือความพร้อม production

## ดูฟีเจอร์บน Desktop web ก่อน

เป้าหมายรอบนี้คือดูและใช้งานฟีเจอร์บนเว็บเดสก์ท็อปก่อน การตรวจ Android เลื่อนไปภายหลัง ดู [คู่มือ Desktop Review](docs/DESKTOP_REVIEW.md) สำหรับลำดับทดลองฟีเจอร์และความต่างระหว่าง local mode กับบริการ Firebase/Drive จริง

## เริ่มใช้งาน

Node.js 22.12 ขึ้นไป (เครื่อง Windows ที่จำกัด PowerShell scripts ให้ใช้ `npm.cmd`)

```sh
npm install
npm run dev
npm run check
```

## ฟีเจอร์ในรุ่นนี้

เพิ่มจาก roadmap continuation: รายงานสัปดาห์/เดือนพร้อม metadata และเลขอ้างอิงหลักฐาน, ตรวจไฟล์ Drive แบบอ่านอย่างเดียว, correction reasons และนำเข้า CSV/XLSX สำรวจแบบ preview พร้อมกริด Y-up/contour ประมาณ ดูสถานะที่ทดสอบจริงและข้อจำกัดใน [Roadmap Progress](docs/ROADMAP_PROGRESS.md)

- ภาพรวมโครงการและจำนวนเที่ยวรถรายวัน ตามวันที่ประเทศไทย
- เพิ่ม แก้ไข ค้นหา และเปลี่ยนสถานะโครงการ รวมถึง Archive
- ระบุพิกัดในช่องเดียวรูปแบบ `lat, lng` เช่น `13.7563, 100.5018` (ไม่บังคับ แต่ต้องกรอกครบคู่) และกดตัวเลขบนการ์ดเพื่อเปิด Google Maps ไม่ต้องมี Maps API key ข้อมูลยังเก็บ latitude/longitude แยกใน model เพื่อรองรับโครงการเดิม
- ข้อมูลรถ คนขับ แหล่งดิน ลูกค้า พร้อมปิดใช้งานแทนการลบ
- ข้อมูลรถเพิ่มจังหวัดทะเบียน เบอร์โทร ประเภทรถหกล้อ/สิบล้อ/อื่น ๆ และแท็กทีม พร้อมค้นหา/กรองแท็กและประเภทรถ
- Excel .xlsx สำหรับรถ: ไฟล์ตัวอย่าง นำเข้าแบบตรวจรายการก่อนบันทึก และส่งออกตามตัวกรอง
- ข้อมูลพื้นฐานชนิดดิน: เพิ่ม/แก้ไข/ปิดใช้งาน และเลือกจาก dropdown ในเที่ยวรถ โดยเก็บชื่อเดิมในประวัติเที่ยวรถแม้แก้ชื่อหรือปิดรายการภายหลัง
- บันทึก/แก้ไขเที่ยวรถใน IndexedDB พร้อมประวัติและ UUID ป้องกัน retry ซ้ำ
- โหลดข้อมูลกลับหลัง refresh และแยกข้อมูลตามบัญชี
- รายงานกรองวันที่/โครงการ/ทะเบียน ส่งออก CSV ภาษาไทย และพิมพ์ A4 ผ่าน Browser PDF
- เครื่องคำนวณระดับจุดตั้งกล้องเดียวและปริมาตรความสูงสม่ำเสมอ (ยังไม่บันทึกผล)
- Firebase Google login และซิงก์เที่ยวรถแบบ transaction เมื่อมี configuration
- Google Drive OAuth ผ่าน Google Identity Services, scope `drive.file`, ตรวจบัญชีตรงกับ Firebase
- คิวภาพต้นฉบับ/PDF ใน IndexedDB, resumable upload พร้อม progress, retry ด้วย File ID เดิม, ตรวจผลก่อนบันทึก metadata และลบ pending Blob
- เชื่อมต่อ/ต่ออายุ/ตัดการเชื่อมต่อ Drive และดาวน์โหลดไฟล์ต้นฉบับจากหน้าการตั้งค่า
- Web app manifest และ service worker สำหรับ production build

## ขอบเขตและข้อจำกัด

มีงานรายวัน รายเที่ยวพร้อมความจุย้อนหลัง รูปหลักฐาน ลายเซ็น ตรวจยอด และปิดวันแล้ว ดูขอบเขตและหลักฐานทดสอบใน [Phase 2 report](docs/PHASE_2_REPORT.md) และ [Phase 3 report](docs/PHASE_3_REPORT.md) การซิงก์อัตโนมัติเกิดเมื่อเปิดแอป/กลับมาออนไลน์; ใช้ปุ่มซิงก์สำหรับรายการใหม่ระหว่างออนไลน์ การบันทึกในเครื่องและ READY ไม่ใช่การยืนยัน Cloud และยังปิดวันไม่ได้จนหลักฐานอัปโหลด/metadata ผ่านและยืนยันยอดครบ

ยังไม่ถือว่าตรวจรับ production: Google/Firebase/Drive/OAuth จริงและ Android hardware ยัง NOT VERIFIED ผล Drive ใน automated tests เป็นตัวจำลอง ส่วน Firestore ใช้ local emulator เท่านั้น Phase 4 ต้องตรวจการกู้คืนไฟล์ต้นฉบับส่วนตัวบนอุปกรณ์ใหม่และบริการจริง

กู้คืนต้นฉบับไว้ดู offline ได้จากหน้า Drive ด้วยปุ่ม **เก็บต้นฉบับไว้ดูออฟไลน์** หลังตรวจข้อมูลอ้างอิง/ชนิด/ขนาดไฟล์แล้ว สำเนานี้แยกจากคิวไฟล์รออัปโหลดและไม่เปลี่ยนผลตรวจยอด ดู [Phase 4 report](docs/PHASE_4_REPORT.md) สำหรับผลทดสอบและขอบเขตที่ยังไม่ยืนยัน

## Google Drive

เพิ่ม `VITE_GOOGLE_CLIENT_ID` ใน `.env.local` เปิด Drive API และตั้งค่า OAuth consent/origins ให้ตรงกับ URL ที่เปิด เช่น `http://localhost:5173` เชื่อม Drive ด้วยบัญชีเดียวกับ Firebase ที่หน้า **การตั้งค่า** ก่อนอัปโหลด ต้องเผยแพร่ `firestore.rules` รุ่นนี้ใน Firebase Console หรือ Firebase CLI และเอกสาร `admins/{uid}` ต้องมี `enabled: true`

โฟลเดอร์สร้างตาม File ID: `Khok Kloi Construction Management/Projects/{ชื่อโครงการ}/Documents` เก็บ mappings ใน Firestore และ IndexedDB ไม่สร้าง public permissions ไฟล์อาจผูกกับเที่ยวรถได้ เก็บภาพโดยไม่ย่อ รองรับรูปภาพและ PDF สูงสุด 100 MB ต่อไฟล์ ข้อจำกัดนี้เป็นของแอปรุ่นนี้ ไม่ใช่เพดานของ Google Drive

หน้า Settings มีปุ่ม **เตรียมโฟลเดอร์โครงการใน Drive** หลังเชื่อมต่อและเลือกโครงการ เพื่อสร้างโฟลเดอร์ได้โดยไม่ต้องอัปโหลดไฟล์ พร้อมลิงก์เปิดโครงการ/Documents/โฟลเดอร์หลักโดยตรง การเชื่อมต่อหรือประมวลผลคิวจะตรวจ mapping เดิมและเปลี่ยนชื่อโฟลเดอร์รหัส UUID ให้เป็นชื่อโครงการ โดยใช้ Folder ID เดิม ไม่ย้ายไฟล์หรือสร้างโฟลเดอร์ซ้ำ หากเปลี่ยนชื่อโครงการในแอป ให้เชื่อม Drive หรือกดเตรียมโฟลเดอร์อีกครั้งเพื่ออัปเดตชื่อจริง

Access token อยู่ในหน่วยความจำและ sessionStorage ของแท็บ โดยแยกตามบัญชีและตรวจ expiry จึงคงการเชื่อมต่อผ่านการสลับหน้าและ refresh ในแท็บเดิมได้ หาก browser ไม่อนุญาต sessionStorage จะใช้หน่วยความจำแทน ไม่เก็บใน IndexedDB, localStorage, env หรือ Firestore; refresh token เก็บเข้ารหัสที่ backend เมื่อเปิดใช้ backend เท่านั้น การหมดอายุ/ตัดการเชื่อมต่อ/เปลี่ยนบัญชีจะล้าง session ที่เกี่ยวข้องในแอป แต่ไม่ใช่การถอนสิทธิ์ใน Google Account การเก็บ access token ฝั่ง browser ยังขึ้นกับความปลอดภัยของ same-origin scripts และไม่ควรถูกอ้างว่าไม่มีความเสี่ยงจาก XSS

การอัปโหลด: เชื่อม Drive → เลือกโครงการ/เที่ยวรถ → เลือกไฟล์ → กด **อัปโหลดไฟล์ที่เลือก** แอปจะเก็บต้นฉบับเข้าคิวก่อนส่ง หากยังไม่เชื่อมหรือออฟไลน์ จะเก็บรอในเครื่องและเริ่มเมื่อเชื่อมสำเร็จ ปุ่ม **เตรียมโฟลเดอร์โครงการใน Drive** สร้างเฉพาะโฟลเดอร์ ไม่อัปโหลดภาพที่เลือกอยู่ หน้าจอแสดงจำนวนไฟล์ที่เลือกแต่ยังไม่ส่ง แจ้ง error เมื่อไม่มีไฟล์แทนการเงียบ และมีลิงก์ **เปิดไฟล์นี้ใน Google Drive** หลังยืนยัน upload/metadata แล้ว

คิวทำงานเมื่อเชื่อมสำเร็จหรือกลับมาออนไลน์ขณะที่หน้านี้เปิดอยู่ การ retry อาจเริ่มโอน bytes ใหม่ แต่ใช้ File ID เดิมเสมอและตรวจไฟล์ที่อัปโหลดสำเร็จแล้วก่อนโอน ไม่พึ่ง Background Sync และยังไม่รองรับ Shared Drive หรือ Google Workspace native documents

เมื่ออัปเดตจากฐานข้อมูลรุ่นเก่า ให้ reload ทุกแท็บของแอปเพื่อปล่อย IndexedDB connection เก่า ไม่มีการลบข้อมูลเดิม หากมี `permission-denied` หลังเชื่อม Drive ให้ตรวจ Rules และ Admin ก่อน ไฟล์ pending จะยังอยู่ในเครื่อง

โหมด local ไม่ใช่การยืนยันตัวตน เก็บข้อมูลบนอุปกรณ์ของผู้ใช้เท่านั้น การล้าง site data จะลบ IndexedDB และ CSV ไม่ใช่ full backup ใช้งานหนึ่งแท็บต่อบัญชีในรุ่นนี้เพื่อหลีกเลี่ยง concurrent local writes

## Firebase

คัดลอก `.env.example` เป็น `.env.local` แล้วกรอก public web app configuration เปิด Google provider ใน Firebase Authentication และเพิ่ม authorized domain

สร้างเอกสาร `admins/{uid}` ผ่าน Firebase Console สำหรับเจ้าของเพียงคนเดียว ก่อนใช้งานคลาวด์ ต้องตรวจสอบและ deploy `firestore.rules` ไปยังโปรเจกต์จริง (แอปไม่สร้างสิทธิ์ admin เอง) ห้ามใส่ service account private key หรือ OAuth client secret ใน `VITE_*`

กฎที่แนบเป็นจุดเริ่มต้น ยังต้องทดสอบด้วย Firebase Emulator และขยาย validation ของข้อมูลอ้างอิงเมื่อเพิ่ม project/master cloud sync ก่อนเปิด production

## คุณภาพและไฟล์ชั่วคราว

`npm run check` รัน format check, typecheck, tests, build, HTTP smoke test และ Playwright E2E ตามลำดับในทุกการเปลี่ยนแปลงฟีเจอร์ ทดสอบ duplicate retry, revision, validation, timezone, CSV injection, คำนวณ, IndexedDB และ flow UI โปรเจกต์→รถ→เที่ยวรถ→reload รวมถึง Firebase SDK จำลองและ service worker cache policy จำลอง

E2E ใช้ Edge แบบ headless บน Windows และ Chromium บนระบบอื่น (`npx playwright install chromium` หากยังไม่มี) เปิด server แยกบน port 5174 พร้อม override Firebase/Google env เฉพาะ process ทดสอบเป็นค่าว่าง ไม่เปลี่ยน `.env.local` ไม่อ่านข้อมูล browser profile ของผู้ใช้ และไม่ส่งข้อมูลไป cloud จริง

ข้อมูลพื้นฐานอัปเดตข้ามแท็บผ่าน BroadcastChannel และเมื่อกลับมา focus พร้อม transaction อ่านข้อมูลล่าสุดก่อนเขียนเพื่อป้องกันทับข้อมูลแท็บอื่น ข้อมูลยังแยกตามบัญชีและ origin: `localhost` กับ `127.0.0.1` เป็นคนละที่เก็บ ไม่ควรสลับ URL ระหว่างทำงาน

ช่องเลือกโครงการในเที่ยวรถและเอกสารแสดงทุกโครงการพร้อมสถานะ แต่บันทึกงานใหม่ได้เฉพาะโครงการที่กำลังดำเนินการ หากเป็น Draft ให้เปิดหน้าโครงการ → ดู/แก้ไข → เปลี่ยนสถานะเป็นกำลังดำเนินการแล้วบันทึก ช่องเลือกจะอัปเดตตามข้อมูลโดยไม่เปลี่ยนสถานะอัตโนมัติ

เพิ่มชนิดดินได้ที่ **ข้อมูลพื้นฐาน → ชนิดดิน → เพิ่มข้อมูล** กรอกชื่อและรายละเอียด แล้วเลือกใช้งานในฟอร์มเที่ยวรถได้ทันที ฟิลด์นี้ยังเว้นว่างได้เพื่อไม่ขัดขวางงานหน้างาน รายการปิดใช้งานจะไม่ปรากฏสำหรับเที่ยวใหม่ ส่วนเที่ยวเดิมยังเก็บและแก้ไขข้อมูลอื่นได้โดยคงชื่อชนิดดินเดิม โครงสร้าง Master เพิ่ม `kind: soilType` และ Trip ยังคงเก็บ `soilType` เป็นชื่อ snapshot จึงไม่ต้องลบหรือ migrate ข้อมูลเดิม

เมื่อเชื่อม Drive แล้วและออนไลน์ ไฟล์ที่เพิ่มใหม่จะเริ่มอัปโหลดอัตโนมัติ หน้าจอแสดงสถานะเตรียมโฟลเดอร์ อัปโหลด และรอบันทึก metadata แยกกัน Firestore folder/metadata operations แจ้ง timeout หลัง 20 วินาทีแทนการรอไม่สิ้นสุด คิวเดิมและ Blob ยังคงอยู่สำหรับ retry

`npm run clean` ล้างเฉพาะ cache ติดตั้ง, coverage, test reports และ TypeScript build metadata ที่กำหนดไว้ โดยเก็บ production build ใน `dist/` ไว้สำหรับ preview คำสั่งปฏิเสธ symlink และ path ที่อยู่นอกโปรเจกต์

`node_modules/`, `dist/`, coverage, test reports, logs และ tsbuildinfo ถูก ignore ไม่เก็บใน Git ไม่ลบ IndexedDB หรือไฟล์ผู้ใช้ในขั้นตอน cleanup เก็บ lockfile สำหรับ reproducible installs ไม่สร้าง screenshot หรือไฟล์ debug ถาวรโดยไม่จำเป็น

ยังต้องทดสอบกับ Android Chrome จริง, installation/offline service worker, Firebase Emulator, Google login/permission denied และ server sync ก่อนใช้ข้อมูลจริง

## Roadmap

1. ทดสอบ Emulator rules และเพิ่ม cloud persistence ของ project/master/audit พร้อม restore และ conflict handling
2. ตรวจรับการกู้คืนไฟล์ต้นฉบับส่วนตัวจาก Drive, OAuth และกล้อง/ลายเซ็นบน Android จริง (คิวอัปโหลดมี Web Locks แล้ว; browser ที่ไม่รองรับต้องใช้หนึ่งแท็บ)
3. Daily evidence/reconciliation/verification และรายงานยืนยันที่แยกจาก pending
4. Survey sessions, turning points, grid/slope calculations, assumptions persistence
5. Excel export, PDF reports, Android E2E และ production security review

ยังไม่มีการ deploy หรือ commit อัตโนมัติ

## รถ แท็กทีม และ Excel

1. สร้างทีมที่ **ข้อมูลพื้นฐาน → แท็กทีม → เพิ่มข้อมูล** ตั้งชื่อ เช่น ทีม A หรือทีมผู้รับเหมาช่วง แท็กใช้ร่วมกับรถ คนขับ แหล่งดิน ลูกค้า และชนิดดินได้
2. ที่หมวดรถ กรอกทะเบียน จังหวัดทะเบียน เบอร์โทร ประเภทรถ ความจุ และเลือกแท็กได้หลายรายการ ค้นหาจากทะเบียน/จังหวัด/โทรศัพท์/ชื่อแท็ก และใช้ตัวกรองแท็กหรือประเภทรถร่วมกันได้
3. ดาวน์โหลดตัวอย่างจากปุ่ม **ดาวน์โหลด Excel ตัวอย่าง** หรือ `public/templates/trucks-import-template.xlsx` กรอกชีต `Trucks` คงหัวคอลัมน์ 10 ช่องรวมชื่อเล่น (ยังรองรับไฟล์เดิม 9 ช่อง) หากเปลี่ยนชื่อชีต เช่น `รถบรรทุก` ระบบอ่านได้เมื่อมีชีตข้อมูลรถที่หัวคอลัมน์ครบเพียงชีตเดียว ถ้ามีหลายชีตให้ตั้งชื่อชีตที่ต้องการเป็น `Trucks` ชีต `Examples`, `Instructions` และ `Tags` ไม่ถูกนำเข้าแทนชีตข้อมูล
4. นำเข้า .xlsx → ตรวจรายการเพิ่ม/ข้าม/อัปเดต/ข้อผิดพลาด → ยืนยันบันทึก ทะเบียนเป็นข้อมูลบังคับ เบอร์โทรและทะเบียนต้องเป็นข้อความ เพื่อไม่ทำเลข 0 นำหน้าหาย แท็กทีมในเซลล์คั่นด้วย comma แท็กที่ยังไม่มีจะสร้างหลังยืนยัน
5. ค่าเริ่มต้นข้ามรถเดิม การอัปเดตต้องเลือก checkbox โดยตั้งใจ และแทนทุกคอลัมน์จากไฟล์ รวมถึงล้างช่องที่เว้นว่าง ใช้รหัสรถจากไฟล์ส่งออกเพื่อรักษา ID และความสัมพันธ์เที่ยวรถ
6. ตรวจรถซ้ำด้วยทะเบียน+จังหวัด รถเก่าที่ไม่ระบุจังหวัดจะจับทะเบียนเพื่อให้ตรวจอัปเดต ถ้าในไฟล์มีแถวผิด/ซ้ำจะไม่บันทึกแม้แต่บางแถว หากข้อมูลเปลี่ยนในอีกแท็บหลัง preview ต้องกดตรวจรายการใหม่ก่อนยืนยัน
7. ส่งออก Excel จะใช้รถตามตัวกรองปัจจุบัน พร้อม ID และข้อมูลแท็ก จำกัดนำเข้า 1,000 แถว/5 MB ต่อครั้ง ข้อมูลพื้นฐานยังเก็บใน IndexedDB ตามสถาปัตยกรรมปัจจุบัน ไม่ได้เพิ่ม cloud sync ในงานนี้

Excel ใช้ read-excel-file/write-excel-file แบบ lazy load โดยเขียนทะเบียน โทรศัพท์ และข้อความเป็น String cells รวมถึงข้อความขึ้นต้น `=` ไม่สร้างสูตร Excel จากข้อมูลผู้ใช้ ต้องการสร้าง template ใหม่ให้รัน `node scripts/generate-truck-template.mjs`

## Local development diagnostics

Vite dev server มีตัวตรวจสถานะอัปโหลดแบบอ่านอย่างเดียว ใช้เฉพาะ localhost ส่งเฉพาะจำนวนรายการ/สถานะ/ข้อผิดพลาด/การมีต้นฉบับและ mapping ไม่ส่ง token, email, UID, ชื่อโครงการ/ไฟล์ หรือ binary เก็บผลในหน่วยความจำ dev server สูงสุด 5 requests และปฏิเสธ Origin อื่น ไม่มีใน production build

# นำเข้ารถจาก Google Sheets โดยตรง

- เปิด **Google Sheets API** ใน Google Cloud โปรเจกต์เดียวกับ OAuth Client ID เดิม เพิ่ม scope `https://www.googleapis.com/auth/spreadsheets.readonly` ใน OAuth consent screen หากยังไม่มี และเพิ่มบัญชีผู้ใช้ใน Test users ขณะใช้โหมด Testing ไม่ต้องเพิ่ม API key หรือ client secret ในเว็บ
- อัปโหลดเทมเพลต Excel เดิมไป Google Drive แล้วแปลงเป็น Google Sheets จะเก็บในโฟลเดอร์หลักและตั้งชื่อ `template document - รถบรรทุก` ได้ คงชีต `Trucks` และหัวคอลัมน์เดิม ตั้งทะเบียนและเบอร์โทรเป็นข้อความธรรมดาก่อนกรอก
- หน้า **ข้อมูลพื้นฐาน → รถบรรทุก** วางลิงก์ชีต แล้วกด **นำเข้าจาก Google Sheets** อนุญาตการอ่านด้วยบัญชีเดียวกับที่เข้าสู่ระบบ ตรวจรายการแล้วกด **ยืนยันนำเข้ารถ**
- การอ่านใช้ Sheets API โดยตรงผ่าน HTTPS และ OAuth token ในหน่วยความจำ ไม่มีการเผยแพร่ชีตเป็นสาธารณะ ลิงก์ที่อ่านสำเร็จจำแยกบัญชีใน IndexedDB ของเครื่องนี้
- อ่านไม่เกิน 1,000 แถวข้อมูล ชีตว่าง ชื่อผิด ไม่มีสิทธิ์ หมดอายุ หรืออ่านล้มเหลวจะแสดงข้อผิดพลาดและไม่บันทึกรถ การนำเข้าใช้ตัวตรวจสอบและธุรกรรมเดียวกับ Excel ไม่เขียนกลับชีต และไม่อ้างว่า master data ถูกซิงก์ Firestore
- เทมเพลตเริ่มต้นใช้ชีตที่ผู้ใช้ระบุ ID `1_DHAvNEMXyeVbFhc9Am13o8b_gu4AhOSCQljTUq6jzA` โดยลิงก์ที่เคยบันทึกของแต่ละบัญชียังคงมีลำดับก่อนค่าเริ่มต้น
- กด **สร้างหัวคอลัมน์ในชีต** เพื่อสร้างแท็บ `Trucks` หัวคอลัมน์ 9 ช่อง ตรึงแถวหัวตาราง และตั้งคอลัมน์ข้อความเพื่อรักษาเลขศูนย์ด้านหน้า โดยขอ scope `https://www.googleapis.com/auth/spreadsheets` สำหรับการเตรียมนี้ เพิ่ม scope นี้ใน OAuth consent screen ด้วย ชื่อไฟล์และตำแหน่งโฟลเดอร์เดิมคงไว้
- ปุ่มเตรียมไม่ลบชีตเดิม ไม่เขียนข้อมูลรถ และจะปฏิเสธหัวตารางที่มีข้อมูลเดิมไม่ตรงรูปแบบ การเตรียมสำเร็จต้องได้รับคำตอบสำเร็จจาก Google จริงก่อนแจ้งสถานะ

## Approved extensions

See [the nine-item scope](docs/APPROVED_EXTENSIONS.md) and [implementation, usage and validation](docs/EXTENSIONS_REPORT.md) for project finance estimates, JSON restore, duplicate review and preferred projects. Real-service/physical-device acceptance remains separate; shared company roles and rollout requirements are documented in [Company Access](docs/COMPANY_ACCESS.md).

Latest validated source `7fae411` (2026-11-09): shared company membership is implemented; frontend 310, backend 14, Rules 9, integration 10 and browser E2E 58 passed. See [Company Access](docs/COMPANY_ACCESS.md) for owner/member setup and coordinated client/backend/Rules/index release prerequisites. This milestone has not been pushed or deployed.
