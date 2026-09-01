import 'server-only'
import { db } from '@/core/shared/db'
import type { SessionContext } from '@/core/auth/auth'

// نقش کاربر در شرکت فعال
export async function roleInCompany(userId: string, companyId: string | null) {
  if (!companyId) return null
  const m = await db.membership.findUnique({
    where: { userId_companyId: { userId, companyId } },
  })
  return m?.role ?? null
}

// دامنه شرکت‌های قابل مشاهده:
// اگر شرکت فعال از نوع GROUP باشد → همه شرکت‌های عضو (دید هلدینگی)
// در غیر این صورت → فقط شرکت فعال (ایزولاسیون چندشرکتی — ADR-002)
export async function scopeCompanyIds(ctx: SessionContext): Promise<string[]> {
  const memberships = await db.membership.findMany({
    where: { userId: ctx.userId },
    include: { company: { select: { id: true, type: true } } },
  })
  const active = memberships.find((m) => m.company.id === ctx.companyId)
  if (active && active.company.type === 'GROUP') {
    return memberships.map((m) => m.company.id)
  }
  return ctx.companyId ? [ctx.companyId] : []
}

// ---------- گاردهای نقش (P1-T14/T18 — ماتریس docs/architecture/04-security-rbac.md §۳) ----------

/**
 * P1-T18 — گارد نقش پایه نوشتن: VIEWER (و نقش نامعلوم) هیچ نوشتنی ندارد.
 * مدیر پلتفرم (isAdmin) بای‌پس می‌شود. خروجی null = مجاز؛ رشته = پیام خطای فارسی.
 */
export async function requireWriteRole(ctx: SessionContext): Promise<string | null> {
  if (ctx.isAdmin) return null
  const role = await roleInCompany(ctx.userId, ctx.companyId)
  if (role === 'ADMIN' || role === 'MANAGER' || role === 'OPERATOR') return null
  return 'نقش «بازدیدکننده» اجازه ثبت یا تغییر داده ندارد؛ برای دسترسی عملیاتی با مدیر سامانه تماس بگیرید'
}

/**
 * P1-T14 — گارد تنظیمات بستر: مدیر پلتفرم (isAdmin) یا ADMIN شرکت فعال.
 * خروجی null = مجاز؛ رشته = پیام خطای فارسی (403).
 */
export async function requireSettingsAdmin(ctx: SessionContext): Promise<string | null> {
  if (ctx.isAdmin) return null
  const role = await roleInCompany(ctx.userId, ctx.companyId)
  return role === 'ADMIN' ? null : 'دسترسی به تنظیمات بستر فقط برای مدیران سامانه مجاز است'
}
