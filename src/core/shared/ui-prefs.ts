/**
 * شخصی‌سازی ماندگار UI (P2.5-U3) — ترجیحات نمایشی per کاربر در localStorage.
 *
 * الگوی تثبیت‌شده (هم‌خانواده io.draft.v1 / io.workspace.v1):
 *  - کلید کامل: `io.ui.v1:<userId>:<name>` (نام = «cols:<viewKey>» / «sec:<formKey>» / «pins» / «dashrange»)
 *  - per-user چون ترجیح چیدمان متعلق به شخص است، نه مرورگر (دمو: چند نقش در یک مرورگر)
 *  - بدون ثبت سروری — قرارداد UI عمداً ساده است؛ مهاجرت به «نمای ذخیره‌شده سروری»
 *    (قابل اشتراک بین کاربران) در P6 گزارش/BI ثبت شده — این لایه نباید عوض شود، فقط backing store
 *  - هرگز exception نمی‌پاشد: SSR بی‌صدا skip، JSON خراب = null، حافظه پر = بی‌صدا
 */

const PREFIX = 'io.ui.v1'

function fullKey(userId: string, name: string): string {
  return `${PREFIX}:${userId}:${name}`
}

/** خواندن ترجیح — نبود/خرابی/SSR = null (فراخواننده تصمیم می‌گیرد پیش‌فرض چیست) */
export function readUiPref<T>(userId: string | null | undefined, name: string): T | null {
  if (typeof window === 'undefined' || !userId) return null
  try {
    const raw = window.localStorage.getItem(fullKey(userId, name))
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** نوشتن ترجیح — شکل ذخیره (کووتا/حالت خصوصی) بی‌صدا نادیده گرفته می‌شود */
export function writeUiPref<T>(userId: string | null | undefined, name: string, value: T): void {
  if (typeof window === 'undefined' || !userId) return
  try {
    window.localStorage.setItem(fullKey(userId, name), JSON.stringify(value))
  } catch {
    /* بی‌صدا — شخصی‌سازی اختیاری است، نه مسیر داده */
  }
}

/** حذف ترجیح (بازنشانی) */
export function removeUiPref(userId: string | null | undefined, name: string): void {
  if (typeof window === 'undefined' || !userId) return
  try {
    window.localStorage.removeItem(fullKey(userId, name))
  } catch {
    /* بی‌صدا */
  }
}
