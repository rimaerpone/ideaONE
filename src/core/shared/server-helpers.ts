import 'server-only'
import { NextResponse } from 'next/server'
import { db } from '@/core/shared/db'
import { getSessionCtx, type SessionContext } from '@/core/auth/auth'
import { jalaliYear } from '@/core/shared/jalali'
import { isModuleEnabled } from '@/core/tenancy/module-access'

// ---------- گارد احراز هویت ----------
// قاعده AGENTS.md: هر route/service با requireCtx شروع می‌شود.
export async function requireCtx(): Promise<
  { ok: true; ctx: SessionContext } | { ok: false; res: NextResponse }
> {
  const ctx = await getSessionCtx()
  if (!ctx) {
    return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  }
  return { ok: true, ctx }
}

/**
 * P1-T28 — گارد ماژول: احراز هویت + کلید دوگانه فعال‌سازی (سراسری/شرکتی).
 * ماژول خاموش → 404 فارسی (داده موجود است اما قابلیت برای این شرکت فعال نیست).
 * نگاشت code ماژول‌ها: office-automation / warehouse / products / partners / ...
 */
export async function requireModule(
  moduleCode: string,
): Promise<{ ok: true; ctx: SessionContext } | { ok: false; res: NextResponse }> {
  const r = await requireCtx()
  if (!r.ok) return r
  const enabled = await isModuleEnabled(moduleCode, r.ctx.companyId)
  if (!enabled) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'این قابلیت برای شرکت فعال شما فعال نیست؛ برای فعال‌سازی با مدیر سامانه تماس بگیرید' },
        { status: 404 },
      ),
    }
  }
  return r
}

export function jsonError(message: string, status = 400, headers?: Record<string, string>) {
  return NextResponse.json({ error: message }, { status, headers })
}

// ---------- شماره‌گذاری خودکار اسناد ----------
// ترتیبی سالانه جلالی per-company (تصمیم ممیزی: شماره‌گذاری سراسری ممنوع)
export async function nextDocNumber(companyId: string, scope: string): Promise<number> {
  const year = jalaliYear(new Date())
  const counter = await db.docCounter.upsert({
    where: { companyId_scope_year: { companyId, scope, year } },
    create: { companyId, scope, year, value: 1 },
    update: { value: { increment: 1 } },
  })
  return counter.value
}

// ---------- برچسب‌های فارسی مشترک ----------
export const LABELS = {
  roles: { ADMIN: 'مدیر سیستم', MANAGER: 'مدیر', OPERATOR: 'کارشناس', VIEWER: 'بازدیدکننده' },
  docTypes: { RECEIPT: 'رسید انبار', ISSUE: 'حواله انبار', TRANSFER: 'انتقال انبار', COUNT: 'شمارش' },
  docStatus: { DRAFT: 'پیش‌نویس', POSTED: 'قطعی', CANCELLED: 'ابطال‌شده' },
  letterTypes: { INCOMING: 'وارده', OUTGOING: 'صادره', INTERNAL: 'داخلی' },
  letterStatus: { DRAFT: 'پیش‌نویس', IN_PROGRESS: 'در جریان', ANSWERED: 'پاسخ داده‌شده', ARCHIVED: 'بایگانی' },
  confidentiality: { NORMAL: 'عادی', CONFIDENTIAL: 'محرمانه', SECRET: 'سری' },
  urgency: { NORMAL: 'عادی', URGENT: 'فوری' },
  reqStatus: { PENDING: 'در انتظار', APPROVED: 'تأییدشده', REJECTED: 'ردشده', FULFILLED: 'تأمین‌شده' },
  moduleCategories: { CORE: 'هسته پلتفرم', BUSINESS: 'کسب‌وکار', COLLAB: 'همکاری سازمانی', AI: 'هوش مصنوعی' },
  warehouseKinds: { PHYSICAL: 'فیزیکی', VIRTUAL: 'مجازی (حسابی/امانی)', WORKSTATION: 'پای کار ایستگاه' },
}
