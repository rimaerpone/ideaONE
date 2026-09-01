# معماری کلان سامانه

وضعیت: **فعال** | مالک: معماری | بازنگری: ۱۴۰۵/۰۶/۰۵ | پیوند: ADR-001، ADR-002، ADR-003، ADR-004، ADR-005

## ۱. تصمیم معماری (خلاصه یک‌صفحه‌ای)

| موضوع | تصمیم | چرا (جایگزین ردشده) |
|---|---|---|
| سبک کلی | **مونولیت ماژولار** + رجیستری دیتابیس‌محور | میکروسرویس در سندباکس تک‌پورت ناممکن؛ تعداد توسعه‌دهنده کم |
| چندمستأجری | **«شرکت = مستأجر»** بدون tenant_id اضافه | فیلد tenant_id جدول‌ها را شلوغ و کوئری‌ها را خطاخیز می‌کند (ADR-002) |
| جداسازی ماژول | پوشه‌بندی `src/modules/*` + قاعده «ماژول از ماژول import نمی‌کند» | بسته‌های کاری جدا در آینده بدون big-bang |
| ارتباط بین‌ماژولی | **Outbox دیتابیسی** (`OutboxEvent`) | message broker در سندباکس نیست (ADR-003) |
| احراز هویت | نشست دیتابیسی + scrypt + کوکی httpOnly | next-auth حذف شد — پیچیدگی غیرضروری برای تک‌دامنه |
| اعلان | `notify()` → INSERT + push سوکت (fire-and-forget) + polling ۳۰s | at-least-once بدون وابستگی به سوکت (ADR-004) |
| بلادرنگ | مینی‌سرویس Bun مستقل socket.io پورت 3003 + API داخلی 3004 | سوکت روی همان پورت Next ممکن نیست (قاعده گیت‌وی) |
| دیتابیس | SQLite تک‌فایل + Prisma (بدون مهاجرت زنده؛ `db push`) | ساده‌ترین DB پایدار سندباکس؛ مسیر ارتقا در P10 |
| UI | SPA تک‌مسیره (`/` فقط) + سوئیچ نما از رجیستری | گیت‌وی فقط `/` را نشان می‌دهد |
| AI | z-ai-web-dev-sdk فقط سمت سرور + HITL | کلید نباید به کلاینت برود؛ خروجی AI بدون تأیید ذخیره نمی‌شود |

## ۲. نمای اجزا و جریان‌ها

```
مرورگر (RTL SPA — پوسته + ماژول‌های UI)
   │  fetch نسبی: /api/** (گیت‌وی Caddy → پورت 3000)
   │  WebSocket:  io('/?XTransformPort=3003')
   ▼
Next.js 16 (App Router — پورت 3000)
   ├── src/app/api/**/route.ts      ← آداپتور نازک (~۸ خط): گارد + delegate
   ├── src/modules/*/service.ts     ← منطق کسب‌وکار (ServiceResult)
   ├── src/core/*                   ← auth/tenancy/events/notifications/audit/shared
   └── Prisma ORM ──► SQLite (db/custom.db)
                        ▲
   mini-services/realtime (Bun — پورت 3003 سوکت / 127.0.0.1:3004 API داخلی)
                        │  emit داخلی: POST 127.0.0.1:3004/emit (x-internal-key)
                        └─ Next برای هر notify() صدا می‌زند
```

### جریان‌های شاخص (به سناریوها ارجاع دهید)

| جریان | مسیر | سناریو |
|---|---|---|
| ثبت نامه و ارجاع | route → letters/service → DocCounter + notify → Outbox → Audit | SC-001 |
| قطعی‌سازی سند انبار | route → inventory/service → applyDocToStock (تراکنشی) → Outbox → Audit | SC-002 |
| درخواست کالا | route → requests/service → notify مدیران → تصمیم → notify متقاضی | SC-003 |
| اعلان بلادرنگ | notify → INSERT Notification + POST emit → اتاق user:<id> → Toast/badge | SC-004 |
| ایزولاسیون داده | هر کوئری: `scopeCompanyIds(ctx)` | SC-005 |
| AI با HITL | letters/service → ZAI.chat (سمت سرور) → نمایش پیشنهاد → اعمال صریح | SC-006 |

## ۳. قواعد غیرقابل نقض سندباکس (ADR-005)

1. فقط `/` قابل نمایش؛ route app جدید ممنوع (API route آزاد است).
2. `bun run build`/`bun run dev` ممنوع — dev سرور تحت نظارت محیط است.
3. z-ai-web-dev-sdk فقط در فایل‌های `server-only`.
4. fetch مرورگر و سوکت: همیشه مسیر نسبی + `XTransformPort`؛ مطلق ممنوع.
5. پروسه پس‌زمینه با double-fork: `( cd dir && setsid cmd >> log 2>&1 < /dev/null & )`.
6. تست مرورگر فقط از گیت‌وی `http://127.0.0.1:81/`.

## ۴. نگرانی‌های عملیاتی شناخته‌شده

| موضوع | وضعیت | برنامه |
|---|---|---|
| پردازشگر Outbox دوره‌ای | رویدادها نوشته می‌شوند اما consumer نداریم | P0-T18 |
| شمارش موجودی منفی در ISSUE پیش از قطعی | کنترل فقط هنگام post | P3-T6 (اعتبارسنجی پیش‌نمایش) |
| جستجوی متن نامه | `contains` بدون ایندکس FTS | P2-T5 (FTS5) |
| ابطال سند قطعی‌شده | ممنوع در پایلوت | P3-T12 (سند اصلاحی معکوس) |
| تغییر schema | `db push` بدون مهاجرت نسخه‌دار | P10 (migrate + ارتقا PG) |

## ۵. پیوندها

- قواعد پوشه‌ها: [`02-folder-structure.md`](./02-folder-structure.md)
- مدل داده کامل: [`03-data-model.md`](./03-data-model.md)
- امنیت: [`04-security-rbac.md`](./04-security-rbac.md)
- بلادرنگ: [`05-realtime.md`](./05-realtime.md)
- رجیستری ماژول: [`06-module-registry.md`](./06-module-registry.md)
