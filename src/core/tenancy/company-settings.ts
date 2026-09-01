import 'server-only'
import { db } from '@/core/shared/db'

/**
 * P1-T29/T30 — تنظیمات per-company (کلید-مقدار)
 *
 * هر شرکت (از جمله هلدینگ) رکورد تنظیم مستقل دارد؛ کلیدهای فعال:
 *   requests.visibility    → 'ALL' (پیش‌فرض) | 'SELF_MANAGERS'
 *   requests.notifyCeilingM2 → عدد مترمربع؛ ۰/حذف = اعلان همه درخواست‌ها به مدیران
 *   letterhead.subtitle    → سطر زیر نام شرکت در سربرگ چاپ نامه (P2.5-U7 / P2-T7)
 *   letterhead.footer      → پاورقی چاپ نامه (نشانی/تماس) (P2.5-U7 / P2-T7)
 *
 * خواندن ارزان است (unique index) — بدون کش درون‌فرایندی تا تغییر تنظیم
 * بلافاصله در فهرست/اعلان‌ها حاکم باشد.
 */
export const REQUESTS_VISIBILITY = 'requests.visibility'
export const REQUESTS_CEILING = 'requests.notifyCeilingM2'
export const LETTERHEAD_SUBTITLE = 'letterhead.subtitle'
export const LETTERHEAD_FOOTER = 'letterhead.footer'

export type RequestsVisibility = 'ALL' | 'SELF_MANAGERS'

export async function getCompanySetting(companyId: string | null, key: string): Promise<string | null> {
  if (!companyId) return null
  const row = await db.companySetting.findUnique({
    where: { companyId_key: { companyId, key } },
    select: { value: true },
  })
  return row?.value ?? null
}

export async function getCompanySettings(companyId: string | null): Promise<Record<string, string>> {
  if (!companyId) return {}
  const rows = await db.companySetting.findMany({ where: { companyId }, select: { key: true, value: true } })
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export async function setCompanySetting(companyId: string, key: string, value: string): Promise<void> {
  await db.companySetting.upsert({
    where: { companyId_key: { companyId, key } },
    create: { companyId, key, value },
    update: { value },
  })
}

/** دید درخواست کالا برای شرکت فعال — پیش‌فرض ALL (تست‌شده در P1-T29) */
export async function getRequestsVisibility(companyId: string | null): Promise<RequestsVisibility> {
  const v = await getCompanySetting(companyId, REQUESTS_VISIBILITY)
  return v === 'SELF_MANAGERS' ? 'SELF_MANAGERS' : 'ALL'
}

/** سقف اعلان مدیران (مترمربع) — ۰ = اعلان همه (پیش‌فرض) */
export async function getRequestsCeilingM2(companyId: string | null): Promise<number> {
  const v = await getCompanySetting(companyId, REQUESTS_CEILING)
  const n = v === null ? 0 : Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export type LetterheadConfig = { subtitle: string | null; footer: string | null }

/**
 * سربرگ چاپ نامه per-company (P2.5-U7 / P2-T7) — هر دو کلید اختیاری؛
 * خالی = چاپ فقط نام شرکت (سطر قانونی شرکت از Company.legalName جدا می‌آید).
 * خواندن با getCompanySettings (unique index) — بدون کش، تغییر بلافاصله حاکم.
 */
export async function getLetterhead(companyId: string | null): Promise<LetterheadConfig> {
  const raw = await getCompanySettings(companyId)
  return {
    subtitle: raw[LETTERHEAD_SUBTITLE]?.trim() || null,
    footer: raw[LETTERHEAD_FOOTER]?.trim() || null,
  }
}
