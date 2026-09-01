# -*- coding: utf-8 -*-
# به‌روزرسانی SPEC اداری — سکشن P2-T5 + ردیف API جستجو
import io

def patch(path, pairs):
    s = io.open(path, encoding='utf-8').read()
    for old, new in pairs:
        assert s.count(old) == 1, f"anchor not unique/found: {old[:70]!r} (count={s.count(old)})"
        s = s.replace(old, new)
    io.open(path, 'w', encoding='utf-8').write(s)
    print(f"OK {path} ({len(pairs)} patch)")

T5_SECTION = """### جستجوی تمام‌متن نرمال‌شده (P2-T5 — ۱۴۰۵/۰۶/۱۴)

- **زیرساخت:** جدول مجازی `letter_fts` (FTS5) **خارج Prisma** — شِما صاحب جداول خودش است و `prisma db push` دستش نمی‌زند؛ همه عملیات از `$queryRawUnsafe/$executeRawUnsafe` خود Prisma (موتور SQLite آن FTS5 دارد — اثبات `scripts/probe-prisma-fts5.ts`؛ سرور Next روی Node اجرا می‌شود و bun:sqlite در src ممنوع). ستون‌های ایندکس: subject/body/sender/receiver + numText (شماره نمایشی «سال/شماره» با ارقام لاتین).
- **خودترمیم (آرنیتکتوری «جستجو هرگز نمی‌شکند»):** هر جستجو پیش از MATCH با `ensureLetterFts` دو COUNT ارزان می‌گیرد؛ ناهماهنگی شمارش (seed بی‌قلاب/ریست) → rebuild کامل (~۱–۲ث روی ۱۰هزار نامه، درج دسته‌ای ۱۰۰تایی). شکست ensure/MATCH → **عقب‌گرد contains** (مسیر قدیمی)؛ پرس‌وجوی بدون توکن معتبر (تک‌نویسه/نماد) هم مستقیم به همان مسیر می‌رود.
- **سینک:** سطح اپلیکیشن — قلاب `upsertLetterFts` در createLetter (ستون‌های ایندکسی فقط هنگام ثبت تغییر می‌کنند؛ اقدام‌ها فقط status/holder را عوض می‌کنند) + rebuild پایان seed/seed-big + قلاب بوت instrumentation. شکست قلاب بی‌صدا؛ خودترمیم شمارش جبران می‌کند.
- **معناشناسی پرس‌وجو (دوسویه با `normalizeFaText`):** ك/ي عربی → فارسی، ارقام فارسی/عربی/لاتین → لاتین، ZWNJ/فاصله‌های نیم‌شکسته → فاصله. توکن ≥۲ نویسه؛ توکن حرفی با پیشوند `*` (مهر = مهرداد)؛ توکن تمام‌رقم **دقیق** (۴۲ = ۴۲ نه ۴۲۴/۱۴۲)؛ چند توکن = AND ضمنی؛ توکن‌ها فقط الفبایی/رقمی‌اند → رشته MATCH تولیدی هرگز نحو FTS ندارد (تزریق‌ناپذیر). محدودیت شناخته‌شده: شکل «چسبیده» واژه نیم‌فاصله‌دار (ذیربط) توکنی جدا ندارد (در contains قدیمی هم نبود).
- **فهرست/CSV:** `q` روی مسیر FTS می‌رود (فیلترهای جعبه/نوع/وضعیت/فوریت + مرتب‌سازی + صفحه‌بندی همه در SQL آینه where)؛ hydration با IN کوچک بدون orderBy (ترتیب از SQL — درس ۲۳)؛ CSV همان FTS با سقف ۵٬۰۰۰ و hydration قطعه‌ای ۵۰۰تایی. دامنه شرکت/گارد ماژول/گارد نقش دست‌نخورده (ایزولاسیون تست‌شده).
- **هایلایت:** کامپوننت مشترک `HighlightFa` (components/common/highlight-fa) — regex یونیکدی واریانت‌آگاه (ك↔ک، ي↔ی، أإآ↔ا، ؤ↔و، ارقام سه‌گانه) با مرز واژه lookaround یونیکدی (نه \\b اسکی)؛ توکن حرفی = واژه کامل، توکن رقمی = فقط برابر دقیق؛ مصرف در ستون «موضوع» و «فرستنده/گیرنده» نما با وابستگی [q].
- **کارایی (معیار پذیرش):** «مهر» (بدون نتیجه — بدترین حالت) ۸۶ms و «استعلام» (۴۷۶ نتیجه) ۵۳ms روی ۱۰٬۲۴۸ نامه؛ اولین جستجو پس از تخریب شامل rebuild یک‌باره ~۲٫۵ث.
- **تست:** `scripts/test-t5-fts.ts` (۵۱ سنجه: ۱۵ واحد توکنایزر/هایلایت + ۲۳ API شامل شماره نمایشی/ایزولاسیون/عقب‌گرد/CSV + ۵ خودترمیم DB + کارایی) + `scripts/e2e-t5-fts.ts` (۱۴ سنجه مرورگر: مار در ستون موضوع، پاک‌کردن جستجو، واریانت عربی، موبایل ۳۹۰ بدون سرریز) + QA بصری VLM سه اسکرین‌شات.

"""

patch('docs/modules/office-automation/SPEC.md', [
    # سکشن T5 بعد از سکشن OCR، قبل از API
    ("## ۷. API", T5_SECTION + "## ۷. API"),
    # ردیف GET /api/letters — معناشناسی q
    ("| GET /api/letters | `?q&box=all\\|inbox\\|sent&type&status&urgency&sort=field:dir&page&pageSize` — قرارداد استاندارد P1-T3 (sort: createdAt/number/type/status/subject؛ سقف pageSize=۱۰۰) | پاکت `ListEnvelope`: `{items: LetterListItem[], total, page, pageSize, pageCount}` (T12: سقف ۱۰۰ برداشته شد — صفحه‌بندی/مرتب‌سازی/جستجو در سرور) | 401 | عضو دامنه |",
     "| GET /api/letters | `?q&box=all\\|inbox\\|sent&type&status&urgency&sort=field:dir&page&pageSize` — قرارداد استاندارد P1-T3 (sort: createdAt/number/type/status/subject؛ سقف pageSize=۱۰۰). **P2-T5: q = جستجوی تمام‌متن FTS5 نرمال‌شده** (موضوع/متن/فرستنده/گیرنده/شماره نمایشی؛ توکن ≥۲ نویسه، حرف پیشوند*، رقم دقیق، AND ضمنی؛ تک‌نویسه/خطا → contains قدیمی) | پاکت `ListEnvelope`: `{items: LetterListItem[], total, page, pageSize, pageCount}` (T12: سقف ۱۰۰ برداشته شد — صفحه‌بندی/مرتب‌سازی/جستجو در سرور) | 401 | عضو دامنه |"),
    # ردیف CSV — q FTS
    ("| GET /api/letters?format=csv (P2.5-U7) | همان فیلترهای فهرست — بدون صفحه‌بندی، سقف ۵٬۰۰۰ | `text/csv` با BOM + هدرهای X-Csv-Rows/X-Csv-Capped + filename `letters-*.csv` | 401 | عضو دامنه |",
     "| GET /api/letters?format=csv (P2.5-U7) | همان فیلترهای فهرست — بدون صفحه‌بندی، سقف ۵٬۰۰۰ (P2-T5: q همان جستجوی FTS فهرست — آینه دقیق where) | `text/csv` با BOM + هدرهای X-Csv-Rows/X-Csv-Capped + filename `letters-*.csv` | 401 | عضو دامنه |"),
])
print("SPEC به‌روز شد")
