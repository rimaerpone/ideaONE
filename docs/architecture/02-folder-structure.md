# ساختار پوشه‌ها — قواعد الزامی

وضعیت: **فعال (نسخه ۳ — پس از تاکسونومی سه‌لایه ADR-008 و سرویس‌های هسته ADR-009)** | مالک: معماری | بازنگری: ۱۴۰۵/۰۶/۱۳
اجرای ماشینی این سند: `bun run check` (ADR-007) — هر قاعده‌ای که قابل اتوماسیون است، شناسه CH- دارد.

> **فلسفه**: هر مسیر یک «منظور» و یک «مالک» دارد. فایل بی‌منظور = فایل منسوخ = حذف. هیچ فایلی «برای شاید بعداً» نگه داشته نمی‌شود؛ تاریخچه در گیت امن است.

## ۱. درخت کامل با مالک و مسئولیت

```
/home/z/my-project
├── AGENTS.md                     ← قرارداد عامل‌ها (اولین فایل خوانده‌شده) — مالک: معماری
├── README.md                     ← نمای عمومی پروژه — مالک: محصول
├── package.json / bun.lock       ← وابستگی‌ها + اسکریپت‌ها (dev/lint/check/db:*) — مالک: معماری
├── next.config.ts / tsconfig.json / eslint.config.mjs / postcss.config.mjs / components.json
│                                 ← پیکربندی (Tailwind 4 CSS-first است — tailwind.config.ts حذف شد؛ توکن‌ها در globals.css)
├── Caddyfile                     ← گیت‌وی (تغییر = خطر) — مالک: زیرساخت
├── .env                          ← فقط DATABASE_URL غیرمحرمانه — عمداً track شده (استثنا !.env در .gitignore)
├── .gitignore                    ← *.log و .env* نادیده؛ استثنای عمدی: !.env
├── .zscripts/                    ← اسکریپت‌های نظارت محیط سندباکس (dev.sh/start.sh/…) — مالک: محیط، دست نزنید
├── prisma/schema.prisma          ← تنها منبع حقیقت داده (۲۹ مدل) — مالک: داده
├── db/custom.db                  ← دیتابیس SQLite (داده دمو؛ track است) — مالک: داده
├── .storage/                     ← اشیای فایل آداپتر Storage (gitignore — ADR-009) — مالک: زیرساخت
├── research/                     ← پژوهش‌های خام بنچمارک ممیزی ۳۶۰ درجه (Odoo/Axelor/تیم‌یار/راهکاران) — مالک: معماری
├── dev.log                       ← لاگ اپ (tee از اسکریپت dev؛ gitignore؛ trunc طبق RB-02)
│
├── docs/                         ← نظام مستندسازی (نقشه: docs/README.md)
│   ├── README.md                 ← نقشه مستندات + قواعد نگهداشت
│   ├── product/                  ← ۳ سند «چیستی و برای کی»
│   ├── architecture/             ← ۸ سند «چگونگی» (همین پوشه)
│   ├── modules/                  ← SPEC هر پلاگین (قالب: _TEMPLATE.md؛ نام پوشه = کد رجیستری)
│   ├── scenarios/                ← سناریوهای عملیاتی SC-NNN
│   ├── roadmap/                  ← نقشه راه: 00-master.md + ۱۱ فاز P0..P10
│   ├── adr/                      ← تصمیم‌های معماری ADR-NNN
│   ├── runbook/                  ← عملیات RB-NNN
│   └── persian/                  ← پشته فارسی + انطباق ایران
│
├── src/
│   ├── app/                      ← پوسته نازک — مالک: معماری
│   │   ├── page.tsx              ← تک‌مسیره (قانون گیت‌وی) — فقط رندر AppShell
│   │   ├── layout.tsx            ← RTL + فونت وزیرمتن (localFont از src/app/fonts/)
│   │   ├── globals.css           ← تم/توکن‌های Tailwind 4 (تنها پیکربندی Tailwind)
│   │   ├── fonts/                ← Vazirmatn (Regular/Medium/Bold) — تنها منبع فونت
│   │   └── api/**/route.ts       ← آداپتور HTTP: هر متد ≤ ۱۴ خط (CH-04) — گارد + delegate فقط
│   ├── instrumentation.ts        ← قلاب بوت سرور → راه‌اندازی هسته زمان‌بند (ADR-009)
│   ├── core/                     ← هسته پلتفرم — ۱۸ سرویس سند منبع (ADR-009) — مالک: معماری
│   │   ├── auth/auth.ts          ← نشست scrypt + login/mePayload/switchCompany/logout + requireCtx در shared
│   │   ├── tenancy/tenancy.ts    ← scopeCompanyIds + roleInCompany
│   │   ├── events/outbox.ts      ← emitEvent
│   │   ├── notifications/        ← notify.ts (قیف واحد) + realtime.ts (push)
│   │   ├── audit/audit.ts        ← سجل حسابرسی
│   │   ├── featureflags/         ← Feature Flags (سرویس ۱۳): isFeatureEnabled + کش ۱۵ث
│   │   ├── storage/storage.ts    ← اشیای فایل (سرویس ۱۱): putObject/getObject — آداپتر FS، قرارداد S3
│   │   ├── scheduler/scheduler.ts ← کارهای دوره‌ای (سرویس ۱۲): پردازشگر Outbox + پایش سلامت
│   │   ├── ai/gateway.ts         ← دروازه AI (سرویس ۱۷): runAiJson — گیت فلگ + تلمتری + تایم‌اوت
│   │   ├── integration/          ← باس یکپارچه‌سازی (سرویس ۱۸): کاتالوگ کانکتورها
│   │   ├── reporting/            ← فراداده گزارش‌ها (سرویس ۱۶)
│   │   └── shared/               ← db, jalali, api-client, server-helpers, types (ServiceResult), LABELS
│   ├── modules/                  ← پلاگین‌های کسب‌وکار — نام پوشه = کد رجیستری (ADR-008) — مالک هر پوشه: مالک پلاگین
│   │   └── <name>/               ← آناتومی الزامی (CH-01):
│   │       ├── service.ts        ← منطق (توابع ServiceResult؛ server-only)
│   │       ├── components/*.tsx  ← نماها و دیالوگ‌های پلاگین
│   │       ├── <sub>.ts          ← زیرسرویس‌های دامنه (نمونه: warehouse/requests.ts)
│   │       └── README.md         ← معرفی یک‌صفحه‌ای + پیوند به docs/modules/<name>/SPEC.md
│   ├── components/
│   │   ├── ui/                   ← shadcn — فقط کامپوننت‌های در استفاده (CH-10)؛ افزودن با CLI مجاز، بلااستفاده = حذف
│   │   ├── shell/                ← app-shell, header, sidebar, login-view
│   │   └── common/               ← ui-bits (PageHeader/StatusBadge/…) + jalali-date-picker
│   ├── hooks/                    ← use-realtime, use-toast (فقط هوک‌های در استفاده — CH-11)
│   ├── store/app.ts              ← zustand: me, view, company, rt state
│   ├── types/platform.ts         ← تایپ‌های مشترک کلاینت (آینه مدل‌ها — قرارداد API)
│   └── lib/utils.ts              ← فقط cn() — استثنای قرارداد shadcn
│
├── mini-services/
│   └── realtime/                 ← مینی‌سرویس Bun مستقل (socket.io 3003 + API داخلی 3004)
│       ├── index.ts / package.json / bun.lock / node_modules/
│       └── realtime.log          ← لاگ سرویس اینجا می‌نشیند (نه ریشه) — W-01
├── scripts/
│   ├── check.ts                  ← دروازه کیفیت ساختار/مستندات (bun run check — ADR-007)
│   ├── seed.ts                   ← داده اولیه (پاک‌سازی کامل + seed)
│   └── test-jalali.ts            ← تست ۵ تاریخ مرجع تبدیل جلالی
├── prisma/ · public/ (logo.svg, robots.txt)
├── upload/ideaone idea.txt       ← سند اصلی محصول (ورودی، فقط‌خواندنی)
├── download/                     ← خروجی‌های قابل دانلود کاربر (گزارش‌ها و …)
├── archive/                      ← تاریخچه خارج از مسیر فعال (audit-phase/ — شامل refactor-imports.py مهاجرت انجام‌شده)
├── skills/                       ← مهارت‌های سندباکس (به پروژه تعلق ندارد — محیط)
└── worklog.md                    ← گزارش کار تجمعی همه عامل‌ها
```

## ۲. قواعد جابه‌جایی و مالکیت

| پوشه | مجاز است | ممنوع است |
|---|---|---|
| `src/app/api/**` | گارد + فراخوانی service + ترجمه ServiceResult→HTTP | هر منطق کسب‌وکار، Prisma مستقیم (CH-05)، SDK |
| `src/core/*` | زیرساخت بی‌طرف | import از `modules/*` یا `components/*` (CH-07) |
| `src/modules/<m>` | import از `core/*`, `components/*`, hooks/store | import از ماژول دیگر (CH-06)؛ منطق ماژول بیرون از پوشه‌اش |
| `src/components/ui` | کامپوننت shadcnِ در استفاده؛ افزودن با CLI | نگه‌داشتن کامپوننت بلااستفاده (CH-10)؛ ویرایش رفتار پیش‌فرض shadcn |
| `src/components/common` | کامپوننت‌های مقطعی (PageHeader…) | منطق یک ماژول خاص |
| `mini-services/*` | سرویس مستقل با پورت ثابت + لاگ در پوشه خودش + راه‌انداز setsid | وابستگی به کد src/ (کپی/پروتکل، نه import)؛ لاگ در ریشه (W-01) |
| `docs/**` | به‌روزرسانی هم‌زمان با PR همان تغییر | سند بدون وضعیت/مالک؛ نام‌گذاری خارج از الگو (CH-13)؛ پیوند شکسته (CH-12) |
| `archive/**` | انتقال آرتیفکت فازهای بسته و اسکریپت‌های یک‌بارمصرف | هر ارجاع فعال از src/ به این پوشه |
| `scripts/*` | اسکریپت قابل اجرای مکرر (check/seed/test) | اسکریپت یک‌بارمصرف (آن‌ها archive می‌شوند) |
| ریشه | فقط فایل‌های پیکربندی + AGENTS/README/worklog/.env/dev.log | هر فایل موقت/خروجی — خروجی → download/ (W-04) |

## ۳. قواعد نام‌گذاری (خلاصه؛ کامل: `07-conventions.md`)

| عنصر | قاعده | نمونه |
|---|---|---|
| پوشه/فایل | kebab-case | `letter-detail-dialog.tsx` |
| کامپوننت/Type | PascalCase بدون I | `LettersView` |
| تابع | فعل+موضوع camelCase | `postWarehouseDoc()` |
| ثابت | SCREAMING_SNAKE | `SESSION_COOKIE` |
| مدل Prisma | مفرد PascalCase | `WarehouseDoc` |
| مسیر API | جمع kebab-case + `[id]` | `/api/letters/[id]/actions` |
| سند docs | پیشوند شماره‌دار نوع | `ADR-004-…`, `SC-006-…`, `RB-02-…`, `P3-…` |
| import ماژول Node | همیشه با پیشوند `node:` | `node:crypto` |

## ۴. سیاست «بدون فایل منسوخ» (اجرای ماشینی: بخش «د» دروازه check)

1. **هر فایل باید در این سند (یا SPEC ماژولش) مسیر و منظور داشته باشد** — فایل ناشناخته در review رد می‌شود؛ فایل یتیم از نقاط ورود = خطا (CH-11).
2. حذف به‌جای کامنت‌گذاری: کد مرده (کامپوننت بلااستفاده، `eslint-disable` بلااستفاده، import بلااستفاده) در همان PR حذف می‌شود — بازگردانی از گیت یا با CLI shadcn (۵ ثانیه) ممکن است.
3. **وابستگی npm**: هر بسته باید در استفاده باشد یا در allowlist مستندِ `scripts/check.ts` (با پیوند نقشه راه/ADR) بیاید (CH-08)؛ import بدون اعلام در package.json ممنوع (CH-09).
   - وضعیت پس از ممیزی ۱۴۰۵/۰۶ (۳۶ بسته حذف شد): مجازِ مستند = `@tanstack/react-query` و `@tanstack/react-table` (P1)، `react-hook-form` + `zod` (P1-T20)، `prisma` (CLI)، `react-dom` (peer رندر). صریحاً اعلام شدند: `react-date-object` (تقویم جلالی)، `server-only` (مرز سرور/کلاینت).
   - حذف‌شده‌های ممیزی: کامپوننت‌های شبح‌ساز (dnd-kit، framer-motion، mdxeditor، react-markdown، syntax-highlighter، reactuses، uuid، sharp، date-fns، hookform-resolvers) + یتیم‌های ۲۹ کامپوننت حذف‌شده ui (radixهای ۱۵گانه، sonner، next-themes، cmdk، vaul، embla، input-otp، react-resizable-panels، react-day-picker، tailwindcss-animate).
4. آرتیفکت فاز بسته → `archive/<phase>/` در همان روز بستن فاز (نمونه: refactor-imports.py).
5. لاگ‌ها (`*.log`) gitignore هستند (الگوی موجود در .gitignore) — در ریشه فقط `dev.log` مجاز است؛ پاکسازی دوره‌ای با `truncate` طبق RB-02 (W-02).

## ۵. تغییر این سند

هر تغییر ساختار پوشه (افزودن/جابه‌جایی/حذف مسیر) **قبل از جابه‌جایی کد** در این سند ثبت و در PR لینک می‌شود. کامیت ساختاری بدون به‌روزرسانی این سند رد می‌شود.
قاعده ADR-007: قاعده جدیدِ قابل‌اتوماسیون = همزمان یک بررسی CH-xx در `scripts/check.ts`؛ سندی که ماشین نمی‌تواند راستی‌آزمایی کند، به کهنگی محکوم است.
