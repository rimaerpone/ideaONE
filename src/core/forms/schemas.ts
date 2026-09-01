/**
 * استاندارد اعتبارسنجی فرم‌ها (P1-T20) — آینه سرور
 *
 * قاعده طلایی: پیام خطای کلاینت باید همان متن سرور باشد تا کاربر دو روایت
 * متفاوت از یک خطا نبیند. سازنده‌های زیر دقیقاً واژگان سرویس‌ها را بازتولید
 * می‌کنند (مقایسه در scripts/test-ux-foundation.ts ماشین‌چک می‌شود).
 *
 * فایل عمداً بدون وابستگی به React/UI است تا در اسکریپت‌های تست bun هم
 * قابل اجرا باشد (همانند normalize.ts).
 */
import { z } from 'zod'
import { parseNumericInput } from '@/core/shared/normalize'
import { parseJalaliInput, faDigits } from '@/core/shared/jalali'

/** متن الزامی — trim اجباری، سقف طول با پیام فارسی (ارقام فارسی) */
export function faRequired(label: string, max = 500) {
  return z.string().trim()
    .min(1, `${label} الزامی است`)
    .max(max, `${label} حداکثر ${faDigits(max)} نویسه است`)
}

/** متن اختیاری — trim، سقف طول */
export function faOptional(max = 500) {
  return z.string().trim().max(max, `حداکثر ${faDigits(max)} نویسه مجاز است`)
}

/**
 * عدد فارسی‌پذیر — ورودی رشته فرم است؛ «۱٬۲۰۰٫۵» و «-620» هر دو معتبرند.
 * برای مقدار نهایی، خروجی را با parseNumericInput بگیرید (پس از اعتبارسنجی null نیست).
 */
export function faNumberField(
  label: string,
  opts: { min?: number; max?: number } = {},
) {
  return z.string().superRefine((v, ctx) => {
    const n = parseNumericInput(v)
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: `${label} عدد معتبر نیست (ارقام فارسی و جداکننده ٫ پشتیبانی می‌شود)` })
      return
    }
    if (opts.min !== undefined && n < opts.min) {
      ctx.addIssue({ code: 'custom', message: `${label} باید حداقل ${opts.min} باشد` })
    }
    if (opts.max !== undefined && n > opts.max) {
      ctx.addIssue({ code: 'custom', message: `${label} حداکثر ${opts.max} می‌تواند باشد` })
    }
  })
}

/**
 * عدد فارسی‌پذیر اختیاری — خالی مجاز (پس از parse → 0/undefined)؛
 * اگر چیزی نوشته شده باشد باید عدد معتبر و نامنفی باشد.
 */
export function faOptionalNumber(label: string) {
  return z.string().superRefine((v, ctx) => {
    if (!v.trim()) return // خالی = اختیاری
    const n = parseNumericInput(v)
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: `${label} عدد معتبر نیست (ارقام فارسی و جداکننده ٫ پشتیبانی می‌شود)` })
      return
    }
    if (n < 0) {
      ctx.addIssue({ code: 'custom', message: `${label} نمی‌تواند منفی باشد` })
    }
  })
}

/** انتخاب الزامی (کدام Select مقدار id می‌دهد) — پیام با الگوی سرور */
export function faChoice(label: string) {
  return z.string().min(1, `${label} را انتخاب کنید`)
}

/** تاریخ جلالی اختیاری — قالب دیت‌پیکر «YYYY/MM/DD» (ارقام فارسی هم قبول) */
export function faJalaliDate(label: string) {
  return z.string().superRefine((v, ctx) => {
    if (!v.trim()) return // خالی = اختیاری
    if (!parseJalaliInput(v)) {
      ctx.addIssue({ code: 'custom', message: `${label} نامعتبر است (نمونه درست: ۱۴۰۵/۰۶/۰۵)` })
    }
  })
}

/** تاریخ جلالی الزامی */
export function faJalaliDateRequired(label: string) {
  return z.string().superRefine((v, ctx) => {
    if (!v.trim()) {
      ctx.addIssue({ code: 'custom', message: `${label} الزامی است` })
      return
    }
    if (!parseJalaliInput(v)) {
      ctx.addIssue({ code: 'custom', message: `${label} نامعتبر است (نمونه درست: ۱۴۰۵/۰۶/۰۵)` })
    }
  })
}

/** تبدیل مقدار اعتبارسنجی‌شده فیلد عددی به number (بعد از parse موفق) */
export function numberValue(v: string): number {
  return parseNumericInput(v) ?? 0
}
