# Known issues — V4.0

- ยังไม่ได้ตรวจ production Firebase/Drive/OAuth หรือ Android hardware จริง ต้องแยก manual acceptance จาก emulator/viewport
- ห้ามนำ source/rules ใหม่ deploy อัตโนมัติ และห้าม migration/reset production โดยไม่อนุมัติ
- ไม่มี GitHub Pages workflow ใน working tree; คง hosting configuration ที่มี ไม่เดาเปลี่ยนฐาน URL
- Legacy trips เก็บ soil/customer เป็น snapshot ข้อความและยังไม่มี historical capacity snapshot; ห้ามเดาความจุย้อนหลังเป็นยอด verified
- local workspace และแต่ละ Google UID แยกข้อมูล ไม่ย้ายข้ามบัญชีอัตโนมัติ
- เอกสารรายละเอียด Phase 1 และข้อจำกัดเดิมอยู่ใน PHASE1_REPORT.md
- V4 เพิ่ม optional workspaces และ backup `['v4-backup', owner]` ใน store เดิม; new collections/rules ยังไม่ deploy ต้อง rollout อย่างประสานกันและสำรอง production ก่อน
- `npm.cmd audit --omit=dev --json` ล่าสุด 0 vulnerabilities; full audit มี 14 moderate ใน development/firebase-tools transitive dependencies, 0 high/critical การรัน `npm.cmd audit fix` ไม่แก้ advisory ที่ต้อง downgrade firebase-tools แบบ breaking จึงไม่ได้ใช้ --force และต้องติดตาม upstream แยกจาก app runtime
- PDF export ใช้ browser print / Save as PDF ไม่ใช่ server PDF engine; ทดสอบ headless Windows A4 หลายหน้าและดูภาพภาษาไทยแล้ว ยังไม่ใช่การพิมพ์/ดาวน์โหลดจริงบน Android
- Daily session จำกัด 200 คัน/วัน, close snapshots 100 ครั้ง/วัน, workspace JSON 750 KB; survey gridสูงสุด 2,500 จุด และแบ่งตาราง 100 แถว ป้องกันการคำนวณเกินขอบเขตโดยไม่ทิ้งข้อมูลเดิม
- ภาพหลักฐานอัปโหลดผ่านบริการเดิม ไม่มี public permissions; E2E verify/close ใช้ simulated Drive acknowledgement ระบุใน test ชัดเจน ส่วน Firestore metadata/rules/restore ใช้ emulator จริง ไม่ใช่ production Drive
- PWA offline lazy-import bug จาก Vary: Origin ของ immutable asset cache แก้แล้วและ production-build browser test ผ่าน; ไม่มีการแก้ IndexedDB/localStorage ใน service worker
