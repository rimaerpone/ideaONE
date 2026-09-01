# ماتریس پوشش تست — اسکلت حاکمیتی

وضعیت: **فعال (اسکلت — P0.5-T3)** | مالک: QA/معماری | بازنگری: ۱۴۰۵/۰۶/۱۰ | منبع اجرا: `scripts/` + `.github/workflows/ci.yml`

> **هدف**: تک‌منبع حقیقت برای «چه چیزی، توسط چه باتری‌ای، در کجا تست می‌شود» — شکاف پوشش را دیدنی کند (یافتهٔ C3 ممیزی عمیق: پوشش ۱۸٪). این سند اسکلت است: ستون «پوشش ماژولی» عمداً ناقص است و با REQ-ID (گام بعدی نقشه راه) پر می‌شود.

## ۱. لایه‌های تست

| لایه | تعریف | نیاز به DB | نیاز به مرورگر | اجرا در CI |
|---|---|---|---|---|
| **unit** | تست واحد با mock درون‌حافظه‌ای (`scripts/unit/mock-db.ts`) — semantics تراکنش واقعی | ✗ | ✗ | همیشه (`quality`) |
| **fetch-e2e** | رگرسیون HTTP زنده روی سرور dev (بدون مرورگر) — رفتار route/سرویس/DB واقعی | ✔ Neon | ✗ | مشروط به راز `DATABASE_URL` (`e2e`) |
| **browser-e2e** | مسیر طلایی/UX با agent-browser از گیت‌وی :۸۱ — رفتار واقعی مرورگر (کوکی/Origin/RTL) | ✔ | ✔ | فقط runner سندباکس (`vars.RUN_GOLDEN_CI`) |
| **db** | ممیزی مستقیم دیتابیس (ایندکس، شِما، حجم) | ✔ | ✗ | دستی |

## ۲. باتری‌های فعال (رگرسیون)

| باتری | لایه | دامنه | سنجه‌ها | فرمان | وضعیت |
|---|---|---|---|---|---|
| critical-paths.test.ts | unit | تراکنش `applyDocToStock` + گارد 409 `actOnLetter` (P0.5-T1) | ۱۶ | `bun run test:unit` | 🟢 |
| test-p05-t3.ts | fetch-e2e | **گارد CSRF (۹) + ماندگاری محدودساز نرخ (۵) + scrypt غیرمسدودکننده (۳)** (P0.5-T3) | ۱۹ | `bunx tsx scripts/test-p05-t3.ts` | 🟢 در CI (`e2e`) |
| test-p05-t1-e2e.ts | fetch-e2e | rollback اتمیک سند + رقابت دوبار POST + رقابت اقدام نامه | ۲۱ | `bunx tsx scripts/test-p05-t1-e2e.ts` | 🟢 |
| test-login-security.ts | fetch-e2e | نرخ ورود + سجل LOGIN_FAILED + ایزولاسیون کلید | ۱۷ | `bunx tsx scripts/test-login-security.ts` | 🟢 در CI (`e2e`) |
| test-rbac.ts | fetch-e2e | RBAC دو لایه + گارد ماژول (T28) + CSV | ۱۰۳ | `bunx tsx scripts/test-rbac.ts` | 🟢 (اصلاح کد رجیستری CMD-011 در P0.5-T3) |
| test-t4-t6-letters-v2.ts | fetch-e2e | متن پاسخ نامه + قالب شماره + جستجو | ۱۳ | `bunx tsx scripts/test-t4-t6-letters-v2.ts` | 🟢 |
| test-coding.ts | fetch-e2e | موتور کدگذاری ساختارمند (P4-T0) | ۴۳ | `bunx tsx scripts/test-coding.ts` | 🟢 |
| test-pallet.ts | fetch-e2e | شناسنامهٔ پالت ۱۴کاراکتری (P0.5-T2) | ۱۴ | `bunx tsx scripts/test-pallet.ts` | 🟢 |
| test-warehouses-crud.ts | fetch-e2e | CRUD انبار + نوع سه‌گانه | ۲۱ | `bunx tsx scripts/test-warehouses-crud.ts` | 🟢 |
| test-list-contract.ts | fetch-e2e | قرارداد لیست (فیلتر/sort/صفحه‌بندی/sq) | ~۲۰ | `bunx tsx scripts/test-list-contract.ts` | 🟡 ۱ سنجه داده‌وابسته (بند ۵) |
| test-t5-fts.ts | fetch+db | جستجوی تمام‌متن فارسی (tsvector/GIN) | ۴۹ | `bunx tsx scripts/test-t5-fts.ts` | 🟡 داده‌وابسته (بند ۵) |
| e2e-golden.ts | browser-e2e | مسیرهای طلایی G1..G8 + اعلان زنده | ۸ گام | `bunx tsx scripts/e2e-golden.ts` (WAN: `E2E_WAIT_SCALE=3`) | ✅ **سبز کامل ۱۴۰۵/۰۶/۱۷ — 8/8** (گزارش: `download/qa-e2e-golden/report.md`؛ بدهی T1 بسته شد) |
| باتری‌های UX (u2..u10، t26/t35/t37، dash-v2، coding-ui) | browser-e2e | صفحات/جریان‌های UX | ~۴۰۰+ | `bunx tsx scripts/test-u*.ts` | 🟢 (اجرای دوره‌ای سندباکس؛ خودکار نشده) |
| test-indexes / test-perf / db-check | db | ایندکس/کارایی/صحت | متغیر | دستی | 🟢 |

## ۳. شکاف‌های پوشش (صادقانه)

| شکاف | اثر | برنامه |
|---|---|---|
| **پوشش واحد core/** (tenancy/audit/list-query) | تغییر هسته بدون شبکهٔ ایمنی | وظیفهٔ مستقل پس از بسته P0.5 (بند ۲ P0.5-stabilization) |
| **REQ-ID** | traceability سناریو↔تست سه‌گانه | گام بعد از سبز شدن P0.5 (نقشه ۱۸گامی گام ۱۰) |
| **golden در CI ابری** | رگرسیون مرورگری فقط سندباکس | محدودیت ابزار (agent-browser+گیت‌وی)؛ runner self-hosted آینده |
| **u2..u10 در CI** | UX بدون دروازه merge خودکار | همان محدودیت golden |
| ~~داده seed:big~~ | ~~دو باتری داده‌وارده~~ | ✅ بسته شد ۱۴۰۵/۰۶/۱۷: seed:big بازسازی (۱۰٬۰۳۵ نامه + FTS) → t5-fts 51/51 · list-contract کامل سبز |

## ۴. فعال‌سازی کامل CI (اقدامات مالک مخزن)

1. **راز DB** — ✅ **انجام شد ۱۴۰۵/۰۶/۱۱ (CMD-012)**: راز `DATABASE_URL` از طریق API با رمزنگاری SealedBox ثبت شد (`scripts/set-ci-secret.sh`)؛ job رگرسیون زنده از این پس روی push/PR مخزن اجرا می‌شود.
2. **حفاظت شاخه (merge gate)** — ✅ **فعال شد ۱۴۰۵/۰۶/۱۱ (CMD-012، حکم کارفرما: عمومی‌کردن)**: مخزن عمومی شد و branch protection با required check `کیفیت (check + tsc + lint + unit)` + `strict: true` از طریق API اعمال شد؛ `enforce_admins: false` (مالک push مستقیم دارد، سایرین PR+CI سبز). تاریخ ۴۰۳ (مخزن خصوصی/پلن رایگان) بسته شد؛ جزئیات و پاک‌سازی امنیتی در `docs/decisions/CMD-012-public-baseline.md`.
3. **golden خودکار (اختیاری)**: متغیر مخزن `RUN_GOLDEN_CI=true` + runner self-hosted دارای agent-browser و گیت‌وی.

## ۵. وابستگی داده‌ای باتری‌ها (کشف ۱۴۰۵/۰۶/۱۰)

seed مجدد رجیستری در P0.5-T2، دادهٔ seed:big (۱۰٬۲۹۳ نامه) را با دادهٔ کوچک seed پایه (۳۵ نامه) جایگزین کرد. باتری‌هایی که به حجم/محتوای بزرگ وابسته‌اند: `test-t5-fts` (۱۲ سنجه مانند «استعلام=۴۷۶») و `test-list-contract` (۱ سنجه inbox غیرخالی برای کاربر آزمون). **اقدام** — ✅ انجام شد ۱۴۰۵/۰۶/۱۷: `seed:big` بازسازی (۱۰٬۰۳۵ نامه · ۵٬۰۲۵ سند · FTS ۱۰٬۰۳۵ ردیف در ۸۱ ثانیه، خودش rebuild می‌کند) → t5-fts **51/51** · list-contract **کامل سبز** · golden **8/8**. سیاست آینده: هر باتری داده‌وابسته باید دادهٔ خودش را بسازد/پاک کند (الگوی test-p05-t3 با IP/username یکتا).

## ۶. یادداشت‌های معماری تست

- **گارد CSRF و باتری‌ها**: درخواست‌های fetch اسکریپتی بدون هدر Origin/Sec-Fetch-Site عمداً از گرد عبور می‌کنند (قاعدهٔ ۵ `src/proxy.ts`) — کلاینت غیرمرورگری بردار CSRF نیست. مرورگر واقعی همیشه Origin منطبق می‌فرستد (آزمون زنده ۱۴۰۵/۰۶/۱۰: ورود گیت‌وی + mutation درون‌صفحه‌ای سبز).
- **ادغام‌های آینده (P10-Moadian)**: callback سرور-به-سرور بدون Origin مجاز است؛ webhook با Origin باید در لیست‌سفید مبدأها ثبت شود (TODO در P10).
- **E2E_WAIT_SCALE**: ضریب انتظارهای مرورگری برای WAN (~۲۲۰ms RTT Neon) — در CI با مقدار ۳.
