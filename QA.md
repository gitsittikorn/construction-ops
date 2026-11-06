# Verification — 2026-11-02

ผลตรวจ Phase 1 ล่าสุดวันที่ 2026-11-06 อยู่ใน [PHASE_1_E2E_REPORT.md](docs/PHASE_1_E2E_REPORT.md) ซึ่งแยกผล browser, unit และ Firestore Emulator ออกจากบริการจริง ข้อความด้านล่างเป็นประวัติการตรวจแต่ละรุ่น ไม่ใช่สถานะปัจจุบันของ project/master sync หรือ restore

ตรวจสอบรุ่นเริ่มต้นบน Windows / Node.js 26.3.1

## ผลที่รันจริง

- `npm run check`: การตรวจล่าสุดครอบคลุม formatting, TypeScript, unit/integration tests, production build, HTTP smoke และ Playwright browser E2E (ผลรอบแก้บัคด้านล่าง)
- HTTP smoke: Vite preview ตอบ 200 สำหรับ HTML, 4 JavaScript/CSS assets, manifest, PNG icons 192/512 และ service worker จากนั้นปิด server
- npm install หลังอัปเดต dependencies: audit รายงาน 0 vulnerabilities

## ขอบเขตทดสอบ

- UI: สร้างโครงการและรถ บันทึกเที่ยวรถ โหลดข้อมูลกลับหลังเปิดใหม่ แก้ไข/Archive โครงการ ค้นหา เพิ่ม/ปิดข้อมูลพื้นฐานคนขับ แหล่งดิน และลูกค้า คำนวณระดับและปริมาตร และสั่งพิมพ์รายงาน
- Domain: duplicate ID/retry, conflicting payload, revision conflicts, edit history, active references, invalid calendar date/time, negative capacities, timezone ไทย, CSV formula injection, cut/fill และ volume factors
- Persistence: IndexedDB แบบจำลอง เก็บ pending ข้ามการเปิดใหม่และแยกบัญชี
- Cloud adapter: Firebase SDK แบบจำลอง ทดสอบ atomic write/audit, retry, หลาย offline revisions, stale/conflicting data, permission error และ missing authentication/configuration
- PWA policy: worker จำลอง ทดสอบ cache recovery, refresh HTML, ไม่แตะ cloud API/write requests และไม่ลบ cache ของแอปอื่น

## แก้ไขระหว่างตรวจสอบ

- แก้ revision ของข้อมูลที่แก้ไขออฟไลน์หลายครั้งก่อน sync ครั้งแรก
- ป้องกันการยอมรับ payload ขัดแย้งที่ใช้ operation ID/revision เดิม
- ป้องกันวันปฏิทินที่ไม่มีจริง เช่น 30 กุมภาพันธ์
- แก้ cache HTML ให้ปรับตามเวอร์ชันที่เปิดออนไลน์
- จำกัด cleanup ของ service worker ให้เฉพาะ cache ของแอปนี้
- อัปเดต Vitest และ override dependency ของ gRPC ตามช่องโหว่ที่ audit พบ
- แยก Firebase bundles เพื่อลดขนาด entry bundle

## ยังไม่ได้ยืนยัน

- Rendering, touch interaction และการติดตั้ง/เปิดออฟไลน์บน Android Chrome จริง
- Google login/logout จริง, Firestore transactions/Rules กับ Emulator หรือ cloud จริง และการข้ามอุปกรณ์
- PDF rendering/การพิมพ์ภาษาไทยจริง (ทดสอบเพียงเรียก browser print และมี A4 CSS)
- Google Drive และรูป/เอกสารเพิ่มแล้ว แต่ยังไม่ได้ทดสอบกับบัญชีจริง; Signature canvas, reconciliation, survey grid/turning points และ Excel ยังไม่พัฒนา
- เครื่องคำนวณยังเป็นผลชั่วคราว และ project/master data ยังไม่มี cloud sync

ผลทดสอบนี้ไม่ใช่การยืนยันว่าระบบพร้อม production หรือครบ Master Prompt ทุกเฟส

## Google Drive integration — เพิ่มเติม

- เพิ่ม OAuth token model พร้อมตรวจบัญชีเดียวกับ Firebase, deny/closed popup/expiry handling
- เพิ่ม original file queue ใน IndexedDB พร้อม migration เก็บข้อมูลเดิม, progress, retry, stable Drive File ID และ metadata transaction/audit
- เพิ่ม tests สำหรับ queue persistence/bytes, per-account isolation, upload/metadata failure, recovery, private resumable upload, verification, malformed responses, folder reuse, token handling และ UI flow offline→online→retry
- Metadata เก็บเฉพาะข้อมูลอ้างอิง ไม่ใส่ Blob ใน Firestore ลบ Blob ในเครื่องหลัง verified upload และ metadata success เท่านั้น
- ยังไม่ได้ยืนยัน OAuth/upload/download ด้วยบัญชีผู้ใช้จริง หรือ deploy/ทดสอบ Rules ด้วย Emulator รอบนี้ ต้องเผยแพร่ Rules ใหม่ก่อนทดสอบอัปโหลดจริง
- เพิ่ม Web Locks ป้องกันสองแท็บอัปโหลดคิวเดียวกันพร้อมกัน และบันทึกหลายไฟล์เข้าคิวแบบ transaction ป้องกันการบันทึกบางส่วนหากเลือกไฟล์ไม่ถูกต้อง
- ข้อจำกัด: browser ที่ไม่มี Web Locks ต้องใช้หนึ่งแท็บสำหรับอัปโหลด, retry โอนข้อมูลใหม่ได้หาก session ขาด, ไม่มี background upload เมื่อปิดหน้าตั้งค่า, ไม่มี cloud document list restore

## แก้ dropdown ข้ามแท็บและอัปโหลดดูเหมือนค้าง

- ผลรอบสุดท้าย: `npm run check` ผ่าน 68 unit/integration tests (9 files), production build, HTTP smoke และ 3 Playwright E2E tests บน Edge แบบ headless
- Reproduce บน Edge จริง: เปิดฟอร์มเที่ยวรถในแท็บแรก เพิ่มรถในแท็บสอง แต่ตัวเลือกในแท็บแรกยังว่าง ก่อนแก้ E2E นี้ fail; หลังแก้รับข้อมูลใหม่ผ่าน BroadcastChannel ได้
- เปลี่ยนการบันทึก state เป็น IndexedDB read-modify-write transaction ป้องกันข้อมูลของอีกแท็บถูกทับ พร้อม reload เมื่อ focus/visibility เปลี่ยน และป้องกัน auth callback ของ UID เดิมล้างหน้าจอโดยไม่ reload
- เพิ่มสถานะ preparing และ refresh UI ทุก checkpoint ของคิว พร้อมเริ่มอัปโหลดหลังเพิ่มไฟล์เมื่อเชื่อม Drive และออนไลน์อยู่แล้ว
- เพิ่ม timeout เฉพาะขอบเขต Firebase folder/metadata operations (20 วินาที), OAuth callback (90 วินาที), IndexedDB open (10 วินาที) ไม่ลบข้อมูลเพื่อแก้ค้าง
- Cloud operations ที่ timeout อาจสำเร็จภายหลัง จึงยังใช้ stable IDs และ metadata transaction แบบ idempotent สำหรับ retry
- ทดสอบเพิ่ม concurrent local writes, account notifications, repeated auth event, permission error, stalled Firebase/OAuth และ automatic upload ที่แสดง metadata-pending ระหว่างรอ
- Browser E2E ทดสอบการเพิ่มข้อมูลพื้นฐานครบหมวดแล้วเลือกในเที่ยวรถ, ข้ามแท็บ และเลือก PDF จริงผ่าน file input พร้อมอ่าน original Blob bytes หลัง reload
- ยังไม่สามารถตรวจ IndexedDB/session ใน Chrome profile ที่ผู้ใช้เปิดอยู่หรือทดสอบอัปโหลดด้วยสิทธิ์บัญชีผู้ใช้จริงได้ ไม่มีการเข้าถึงหรือล้างข้อมูล browser ของผู้ใช้

## ช่องเลือกโครงการ

- แยก ProjectPicker ใช้ร่วมกันในฟอร์มเที่ยวรถและเอกสาร เปลี่ยนจาก defaultValue เป็นค่าที่ควบคุมผ่าน state เพื่อให้เลือก/เปลี่ยนโครงการได้สม่ำเสมอเมื่อข้อมูลอัปเดต
- แสดงโครงการทุกสถานะในรายการ โครงการที่ไม่ใช่ active แสดงสถานะและ disabled แทนการหายไปเงียบ ๆ พร้อมทางไปจัดการสถานะจากฟอร์มเที่ยวรถ ไม่มีการเปลี่ยนสถานะข้อมูลเดิมอัตโนมัติ
- ทดสอบ unit เพิ่ม 4 กรณี และ browser เพิ่มกรณี Draft→จัดการสถานะ→Active→เลือกในเที่ยวรถ และการสลับระหว่างสองโครงการพร้อมคงค่าเมื่อพิมพ์ข้อมูลอื่น
- ผลตรวจรอบนี้: 72 unit/integration tests และ 5 browser E2E tests พร้อม TypeScript, formatting, build และ HTTP smoke

## ข้อมูลพื้นฐานชนิดดิน

- เพิ่ม Master kind `soilType` และหมวดชนิดดินในหน้าข้อมูลพื้นฐาน ใช้ฟอร์มเพิ่ม/แก้ไข/ปิดใช้งานและ Audit เดิม
- ฟอร์มเที่ยวรถเลือกเฉพาะชนิดดินที่เปิดใช้งาน หรือเว้นว่างได้ ป้องกันการส่งชื่อใหม่ที่ไม่อยู่ในข้อมูลพื้นฐาน
- ข้อมูลเก่ายังคงชื่อเดิมเป็น snapshot หากรายการถูกแก้ชื่อ/ปิดใช้งาน ยังเปิดเที่ยวเดิมแก้ไขหมายเหตุได้โดยไม่เปลี่ยนชื่อดิน ไม่มีการลบหรือย้ายข้อมูลของผู้ใช้
- เพิ่ม unit/integration tests สำหรับตัวเลือก active/inactive, ชื่อเก่า, ไม่มีรายการ และ domain validation; browser E2E ครอบคลุมสร้าง→แก้ชื่อ→reload→เลือกในเที่ยวรถ→ปิดใช้งาน→แก้เที่ยวเดิม→ไม่ให้เลือกในเที่ยวใหม่
- ผลรอบนี้: 77 unit/integration tests และ 6 browser E2E tests พร้อม TypeScript, formatting, build และ HTTP smoke; ยังไม่ได้ทดสอบกับ Android จริงหรือ cloud data ของผู้ใช้

## ชื่อโฟลเดอร์ Google Drive

- ใช้ชื่อโครงการในการสร้างโฟลเดอร์ แทนรหัส UUID และเปลี่ยนชื่อโฟลเดอร์เดิมผ่าน Folder ID เมื่อเชื่อม Drive/ประมวลผลคิวโดยไม่ย้ายไฟล์หรือสร้างซ้ำ
- เพิ่มปุ่มเตรียมโฟลเดอร์โดยไม่ต้องอัปโหลดไฟล์ และลิงก์เปิดตำแหน่งโครงการ/Documents/โฟลเดอร์หลักที่ตรวจแล้ว
- ทดสอบสร้างชื่อใหม่, PATCH ชื่อเก่าโดยใช้ ID เดิม, ไม่เปลี่ยนชื่อซ้ำเมื่อถูกต้องแล้ว, permission failure ที่ไม่สร้างโฟลเดอร์สำรอง และ UI ใช้ mapping เก่า/สร้างโฟลเดอร์เปล่าได้
- ผลตรวจ: 83 unit/integration tests และ 6 browser E2E tests พร้อม TypeScript, formatting, build และ HTTP smoke; การ rename จริงในบัญชีผู้ใช้ยังต้องให้ผู้ใช้เชื่อม OAuth ผ่านหน้าเว็บ โดยการทดสอบ Drive API ในรอบนี้ใช้ mocks

## ตรวจภาพไม่ปรากฏใน Drive

- ตรวจ read-only ผ่านหน้า localhost ที่เปิดอยู่: มี Firebase session, โครงการ active 1 รายการ และ root/project folder mapping แต่ไม่พบ upload records ในบัญชีนั้น ไม่ได้อ่าน/ส่ง token, email, UID, ชื่อไฟล์ หรือ bytes ออกมา
- แยกปุ่มเตรียมโฟลเดอร์ออกจาก upload form เปลี่ยนปุ่มส่งเป็น **อัปโหลดไฟล์ที่เลือก** แสดงจำนวนภาพที่เลือกแต่ยังไม่ส่ง และเตือนว่าการเตรียมโฟลเดอร์ไม่ส่งไฟล์
- เลือกโครงการเริ่มต้นให้เมื่อมี active project เดียว คงโครงการที่เลือกหลังส่งไฟล์ ใช้ explicit validation แสดง error หากไม่มีไฟล์ แทน native form validation ที่อาจดูเงียบ
- เก็บ Drive session ในหน่วยความจำแยกตามบัญชีเพื่อคงสิทธิ์ระหว่างสลับหน้า ล้างเมื่อ logout/เปลี่ยนบัญชี/ตัดการเชื่อมต่อ และยังเคารพ token expiry ไม่เก็บ token ลง disk
- เพิ่มลิงก์เปิดไฟล์จริงหลัง synced และทดสอบ browser XHR/fetch กับ Drive API จำลอง: ส่ง PNG bytes เดิม ตรวจ metadata หลัง upload และ retry ไม่สร้างซ้ำ
- เพิ่ม read-only development diagnostics ผ่าน Vite HMR ทดสอบปฏิเสธ origin อื่นและตรวจว่าไม่ถูก bundle ใน production
- ผลตรวจ: 89 unit/integration tests และ 8 browser E2E tests ผ่าน พร้อม TypeScript, formatting, build และ HTTP smoke
- Browser API test ใช้ endpoint จำลอง ไม่ใช่การยืนยันอัปโหลดภาพจริงเข้าบัญชี Google ของผู้ใช้ รอบนี้ไม่มีไฟล์ในคิวจริงให้นำมาทดสอบส่งต่อ จึงไม่ได้เลือกไฟล์ส่วนตัวหรือสร้างไฟล์ทดสอบใน Drive ของผู้ใช้

## กล่องประวัติในหน้าตั้งค่า

- จำกัดความสูง panel ไม่เกิน 420px และรายการประวัติไม่เกิน 300px พร้อม scrollbar ภายใน รองรับ keyboard focus และป้องกัน scroll ลามไปหน้าเว็บ
- แสดงประวัติเดิมทั้งหมดในกล่อง แทนการจำกัดเฉพาะ 12 รายการล่าสุด ไม่เปลี่ยนหรือลบ audit records
- Browser E2E ใช้ข้อมูล 40 เหตุการณ์ ตรวจความสูงจริง การ scroll ภายใน และการมีรายการเก่าสุด
- ผลตรวจ: 89 unit/integration tests และ 9 browser E2E tests ผ่าน พร้อม formatting, TypeScript, build และ HTTP smoke; ยังไม่ได้ตรวจ touch scroll บน Android จริง

## พิกัดโครงการ

- เพิ่ม Project.latitude/longitude แบบ optional ไม่ต้อง migrate โครงการเดิม บันทึก/แก้ไข/ล้างพิกัดผ่านฟอร์มโครงการ และบันทึก audit ตามระบบเดิม
- ตรวจค่าครบคู่, finite numbers, Latitude -90..90 และ Longitude -180..180 รองรับศูนย์ ค่าติดลบ และทศนิยม
- ตัวเลข Lat/Lng บนการ์ดเป็น Maps URL แบบ api=1/query พิกัดเรียง latitude,longitude เปิดแท็บใหม่พร้อม noopener/noreferrer ไม่มีการเรียก Maps SDK หรือส่งคำขอแผนที่จนกว่าผู้ใช้คลิก
- ทดสอบ unit 6 กรณี และ browser เพิ่มกรณีแก้โครงการเดิม กรอกไม่ครบคู่ บันทึกศูนย์ reload เปิด URL ใน popup แก้พิกัดทศนิยมติดลบ และล้างโดยคงโครงการ
- ผลตรวจ: 95 unit/integration tests และ 10 browser E2E tests ผ่าน พร้อม formatting, TypeScript, build และ HTTP smoke; popup ทดสอบ URL ผ่าน endpoint จำลอง ยังไม่ได้ตรวจการเปิดแอป Google Maps บน Android จริง

## ช่องพิกัดรวม

- เปลี่ยน UI เป็นช่องเดียว `พิกัด (Lat, Lng)` รองรับ comma พร้อม/ไม่มีช่องว่าง เก็บ latitude/longitude ในโครงสร้างเดิมและแสดงค่าที่บันทึกไว้เก่ารวมเป็นช่องเดียวเมื่อแก้ไข
- ตรวจจำนวนพิกัดให้มีสองค่าเท่านั้น ตรวจรูปแบบเลขทศนิยมและช่วงค่าเดิม ไม่รับข้อมูลขาดคู่/ข้อความ/hex/ค่าล้นช่วง ล้างทั้งช่องเพื่อลบพิกัดได้
- เพิ่ม unit parser tests และปรับ browser flow ให้ทดสอบกรอกผิดรูปแบบ ศูนย์ ทศนิยมติดลบ การอ่านค่ารวมตอนแก้ไข และล้างช่องเดียว
- ผลตรวจ: 97 unit/integration tests และ 10 browser E2E tests พร้อม formatting, TypeScript, build และ HTTP smoke

## รถ แท็กทีม และ Excel

- เพิ่ม optional fields province/phone/truckType/tagIds และ Master kind `tag` โครงสร้างเดิมยังอ่านได้ ไม่ migrate หรือลบข้อมูลผู้ใช้
- เพิ่มแท็กทีมในข้อมูลพื้นฐาน ฟอร์มเลือกแท็กหลายรายการสำหรับข้อมูลทุกหมวด และตัวกรองแท็ก/ประเภทรถ/คำค้น
- สร้าง Excel .xlsx จริง พร้อมชีต Trucks/Instructions/Examples/Tags และ static template ใน public/templates ข้อมูลเบอร์โทร/ทะเบียนเป็น text cells เพื่อรักษาเลขศูนย์
- นำเข้าตรวจข้อผิดพลาดรายแถว ตรวจ duplicate ภายในไฟล์และข้อมูลเดิม Preview ก่อนบันทึก ค่าเริ่มต้นข้ามรถเดิม การอัปเดตต้องเลือกเอง รักษา ID/createdAt และเพิ่ม audit พร้อมบันทึก batch ใน IndexedDB transaction เดียว
- ตรวจ stale preview ก่อน commit และสร้างแท็กใหม่เฉพาะหลังยืนยัน; ปฏิเสธรหัสรถไม่รู้จัก แท็กปิดใช้ใหม่ เบอร์โทรเป็น numeric cell ไฟล์ผิดรูปแบบ และข้อมูลเกินขอบเขต
- ทดสอบ roundtrip workbook จริง, literal formula-like strings, blank template ไม่ดึง Examples, tag references/history, duplicate registrations/provinces และ rollback เมื่อแถวผิด
- Browser E2E ทดสอบสร้าง tags/รถผ่าน UI, กรองทีม, ดาวน์โหลด Excel และอ่าน phone leading zero, นำเข้าเพิ่ม+อัปเดต, สร้างแท็กใหม่, ปฏิเสธ duplicate และ reload กลับมาเห็นข้อมูลเดิม
- ผลตรวจ: 112 unit/integration tests และ 12 browser E2E tests ผ่าน พร้อม formatting, TypeScript, build และ HTTP smoke; หลังเลือก dependencies สุดท้าย npm install รายงาน 0 vulnerabilities
- ยังไม่ได้เปิด template ใน Microsoft Excel Desktop/Android จริง และไม่ได้เพิ่ม cloud synchronization สำหรับ master data ในรอบนี้
