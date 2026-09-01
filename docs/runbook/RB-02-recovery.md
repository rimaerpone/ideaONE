# RB-02 — بازیابی: پشتیبان‌گیری، seed مجدد و بازگشت به عقب

## پشتیبان‌گیری سریع (قبل از هر تغییر پرریسک)

### اسنپ‌شات سازگار — روش توصیه‌شده (P0-T16)

```bash
bun run db:snapshot        # معادل: bun scripts/db-snapshot.ts
```

- روش: `VACUUM INTO` از اتصال readonly — اسنپ‌شات فشرده و سالم حتی هنگام اجرای سرویس (بدون نیاز به CLI sqlite3).
- راستی‌آزمایی خودکار: `integrity_check` + شمار ردیف کاربر؛ خروجی در `db/snapshots/snapshot-<timestamp>.db` (فقط ۱۰ نسخه اخیر نگه داشته می‌شود؛ gitignore است).
- تست‌شده: تولید + بازگردانی روی کپی آزمایشی (۱۴ نامه / ۲۹ پلاگین قابل خواندن).

### بازگردانی از اسنپ‌شات

```bash
# ۱) سرویس را متوقف کنید (اختیاری در سندباکس؛ توصیه‌شده):
ss -tlnp | grep 3000   # pid سرور — kill <pid>
# ۲) جایگزینی فایل:
cp db/snapshots/snapshot-<timestamp>.db db/custom.db
rm -f db/custom.db-wal db/custom.db-shm
# ۳) احیای سرور طبق RB-01
```

### کپی سریع قدیمی (بدون فشرده‌سازی)

```bash
cd /home/z/my-project
cp db/custom.db "db/backup-$(date +%Y%m%d-%H%M).db"     # دیتابیس تک‌فایل است
git add -A && git commit -m "chore: checkpoint <توضیح>"   # نقطه بازیابی کد
```

فهرست پشتیبان‌ها: `ls db/backup-*.db` — قدیمی‌تر از ۱۰ نسخه را پاک کنید.

## بازگرداندن کد به نقطه قبل

```bash
git log --oneline | head -5          # یافتن کامیت
git checkout <hash> -- src/ prisma/  # بازگرداندن صرفاً کد (دیتابیس دست‌نخورده)
# یا کل مخزن: git reset --hard <hash>  ⚠️ همه تغییرات ذخیره‌نشده می‌پرد
```

## seed مجدد داده دمو (پاک‌کننده!)

```bash
bunx tsx scripts/seed.ts
```

پاک می‌کند و می‌سازد: ۵ شرکت، ۸ کاربر، ۱۶ ماژول رجیستری، ۱۱ محصول، ۸ شریک + نمونه‌ها، ۵ انبار، ~۳۰ واریانت موجودی، ۱۰ سند، ۵ درخواست، ۱۴ نامه.
⚠️ بعد از seed همه نشست‌ها باطل‌اند — ورود مجدد لازم است.

## تغییر schema

```bash
# ۱. ویرایش prisma/schema.prisma
bun run db:push        # اعمال (پذیرش از دست دادن داده ستون‌های حذفی)
bunx tsx scripts/seed.ts   # در صورت خرابی داده
```

## پس از ری‌بوت کامل سندباکس

۱. Next.js خودکار بالا می‌آید (نظارتی) — لاگ `dev.log` را چک کنید
۲. سرویس realtime باید دستی بیاید → RB-01
۳. سلامت کلی: RB-01 جدول پایش + `bun run check` (دروازه ساختار/مستندات)

## پاکسازی دوره‌ای لاگ‌ها (P0-T13)

- `mini-services/realtime/realtime.log` (لاگ سرویس خودمان، حالت append `>>`): با `truncate -s 0 mini-services/realtime/realtime.log` امن است — وقتی از ۲MB گذشت.
- `dev.log` ریشه: **دست نزنید** — این لاگ را خط‌لوله `tee` محیط نظارتی می‌نویسد و offset خودش را نگه می‌دارد؛ truncate فایل اسپارس پر از بایت تهی می‌سازد. رشدش را می‌پذیریم (gitignore است).
- `.zscripts/dev.log`: متعلق به نظارت محیط — دست نزنید.

```bash
truncate -s 0 mini-services/realtime/realtime.log   # فقط لاگ سرویس خودمان
ls -la mini-services/realtime/*.log                 # راستی‌آزمایی حجم
```

## نقاط تک‌شکست

| مؤلفه | ریسک | کاهش |
|---|---|---|
| `db/custom.db` | خرابی فایل | backup-* قبل از تغییرات |
| git مخزن محلی | بدون remote | بسته periodic: `tar --exclude=node_modules --exclude=.next -czf download/project-snapshot.tgz .` |
| سرویس realtime | پس از ری‌بوت خاموش | RB-01 + polling پوشش می‌دهد |
