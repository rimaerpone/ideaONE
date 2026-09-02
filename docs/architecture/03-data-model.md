# مدل داده — هر مدل، هر فیلد، هر قاعده

وضعیت: **فعال** | مالک: داده | بازنگری: ۱۴۰۵/۰۶/۱۰ (P0.5-T3: افزودن LoginAttempt) | منبع حقیقت: `prisma/schema.prisma` (۳۵ مدل)

> **قانون هم‌ارزی**: هر تغییر `schema.prisma` باید هم‌زمان این سند و `src/types/platform.ts` را به‌روزرسانی کند. شمارش فیلدها بر اساس schema فعلی است.

## قراردادهای عمومی

- `id`: رشته cuid؛ تولید توسط Prisma؛ هرگز از سمت کلاینت ارسال نمی‌شود (برای رکورد جدید).
- تاریخ‌ها: DateTime میلادی UTC در DB؛ نمایش همیشه جلالی از طریق `core/shared/jalali.ts`.
- حذف: `onDelete: Cascade` فقط در روابط والد-فرزند واقعی (DocItem→Doc، Membership→User/Company)؛ روابط مرجع بدون Cascade می‌مانند تا سابقه از بین نرود.
- enumها در SQLite به‌صورت String ذخیره می‌شوند؛ مقادیر مجاز در ستون «مقادیر» و در UI با دیکشنری لیبل فارسی (`ui-bits.tsx`) ترجمه می‌شوند.

---

## ۱. Company — شرکت (هلدینگ/عملیاتی)

| فیلد | نوع | الزامی | مقادیر/قاعده | توضیح |
|---|---|---|---|---|
| id | String (cuid) | ✔ | — | کلید |
| code | String | ✔ | **unique**؛ ۳–۶ حرف لاتین: HOLD, ARAD, ISF, NLT, LKF | کد کوتاه برای نمایش فشرده (`companyCode` در UI) |
| name | String | ✔ | — | نام تجاری فارسی |
| legalName | String? | — | — | نام حقوقی کامل (مثل «شرکت آراد سرام پیشرو (سهامی خاص)») |
| type | String | ✔ | `GROUP` \| `COMPANY` | GROUP=هلدینگ (فقط دید)، COMPANY=عملیاتی (مالک داده) |
| city | String? | — | — | شهر |
| sortOrder | Int | ✔ | پیش‌فرض 0 | ترتیب نمایش در سوییچر |
| createdAt | DateTime | ✔ | now() | |

روابط: memberships, products, warehouses, warehouseDocs, goodsRequests, letters, partnerInstances, moduleActivations, auditLogs, counters.
قاعده: ثبت رکورد عملیاتی (نامه/سند/درخواست) با شرکت فعال GROUP **رد می‌شود** (خطای فارسی در سرویس‌ها).

## ۲. User — کاربر پلتفرم

| فیلد | نوع | الزامی | مقالیر/قاعده | توضیح |
|---|---|---|---|---|
| id | String | ✔ | — | |
| username | String | ✔ | **unique**؛ حروف لاتین/نقطه (ceo.arad) | شناسه ورود |
| fullName | String | ✔ | — | نام و نام خانوادگی فارسی |
| passwordHash | String | ✔ | scrypt + salt | هرگز به کلاینت نمی‌رود |
| jobTitle | String? | — | — | عنوان شغلی (نمایش در ارجاع‌ها) |
| isAdmin | Boolean | ✔ | پیش‌فرض false | مدیر پلتفرم: دسترسی رجیستری ماژول سراسری |
| isActive | Boolean | ✔ | پیش‌فرض true | غیرفعال = ورود ممنوع؛ در لیست ارجاع نمی‌آید |
| createdAt | DateTime | ✔ | now() | |

شکاف v1 (→ P1): تغییر رمز عبور توسط کاربر، بازنشانی توسط ادمین، عضویت از UI — فعلاً فقط seed.
شکاف v1 (→ P9): مفهوم «جانشین» ندارد.

## ۳. Membership — عضویت کاربر در شرکت با نقش

| فیلد | نوع | الزامی | مقادیر | توضیح |
|---|---|---|---|---|
| id | String | ✔ | — | |
| userId | String | ✔ | FK→User (Cascade) | |
| companyId | String | ✔ | FK→Company (Cascade) | |
| role | String | ✔ | `ADMIN` \| `MANAGER` \| `OPERATOR` \| `VIEWER` | نقش در «آن» شرکت — ماتریس در 04-security |
| createdAt | DateTime | ✔ | now() | |

قید: `@@unique([userId, companyId])` — هر کاربر در هر شرکت حداکثر یک نقش دارد. نقش هلدینگ از طریق عضویت در شرکت GROUP.

## ۴. Session — نشست ورود

| فیلد | نوع | الزامی | قاعده | توضیح |
|---|---|---|---|---|
| id | String | ✔ | — | **توکن نشست** (خود id در کوکی httpOnly می‌نشیند) |
| userId | String | ✔ | FK→User (Cascade) | |
| companyId | String? | — | — | شرکت فعال نشست (سوییچر این را عوض می‌کند) |
| expiresAt | DateTime | ✔ | ۷ روز | پاکسازی فعال توسط کار زمان‌بند `session-purger` (ساعتی) |
| createdAt | DateTime | ✔ | now() | |
| lastSeenAt | DateTime | ✔ | now()؛ به‌روزرسانی گلوگاه‌دار (حداکثر ۱ نوشتار در دقیقه) | P1-T8: «آخرین فعالیت» در فهرست دستگاه‌های فعال |
| ip | String? | — | — | P1-T8: نشانی نشست (از x-forwarded-for) |
| userAgent | String? | — | — | P1-T8: عامل کاربر خام |
| deviceKey | String? | — | sha256(UA نرمال‌شده) | P1-T19: اتصال نشست به دستگاه شناخته‌شده |

P1-T8 بسته شد: لیست دستگاه‌های فعال با آخرین فعالیت + «خروج از همه دستگاه‌ها» در نمای «حساب من» (`/api/auth/sessions` GET/DELETE).

## ۵. KnownDevice — دستگاه‌های شناخته‌شده کاربر (P1-T19)

| فیلد | نوع | الزامی | قاعده | توضیح |
|---|---|---|---|---|
| id | String | ✔ | — | |
| userId | String | ✔ | FK→User (Cascade) | |
| deviceKey | String | ✔ | sha256 عامل کاربر با حذف شماره نسخه‌ها | ارتقای مرورگر = همان دستگاه |
| userAgent | String? | — | — | نمونه UA دیده‌شده |
| ip | String? | — | — | آخرین IP دیده‌شده |
| firstSeen | DateTime | ✔ | now() | |
| lastSeen | DateTime | ✔ | now()؛ به‌روزرسانی هنگام ورود | |

قید: `@@unique([userId, deviceKey])`. هدف: تشخیص «ورود از دستگاه جدید» مستقل از چرخه حیات نشست‌ها (خروج/انقضا دستگاه را فراموش نمی‌کند تا اعلان تکراری نشود). ورود از دستگاه جدید → اعلان `SECURITY` (targetView=my-account) + سجل `LOGIN_NEW_DEVICE`.

## ۵ب. LoginAttempt — تلاش‌های ورود ناموفق (P0.5-T3)

| فیلد | نوع | الزامی | قاعده | توضیح |
|---|---|---|---|---|
| id | String | ✔ | — | |
| username | String | ✔ | lowercase/trim در سرویس | کلید نرخ = (username, ip) |
| ip | String | ✔ | از x-forwarded-for | |
| at | DateTime | ✔ | now() | مهر زمان تلاش ناموفق |

قید: `@@index([username, ip, at])` — شمارش پنجرهٔ لغزان ۶۰ثانیه‌ای (حداکثر ۵ ناموفق). هدف: **ماندگاری محدودساز نرخ ورود در DB** — قبلاً در حافظه بود و ری‌استارت سرویس پنجرهٔ حمله را ریست می‌کرد؛ اکنون چند-نمونه امن است. تلاشِ مسدودشده (429) ردیف **نمی‌نویسد** تا پنجرهٔ قفل تحت حملهٔ ممتد خودتمدید نشود. بهداشت: ردیف‌های کهنه‌تر از ۲۴ ساعت با پاک‌سازی دوره‌ای (گلوگاه ۱۰ دقیقه) حذف می‌شوند — سجل جرم‌یابی امنیتی در `AuditLog` (LOGIN_FAILED) ماندگارتر است. ایجاد جدول با CREATE مستقیم (`scripts/apply-p05-t3-schema.ts`) — db push جدول‌های FTS دستی را می‌اندازد (درس P0.5-T2).

## ۶. PlatformModule — رجیستری پلاگین (قلب پلاگین‌محوری — تاکسونومی سه‌لایه ADR-008)

| فیلد | نوع | الزامی | مقادیر | توضیح |
|---|---|---|---|---|
| id | String | ✔ | — | |
| code | String | ✔ | **unique**؛ kebab-case معادل نام پوشه سند منبع: `office-automation`, `warehouse`, `finance`, `payroll` | کلید اتصال رجیستری/کد/SPEC |
| name | String | ✔ | — | نام فارسی پلاگین (واژگان رایج بازار) |
| description | String | ✔ | — | توضیح با ارجاع به بخش سند منبع |
| icon | String | ✔ | نام آیکون lucide ⊆ ICONS سایدبار (CH-19) | |
| layer | String | ✔ | `FOUNDATION` \| `OPERATIONS` \| `INTELLIGENCE` | لایه تاکسونومی |
| domain | String | ✔ | office \| warehouse \| master-data \| manufacturing \| finance \| commercial \| hr \| ai \| general | دامنه (گروه منو) |
| targetPhase | String | ✔ | `P0`..`P10` | فاز تحقق نقشه راه |
| dependsOn | String | ✔ | JSON آرایه کدها: `["products"]` | وابستگی پلاگین‌ها |
| version | String | ✔ | semver `1.0.0` | نسخه پلاگین |
| status | String | ✔ | `ACTIVE` \| `INACTIVE` | کلید سراسری |
| sortOrder | Int | ✔ | — | ترتیب کاتالوگ |

قاعده: هر پلاگین ACTIVE باید حداقل یک `ModuleMenu` داشته باشد (CH-20)؛ پلاگین ≠ نما — ناوبری از منوها ساخته می‌شود.

## ۷. ModuleMenu — منوی ناوبری پلاگین (ADR-008)

| فیلد | نوع | الزامی | توضیح |
|---|---|---|---|
| id | String | ✔ | |
| moduleId | String | ✔ | FK→PlatformModule (Cascade) |
| viewKey | String | ✔ | کلید case در app-shell: `cartable`, `letters`, `stock`, `whdocs`, `requests`, … |
| label | String | ✔ | لیبل فارسی منو |
| icon | String | ✔ | آیکون منو (lucide) |
| sortOrder | Int | ✔ | ترتیب درون پلاگین |

قید: `@@unique([moduleId, viewKey])`. پیوند دوسویه با نماها توسط CH-18 دروازه راستی‌آزمایی می‌شود.

## ۸. ModuleActivation — فعال‌سازی ماژول به تفکیک شرکت

| فیلد | نوع | الزامی | توضیح |
|---|---|---|---|
| id | String | ✔ | |
| moduleId | String | ✔ | FK→PlatformModule (Cascade) |
| companyId | String | ✔ | FK→Company (Cascade) |
| enabled | Boolean | ✔ | پیش‌فرض true |

قید: `@@unique([moduleId, companyId])`. منطق دید منو: `status=ACTIVE` سراسری **و** (activation برای شرکت فعال وجود ندارد یا enabled=true).

## ۹. Product — مستر دیتا محصول کاشی

| فیلد | نوع | الزامی | قاعده | توضیح |
|---|---|---|---|---|
| id | String | ✔ | — | |
| companyId | String | ✔ | FK→Company | مالک رکورد = شرکت تولیدکننده |
| code | String | ✔ | **unique (سراسری)** مثل `ARD-P60-WHT` | کد کالا؛ الگوی `شرکت-خط/اندازه-رنگ` توصیه‌شده |
| name | String | ✔ | — | نام کامل فارسی |
| productLine | String | ✔ | — | خط محصول (واژه‌نامه) |
| size | String | ✔ | مثل «۶۰×۶۰» | ابعاد |
| color | String | ✔ | — | رنگ |
| surface | String? | — | پولیش/مات/براق/ساتن/روستیک | سطح |
| baseUnit | String | ✔ | پیش‌فرض `m2` | واحد پایه (P4: کارتن/عدد هم) |
| cartonArea | Float | ✔ | پیش‌فرض 0؛ >0 برای تبدیل م²↔کارتن | مترمربع هر کارتن |
| cartonsPerPallet | Int | ✔ | پیش‌فرض 0 | کارتن هر پالت |
| status | String | ✔ | `ACTIVE` (پیش‌فرض) | چرخه عمر در P4 (ACTIVE/PHASED_OUT/ARCHIVED) |
| createdAt | DateTime | ✔ | now() | |

قاعده: code یکتا در **کل گروه** است (نه per-company) — چون پیشوند شرکت در کد است؛ تغییر به unique per-company در P4-T6 ارزیابی می‌شود.

## ۱۰. Partner — رکورد طلایی شریک (سطح گروه)

| فیلد | نوع | الزامی | قاعده | توضیح |
|---|---|---|---|---|
| id | String | ✔ | — | |
| kind | String | ✔ | `CUSTOMER` \| `SUPPLIER` | نوع رابطه (P4: یک شریک هم مشتری هم تأمین‌کننده؟) |
| goldenName | String | ✔ | — | نام مرجع گروهی |
| nationalId | String? | — | ۱۰ رقم = کد ملی حقیقی، ۱۱ رقم = شناسه ملی حقوقی؛ اعتبارسنجی رقم کنترل با persian-tools در UI (نشان معتبر/بازبینی) | |
| isActive | Boolean | ✔ | پیش‌فرض true | حذف منطقی |

شکاف v1 (→ P4): ادغام رکورد تکراری، شماره اقتصادی، اشخاص تماس، آدرس/بانک.

## ۱۱. PartnerInstance — نمونه عملیاتی شریک در هر شرکت

| فیلد | نوع | الزامی | توضیح |
|---|---|---|---|
| id | String | ✔ | |
| partnerId | String | ✔ | FK→Partner (Cascade) |
| companyId | String | ✔ | FK→Company |
| accountCode | String? | — | کد حساب تفصیلی در سامانه حسابداری شرکت |
| creditLimit | Float | ✔ | پیش‌فرض 0 — واحد تومان؛ نمایش میلیارد در UI |
| terms | String? | — | شرایط پرداخت (مثل «۶۰ روزه») |
| note | String? | — | یادداشت خصوصی شرکت |

قید: `@@unique([partnerId, companyId])`.

## ۱۲. Warehouse — انبار

| فیلد | نوع | الزامی | مقادیر | توضیح |
|---|---|---|---|---|
| id | String | ✔ | — | |
| companyId | String | ✔ | FK→Company | |
| code | String | ✔ | مثل `AR-F01` | کد انبار |
| name | String | ✔ | — | نام فارسی |
| kind | String | ✔ | `RAW` \| `FINISHED` \| `WASTE` | نوع انبار |
| isActive | Boolean | ✔ | پیش‌فرض true | |

شکاف v1 (→ P1): CRUD انبار از UI (فعلاً seed).

## ۱۳. StockItem — موجودی (واریانت)

| فیلد | نوع | الزامی | قاعده | توضیح |
|---|---|---|---|---|
| id | String | ✔ | — | |
| warehouseId | String | ✔ | FK→Warehouse (Cascade) | |
| productId | String | ✔ | FK→Product | |
| tone | String | ✔ | پیش‌فرض ""؛ A/B/C یا خالی | تون |
| caliber | String | ✔ | پیش‌فرض ""؛ ۱/۲/۳ یا خالی | کالیبر |
| grade | String | ✔ | پیش‌فرض "1"؛ `1`/`2`/`w` | درجه |
| qtyM2 | Float | ✔ | پیش‌فرض 0؛ منفی ممنوع (اینواریانت) | |
| updatedAt | DateTime | ✔ | @updatedAt | آخرین تغییر موجودی |

قید: `@@unique([warehouseId, productId, tone, caliber, grade])` — **کلید واریانت موجودی**.
اینواریانت‌ها: qtyM2 ≥ 0 همیشه؛ ردیف صفر در فهرست نمایش داده نمی‌شود (`qtyM2: { not: 0 }`) ولی رکورد حذف نمی‌شود (حفظ تاریخچه به‌روزرسانی).
منبع تغییر: **فقط** `applyDocToStock` (inventory/warehouse.ts) — دست‌کاری مستقیم ممنوع.

## ۱۴. WarehouseDoc — سند انبار (سربرگ)

| فیلد | نوع | الزامی | مقادیر/قاعده | توضیح |
|---|---|---|---|---|
| id | String | ✔ | — | |
| companyId | String | ✔ | FK | مالک سند |
| docNumber | Int | ✔ | از DocCounter | شماره ترتیبی سالانه |
| type | String | ✔ | `RECEIPT` \| `ISSUE` \| `TRANSFER` \| `COUNT` | |
| warehouseId | String | ✔ | FK→Warehouse | انبار مبدأ |
| toWarehouseId | String? | — | فقط TRANSFER | انبار مقصد |
| partnerName | String? | — | متن آزاد (خط تولید ۱، ابنیه مسکن…) | طرف حساب — P3-T20: تبدیل به FK به PartnerInstance |
| status | String | ✔ | `DRAFT` → `POSTED` \| `CANCELLED` | DRAFT قابل ویرایش/ابطال؛ POSTED برگشت‌ناپذیر در پایلوت |
| docDate | DateTime | ✔ | پیش‌فرض now؛ ورود با دیت‌پیکر جلالی | تاریخ سند (می‌تواند گذشته باشد) |
| note | String? | — | — | یادداشت |
| createdById | String? | — | — | ثبت‌کننده |
| items | DocItem[] | ✔ | حداقل ۱ قلم | |

قید: `@@unique([companyId, type, docNumber])`.
قاعده قطعی‌سازی (`applyDocToStock`): رسید مثبت/حواله منفی (کاربر علامت را وارد می‌کند)/شمارش علامت‌دار/انتقال = کسر مبدأ + افزودن مقصد؛ **کنترل موجودی منفی قبل از هر apply**؛ پس از موفقیت `status=POSTED` + رویداد `doc.posted`.
شکاف v1 (→ P3): قطعی‌سازی و ابطال POSTED با سند معکوس؛ ویرایش اقلام DRAFT.

## ۱۵. DocItem — قلم سند انبار

| فیلد | نوع | الزامی | قاعده | توضیح |
|---|---|---|---|---|
| id | String | ✔ | — | |
| docId | String | ✔ | FK→WarehouseDoc (Cascade) | |
| productId | String | ✔ | FK→Product — باید متعلق به همان شرکت باشد | |
| tone / caliber / grade | String | ✔ | همان مقادیر StockItem | واریانت |
| qtyM2 | Float | ✔ | ≠ 0؛ ISSUE/کسری منفی | مقدار علامت‌دار |
| note | String? | — | — | یادداشت قلم |

## ۱۶. GoodsRequest — درخواست کالا

| فیلد | نوع | الزامی | مقادیر | توضیح |
|---|---|---|---|---|
| id | String | ✔ | — | |
| companyId | String | ✔ | FK | |
| reqNumber | Int | ✔ | DocCounter scope=GOODSREQ | |
| requesterId | String | ✔ | FK→User | متقاضی |
| warehouseId | String | ✔ | FK→Warehouse | انبار هدف |
| status | String | ✔ | `PENDING`→`APPROVED`\|`REJECTED`؛ APPROVED→`FULFILLED` | ماشین حالت در SPEC requests |
| neededFor | String? | — | — | واحد/مصرف مصرف‌کننده |
| note | String? | — | — | توضیح |
| createdAt / decidedAt | DateTime | ✔/— | now / زمان تصمیم | |
| items | GoodsRequestItem[] | ✔ | ≥۱ | |

قاعده: تصمیم (APPROVE/REJECT/FULFILL) فقط MANAGER/ADMIN همان شرکت؛ فقط از PENDING (و FULFILL از APPROVED).
شکاف v1 (→ P5): سطح تأیید چندمرحله‌ای، انصراف توسط متقاضی، تبدیل تأییدشده به حواله با یک کلیک (P3-T22).

## ۱۷. GoodsRequestItem — قلم درخواست

| فیلد | نوع | الزامی | قاعده |
|---|---|---|---|
| id / requestId / productId | String | ✔ | FK→GoodsRequest (Cascade) / FK→Product |
| qtyM2 | Float | ✔ | > 0 (برخلاف DocItem)؛ نرمال‌سازی ارقام فارسی سمت سرور |

## ۱۸. Letter — نامه

| فیلد | نوع | الزامی | مقادیر/قاعده | توضیح |
|---|---|---|---|---|
| id | String | ✔ | — | |
| companyId | String | ✔ | FK | مالک نامه |
| number | Int | ✔ | DocCounter — scope=LETTER یا LETTER:INCOMING/OUTGOING/INTERNAL (P2-T8 سری جدا per-type) | سالانه per-company+scope |
| type | String | ✔ | `INCOMING` \| `OUTGOING` \| `INTERNAL` | |
| subject | String | ✔ | trim، غیرخالی | موضوع |
| body | String | ✔ | trim، غیرخالی | متن کامل |
| senderTitle | String? | — | توصیه‌شده برای INCOMING | فرستنده بیرونی |
| receiverTitle | String? | — | توصیه‌شده برای OUTGOING | گیرنده بیرونی |
| confidentiality | String | ✔ | `NORMAL` \| `CONFIDENTIAL` \| `SECRET` | SECRET = مسدودیت AI |
| urgency | String | ✔ | `NORMAL` \| `URGENT` | |
| deadlineAt | DateTime? | — | ورود جلالی + اعتبارسنجی رفت‌وبرگشت | مهلت اقدام |
| status | String | ✔ | `DRAFT` → `IN_PROGRESS` → `ANSWERED` → `ARCHIVED` | ماشین حالت در SPEC letters |
| currentHolderId | String? | — | FK→User | دارنده فعلی (کارتابل)؛ ARCHIVED → null |
| creatorId | String | ✔ | FK→User | ثبت‌کننده |
| aiCategory / aiSummary | String? | — | فقط پس از HITL (تطبیق ۶۰/۸۰۰ کاراکتر) | خروجی تأییدشده AI |
| relationLetterId | String? | — | self-FK «LetterRelations» + ایندکس + onDelete: SetNull | P2-T9 — عطف تک‌والد به نامهٔ مرجع؛ حذف مرجع = عطف آویزان SetNull می‌شود |
| createdAt / updatedAt | DateTime | ✔ | now/@updatedAt | |

شکاف v1 (→ P2): ~~عطف/ارتباط نامه‌ها~~ **انجام (P2-T9/R9 — عطف دوسویه با زنجیرهٔ ۵ سطحی؛ حلقه/عمق/دامنه گارد سروری)** · ~~شماره‌گذاری پیکربندی‌پذیر per-type~~ **انجام (P2-T8/R9 — کلید CompanySetting `letters.numbering`: سری جدا + پیشوند/پسوند + displayNumber سرورساخته)** · پیوست، پاسخ متنی، جستجوی FTS، چاپ — انجام/در صف R10.

## ۱۹. LetterReferral — گام گردش نامه (زنجیره ارجاع)

| فیلد | نوع | الزامی | مقادیر | توضیح |
|---|---|---|---|---|
| id / letterId | String | ✔ | FK→Letter (Cascade) | |
| fromUserId / toUserId | String | ✔ | FK→User | برای اقدامات غیر-ارجاع، to = خود کاربر |
| action | String | ✔ | `REFER` \| `ANSWER` \| `APPROVE` \| `ARCHIVE` | |
| note | String? | — | — | یادداشت اقدام |
| deadlineAt | DateTime? | — | — | مهلت این گام (P2: هنگام ارجاع الزام‌پذیر) |
| createdAt | DateTime | ✔ | now | ترتیب timeline |

## ۲۰. Notification — اعلان درون‌برنامه‌ای

| فیلد | نوع | الزامی | مقادیر | توضیح |
|---|---|---|---|---|
| id / userId | String | ✔ | FK→User (Cascade) | گیرنده |
| title | String | ✔ | — | عنوان (فارسی، شامل شماره سند) |
| body | String? | — | — | شرح |
| kind | String | ✔ | `INFO` \| `LETTER` \| `WAREHOUSE` \| `REQUEST` | رنگ/آیکون toast |
| targetView | String? | — | کد نما برای ناوبری با کلیک | مثل `cartable` |
| isRead | Boolean | ✔ | پیش‌فرض false | کلیک = خوانده‌شده |
| createdAt | DateTime | ✔ | now | |

قیف واحد: همه ماژول‌ها فقط `notify()` — INSERT + push بلادرنگ (fire-and-forget) + تضمین polling.

## ۲۱. AuditLog — سجل حسابرسی

| فیلد | نوع | الزامی | توضیح |
|---|---|---|---|
| id | String | ✔ | |
| userId / companyId | String? | — | کاربر/شرکت در لحظه عملیات |
| action | String | ✔ | `LOGIN`,`LOGOUT`,`CREATE`,`CREATE+POST`,`POST`,`CANCEL`,`REFER`,`ANSWER`,`APPROVE`,`ARCHIVE`,`MODULE_TOGGLE`,`AI_SUGGEST`,`AI_APPLY`,`REQUEST_*` |
| entity / entityId | String | ✔/— | مثل `letter` + id رکورد |
| details | String? | — | JSON رشته‌ای |
| createdAt | DateTime | ✔ | |

## ۲۲. OutboxEvent — رویداد دامنه (ADR-003)

| فیلد | نوع | الزامی | مقادیر type | توضیح |
|---|---|---|---|---|
| id / type / payload | String | ✔ | `letter.created`,`letter.referred`,`doc.posted`,`request.created`,`request.approved/rejected/fulfilled`,`ai.applied` | payload=JSON |
| createdAt | DateTime | ✔ | now | |
| processedAt | DateTime? | — | null تا مصرف توسط پردازشگر دوره‌ای (P0-T18) | |

## ۲۳. DocCounter — شمارنده سالانه اسناد

| فیلد | نوع | الزامی | مقادیر | توضیح |
|---|---|---|---|---|
| id / companyId | String | ✔ | FK→Company | |
| scope | String | ✔ | `LETTER` \| `WHDOC` \| `GOODSREQ` | |
| year | Int | ✔ | سال جلالی جاری | |
| value | Int | ✔ | آخرین شماره صادرشده | |

قید: `@@unique([companyId, scope, year])`. تابع `nextDocNumber`: increment اتمیک در تراکنش — **هیچ شماره‌ای دو بار صادر نمی‌شود**؛ سال از تاریخ جلالی سیستم.


## ۲۴. FeatureFlag — پرچم ویژگی (سرویس هسته ۱۳ — ADR-009)

| فیلد | نوع | الزامی | توضیح |
|---|---|---|---|
| id | String | ✔ | |
| key | String | ✔ | **unique**؛ الگوی دامنه‌ای: `ai.letter-assist`, `scheduler.enabled` |
| description | String | ✔ | توضیح فارسی قابلیت |
| enabled | Boolean | ✔ | پیش‌فرض false |
| updatedAt | DateTime | ✔ | @updatedAt |

کلیدهای فعال: `ai.letter-assist` · `storage.letter-attachments` · `scheduler.enabled` — هر سه مسیر کد واقعی را قطع/وصل می‌کنند. کش ۱۵ ثانیه‌ای سمت سرور (`core/featureflags`).

## ۲۵. FileObject — شیء فایل (سرویس هسته ۱۱ — Storage)

| فیلد | نوع | الزامی | توضیح |
|---|---|---|---|
| id | String | ✔ | |
| storageKey | String | ✔ | **unique**؛ سمت سرور ساخته می‌شود: `letters/2026-02/<uuid>.pdf` — ورودی کاربر هرگز وارد مسیر نمی‌شود |
| fileName | String | ✔ | نام اصلی (≤۱۸۰) |
| mimeType | String | ✔ | از allowlist: PDF/PNG/JPEG/WebP/TXT/DOC/DOCX/XLS/XLSX |
| sizeBytes | Int | ✔ | سقف ۱۰MB |
| sha256 | String | ✔ | اثر انگشت محتوا |
| createdAt | DateTime | ✔ | |

آداپتر سندباکس: فایل‌سیستم `.storage/` (gitignore)؛ قرارداد putObject/getObject برای مهاجرت به S3/MinIO ثابت است.

## ۲۶. Attachment — پیوست چندریختی

| فیلد | نوع | الزامی | توضیح |
|---|---|---|---|
| id | String | ✔ | |
| entityType | String | ✔ | `letter` (و در آینده: archive, contract, …) |
| entityId | String | ✔ | کلید موجودیت متصل |
| fileObjectId | String | ✔ | FK→FileObject (Cascade) |
| uploadedById | String? | — | کاربر بارگذار |
| createdAt | DateTime | ✔ | |

قید: `@@index([entityType, entityId])`. کنترل دسترسی دانلود از طریق دامنه دید موجودیت متصل (نامه در scope کاربر).

## ۲۷. ScheduledJob — تعریف کار دوره‌ای (سرویس هسته ۱۲ — Scheduler)

| فیلد | نوع | الزامی | توضیح |
|---|---|---|---|
| id | String | ✔ | |
| key | String | ✔ | **unique**؛ باید در RUNNERS هسته زمان‌بند پیاده باشد: `outbox-processor`, `health-monitor` |
| name | String | ✔ | نام فارسی |
| intervalSec | Int | ✔ | پیش‌فرض ۶۰ |
| enabled | Boolean | ✔ | خاموشی بدون ری‌استارت |
| lastRunAt | DateTime? | — | |
| lastStatus | String? | — | `OK` \| `ERROR` |
| lastError | String? | — | متن خطا (برش ۳۰۰) |
| note | String? | — | گزارش کوتاه آخرین اجرا |

بوت از `src/instrumentation.ts` (قلاب register)؛ حلقه ۱۵ ثانیه‌ای، محافظ globalThis، خاموشی اضطراری `SCHEDULER_DISABLED=1`.

## ۲۸. AiInvocation — سجل فراخوانی مدل (سرویس هسته ۱۷ — AI Gateway)

| فیلد | نوع | الزامی | توضیح |
|---|---|---|---|
| id | String | ✔ | |
| task | String | ✔ | شناسه وظیفه: `letter.classify-summarize` |
| provider | String | ✔ | `zai` |
| model | String? | — | شناسه مدل (در صورت گزارش) |
| ok | Boolean | ✔ | نتیجه |
| error | String? | — | TIMEOUT / UNPARSABLE_RESPONSE / متن استثنا |
| latencyMs | Int | ✔ | تاخیر اندازه‌گیری‌شده |
| userId | String? | — | بدون FK عمدی (جدول تلمتری پرنوشت) |
| companyId | String? | — | |
| createdAt | DateTime | ✔ | |

نمایندگی UI: تب «یکپارچه‌سازی و گزارش‌ها» ← ۳۰ فراخوانی اخیر.

## ۲۹. IntegrationConnector — کاتالوگ کانکتور (سرویس هسته ۱۸ — Integration Bus)

| فیلد | نوع | الزامی | مقادیر |
|---|---|---|---|
| id | String | ✔ | |
| code | String | ✔ | **unique**: `tax-connector`, `bank-connector`, `attendance-device-connector`, `e-invoice-connector`, `legacy-connector`, `chat-connector` |
| name | String | ✔ | نام فارسی |
| kind | String | ✔ | `TAX` \| `BANK` \| `ATTENDANCE` \| `E_INVOICE` \| `LEGACY` \| `GENERIC` |
| status | String | ✔ | `PLANNED` \| `CONFIGURED` \| `LIVE` — فعلاً همه PLANNED (صادقانه) |
| direction | String | ✔ | `OUTBOUND` \| `INBOUND` \| `BIDIRECTIONAL` |
| endpoint | String? | — | نقطه اتصال (پس از پیکربندی) |
| note | String? | — | فاز تحقق |

قاعده حاکمیت: هر اتصال بیرونی «اول ثبت در این رجیستری، بعد پیاده‌سازی» — اتصال ناشناس ممنوع.

## ۳۰. ReportDefinition — کاتالوگ گزارش (سرویس هسته ۱۶ — Reporting Metadata)

| فیلد | نوع | الزامی | مقادیر |
|---|---|---|---|
| id | String | ✔ | |
| code | String | ✔ | **unique**: `letters.register`, `stock.by-grade`, `audit.trail`, … |
| name | String | ✔ | نام فارسی گزارش |
| moduleCode | String | ✔ | پلاگین مالک (نسبت به رجیستری) |
| category | String | ✔ | `OPERATIONAL` \| `MANAGEMENT` \| `COMPLIANCE` |
| engine | String | ✔ | `BUILTIN` \| `AI` |
| targetPhase | String | ✔ | فاز تحقق (P0 فوری، بعدی‌ها P1/P2/P5) |
| params | String | ✔ | JSON پارامترهای استاندارد |

## ۳۱. CompanySetting — تنظیمات per-company (P1-T29/T30)

| فیلد | نوع | الزامی | توضیح |
|---|---|---|---|
| id | String | ✔ | |
| companyId | String | ✔ | FK به Company (حذف آبشاری) |
| key | String | ✔ | سفیدلیست: `requests.visibility` · `requests.notifyCeilingM2` |
| value | String | ✔ | مقدار متن (اعتبارسنجی در سرویس) |
| updatedAt | DateTime | ✔ | @updatedAt |

قاعده یکتایی: `@@unique([companyId, key])`. کلیدهای فعال: دید درخواست کالا (`ALL` پیش‌فرض / `SELF_MANAGERS` = کارشناس فقط خودش، مدیران همه) و سقف اعلان درخواست (مترمربع؛ ۰ = اعلان همه — pre-finance، پس از ماژول مالی به مبلغ ریالی ارتقا می‌یابد). خواندن/نوشتن فقط با گارد `requireSettingsAdmin`؛ هر تغییر رکورد `COMPANY_SETTING` حسابرسی می‌شود. ثبت‌ها همراه هر شرکت از جمله هلدینگ (GROUP) — تنظیم هلدینگ بر نمای تجمعی حاکم است.

## ۳۲. CodeScheme — طرحواره کدگذاری (موتور کدگذاری ساختارمحور — P4-T0)

| فیلد | نوع | الزامی | توضیح |
|---|---|---|---|
| id | String | ✔ | cuid |
| companyId | String? | — | null = طرحواره سراسری هلدینگ؛ مقدار = اختصاصی همان شرکت (اولویت override همان code) |
| code | String | ✔ | `tile` · `equipment` · `spare-part` · `raw-material` |
| name | String | ✔ | فارسی |
| description | String? | — | |
| itemFamily | String | ✔ | PRODUCT · EQUIPMENT · SPARE_PART · RAW_MATERIAL |
| separator | String | — | '' برای کاشی (کد پیوسته)، '-' برای طرحواره‌های عمومی |
| motherSegments | Int? | — | شمار اجزای ابتداییِ «کد مادر» (کاشی = ۹ جزء = ۱۲ کاراکتر — تبصره ۱-۲ سند) |
| isActive | Boolean | ✔ | پیش‌فرض true |

قاعده یکتایی: `@@unique([companyId, code])`. سرویس: `core/coding/coding.ts` (compose/decode/شمارنده). منبع داده seed: «دستورالعمل کدگذاری محصولات» شرکت (۱۶ جزء / ۲۰ کاراکتر).

## ۳۳. CodeSegment — جزء کد

| فیلد | نوع | الزامی | توضیح |
|---|---|---|---|
| id | String | ✔ | cuid |
| schemeId | String | ✔ | FK به CodeScheme (حذف آبشاری) |
| position | Int | ✔ | ۱..n از چپ |
| key | String | ✔ | `glaze` · `thickness` · `size` · `design` … |
| label | String | ✔ | فارسی «نوع لعاب» |
| length | Int | ✔ | ۱..۳ کاراکتر |
| kind | String | ✔ | ENUM (فهرست بسته) · COUNTER (شمارنده سالانه از DocCounter با scope `CODE:<scheme>:<key>`) |
| required | Boolean | ✔ | پیش‌فرض true |
| mapsTo | String? | — | نگاشت معنایی به فیلد مستردیتا (size/color/surface/productLine) — کدساز فرم کالا را پیش‌پر می‌کند |

قاعده یکتایی: `@@unique([schemeId, key])`. اجزای حذف‌پذیر نیستند جدا — طرحواره idempotent بازسازی می‌شود (seed-code-schemes).

## ۳۴. CodeEnumValue — فهرست مقدار جزء

| فیلد | نوع | الزامی | توضیح |
|---|---|---|---|
| id | String | ✔ | cuid |
| segmentId | String | ✔ | FK به CodeSegment (حذف آبشاری) |
| code | String | ✔ | مقدار کد — مثلاً `T` (لعاب براق) یا `60` (۶۰×۶۰) |
| label | String | ✔ | فارسی «براق (ترانس)» |
| sortOrder | Int | ✔ | ترتیب نمایش |

قاعده یکتایی: `@@unique([segmentId, code])`.

## نمودار روابط (متنی)

```
Company 1─* Membership *─1 User 1─* Session
Company 1─* ModuleActivation *─1 PlatformModule 1─* ModuleMenu
Company 1─* Product 1─* StockItem *─1 Warehouse (از طریق کلید واریانت)
Company 1─* Warehouse 1─* WarehouseDoc 1─* DocItem *─1 Product
Company 1─* GoodsRequest 1─* GoodsRequestItem *─1 Product
Company 1─* Letter 1─* LetterReferral (from/to User)
Partner 1─* PartnerInstance *─1 Company
User 1─* Notification · User/Company 1─* AuditLog · Company 1─* DocCounter
LoginAttempt — سجل ناموفق ورود (بدون FK عمدی؛ کلید نرخ username+ip — P0.5-T3)
FileObject 1─* Attachment *─* (entityType+entityId → Letter) — پیوست چندریختی
FeatureFlag · ScheduledJob · IntegrationConnector · ReportDefinition — تک‌جدول‌های حاکمیت بستر (ADR-009)
Company 1─* CompanySetting — تنظیمات per-company (دید/اعلان درخواست)
CodeScheme 1─* CodeSegment 1─* CodeEnumValue — دستور زبان کد (موتور کدگذاری ساختارمحور)
AiInvocation — تلمتری مستقل (بدون FK عمدی)
```

---

## نمایه‌های دیتابیس (P1-T11 — مسیرهای داغ)

اصل: هر ایندکس یک «مسیر داغ واقعی» را پوشش می‌دهد (فهرست‌های صفحه‌بندی‌شده، شمارش‌های داشبورد، زنگ اعلان) — نه ایندکس تزئینی. راستی‌آزمایی: `bun scripts/test-indexes.ts` (EXPLAIN QUERY PLAN روی ۱۹ مسیر طلایی؛ هیچ‌یک SCAN نیست).

| مدل | ایندکس | مسیر داغ |
|---|---|---|
| Letter | `(companyId, createdAt)` | فهرست نامه‌ها — دامنه شرکت + جدیدترین |
| Letter | `(companyId, status)` | فیلتر وضعیت + شمارش‌های داشبورد |
| Letter | `(currentHolderId, status)` | کارتابل من (inbox) |
| Letter | `(creatorId, createdAt)` | صادره‌های من |
| LetterReferral | `(letterId, createdAt)` | سلسله ارجاع‌های نامه (نمای جزئیات) |
| WarehouseDoc | `(companyId, docDate, docNumber)` | فهرست اسناد — جدیدترین با ترتیب ثانویه شماره |
| WarehouseDoc | `(companyId, status)` | فیلتر وضعیت + groupBy داشبورد |
| WarehouseDoc | `(warehouseId)` | فیلتر انبار (شامل مقصد انتقال) |
| WarehouseDoc | `(companyId, type, docNumber)` **unique** | یکتایی شماره + جستجوی شماره |
| DocItem | `(docId)` · `(productId)` | include اقلام سند؛ ردیابی کالا |
| GoodsRequest | `(companyId, createdAt)` · `(companyId, status)` · `(requesterId)` | فهرست؛ شمارش در انتظار؛ درخواست‌های من |
| GoodsRequestItem | `(requestId)` | include اقلام درخواست |
| StockItem | `(productId)` + unique واریانت | فیلتر کالا؛ (پیشوند warehouseId توسط unique پوشش دارد) |
| Notification | `(userId, createdAt)` | زنگ اعلان: ۳۰ اعلان آخر + خوانده‌نشده (داغ‌ترین) |
| AuditLog | `(companyId, createdAt)` · `(userId, createdAt)` · `(action, createdAt)` | فهرست حسابرسی؛ فعالیت کاربر؛ ورودهای ناموفق |
| Session | `(userId, expiresAt)` | دستگاه‌های فعال + پاکسازی منقضی‌ها |
| LoginAttempt | `(username, ip, at)` | شمارش پنجرهٔ لغزان محدودساز نرخ ورود (P0.5-T3) |
| Membership | `(companyId)` | ماتریس اعضای شرکت |
| OutboxEvent | `(processedAt)` | برداشت پردازشگر رویداد |
| Attachment | `(entityType, entityId)` | پیوست‌های موجودیت (از P0) |

**استثنای مستند:** جمع‌های کامل موجودی (`SUM(qtyM2) GROUP BY grade`) عمداً پیمایش کامل جدول‌اند — با ۳هزار ردیف ۳ms؛ در صورت رشد به صدها هزار ردیف، مسیر materialized view / جمع پیش‌محاسبه در P3 بازنگری می‌شود.

**قاعده افزودن ایندکس جدید:** (۱) کوئری داغ را با EXPLAIN اثبات کن؛ (۲) ایندکس را در شمای Prisma با کامنت مسیر اضافه کن؛ (۳) تست `test-indexes.ts` را گسترش بده؛ (۴) بودجه زمانی `test-perf.ts` را نگه دار. هزینه نوشتن هر ایندکس روی مسیرهای INSERT داغ (Outbox/Notification/AuditLog) سنجیده شده و پذیرفته است.

**داده حجمی تست کارایی (P1-T10):** `bun run seed:big` — ۱۰٬۰۰۰ نامه + ۵٬۰۰۰ سند + ۵۰۰ کالا + ۲٬۰۰۰ درخواست + ۳٬۰۰۰ سجل + ۱۲۰ شریک طلایی (در ~۳ ثانیه)؛ توزیع وزنی بین شرکت‌ها و ~۵۵٪ داده در ۴۵ روز اخیر تا روند داشبورد واقعی باشد. شماره‌ها از DocCounter ادامه می‌یابند (بدون برخورد یکتایی). اجرای مجدد = افزودن مجدد داده؛ برای بازتنظیمی کامل، seed اصلی و سپس seed:big.
