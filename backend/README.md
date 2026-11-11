# Construction Ops backend — Render บัญชีใหม่

ใช้ Render บัญชีของงานก่อสร้าง และ Google Cloud/Firebase โปรเจกต์เดิม
`khok-kloi-backhoe-engineering` ใช้ Web OAuth client สำหรับ Drive ที่ตรงกับ frontend
และ Client Secret ของ client นั้น ส่วน encryption key ต้องคงค่าเดิม

Backend ตรวจ Firebase ID token พร้อมการถอนสิทธิ์ และ `admins/{uid}.enabled == true` ทุกคำขอ
เก็บ credentials เข้ารหัส AES-256-GCM แยก UID และ OAuth client ที่
`_driveCredentials/{uid}/oauthClients/{sha256(clientId)}` โดยเก็บ Client ID ภายในข้อมูลเข้ารหัสด้วย
เอกสารเดิม `_driveCredentials/{uid}` และสิทธิ์ของ client อื่นยังคงอยู่ ไม่ถูกนำมาใช้แทนสิทธิ์ใหม่
Firestore rules ปัจจุบันปิดการเข้าถึง collection นี้จาก frontend แล้ว

## 1. เตรียม source

นำโค้ดที่ตรวจแล้ว รวม `backend/`, `backend/package-lock.json` และ `render.yaml`
ขึ้น repo `https://github.com/gitsittikorn/construction-ops` ก่อนให้ Render deploy
Render บัญชีใหม่เชื่อม GitHub เพื่อเข้าถึง repo นี้ได้ ไม่ต้องใช้บัญชี Render ของ Scrum Poker
ห้ามนำ `.env.local`, client secret หรือ private key ขึ้น Git

## 2. เตรียม Firebase credential สำหรับ backend

เปิด [Firebase Service accounts](https://console.firebase.google.com/project/khok-kloi-backhoe-engineering/settings/serviceaccounts/adminsdk)
เลือก Generate new private key แล้วดาวน์โหลด JSON เก็บนอก repo ไม่ส่งผ่านแชต
หากองค์กรมีข้อกำหนด IAM ให้ใช้ service account ที่มีสิทธิ์อ่าน/เขียน Firestore
และตรวจผู้ใช้ Firebase Auth ตามนโยบายองค์กร
Credential นี้ใช้กับ Firebase Admin ฝั่ง backend ไม่ใช่ OAuth ของผู้ใช้ Drive และไม่ใส่ใน React

## 3. สร้าง Render service

เข้า [Render Dashboard](https://dashboard.render.com/) ด้วยบัญชีงานก่อสร้าง
เลือก New → Web Service → เชื่อม repo Construction Ops ตั้งค่าดังนี้:

| ช่อง               | ค่า                        |
| ------------------ | -------------------------- |
| Name               | `construction-ops-backend` |
| Branch             | branch ที่มี backend นี้   |
| Region             | Singapore                  |
| Language / Runtime | Node                       |
| Root Directory     | `backend`                  |
| Build Command      | `npm ci`                   |
| Start Command      | `npm start`                |
| Instance Type      | Free                       |
| Health Check Path  | `/health`                  |

หรือใช้ New → Blueprint กับ `render.yaml` แต่ยังต้องเพิ่ม Firebase Secret File ตามขั้นถัดไป

## 4. Environment และ Secret File

Environment → เพิ่มค่าจากแหล่งเก็บ credentials อย่างปลอดภัย โดยใช้คู่ของ Web client สำหรับ Drive:

```dotenv
GOOGLE_OAUTH_CLIENT_ID=<ตรงกับ VITE_GOOGLE_CLIENT_ID ของ frontend>
GOOGLE_OAUTH_CLIENT_SECRET=<Client Secret ของ Web client ด้านบน>
CONSTRUCTION_FIREBASE_PROJECT_ID=khok-kloi-backhoe-engineering
DRIVE_TOKEN_ENCRYPTION_KEY=<คงค่า encryption key เดิมใน Render>
```

เพิ่มอีกสามค่า:

```dotenv
NODE_VERSION=22
CORS_ORIGINS=https://khok-kloi-backhoe-engineering.web.app,https://khok-kloi-backhoe-engineering.firebaseapp.com,http://localhost:5173,http://127.0.0.1:5173
GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/construction-firebase-admin.json
```

หากใช้ custom domain หรือพอร์ตอื่น ให้เพิ่ม origin จริงใน `CORS_ORIGINS`
ใช้ protocol และ port แต่ไม่มี path หรือ slash ต่อท้าย คั่นแต่ละ origin ด้วย comma

Environment → Secret Files → Add Secret File:

- Filename: `construction-firebase-admin.json`
- Contents: เนื้อหา JSON ที่ได้จากขั้นที่ 2

บันทึกและ deploy เมื่อ source และค่าทั้งหมดพร้อม หาก deploy แรกล้มเหลวเพราะยังไม่มี Secret File
ให้เพิ่มไฟล์แล้ว deploy อีกครั้ง ไม่ต้องสร้าง service ใหม่
ห้ามใส่ secret ใน `VITE_*` และเก็บ `DRIVE_TOKEN_ENCRYPTION_KEY` เดิมไว้หลังเริ่มเข้ารหัส token

## 5. Google client สำหรับ Drive

เปิด [Google Auth Platform Clients](https://console.cloud.google.com/auth/clients?project=khok-kloi-backhoe-engineering)
เลือก Web client ที่ตรงกับ `GOOGLE_OAUTH_CLIENT_ID`
เพิ่ม Authorized JavaScript origins ให้ตรงกับ frontend:

```text
https://khok-kloi-backhoe-engineering.web.app
https://khok-kloi-backhoe-engineering.firebaseapp.com
http://localhost:5173
http://127.0.0.1:5173
```

เพิ่ม custom domain หรือพอร์ตอื่นตามการใช้งานจริง คงค่า Firebase login เดิมไว้
โค้ดใช้ popup code model ไม่ต้องเพิ่ม backend `/callback` เพราะไม่มี route นี้
Google ใช้ origin ของ frontend ตอนแลก authorization code

ตรวจ Google Auth Platform → Audience ด้วย หากเป็น External และสถานะ Testing
refresh token สำหรับ Drive จะมีอายุ 7 วัน สำหรับใช้งานจริงให้จัดการ Publishing status
เป็น In production ตามขั้นตอน Google และทำ verification หาก Console กำหนด
ระบบยังแสดง modal เชื่อมใหม่เมื่อ Google ถอนสิทธิ์หรือไม่ยอมต่ออายุ

## 6. เชื่อม frontend

คัดลอก URL จริงที่ Render ให้ ไม่เดาชื่อ subdomain
เปิด `https://<your-service>.onrender.com/health` ต้องตอบ:

```json
{ "ok": true, "service": "construction-ops-backend" }
```

Health ยืนยันเฉพาะ process ยังไม่ได้ยืนยัน OAuth และสิทธิ์ Firebase
ตั้งค่าใน `.env.local` ของ frontend:

```dotenv
VITE_DRIVE_BACKEND_URL=https://<your-service>.onrender.com
```

local ต้อง restart Vite ส่วน production ต้อง build และ deploy frontend ใหม่บน Firebase Hosting
ไม่ต้องใส่ตัวแปร `VITE_*` นี้ใน Render backend เพราะ frontend ถูก build แยก
หาก URL ยังว่าง แอปจะใช้การเชื่อม Drive แบบเดิม

เข้าสู่ Firebase ด้วยบัญชีที่มี `admins/{uid}.enabled = true`
แล้วกดเชื่อมต่อ Drive ครั้งแรกเพื่อขอ refresh token จากนั้นจะต่ออายุให้เองเมื่อใกล้หมดอายุหรือเปิดเว็บอีกครั้ง
หาก Google ไม่ออก refresh token และไม่มีตัวเก่า ระบบจะขอให้เชื่อมใหม่
ตรวจ consent ที่ [Google Account connections](https://myaccount.google.com/connections) ก่อนอนุญาตใหม่
การถอนสิทธิ์ client เดิมอาจทำให้ Firebase login ของบัญชีนั้นต้องเข้าสู่ระบบใหม่ด้วย

## ทดสอบและข้อจำกัด

ใช้ `npm --prefix backend test` หรือรวมใน `npm run check` ที่ root
ทดสอบ encryption, UID isolation, account matching, refresh, provider errors, disconnect,
Firebase identity, CORS และ CSRF ด้วย provider จำลอง
คู่ Client ID/secret เคยตรวจ client authentication กับ Google แล้ว
เป็นหลักฐานเก่าของคู่เดิม ไม่ยืนยันคู่ใหม่ที่ผู้ใช้ตั้งใน Render
ยังไม่ได้ทดสอบ consent/refresh token ของผู้ใช้จริงหรือ deploy รุ่นแก้ BUG-021

Render Free พักเครื่องเมื่อไม่มี request 15 นาที การเรียกครั้งแรกอาจรอประมาณหนึ่งนาที
ไม่ต้องเปิดเครื่องรอต่ออายุทุกชั่วโมง เมื่อกลับมาใช้งาน backend จะขอ access token ใหม่
ด้วย refresh token ที่ยังอยู่ใน Firestore ไม่มีการ self-ping และไม่เก็บ token ใน local filesystem ของ Render
Render ระบุ Free สำหรับทดลอง/งานส่วนตัว หากต้องการความพร้อมใช้งานของ production ให้เลือก compute plan ที่เหมาะสม

อ้างอิง:
[Render Web Service](https://render.com/docs/deploy-node-express-app),
[Render Environment](https://render.com/docs/configure-environment-variables),
[Firebase Admin](https://firebase.google.com/docs/admin/setup),
[Google code model](https://developers.google.com/identity/oauth2/web/guides/use-code-model),
[Refresh token expiration](https://developers.google.com/identity/protocols/oauth2#expiration),
[Render Free](https://render.com/docs/free)

## OAuth client migration — 2026-11-11

BUG-021 uses additive storage: the backend never reads, overwrites or deletes legacy parent credentials. Switching clients selects another SHA-256-namespaced child document and requires fresh authorization. The encrypted payload must match the configured client before returning access, refreshing or reusing a refresh grant. Misplaced/unbound child records are rejected and retained for reviewed recovery. AES-GCM key, format and UID authentication are unchanged.

Disconnect and `invalid_grant` invalidation affect only the authenticated user's current client child document. Legacy/other-client records and Google grants are untouched. Existing per-process serialization remains; distributed multi-instance locking is not added.

Session/exchange responses include public `clientId`; the updated frontend requires a match with `VITE_GOOGLE_CLIENT_ID`. An old or mismatched backend cannot establish a connection. Deploy the reviewed backend before enabling its URL on the updated frontend. No additional env variable, Rules allowance, index or key rotation is required. See [DRIVE_OAUTH_BINDING_2026-11-11.md](../docs/DRIVE_OAUTH_BINDING_2026-11-11.md) for validation and deployment prerequisites.

## Request limits

Backend JSON bodies are limited to 8 KiB and oversized bodies return 413. Authenticated Drive API calls share a per-UID budget of 60 requests/minute/process with a bounded 1,000-owner window map; excess requests return 429 and Retry-After before provider calls. This is not a distributed/IP/WAF limiter, and does not replace deployment-level protection against unauthenticated request floods. No new secret/env setting is required for the default budget.
