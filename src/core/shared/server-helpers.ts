import 'server-only'
import { NextResponse } from 'next/server'
import { db } from '@/core/shared/db'
import { getSessionCtx, type SessionContext } from '@/core/auth/auth'
import { jalaliYear } from '@/core/shared/jalali'
import { isModuleEnabled } from '@/core/tenancy/module-access'
import { getCompanySetting } from '@/core/tenancy/company-settings'
import { LETTER_NUMBERING_KEY, parseLetterNumbering } from '@/core/shared/numbering'
import type { LetterNumberingConfig } from '@/types/platform'

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

/**
 * P2-T8 (R9) — پیکربندی شماره‌گذاری نامه per-type شرکت فعال
 * (کلید CompanySetting: letters.numbering — خواندن unique-index ارزان، بدون کش تا تغییر
 * تنظیم بلافاصله در شماره‌گذاری/نمایش حاکم باشد). غیبت/خرابی = پیش‌فرض سری مشترک.
 */
export async function getLetterNumbering(companyId: string | null): Promise<LetterNumberingConfig> {
  return parseLetterNumbering(await getCompanySetting(companyId, LETTER_NUMBERING_KEY))
}

/**
 * پیکربندی شماره‌گذاری چند شرکت در یک پرس‌وجو — برای فهرست/CSV چندشرکتی (دامنه هلدینگ)
 * که هر نامه باید با پیکربندی شرکتِ خودش نمایش داده شود. شرکت بدون تنظیم = پیش‌فرض.
 */
export async function getLetterNumberings(companyIds: string[]): Promise<Map<string, LetterNumberingConfig>> {
  const map = new Map<string, LetterNumberingConfig>()
  if (companyIds.length === 0) return map
  const rows = await db.companySetting.findMany({
    where: { companyId: { in: companyIds }, key: LETTER_NUMBERING_KEY },
    select: { companyId: true, value: true },
  })
  const byCompany = new Map(rows.map((r) => [r.companyId, r.value]))
  for (const id of companyIds) {
    map.set(id, parseLetterNumbering(byCompany.get(id) ?? null))
  }
  return map
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
