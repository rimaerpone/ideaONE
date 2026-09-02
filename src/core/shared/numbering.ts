/**
 * P2-T8 — شماره‌گذاری پیکربندی‌پذیر نامه per-type (R9)
 *
 * ماژول خالص (بدون db/server-only) تا سرور (سرویس نامه/زمان‌بند/FTS) و
 * کلاینت (کارت تنظیمات) هر دو آن را ایمپورت کنند — الگوی ai-categories.ts.
 *
 * ذخیره: یک کلید CompanySetting به نام LETTER_NUMBERING_KEY با مقدار JSON.
 *   { "separateByType": true, "types": { "INCOMING": { "prefix": "و", "suffix": "" }, ... } }
 * غیبت/خرابی مقدار = پیکربندی پیش‌فرض = رفتار فعلی (سری مشترک 'LETTER' بدون پیشوند/پسوند).
 *
 * نمایش واحد: «پیشوند + سال‌جلالی/شماره + پسوند» — مثل «و ۱۴۰۵/۴۲ م».
 * سری شمارنده: shared → scope «LETTER»؛ جدا → «LETTER:INCOMING» و… (unique companyId+scope+year).
 */
import type { LetterNumberingConfig, LetterNumberingRule, LetterNumberingType } from '@/types/platform'
import { faDocNumber } from '@/core/shared/jalali'

export const LETTER_NUMBERING_KEY = 'letters.numbering'

/** حداکثر طول پیشوند/پسوند — شماره نمایشی باید در نشان‌ها/توست/چاپ جا شود */
export const LETTER_NUMBERING_MAX_AFFIX = 12

export const DEFAULT_LETTER_NUMBERING: LetterNumberingConfig = {
  separateByType: false,
  types: {
    INCOMING: { prefix: '', suffix: '' },
    OUTGOING: { prefix: '', suffix: '' },
    INTERNAL: { prefix: '', suffix: '' },
  },
}

const LETTER_NUMBERING_TYPE_KEYS: readonly LetterNumberingType[] = ['INCOMING', 'OUTGOING', 'INTERNAL']

function cleanAffix(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, LETTER_NUMBERING_MAX_AFFIX) : ''
}

/** تجزیهٔ سخت‌گیر: هر خطا → پیش‌فرض (تنظیم خراب هیچ‌وقت شماره‌گذاری را نمی‌شکند) */
export function parseLetterNumbering(raw: string | null | undefined): LetterNumberingConfig {
  if (!raw || !raw.trim()) return { ...DEFAULT_LETTER_NUMBERING, types: structuredClone(DEFAULT_LETTER_NUMBERING.types) }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_LETTER_NUMBERING, types: structuredClone(DEFAULT_LETTER_NUMBERING.types) }
  }
  if (typeof parsed !== 'object' || parsed === null) return structuredClone(DEFAULT_LETTER_NUMBERING)
  const obj = parsed as Record<string, unknown>
  const types: Partial<Record<LetterNumberingType, LetterNumberingRule>> = {}
  for (const t of LETTER_NUMBERING_TYPE_KEYS) {
    const rule = obj.types && typeof obj.types === 'object' ? (obj.types as Record<string, unknown>)[t] : undefined
    if (typeof rule === 'object' && rule !== null) {
      types[t] = { prefix: cleanAffix((rule as Record<string, unknown>).prefix), suffix: cleanAffix((rule as Record<string, unknown>).suffix) }
    }
  }
  return {
    separateByType: obj.separateByType === true,
    types: {
      INCOMING: types.INCOMING ?? { prefix: '', suffix: '' },
      OUTGOING: types.OUTGOING ?? { prefix: '', suffix: '' },
      INTERNAL: types.INTERNAL ?? { prefix: '', suffix: '' },
    },
  }
}

/** سری شمارنده DocCounter — پیش‌فرض shared (رفتار فعلی) */
export function letterCounterScope(type: string, cfg: LetterNumberingConfig): string {
  if (!cfg.separateByType) return 'LETTER'
  return LETTER_NUMBERING_TYPE_KEYS.includes(type as LetterNumberingType) ? `LETTER:${type}` : 'LETTER'
}

/** پیشوند/پسوند نوع — برای نوع ناشناخته بدون affix */
export function letterAffix(type: string, cfg: LetterNumberingConfig): LetterNumberingRule {
  const rule = LETTER_NUMBERING_TYPE_KEYS.includes(type as LetterNumberingType) ? cfg.types[type as LetterNumberingType] : undefined
  return rule ?? { prefix: '', suffix: '' }
}

/**
 * شماره نمایشی واحد (سرورساخته برای همه پاسخ‌ها): «پیشوند سال/شماره پسوند».
 * پیکربندی پیش‌فرض دقیقاً خروجی faDocNumber فعلی را می‌دهد (۱۴۰۵/۴۲) — بدون شکست عقب‌گرد.
 */
export function formatLetterDisplayNumber(
  number: number,
  createdAt: Date | string | null | undefined,
  type: string,
  cfg: LetterNumberingConfig,
): string {
  const base = faDocNumber(number, createdAt ?? undefined)
  const { prefix, suffix } = letterAffix(type, cfg)
  if (!prefix && !suffix) return base
  return `${prefix ? `${prefix} ` : ''}${base}${suffix ? ` ${suffix}` : ''}`
}

/** اعتبارسنج مقدار تنظیم (برای whitelist CompanySetting) — null = معتبر؛ رشته = خطای فارسی */
export function validateLetterNumberingValue(v: string): string | null {
  if (!v.trim()) return null // خالی = حذف تنظیم = پیش‌فرض
  let parsed: unknown
  try {
    parsed = JSON.parse(v)
  } catch {
    return 'مقدار شماره‌گذاری باید JSON معتبر باشد'
  }
  if (typeof parsed !== 'object' || parsed === null) return 'مقدار شماره‌گذاری باید شیء JSON باشد'
  const obj = parsed as Record<string, unknown>
  if (obj.separateByType !== undefined && typeof obj.separateByType !== 'boolean') {
    return 'گزینه «سری جداگانه» باید true یا false باشد'
  }
  if (obj.types !== undefined) {
    if (typeof obj.types !== 'object' || obj.types === null || Array.isArray(obj.types)) return 'بخش types باید شیء باشد'
    for (const [t, rule] of Object.entries(obj.types as Record<string, unknown>)) {
      if (!LETTER_NUMBERING_TYPE_KEYS.includes(t as LetterNumberingType)) return `نوع نامه ناشناخته: ${t}`
      if (typeof rule !== 'object' || rule === null) return `قاعده نوع ${t} باید شیء باشد`
      const r = rule as Record<string, unknown>
      for (const k of ['prefix', 'suffix']) {
        const val = r[k]
        if (val === undefined || val === null || val === '') continue
        if (typeof val !== 'string') return `${k} نوع ${t} باید رشته باشد`
        if (val.trim().length > LETTER_NUMBERING_MAX_AFFIX) return `${k === 'prefix' ? 'پیشوند' : 'پسوند'} نوع ${t} حداکثر ${LETTER_NUMBERING_MAX_AFFIX} نویسه است`
        if (/[\r\n\t]/.test(val)) return `${k === 'prefix' ? 'پیشوند' : 'پسوند'} نوع ${t} نباید نویسه کنترلی داشته باشد`
      }
    }
  }
  return null
}

/** مقدار سریال‌شده برای ذخیره — خالی/پیش‌فرض = '' (تنظیم خالی = پیش‌فرض) */
export function serializeLetterNumbering(cfg: LetterNumberingConfig): string {
  return JSON.stringify({
    separateByType: cfg.separateByType === true,
    types: {
      INCOMING: { prefix: cfg.types.INCOMING.prefix.trim(), suffix: cfg.types.INCOMING.suffix.trim() },
      OUTGOING: { prefix: cfg.types.OUTGOING.prefix.trim(), suffix: cfg.types.OUTGOING.suffix.trim() },
      INTERNAL: { prefix: cfg.types.INTERNAL.prefix.trim(), suffix: cfg.types.INTERNAL.suffix.trim() },
    },
  })
}
