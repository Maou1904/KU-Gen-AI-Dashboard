# Roadmap: Source Database Simulation for KU GenAI Dashboard

## เป้าหมายของโปรเจค

สร้างฐานข้อมูลจำลองของ `kucsgenai` และ `dify` ให้มีโครงสร้างและพฤติกรรมใกล้เคียงของจริง แล้วนำข้อมูลเข้าสู่กระบวนการ sync เดิมของระบบ เพื่อให้ Dashboard สรุปผลจาก pipeline จริง ไม่ใช่การใส่ตัวเลข mock ลงหน้าจอโดยตรง

แนวทางนี้ช่วยให้สามารถทดสอบได้ครบทั้งกระบวนการ:

```text
kucsgenai_source_demo + dify_source_demo
        ↓
Sync Process
        ↓
kucsgenai_dashboard_demo
        ↓
Fact / Aggregate Tables
        ↓
Dashboard
```

## แนวคิดหลัก

โปรเจคจะใช้วิธีผสม 2 แบบตามข้อเสนอของอาจารย์:

1. **Scenario Based Simulation**  
   สร้างข้อมูลตามสถานการณ์ที่ต้องการทดสอบ เช่น ช่วงเปิดเทอม ช่วงสอบ ช่วงปิดเทอม การใช้งานพุ่งของบางคณะ หรือแอปใหม่เริ่มใช้งาน

2. **Data Sampling: Time-shifted with Variation**  
   ใช้ pattern จากข้อมูลตัวอย่างหรือข้อมูลจริง แล้วเลื่อนช่วงเวลา พร้อมปรับ token, cost, latency และจำนวน transaction เล็กน้อย เพื่อให้ข้อมูลดูสมจริงขึ้น

## Database ที่จะใช้

จะสร้างฐานข้อมูลจำลองแยกจากฐานจริง เพื่อป้องกันการกระทบข้อมูล production

```text
kucsgenai_source_demo      ใช้แทน source database ฝั่ง KUCS GenAI
dify_source_demo           ใช้แทน source database ฝั่ง Dify
kucsgenai_dashboard_demo   ใช้เป็น dashboard data mart สำหรับทดสอบ
```

## สิ่งที่จะทำ

### Step 1: ออกแบบ Source Schema ขั้นต่ำ

สร้างเฉพาะ table และ column ที่ sync process ใช้จริงก่อน เพื่อให้ระบบทำงานได้โดยไม่ต้อง clone database จริงทั้งก้อน

ฝั่ง `kucsgenai`:

```text
apps
app_category
sub_category
"user"
user_app_usage
ai_notes
```

ฝั่ง `dify`:

```text
apps
app_model_configs
messages
workflow_node_executions
```

### Step 2: สร้างข้อมูล Scenario Based

กำหนด scenario หลักที่จะใช้ทดสอบ Dashboard เช่น:

```text
Normal semester usage
Exam week peak usage
Semester break low usage
Faculty adoption spike
New app launch
High latency model calls
Failed model calls
Empty filter result
```

แต่ละ scenario จะกำหนดช่วงเวลา หน่วยงาน แอป โมเดล จำนวนผู้ใช้ จำนวน transaction token cost และ expected result บน Dashboard

### Step 3: เพิ่ม Time-shifted Sampling with Variation

นำ pattern การใช้งานมาปรับให้กระจายตามเวลา เช่น รายวัน รายชั่วโมง วันทำงาน วันหยุด และช่วงสอบ จากนั้นเพิ่ม variation เพื่อให้ไม่ซ้ำจนเกินไป

ตัวอย่างการปรับ:

```text
เลื่อน event_at ไปยังช่วงเวลาทดสอบ
ปรับ token ประมาณ ±5-20%
ปรับ latency ตาม model/provider
เพิ่มหรือลด transaction ตาม calendar factor
สร้าง UUID ใหม่เพื่อไม่ชนกับข้อมูลเดิม
```

### Step 4: รักษาความสัมพันธ์ของข้อมูล

ข้อมูลจำลองต้องรักษา event chain ให้ถูกต้อง เพราะ sync ต้องเชื่อมข้อมูลจากหลาย table

```text
kucsgenai.apps.app_id
  -> dify.apps.id

kucsgenai.user_app_usage.conversation_id
  -> dify.messages.conversation_id

dify.messages.workflow_run_id
  -> dify.workflow_node_executions.workflow_run_id
```

ถ้าความสัมพันธ์นี้ถูกต้อง ระบบจะสร้าง `fact_usage_event` และ `fact_model_usage_event` ได้เหมือนข้อมูลจริง

### Step 5: รัน Sync Process เดิม

หลังจาก seed ข้อมูลลง source demo database แล้ว จะรันกระบวนการเดิมของระบบ

```text
sync apps
sync users and organizations
sync usage
sync notes
sync model usage
refresh aggregates
run quality checks
```

ผลลัพธ์จะถูกเขียนลง `kucsgenai_dashboard_demo` แล้ว Dashboard จะอ่านข้อมูลจาก data mart นี้

### Step 6: ตรวจสอบผลลัพธ์

ตรวจสอบว่าข้อมูลหลัง sync ถูกต้องทั้ง 3 ระดับ:

```text
Source level      ข้อมูลใน kucsgenai_source_demo และ dify_source_demo ถูกต้อง
Fact level        fact_usage_event และ fact_model_usage_event เชื่อมกันถูกต้อง
Dashboard level   KPI, filter, chart และ aggregate แสดงผลตรงกับ scenario
```

## Roadmap สั้น

| Phase | งานหลัก | ผลลัพธ์ |
|---|---|---|
| 1 | วิเคราะห์ sync contract | รู้ว่า source table/column ใดจำเป็น |
| 2 | สร้าง demo source schema | มี `kucsgenai_source_demo` และ `dify_source_demo` |
| 3 | สร้าง scenario data | มีข้อมูลควบคุมสำหรับทดสอบกรณีสำคัญ |
| 4 | เพิ่ม time-shift variation | ข้อมูลดูสมจริงและไม่ซ้ำเกินไป |
| 5 | รัน sync เข้า dashboard demo | ได้ fact และ aggregate จาก pipeline จริง |
| 6 | Validate และปรับข้อมูล | Dashboard แสดงผลตรงกับ expected result |

## คำสั่งที่เตรียมไว้สำหรับทำ Demo

ถ้า demo database ยังไม่มี ให้รัน SQL นี้ด้วย PostgreSQL admin ก่อน 1 ครั้ง:

```text
backend/database/demo-admin-bootstrap.sql
```

หลังจากมี database แล้วจึงรัน:

```text
npm --prefix backend run demo:setup
npm --prefix backend run demo:seed:reset
npm --prefix backend run migrate
npm --prefix backend run demo:sync
```

การสลับกลับไปใช้ฐานหลักทำได้โดยเปลี่ยนค่า `.env` กลับไปที่ชื่อ database production/source จริง และไม่ใช้ชื่อที่ลงท้ายด้วย `_demo`

## ผลลัพธ์ที่คาดหวัง

- มี demo database ที่แยกจากของจริงและสร้างซ้ำได้
- Dashboard ใช้ข้อมูลที่ผ่าน sync process จริง
- สามารถอธิบายที่มาของตัวเลขบน Dashboard ได้จาก source → sync → fact → aggregate
- ทดสอบ filter, KPI, chart และ model usage ได้ครบกว่า mock data
- ใช้เป็นฐานสำหรับนำเสนอ ทดลอง และปรับ scenario เพิ่มในอนาคต

## เหตุผลที่เลือกแนวทางนี้

การสร้างข้อมูลที่ source database แล้วปล่อยให้ sync process ทำงานเอง ทำให้การทดสอบใกล้เคียงระบบจริงมากที่สุด เพราะไม่ได้สร้างผลลัพธ์ปลายทางขึ้นเอง แต่ให้ระบบแปลงข้อมูลตามขั้นตอนจริงทั้งหมด

ดังนั้นโปรเจคนี้จะพิสูจน์ได้ว่า Dashboard ไม่ได้แค่แสดงตัวเลขจำลอง แต่สามารถรับข้อมูลจาก source จำลอง ผ่านกระบวนการ sync และสรุปผลได้เหมือน workflow การใช้งานจริง
