# نقشه فناوری‌های فارسی (ایران — ۱۴۰۵)

سند زنده: هر تصمیم «فارسی» جدید اینجا ثبت و در AGENTS.md ارجاع داده شود. اصل: **چرخ را اختراع نکن** — کتابخانه بالغ ترجیح دارد.

## انتخاب‌های قطعی‌شده

| نیاز | انتخاب | ریپو / پکیج | نکات استفاده |
|---|---|---|---|
| اعتبارسنجی: کدملی، شناسه ملی/اقتصادی، شبا، شمارت کارت، کد پستی | `@persian-tools/persian-tools` | github.com/persian-tools/persian-tools | در فرم شرکا و فاکتور آینده؛ فقط سمت کلاینت/سرور آزاد — بدون وابستگی |
| عدد به حروف فارسی (فاکتور/چک) | همان بسته (`numberToWords`) | — | فاز مالی |
| تبدیل ارقام فارسی/عربی ↔ لاتین | همان بسته (`digitsEnToFa` و معکوس) + `faDigits` موجود | — | یکدستی: نمایش همیشه فارسی، ذخیره لاتین |
| دیت‌پیکر جلالی React | `react-multi-date-picker` | github.com/shahabyazdi/react-multi-date-picker | تقویم `persian`، locale فارسی، RTL؛ در اسناد انبار و نامه |
| تبدیل تاریخ (هسته) | `src/core/shared/jalali.ts` داخلی | jalaali-js algorithm | ⚠️ دست نزنید — تست ۵ تاریخ مرجع دارد |
| فرمت تاریخ غنی (در صورت نیاز) | `date-fns-jalali` | npm | فقط لایه فرمت — هسته همان داخلی |
| فرمت اعداد/تاریخ بدون کتابخانه | `Intl` بومی Node 24 | — | `Intl.DateTimeFormat('fa-IR-u-ca-persian')` |
| فونت UI | Vazirmatn (self-host) | github.com/rastikerdar/vazirmatn | نسخه تکراری `assets/fonts` حذف شد |
| اعداد پولی (تومان/ریال) | نمایش دستی + separator فارسی | — | واحد پول فقط در فاز مالی نهایی می‌شود (ADR آن موقع) |

## خارج از سندباکس — فقط مستندسازی

| نیاز | مرجع | وضعیت |
|---|---|---|
| صورتحساب الکترونیکی سامانه مودیان | github.com/Jooyeshgar/moadian · github.com/arjavand/moadian | نیازمند کلید مالیاتی واقعی + امضای دیجیتال → در ADR فاز مالی به‌عنوان وابستگی بیرونی |
| ارسال پیامک | — | هیچ سرویس از سندباکس قابل فراخوانی نیست؛ اعلان درون‌برنامه‌ای جایگزین شد |
| NLP فارسی سنتی (Hazm، ParsBERT) | — | رد شد — LLM باکیفیت‌تر برای خلاصه/طبقه‌بندی؛ z-ai SDK هست |

## مرجع‌های الگوی دامنه (کدشان زبان/پشته دیگر دارد — الگوبرداری فقط)

- ERP حسابداری: github.com/Jooyeshgar/FreeAmir (ساختار سرفصل، فاکتور، گردش حساب)
- ایده ماژول‌بندی: NocoBase/ERPهای متن‌باز — رجیستری پلاگین دیتابیس‌محور ما الهام‌گرفته شد

## تقویم تعطیلات رسمی

جدول استاتیک سالانه در `src/core/shared/holidays.ts` (در صورت نیاز گزارش‌ساز) — منبع: تقویم رسمی هر سال؛ به‌روزرسانی دستی سالانه.

## استاندارد RTL پلتفرم (الزام عمومی — ۱۴۰۵/۰۶)

راست‌چینی در **همه لایه‌ها** الزامی است: متن، لیست، ترتیب تب‌ها، جدول، چارت، دیالوگ، منو، انیمیشن. قواعد زیر در کل کد اعمال شده و هر کد جدید باید از آن‌ها پیروی کند (دروازه CH-24 در check.ts پوشش می‌دهد).

### ریشه سیستمیک

| لایه | قاعده | ریشه باگ تاریخی |
|---|---|---|
| `src/app/layout.tsx` | `<html lang="fa" dir="rtl">` + `<RtlProvider>` (wrapper کلاینتِ `@radix-ui/react-direction`) | **بدون DirectionProvider، همه کامپوننت‌های Radix (تب/منو/انتخابگر/دیالوگ) پیش‌فرض LTR می‌شوند حتی با dir=rtl روی html** — DirectionContext خودش 'ltr' است. علامت: تب اول در چپ ظاهر می‌شود |
| Radix props صریح | `dir="rtl"` روی DropdownMenu/Popover در صورت نیاز محلی | اضافه‌بر Context — بی‌ضرر |

### قواعد کلاس‌های Tailwind (فقط ویژگی‌های منطقی)

| ❌ ممنوع (فیزیکی) | ✅ جایگزین (منطقی) | کاربرد |
|---|---|---|
| `ml-*` / `mr-*` | `ms-*` / `me-*` | مارجین |
| `pl-*` / `pr-*` | `ps-*` / `pe-*` | پدینگ |
| `text-left` / `text-right` | `text-start` / `text-end` | تراز متن (سرستون/سلول/عنوان) |
| `left-*` / `right-*` (جایگذاری) | `start-*` / `end-*` | absolute/popover/badge |
| `border-l` / `border-r` | `border-s` / `border-e` | خط جدول/تایم‌لاین |
| `rounded-l-*` / `rounded-r-*` | `rounded-s-*` / `rounded-e-*` | گوشه‌ها |
| `ml-auto` (هل‌دادن به انتها) | `ms-auto` | در RTL فیزیکی `ml-auto` به ابتدا می‌چسبد! |
| `space-x-*` | `gap-*` (در flex) | تضمین‌شده در هر دو جهت |

استثناهای مجاز:
1. **محتوای لاتین**: ورودی‌های نام‌کاربری/کدکالا/عدد اعشاری با `dir="ltr"` + `text-left` (مثل `admin`، `ARD-P60-WHT`، `-620`).
2. **مرکزسازی دیالوگ**: `left-1/2 translate-x-[-50%]` — ریاضیات محض، جهت‌آگاه نیست.
3. **انیمیشن‌های side-bound**: `data-[side=left]:slide-in-from-right-2` — side رادیکس فیزیکی است و جفتشده.

### آینه‌های رفتاری (رفتار فیزیکی که باید آینه شود)

| کامپوننت | قاعده RTL | فایل |
|---|---|---|
| Progress | پر شدن از راست: `translateX(+N%)` (نه منفی) | ui/progress.tsx |
| Switch | شست حرکت راست→چپ: `rtl:data-[state=checked]:-translate-x-[...]` | ui/switch.tsx |
| Toast | viewport پایین-**چپ** (آینه LTR)، خروج `slide-out-to-left-full`، دکمه ✕ در `end-1` | ui/toast.tsx |
| دیالوگ | سرصفحه `sm:text-start`، دکمه ✕ در `end-4`، فوتر `sm:justify-end` = دکمه اصلی در چپ (قرارداد AntD/MUI/Digikala) | ui/dialog.tsx |
| منو/انتخابگر | نشانگر ✓ در `start-2` + `ps-8`؛ میان‌بر/شِوران با `ms-auto`؛ شِوران زیرمنو `rtl:-scale-x-100` | ui/dropdown-menu.tsx، ui/select.tsx |
| سایدبار/کشو موبایل | سمت راست: `right-0` + مخفی با `translate-x-full` | shell/sidebar.tsx |
| آیکون در input | همیشه `start-3` + `ps-9` (جستجو در DataGrid/کارتابل/محصولات/ورود) | همه فرم‌ها |
| بج شمارنده | ارقام فارسی: `faDigits(unread)` — نه رقم لاتین | shell/header.tsx |

### چارت‌های recharts (دستور پخت ثابت)

```tsx
<div dir="ltr">                       {/* لازم: مختصات SVG */}
  <BarChart ...>
    <XAxis reversed />                {/* زمان از راست به چپ */}
    <YAxis orientation="right" />     {/* محور مقادیر سمت راست */}
    <Tooltip contentStyle={{ direction: 'rtl', fontFamily: 'inherit' }} />
    <Legend wrapperStyle={{ direction: 'rtl' }} />   {/* بدون این، آیتم‌های لجند LTR می‌مانند */}
```

### جدول‌ها

- سرستون پیش‌فرض: `text-start` (ui/table.tsx) — ستون عدد/تاریخ فارسی هم `start` (مثل اکسل RTL).
- `align: 'end'` فقط برای محتوای اصیل لاتین؛ `center` برای نشان/وضعیت.
- دکمه «صفحه قبل» ChevronRight و «صفحه بعد» ChevronLeft (جهت مطالعه).

### تقویم جلالی

`react-multi-date-picker` با locale فارسی خودش RTL می‌شود (شنبه راست‌ترین). `calendarPosition="bottom-right"` لنگر راست — درست است؛ تغییر ندهید.
