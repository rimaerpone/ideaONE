# رجیستری پلاگین‌ها — پلاگین‌محوری دیتابیس‌محور با تاکسونومی سه‌لایه

وضعیت: **فعال (نسخه ۲ — ADR-008)** | مالک: معماری | بازنگری: ۱۴۰۵/۰۶/۱۳ | پیوند: ADR-001، ADR-008، SC-008

## ۱. مفهوم

به‌جای Module Federation یا lazy-loading پویا، «پلاگین‌بودن» با **سه جدول دیتابیسی** مدل شده است:

- `PlatformModule` — فهرست سراسری پلاگین‌ها با تاکسونومی: `layer` (بستر/عملیات/هوشمندی)، `domain`، `targetPhase`، `dependsOn`، `version`.
- `ModuleMenu` — منوهای ناوبری هر پلاگین (`viewKey` یکتا per پلاگین) — **پلاگین ≠ نما**.
- `ModuleActivation` — روشن/خاموش به تفکیک شرکت.

سمت کلاینت سایدبار از مسیر «لایه → دامنه → پلاگین → منو» ساخته می‌شود؛ یعنی «فعال‌سازی پلاگین برای شرکت X» بلافاصله منوهای کاربران شرکت X را تغییر می‌دهد — بدون استقرار مجدد. کد نما همیشه deploy است؛ رجیستری فقط **دید و دسترسی** را کنترل می‌کند.

## ۲. تاکسونومی ثبت‌شده (وضعیت seed فعلی — ۳۱ پلاگین)

### لایه FOUNDATION — بستر و حاکمیت (۵)

| code | نام | دامنه | فاز | وضعیت | منوها (viewKey) |
|---|---|---|---|---|---|
| dashboard | داشبورد مدیریتی | general | P0 | فعال | dashboard |
| products | مستر دیتای محصول | master-data | P0 | فعال | products |
| partners | مشتریان و تأمین‌کنندگان | master-data | P0 | فعال | partners |
| modules | کاتالوگ پلاگین‌ها | general | P0 | فعال | modules |
| settings | تنظیمات و حاکمیت بستر | general | P0 | فعال | settings |

### لایه OPERATIONS — عملیات کسب‌وکار (۱۹)

| code | نام | دامنه | فاز | وضعیت | منوها (viewKey) |
|---|---|---|---|---|---|
| office-automation | اتوماسیون اداری و دبیرخانه | office | P0 | **فعال** | cartable، letters |
| warehouse | انبار و لجستیک | warehouse | P0 | **فعال** | stock، whdocs، requests |
| digital-archive | بایگانی دیجیتال | office | P2 | غیرفعال | — |
| chat | چت سازمانی | office | P2 | غیرفعال | — |
| commercial | بازرگانی (خرید و فروش) | commercial | P2 | غیرفعال | — |
| crm | مدیریت ارتباط با مشتری | commercial | P2 | غیرفعال | — |
| finance | حسابداری و دفتر کل | finance | P2 | غیرفعال | — |
| treasury | خزانه‌داری | finance | P2 | غیرفعال | — |
| tax | مالیات و ارزش افزوده | finance | P10 | غیرفعال | — |
| hr | منابع انسانی | hr | P3 | غیرفعال | — |
| payroll | حقوق و دستمزد | hr | P3 | غیرفعال | — |
| attendance | حضور و غیاب | hr | P3 | غیرفعال | — |
| org-chart | چارت سازمانی | hr | P3 | غیرفعال | — |
| production | تولید و ردیابی بچ | manufacturing | P4 | غیرفعال | — |
| laboratory | آزمایشگاه | manufacturing | P4 | غیرفعال | — |
| quality-control | کنترل کیفیت | manufacturing | P4 | غیرفعال | — |
| maintenance | نگهداری و تعمیرات | manufacturing | P4 | غیرفعال | — |
| cost-accounting | بهای تمام‌شده | finance | P4 | غیرفعال | — |
| training / performance | آموزش · ارزیابی عملکرد | hr | P9 | غیرفعال | — |

### لایه INTELLIGENCE — هوشمندی (۶)

| code | نام | دامنه | فاز | وضعیت | منوها (viewKey) |
|---|---|---|---|---|---|
| ai-agents | عوامل هوش مصنوعی (۱۳ عامل سند منبع ۸) | ai | P5 | غیرفعال | — |
| smart-studio | استودیو هوشمند | ai | P5 | غیرفعال | — |
| report-builder | گزارش‌ساز هوشمند | ai | P5 | غیرفعال | — |
| process-builder | فرآیندساز هوشمند | ai | P5 | غیرفعال | — |
| smart-gallery | گالری هوشمند | ai | P5 | غیرفعال | — |
| catalog-builder | کاتالوگ‌ساز هوشمند | ai | P5 | غیرفعال | — |

> پوشش: هر ۲۶ پلاگین سند منبع (بخش ۱۰) + ۵ قابلیت بستر = ۳۱ رکورد. فاز تحقق هر پلاگین با نقشه راه هم‌راستا شده است (نمونه: تولید از P7 به P4 دامنه manufacturing منتقل شد تا وابستگی واریانت‌ها یکجا بماند).

## ۳. منطق فعال‌سازی

```
منو نمایش داده می‌شود ⇐
   PlatformModule.status == 'ACTIVE'                    (کلید سراسری — isAdmin)
   AND (activation ندارد OR ModuleActivation.enabled)   (کلید شرکتی — ADMIN شرکت)
```

- toggle سراسری → فقط `User.isAdmin` (مدیر پلتفرم هلدینگ).
- toggle شرکتی → ADMIN همان شرکت.
- محافظ بستر: پلاگین‌های FOUNDATION حیاتی (داشبورد/محصول/شرکا) سراسرا غیرفعال نمی‌شوند.
- هر toggle: `audit(MODULE_TOGGLE)` + refresh منو بدون رفرش کامل (bump store).

## ۴. افزودن پلاگین جدید (چک‌لیست الزامی)

1. رکورد `PlatformModule` در `scripts/seed.ts` (code یکتا kebab-case = نام پیشنهادی سند منبع بخش ۱۰ + layer/domain/targetPhase/dependsOn + آیکون lucide موجود در ICONS سایدبار).
2. منوها: `menus: [{ viewKey, label, icon }]` — هر پلاگین ACTIVE حداقل یک منو دارد (CH-20).
3. کامپوننت نما در `src/modules/<code>/components/*-view.tsx` + case در `app-shell.tsx` (CH-18 پیوند دوسویه).
4. `src/modules/<code>/` با `service.ts` + `README.md` + ارجاع به SPEC در docs.
5. SPEC در `docs/modules/<code>/SPEC.md` از قالب `_TEMPLATE.md` (قاعده «مستند از کد جلوتر»).
6. سناریو مرتبط + به‌روزرسانی جدول همین سند + ADR-008 در صورت تغییر تاکسونومی.
7. فعال‌سازی پیش‌فرض = INACTIVE برای پلاگین‌های فازهای بعد (قاعده «کد هست، دید نیست»).

## ۵. قواعد و محدودیت‌ها

- **کد پلاگین تغییر نمی‌کند** (کلید پایدار؛ وابستگی‌ها و SPEC به آن گره خورده). viewKey منوها هم پایدارند (targetView اعلان‌ها به آن‌ها ارجاع می‌دهد).
- غیرفعال‌بودن پلاگین = منوهایش مخفی؛ APIهایش همچنان گارد نشست دارند (سخت‌سازی API-level در P1-T31).
- نظم `sortOrder`: FOUNDATION ۱–۱۰ · OPERATIONS ۲۰–۴۹ · INTELLIGENCE ۶۰–۷۹.
- رجیستری منبع «چه چیزی وجود دارد و در چه فازی» است؛ نقشه راه منبع «چه زمانی و با چه معیار پذیرشی».
- `dependsOn` اجرای زمانی ندارد؛ نقش حاکمیتی (ترتیب فعال‌سازی و تحلیل اثر) دارد — اجرای واقعی در P5 (موتور گردشکار).
