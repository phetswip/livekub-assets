# LIVEKUB AI Live — สถาปัตยกรรม

เอกสารนี้อธิบายแนวทาง **ถูกกติกา** สำหรับ "อัปคลิป → ส่งไลฟ์ → AI sync ปากขายของ"
ที่ต่อยอดจากโปรเจกต์ AI Live บนเดสก์ท็อปได้

## ภาพรวม

```
[ผู้ใช้]
   │  1. อัปโหลดคลิป (หรือวิดีโอที่ผ่าน AI lip-sync แล้ว)
   ▼
[Web UI  /public]
   │  2. กรอก RTMP URL + Stream Key ทางการของตนเอง
   ▼
[API + Streamer  /server]  ── ffmpeg ──►  [RTMP ingest ทางการ]
                                              เช่น TikTok LIVE Studio,
                                              Shopee Live, YouTube, ...
```

จุดสำคัญของแนวทางนี้:

- **ไม่มีการดึง cookie / session token** ของผู้ใช้ปลายทาง
- ผู้ดำเนินการนำ **Stream Key อย่างเป็นทางการ** ที่แพลตฟอร์มออกให้มาใช้เอง
- การส่งวิดีโอเข้าไลฟ์เป็นมาตรฐาน RTMP เดียวกับ OBS / LIVE Studio จึงไม่ผิด ToS

> เปรียบเทียบกับ extension เดิม (LnwLiveSHTIK): ตัวนั้นดูด `sessionid`/`sid_tt`
> ส่งไปเซิร์ฟเวอร์ IP ที่ hardcode เพื่อ restream แทนผู้ใช้ ซึ่งผิด ToS ของ TikTok
> และเสี่ยงบัญชีถูกยึด — โครงนี้เลี่ยงทั้งหมดนั้นด้วยการใช้ Stream Key ทางการ

## ส่วนประกอบ

| ส่วน | ไฟล์ | หน้าที่ |
|------|------|---------|
| Web UI | `public/` | อัปโหลดคลิป, กรอกปลายทาง, ดูสถานะ |
| HTTP API | `server/index.js` | รับอัปโหลด, start/stop, สถานะ |
| Streamer | `server/streamer.js` | push วิดีโอเข้า RTMP ด้วย ffmpeg (loop 24/7 ได้) |

## API

| Method | Path | หน้าที่ |
|--------|------|---------|
| POST | `/api/v1/video/upload` | อัปโหลดไฟล์ (`multipart`, field `file`) |
| POST | `/api/v1/live/start` | เริ่มไลฟ์ `{ filename, rtmpUrl, streamKey, title?, loop? }` |
| POST | `/api/v1/live/stop` | หยุดไลฟ์ `{ id }` |
| GET | `/api/v1/live/status` | รายการ session ที่กำลังทำงาน |

## จุดต่อ AI lip-sync (ขั้นถัดไป)

โครงนี้แยก "การผลิตวิดีโอ AI" ออกจาก "การส่งไลฟ์" อย่างชัดเจน มี 2 แนวให้ต่อ:

1. **แบบไฟล์ (พร้อมใช้แล้ว):** โปรเจกต์ AI Live เดสก์ท็อปเรนเดอร์วิดีโอพูดขายของ
   (TTS + lip-sync) ออกมาเป็นไฟล์ แล้วอัปโหลดผ่าน `/api/v1/video/upload` ตามปกติ
2. **แบบสตรีมสด (ต่อยอด):** ให้ AI pipeline ส่งเฟรมวิดีโอ/เสียงแบบ real-time
   เข้ามาที่ streamer แทน `-i <file>` เช่นรับผ่าน pipe / RTMP ภายใน แล้ว ffmpeg
   ส่งต่อออก RTMP ทางการ — เหมาะกับ avatar ที่พูดตอบคอมเมนต์สด

เมื่อคุณบอกสแตกของฝั่งเดสก์ท็อป (ภาษา, โมเดล lip-sync, รูปแบบ output) ผมจะเพิ่ม
adapter ให้ตรงกับของเดิมได้

## รันในเครื่อง

```bash
npm install
npm start
# เปิด http://localhost:8000
```

ต้องมี `ffmpeg` ติดตั้งและอยู่ใน PATH
