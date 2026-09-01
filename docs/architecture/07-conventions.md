# قراردادهای کد و مهندسی

وضعیت: **فعال** | مالک: معماری | بازنگری: ۱۴۰۵/۰۶/۰۵

## ۱. زبان

| لایه | زبان | مثال |
|---|---|---|
| شناسه‌ها، فیلد DB، enumها، مسیر API | انگلیسی | `WarehouseDoc`, `qtyM2`, `/api/whdocs` |
| UI، پیام خطا، کامنت، مستندات | فارسی | «سند قطعی و موجودی به‌روزرسانی شد» |
| ارقام نمایشی | فارسی (`faDigits`/`faNumber`) | ۱٬۲۴۰ |
| تاریخ نمایشی | جلالی (`formatJalali`) | ۱۴۰۵/۰۶/۰۵ |

## ۲. الگوی ServiceResult (قرارداد همه سرویس‌ها)

```ts
// تعریف واحد: src/core/shared/types.ts — هر ماژول آن را import می‌کند
export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number }
```

- route فقط: `requireCtx` → فراخوانی سرویس → `NextResponse.json(data)` یا `json({error},{status})`.
- **error همیشه فارسی و قابل نمایش مستقیم در toast است** — کد خطا/exception خام هرگز به کلاینت نمی‌رود.
- status پیش‌فرض خطای منطقی 400؛ 404 برای «یافت نشد»؛ 401 نشست؛ 403 مجوز؛ 503 سرویس خارجی.

## ۳. الگوهای الزامی (که چرخ را دوباره اختراع نکنید)

| نیاز | الگو | فایل مرجع |
|---|---|---|
| اعلان | `notify()` (DB + push + polling) | `core/notifications/notify.ts` |
| رویداد دامنه | `emitEvent()` (Outbox) | `core/events/outbox.ts` |
| شماره سند | `nextDocNumber(companyId, scope)` | `core/shared/server-helpers.ts` |
| دامنه دید | `await scopeCompanyIds(ctx)` | `core/tenancy/tenancy.ts` |
| نقش در شرکت | `roleInCompany(userId, companyId)` | همان |
| حسابرسی | `audit({ctx, action, entity, entityId, details})` | `core/audit/audit.ts` |
| تاریخ جلالی | `jalali.ts` فقط (تبدیل تست‌شده) | `core/shared/jalali.ts` |
| نرمال‌سازی ارقام فارسی | `digitsFaToEn` از persian-tools | سرویس‌ها |
| اعتبارسنجی شناسه ایرانی | `verifyIranianNationalId/LegalId` | partners-view |
| فرم تاریخ | `<JalaliDatePicker/>` | `components/common/` |
| fetch | `apiGet/apiPost` (نسبی + XTransformPort + خطای فارسی) | `core/shared/api-client.ts` |
| state فرم | state ساده + اعتبارسنجی دستی + toast | نماها (مهاجرت به react-hook-form + zod در P1-T20) |

## ۴. الگوهای ممنوع

1. منطق کسب‌وکار در `route.ts` (هر متد HTTP ≤ ۱۴ خط — بررسی ماشینی CH-04؛ منطق در `service.ts` ماژول یا `core/*`).
2. import ماژول از ماژول (`modules/a` → `modules/b` ❌) — ارتباط فقط Outbox یا service ترکیبی در آینده.
3. Prisma/SDK در کامپوننت کلاینت یا فایل بدون `'server-only'`.
4. کتابخانه تاریخ جدید؛ regex دست‌ساز کد ملی؛ Intl به‌جای jalali.ts.
5. `setInterval` بدون alive-flag؛ `.then` بدون cleanup در effect.
6. Radix Select با `value=""` (کرش) — مقدار نگهبان `'none'`.
7. شماره سند خودساخته (همیشه DocCounter).
8. کوئری بدون فیلتر دامنه شرکت.
9. مسیر fetch/سوکت مطلق (قانون گیت‌وی).
10. کامیت بدون پیام Conventional.

## ۵. کامیت‌ها (Conventional Commits)

```
<type>(<scope>): <subject-fa-or-en>
feat(letters): پیوست فایل به نامه
fix(inventory): کنترل موجودی منفی هنگام قطعی انتقال
refactor(core): تجزیه server-helpers
docs(roadmap): افزودن فاز P3
test(e2e): سناریوی SC-005
chore: حذف مخلفات اسکفولد
```

scopeهای مجاز: `core, letters, inventory, products, partners, requests, dashboard, platform, realtime, docs, seed, ui`. هر کامیت = یک منطق واحد؛ refaktور خالص و feat در کامیت‌های جدا.

## ۶. کامنت‌گذاری

- هر `service.ts` سرِ فایل: هدف ماژول + ارجاع به سناریو/SPEC.
- کامنت فقط برای «چرا»ها (تصمیم غیربدیهی، دور زدن باگ شناخته‌شده سندباکس)؛ «چه کاری» را کد بگوید.
- TODO فقط با شماره وظیفه نقشه راه: `// TODO(P2-T3): پیوست نامه`.

## ۷. قواعد Prisma

- تغییر schema → `bun run db:push` + به‌روزرسانی `docs/architecture/03-data-model.md` + `src/types/platform.ts`.
- هیچ مهاجرت نسخه‌دار زنده‌ای اجرا نمی‌شود (SQLite سندباکس) — تاریخچه schema در گیت.
- seed همیشه «پاک‌سازی کامل + بازسازی» است (`bunx tsx scripts/seed.ts`) — idempotent.

## ۸. قواعد UI

- همه دیالوگ‌ها `dir="rtl"` + `max-h-[90vh] overflow-y-auto` + thin-scrollbar.
- لیست‌ها: حالت LoadingState / EmptyState الزامی؛ ارقام با faNumber؛ اعداد جدول `tabular-nums`.
- نشان وضعیت فقط از `StatusBadge` (نقشه رنگ واحد).
- عملیات مخرب/قطعی → دکمه primary متمایز + toast نتیجه؛ در P1 برای همه عملیات مخرب AlertDialog تأیید اضافه می‌شود.
- موبایل 390px: هیچ جدولی بدون `overflow-x-auto` یا ستون‌های مخفی شرطی (`hidden md:table-cell`).
