/**
 * نرمال‌سازی عددی ورودی کاربر (P1-T16 — ماتریس SC-007)
 *
 * کاربر فارسی‌زبان ممکن است هر ترکیبی از این‌ها را تایپ کند:
 *  - ارقام فارسی (۰-۹) و عربی (٠-٩)
 *  - جداکننده اعشار فارسی «٫» و ممیز «/»
 *  - جداکننده هزارگان فارسی «٬»، ویرگول «,» و فاصله (نیم‌فاصله هم)
 *  - علامت منفی فارسی «−» (U+2212)، خط تیره و منفی استاندارد
 *
 * خروجی: عدد جاوااسکریپت یا null وقتی ورودی عدد نیست.
 * دوطرفه است (فرم کلاینت + اعتبارسنجی سرور) — همانند jalali.ts بدون server-only.
 */

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/** تبدیل یک کاراکتر رقم فارسی/عربی به رقم لاتین */
function digitToLatin(ch: string): string {
  const fa = FA_DIGITS.indexOf(ch)
  if (fa >= 0) return String(fa)
  const ar = AR_DIGITS.indexOf(ch)
  if (ar >= 0) return String(ar)
  return ch
}

/** تبدیل همه ارقام فارسی/عربی یک رشته به لاتین (موتور کدگذاری — ورودی کد کاربر) */
export function digitsToLatin(input: string): string {
  return [...input].map(digitToLatin).join('')
}

/**
 * نرمال‌سازی رشته عددی به رشته لاتین تمیز (فقط ارقام، حداکثر یک ممیز، علامت منفی سمت آغاز).
 * خروجی null یعنی «عدد نیست».
 */
export function normalizeNumericString(input: string): string | null {
  if (typeof input !== 'string') return null
  // حذف فاصله‌های معمولی، نیم‌فاصله، ZWNJ و جداکننده‌های هزارگان
  const cleaned = input
    .replace(/[\s\u200c\u00a0]/g, '')
    .replace(/[\u066c,]/g, '') // ٬ (جداکننده هزارگان فارسی/عربی) و ,
    .replace(/[\u2212\u2010\u2011\u2013]/g, '-') // منفی‌های یونیکد → خط تیره استاندارد
    .replace(/[\u066b/]/g, '.') // ٫ (اعشار فارسی/عربی) و ممیز → نقطه
    .split('')
    .map(digitToLatin)
    .join('')

  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  // فقط «ارقام با حداکثر یک ممیز و منفی اختیاری در آغاز» مجاز است
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null
  // یک ممیز بیش از حد یا ممیز پایانی بدون رقم
  if ((cleaned.match(/\./g) ?? []).length > 1) return null
  if (cleaned.endsWith('.') || cleaned.startsWith('-.')) return null
  return cleaned
}

/**
 * تجزیه عدد ورودی کاربر — هر ترکیب ارقام فارسی/عربی/لاتین با جداکننده‌های ایرانی.
 * @returns عدد یا null (ورودی عدد نیست / خالی است)
 */
export function parseNumericInput(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  const s = normalizeNumericString(input)
  if (s === null) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * نرمال‌سازی متن فارسی برای جستجو (P1-T1 — جستجوی سراسری DataGrid).
 *
 * «۱۲۳» و «123»، «کتاب» و «كتاب» (ک عربی)، نیم‌فاصله/فاصله و حروف اول‌واژه
 * یکسان در نظر گرفته می‌شوند تا جستجوی کاربر فارسی‌زبان بدون دقت به صفحه‌کلید پاس بدهد.
 */
export function normalizeFaText(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[ك]/g, 'ک')
    .replace(/[ي]/g, 'ی')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ؤ]/g, 'و')
    .replace(/[\u200c\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * توکن‌های جستجوی فارسی (P2-T5 — جستجوی تمام‌متن نرمال‌شده) — دوطرفه (سرور MATCH + هایلایت کلاینت).
 *
 * ورودی نرمال‌شده → شکستن روی هر جداکننده غیر الفبایی/رقمی (هم‌معنای توکنایزر unicode61 خود FTS5:
 * ZWNJ با normalizeFaText از قبل فاصله شده — «می‌شود» = دو واژه) → حذف واژه‌های تک‌نویسه
 * (پرسر و صدا؛ پرس‌وجوی تک‌نویسه با عقب‌گرد contains پاس داده می‌شود).
 * خروجی: توکن‌های کوچک‌حرفه با ارقام لاتین — ارقام «دقیق» و حروف «پیشوند» در MATCH ساخته می‌شوند.
 */
export function faSearchTokens(input: string): string[] {
  const norm = normalizeFaText(input)
  if (!norm) return []
  return norm
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2)
}
