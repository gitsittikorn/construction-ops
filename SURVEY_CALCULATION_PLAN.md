# Survey calculation and migration plan

เพิ่ม survey เป็น optional WorkspaceRecord ใน `state` และ sync pipeline เดิม ไม่เปลี่ยนฐาน/primary key ไม่ลบหรือแปลงผลเครื่องคำนวณเดิม ทำ backup `['v4-backup', owner]` ก่อน metadata ใหม่และรวมใน export; ทดสอบด้วยข้อมูลจำลอง ไม่รัน migration กับ production หรือ deploy อัตโนมัติ

- Leveling ใช้ HI = known RL + BS, RL = HI − IS/FS; FS สร้าง turning point และ BS ถัดไปต้องอ้าง TP เดียวกันก่อนตั้ง HI ใหม่ อ้างอิง [USACE EM 1110-1-1005](https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-1-1005.pdf)
- กริดสี่เหลี่ยมรวมขอบที่ระยะหารไม่ลงตัว แบ่งแต่ละ cell เป็นสองสามเหลี่ยมตามแนว SW–NE และสมมติระดับเปลี่ยนแบบ linear บนสามเหลี่ยม ตัด polygon ที่ depth = 0 เพื่อรวม cut/fill แยกกัน ห้ามหักล้างยอดต่างชนิดหรือใช้ absolute(mean depth) แทน
- ปริมาตร ground/design อ้าง elevation datum ที่ผู้ใช้กำหนดแสดง signed volume เหนือ BM; fill คือ compacted geometric void ไม่มีการคาดความหนาแน่นดิน
- ค่า allowance 25/30/35/50/60/custom ใช้กับ compacted fill เพื่อวางแผนขนส่งเท่านั้น ไม่ใช้แทนผลทดสอบ compaction/shrinkage; cut swell ใช้กับ bank cut แยกต่างหาก ตามความหมาย material states ที่ [FHWA Earthwork Design](https://highways.dot.gov/federal-lands/pddm/dpg/earthwork-design) แยก bank/loose/compacted
- Tests: constant plane, linear slope, mixed cut/fill, zero area/NaN/limits, boundary clipping, TP sequences, units, round-trip persistence, stale changes, workbook/print escaping
- การทดสอบสูตรไม่ยืนยันความถูกต้องของค่าหน้างานหรือ geotechnical factors ต้องตรวจ BM/datum/หน่วยและ assumptions ก่อนใช้จริง
