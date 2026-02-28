# 🏢 Rentsphere Backend

Backend ระบบจัดการคอนโด/หอพัก พัฒนาด้วย Node.js + Express + Prisma + PostgreSQL

---

# 📌 Tech Stack

* Node.js (LTS)
* Express.js
* Prisma ORM
* PostgreSQL
* JWT Authentication
* Docker (สำหรับรันฐานข้อมูล)

---

# ⚙️ ขั้นตอนการติดตั้งระบบ (Installation Guide)

## 1️⃣ ติดตั้งเครื่องมือที่จำเป็น

### ติดตั้ง Node.js (LTS)

ดาวน์โหลดจาก: [https://nodejs.org](https://nodejs.org)

ตรวจสอบเวอร์ชัน

```bash
node -v
npm -v
```

---

### ติดตั้ง Docker Desktop

ดาวน์โหลดจาก: [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)

ตรวจสอบเวอร์ชัน

```bash
docker --version
```

---

# 📥 2️⃣ Clone โปรเจกต์

```bash
git clone <repository-url>
cd rentsphere-backend
```

---

# 📦 3️⃣ ติดตั้ง Dependencies

```bash
npm install
```

---

# 🗄 4️⃣ ตั้งค่าฐานข้อมูล PostgreSQL (ผ่าน Docker)

สร้างไฟล์ `docker-compose.yml`

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:15
    container_name: rentsphere-postgres
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: change_me
      POSTGRES_DB: rentsphere
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

รันฐานข้อมูล

```bash
docker compose up -d
```

ตรวจสอบว่า container ทำงาน

```bash
docker ps
```

---

# 🔐 5️⃣ ตั้งค่า Environment Variables

สร้างไฟล์ `.env`

```env
DATABASE_URL="postgresql://postgres:change_me@127.0.0.1:5432/rentsphere?schema=public"

JWT_SECRET="supersecret"
JWT_EXPIRES_IN="7d"
```

---

# 🧠 6️⃣ Prisma Setup

## Generate Prisma Client

```bash
npx prisma generate
```

## สร้างตารางในฐานข้อมูล

### กรณีใช้ Migration

```bash
npx prisma migrate dev
```

### กรณีต้องการ push schema ทันที

```bash
npx prisma db push
```

---

# 🌱 7️⃣ Seed Database (ถ้ามี)

```bash
npm run seed
```

---

# ▶️ 8️⃣ รันเซิร์ฟเวอร์

```bash
npm run dev
```

หากสำเร็จจะแสดงข้อความ:

```
Server running on http://localhost:3000
```

---

# 🧪 การทดสอบ API

สามารถทดสอบผ่าน:

* Browser
* Postman
* Thunder Client (VS Code)

ตัวอย่าง Endpoint:

```
POST http://localhost:3000/api/auth/login
```

---

# 🧯 ปัญหาที่พบบ่อย

### ❌ Prisma cannot connect to database

* ตรวจสอบว่า Docker ทำงานอยู่
* ตรวจสอบ port 5432 ไม่ถูกใช้งานซ้ำ

### ❌ Port 3000 already in use

```bash
lsof -i :3000
kill -9 <PID>
```

---

# 📂 โครงสร้างโปรเจกต์ (Project Structure)

```
rentsphere-backend/
│── prisma/
│   ├── schema.prisma
│   └── seed.ts
│
│── src/
│   ├── routes/
│   ├── middlewares/
│   ├── utils/
│   └── index.ts
│
│── docker-compose.yml
│── package.json
│── .env
```

---

# 🎯 สรุปขั้นตอนแบบรวดเร็ว

```bash
npm install
docker compose up -d
npx prisma migrate dev
npm run dev
```

---

# 🗄 วิธีดูข้อมูลใน Database

## 1️⃣ ใช้ Prisma Studio (แนะนำสำหรับ Developer)

รันคำสั่ง:

```bash
npx prisma studio
```

เปิดที่:

```
http://localhost:5555
```

สามารถดู เพิ่ม แก้ไข และลบข้อมูลในแต่ละตารางได้ผ่านหน้าเว็บ

---

## 2️⃣ ใช้ Adminer (Database UI เต็มรูปแบบ)

เปิดที่:

```
http://localhost:8080
```

ใส่ค่า:

System: PostgreSQL
Server: host.docker.internal
Username: postgres
Password: change_me
Database: rentsphere

จากนั้นสามารถดูตาราง (Tables), โครงสร้าง (Structure) และรัน SQL Query ได้

---

## 3️⃣ ใช้ Command Line (psql)

เชื่อมต่อฐานข้อมูล:

```bash
psql "postgresql://postgres:change_me@127.0.0.1:5432/rentsphere"
```

คำสั่งที่ใช้บ่อย:

```sql
\dt                 -- ดูรายชื่อตาราง
\d "User"          -- ดูโครงสร้างตาราง
SELECT * FROM "User" LIMIT 10;
```

ออกจาก psql:

```sql
\q
```
