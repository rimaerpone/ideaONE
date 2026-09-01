# ماژول پلتفرم (platform)

رجیستری ماژول‌ها (جایگزین Module Federation — ADR-001)، مدیریت کاربران دامنه دید و حسابرسی + Outbox.

- سرویس: `service.ts` (listModules، toggleModule، listUsers، listAudit)
- API: `/api/modules`، `/api/users`، `/api/audit`
- قواعد: تغییر سراسری فقط مدیر سامانه؛ فعال‌سازی per-company با ADMIN شرکت

> مشخصات کامل (فرم‌ها فیلد‌به‌فیلد، نماها، API، مجوزها): `docs/modules/platform/SPEC.md`
