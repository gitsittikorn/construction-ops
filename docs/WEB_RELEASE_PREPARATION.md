# เตรียมเปิดเว็บ — ยังไม่ได้เผยแพร่

อัปเดต 2026-11-10. ใช้คู่มือนี้ร่วมกับ [Allowlist rollout](AUTH_RBAC_IMPLEMENTATION.md), [ผลตรวจมือถือ](MOBILE_WEB_READINESS.md) และ [Production smoke plan](PRODUCTION_SMOKE_PLAN.md). การเตรียมโค้ด/Artifact ไม่ใช่คำอนุญาต Merge, Deploy, เปลี่ยน Secrets หรือ Bootstrap Production

## สิ่งที่เตรียมพร้อมแล้ว

| งาน                                                       | คำสั่ง / ไฟล์                                 | ผลที่ได้                                                                          |
| --------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| Build โฮสต์ที่รากเว็บ เช่น Firebase Hosting/custom domain | `npm run build` / `npm run smoke`             | `dist/`, base `/`                                                                 |
| Build GitHub Pages ของ Repository นี้                     | `npm run build:pages` / `npm run smoke:pages` | `dist-pages/`, base `/construction-ops/` และ `.nojekyll`                          |
| ตรวจ Public Config ก่อน Build บริษัท                      | `npm run release:check`                       | ปฏิเสธ config ไม่ครบ, local demo, backend URL ไม่ปลอดภัย หรือ frontend secret     |
| เตรียม Artifact ผ่าน GitHub UI                            | `.github/workflows/prepare-pages.yml`         | Manual `workflow_dispatch` เท่านั้น เลือก `demo` หรือ `company`; ไม่มี Deploy job |

Full `npm run check` ตรวจ Build/HTTP smoke ทั้งสอง base path รวมกับ unit/backend/emulator/E2E. คำสั่ง `release:check` ตรวจความพร้อมของค่าใน process แบบไม่ติดต่อ Cloud และไม่พิมพ์ค่า secret จึงไม่ใช่การรับรองว่าบริการจริงเชื่อมสำเร็จ

Production build ปกติที่ไม่มี Firebase configuration จะปฏิเสธเข้าพื้นที่บริษัท ค่า `VITE_ALLOW_LOCAL_DEMO=true` ใช้เฉพาะ Build เดโมที่ตั้งใจแยกออกมา Workflow โหมด `demo` ล้าง Firebase/Google/backend public settings ใน process ของงานนั้นและไม่เชื่อมข้อมูลบริษัทจริง ห้ามเปลี่ยนค่าเว็บบริษัทเป็นเดโมเพื่อเลี่ยง Login

## GitHub Pages กับ Backend

GitHub Pages ให้บริการ HTML/JavaScript/CSS และ PWA เท่านั้น Backend Node/Firebase Admin SDK ที่ใช้ Allowlist/Google Drive ต้องมี HTTPS service แยกต่างหาก ใช้ `VITE_ACCESS_BACKEND_URL` หรือ fallback เป็น `VITE_DRIVE_BACKEND_URL` เดิม ห้ามนำ Admin SDK private key, OAuth client secret หรือ Drive encryption key ไปใส่ `VITE_*` หรือ static artifact

หากใช้ URL มาตรฐานของ Repository: frontend origin คือ `https://gitsittikorn.github.io` และ base path คือ `/construction-ops/`. ค่าใน Firebase Authorized domains ต้องเป็น hostname ส่วน OAuth JavaScript origin และ backend CORS ใช้ origin โดยไม่มี path ตรวจ OAuth callback URL ของ backend ให้ตรงกับการตั้งค่าเดิม ไม่เดาหรือหมุน credentials ใหม่

ข้อมูล IndexedDB แยกตาม browser **origin** ไม่ใช่ path. เว็บไซต์หลาย Repository ใต้ `gitsittikorn.github.io` ไม่ได้แยกความปลอดภัยของ browser storage จากกัน ควรใช้โดเมนเฉพาะหรือ Firebase Hosting origin แยกสำหรับเว็บบริษัทที่เก็บข้อมูลหน้างานออฟไลน์ อย่าล้าง site data หรือย้าย origin โดยคาดว่าคิว pending จะตามไปเอง สำรอง/กู้คืนด้วยขั้นตอนที่รองรับและรักษา namespace/actor เดิม

## เมื่อพร้อมใช้ GitHub UI จากโทรศัพท์หรือคอมพิวเตอร์

1. รีวิว Feature Branch/PR และผลทดสอบก่อน ข้อกำหนดยังไม่อนุญาต Merge อัตโนมัติ Workflow แบบกดรันเองจะปรากฏตามเงื่อนไข GitHub หลังไฟล์อยู่บน default branch ที่ได้รับอนุมัติแล้ว
2. เมื่อต้องการแค่ Artifact เลือก Actions → **Prepare Pages artifact (no deployment)** → Run workflow → `demo` หรือ `company`. โหมดบริษัทต้องตั้งค่า Repository Variables สำหรับ public `VITE_FIREBASE_*`, `VITE_GOOGLE_CLIENT_ID` และ HTTPS backend URLs ก่อน งานนี้ยังไม่ได้ตั้งค่า Variables เหล่านั้น
3. ดาวน์โหลด Artifact `pages-…` จาก run ที่สำเร็จ เทียบ commit/test evidence กับรุ่นที่จะเผยแพร่ Artifact นี้ยังไม่ใช่ URL เว็บและยังไม่มีการเปิด GitHub Pages ให้อัตโนมัติ
4. หลังได้รับอนุมัติเผยแพร่แยก จึงตั้งค่า Hosting/Pages และ Backend/Rules/index/client ที่เข้ากันได้ ตรวจ health, Login, ทุกบทบาท, pending/offline/reconnect และบัญชีทดสอบจริงตามคู่มือ ห้ามเปิด `allowlist-v1` ก่อนองค์ประกอบทั้งหมดพร้อม

ไม่ต้องเปิดคอมเพื่อให้ Codex พัฒนา/Build/ทดสอบต่อ แต่การเผยแพร่จริงยังต้องมีช่องทาง GitHub/Hosting ที่ได้รับสิทธิ์และคำสั่งอนุมัติ ไม่มีการสร้าง public preview หรือใช้ tunnel ภายนอกในงานนี้

## เปิดใช้ TOTP MFA อย่างปลอดภัย

1. ใน dedicated Firebase test project ตรวจว่าใช้ Authentication with Identity Platform และเปิด TOTP ตามเอกสาร Firebase/แผนบริการที่องค์กรอนุมัติแล้ว ไม่เปลี่ยน billing/provider settings จากคำสั่งเตรียมเว็บนี้
2. Login Google ด้วยผู้ดูแลที่ได้รับ Allowlist แล้ว เปิด **การตั้งค่า → ยืนยันตัวตน 2 ขั้นตอน → ตั้งค่าแอปยืนยันตัวตน**. ยืนยัน Google ใน popup เพิ่มคีย์ใน Authenticator แล้วกรอกรหัส 6 หลักเพื่อยืนยัน ห้ามส่งคีย์/รหัสผ่านแชตหรือเก็บในเอกสารโครงการ
3. ออกจากระบบและ Login ใหม่ ต้องผ่าน Google และหน้ารหัส Authenticator. ตรวจรหัสผิด/หมดเวลา/cancel/offline/account switch และการปฏิเสธบัญชีที่ไม่มีสิทธิ์ MFA ไม่เพิ่มบทบาทหรือข้าม Allowlist
4. ตรวจผู้ดูแลสำรองและช่องทางกู้บัญชีผ่านผู้ดูแล Firebase ที่เชื่อถือได้ก่อนบังคับใช้ ไม่ลบ/ปิด Super Admin คนสุดท้ายและไม่ clear local pending เพื่อแก้ปัญหา MFA รุ่นนี้รองรับ TOTP; ยังไม่มี SMS enrollment, recovery-code UI หรือการลบ factor เอง
5. หลัง Real Acceptance ผ่านและอนุมัติการเปลี่ยน Backend แล้ว จึงพิจารณา `ACCESS_REQUIRE_ADMIN_MFA=true`. ค่านี้ตรวจ Firebase MFA claim ของ Super Admin ใน Access API ไม่ใช่การเปิด Firebase provider หรือบังคับ MFA ทุก Firestore read/offline cache แทนองค์กร

Real Google/TOTP, Safari/iPhone/iPad, Home Screen/PWA และ Production acceptance ยัง **NOT VERIFIED**. WebKit download ใน Cloud ถูกปฏิเสธด้วย Domain forbidden; ผลทดสอบ Chromium แบบสัมผัสไม่แทนอุปกรณ์จริง
