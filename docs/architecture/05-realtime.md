# معماری اعلان بلادرنگ (Realtime)

وضعیت: **فعال** | مالک: زیرساخت | بازنگری: ۱۴۰۵/۰۶/۰۵ | پیوند: ADR-004، SC-004

## ۱. چرا مینی‌سرویس مستقل؟

سندباکس فقط یک پورت عمومی (۳۰۰۰ از طریق گیت‌وی) دارد و گیت‌وی Caddy مسیرهای `XTransformPort` را فوروارد می‌کند. اتصال socket.io به dev سرور Next عملاً ممکن نیست (middleware/upgrade تداخل دارد). راه‌حل: **مینی‌سرویس Bun مستقل** در `mini-services/realtime/` با دو پورت:

| پورت | intf | کار |
|---|---|---|
| 3003 | همه | socket.io با `path:'/'` (قاعده گیت‌وی) — اتصال کلاینت: `io('/?XTransformPort=3003')` |
| 127.0.0.1:3004 | فقط لوکال | API داخلی: `GET /healthz`، `POST /emit` با هدر `x-internal-key` (timingSafeEqual) |

> **درس کلیدی سندباکس**: socket.io با `path:'/'` تمام HTTP سرور خودش را تصرف می‌کند؛ به همین دلیل API داخلی روی پورت جداگانه است، نه زیرمسیر.

## ۲. چرخه کامل تحویل

```
سرویس ماژول (مثلاً requests)
  └─ notify({userId,title,body,kind,targetView})     ← قیف واحد
       ├─ INSERT Notification            (منبع حقیقت — at-least-once)
       └─ pushRealtime(userIds, data)    (fire-and-forget, timeout 2.5s, سکوت عمدی خطا)
             └─ POST 127.0.0.1:3004/emit { room:'user:<id>', event:'notification', data }
                   └─ io.to(room).emit(...)
مرورگر (AppShell → useRealtime)
  ├─ GET /api/realtime/ticket (کوکی نشست) → بلیت HMAC 60s
  ├─ io('/?XTransformPort=3003') + emit('register', ticket)
  ├─ on('notification') → toast فارسی + bumpRt() → refetch badge
  └─ قطع → reconnect خودکار socket.io → چیپ «آفلاین» تا بازگشت
پوشش قطعی: polling هر 30s روی /api/notifications (rtVersion مستقل)
```

## ۳. قراردادها

| قرارداد | مقدار |
|---|---|
| اتاق کاربر | `user:<userId>` — تنها الگوی اتاق مجاز |
| رویداد | `notification` با payload `{id,title,body,kind,targetView}` |
| بلیت | `base64(userId:expMs).HMAC_SHA256(secret)` — ۶۰ ثانیه، timingSafeEqual |
| API داخلی | فقط `127.0.0.1`؛ کلید در متغیر محیطی هر دو طرف |
| خوانده‌شده | کلیک اعلان → `POST /api/notifications` (mark) — نه از سوکت |

## ۴. تاب‌آوری (اثبات‌شده در SC-004)

- kill سرویس → کلاینت چیپ «آفلاین» + polling ادامه می‌دهد → اعلان دیرهنگام ولی **از دست نمی‌رود**.
- ری‌استارت با الگوی double-fork (قانون سندباکس):
  `( cd mini-services/realtime && setsid bun run dev >> realtime.log 2>&1 < /dev/null & )`
- سوکت پس از بازگشت خودکار وصل می‌شود؛ نیازی به رفرش صفحه نیست.

## ۵. مقیاس‌پذیری و مسیر آینده

| موضوع | امروز | برنامه |
|---|---|---|
| پردازشگر Outbox → emit | emit مستقیم در notify | P0-T18: consumer دوره‌ای + retry |
| رویدادهای بیشتر (typing/presence) | فقط notification | P5 (کارتابل زنده) |
| چند نمونه سرویس | ۱ | خارج از سندباکس لازم نمی‌شود |
| احراز اتصال پایدار | بلیت در register | کافی برای پایلوت |
