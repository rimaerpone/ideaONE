# ADR-005 — قواعد بقا در سندباکس (پشته فناوری مجاز)

- وضعیت: پذیرفته‌شده (سند زنده — با هر کشف محیطی به‌روز شود)
- تاریخ: ۱۴۰۵/۰۶/۰۵
- مرتبط: ممیزی فصل B0-B2 (۴۲ مؤلفه)

## تصمیم

پشته مجاز و مسیر جایگزین هر نیاز، بر اساس **اثبات عملی** در همین محیط:

| نیاز | انتخاب | جایگزین رد‌شده + دلیل |
|---|---|---|
| وب | Next.js 16 App Router (تک‌مسیره SPA) | Next.js Pages / CSR خالص — server actions و route handler لازم است |
| دیتابیس | Prisma + SQLite تک‌فایل | Postgres — در سندباکس نیست؛ اسکیما Postgres-compatible نگه داشته می‌شود (بدون نوع SQLite-specific) |
| UI | shadcn/ui + Tailwind 4 (New York) | MUI/AntD — RTL و کنترل ظاهری ضعیف‌تر |
| state | Zustand + fetch ساده | Redux/TanStack Query — برای مقیاس فعلی overkill (Query در فاز گزارش‌ساز بازبینی شود) |
| بلادرنگ | socket.io مینی‌سرویس Bun | SSE — دوطرفه نیست؛ polling — تأخیر |
| AI | z-ai-web-dev-sdk (فقط سرور) | OpenAI مستقیم — کلید نیست؛ پایتون/NLP محلی — ضعیف‌تر |
| احراز هویت | نشست دیتابیسی + scrypt + cookie httpOnly | NextAuth — مدل چندشرکتی نشست‌محور و رول per-company با آن نامرتبط است |
| فونت | Vazirmatn (self-host در `src/app/fonts/`) | CDN — قطعی اینترنت؛ فونت دوم تکراری حذف شد |
| تاریخ | `core/shared/jalali.ts` داخلی (تست‌شده) + دیت‌پیکر react-multi-date-picker | moment-jalali — unmaintained؛ date-fns-jalali — فقط لایه فرمت در صورت نیاز |
| اعتبارسنجی ایرانی | @persian-tools/persian-tools | regex دست‌ساز — خطاخیز |

## قواعد عملیاتی کشف‌شده (با اثبات)

1. پروسه پس‌زمینه با **double-fork + setsid** زنده می‌ماند (پروسه عادی بین دستورات shell کشته می‌شود)
2. تست اتصال سوکت فقط از پورت گیت‌وی ۸۱ ممکن است، نه 3000 مستقیم
3. هر پورت جدید فقط با `?XTransformPort=<port>` از بیرون قابل دسترس است
4. `bun run dev/build` ممنوع — سرور نظارتی سیستم روی ۳۰۰۰ است
5. camleCase/مسیر مطلق در fetch ممنوع — فقط نسبی

## پیامدها

✅ هر ردیف جدول حداقل یک‌بار در عمل اثبات شده · onboarding عامل جدید سریع
❌ سند زنده است — کشف محیطی جدید باید همین‌جا ثبت شود (قاعده AGENTS.md)
