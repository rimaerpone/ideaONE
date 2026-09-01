import 'server-only'
import { db } from '@/core/shared/db'

/**
 * محدودسازی نرخ تلاش ورود (P0-T20 → P0.5-T3 بازنویسی)
 * پنجره لغزان ۶۰ثانیه‌ای: حداکثر ۵ تلاش ناموفق به تفکیک username+IP.
 * تلاش ششم → ۴۲۹ فارسی + Retry-After. ورود موفق، ردیف‌های همان کلید را پاک می‌کند.
 *
 * P0.5-T3 — ماندگار در DB (جدول LoginAttempt):
 *  - قبلاً در حافظه بود؛ ری‌استارت سرویس پنجره حمله را ریست می‌کرد.
 *  - اکنون همهٔ نمونه‌های سرویس (چند-پروسه/چند-سرور) شمارندهٔ واحدی در
 *    پایگاه داده می‌بینند؛ محدودیت پس از ریست سرویس پابرجا است.
 *  - هزینه: یک COUNT با ایندکس (username, ip, at) در مسیر ورود — نه مسیر داغ.
 *  - تاب‌آوری: اگر شمارش ناموفق باشد (قطعی DB)، محدودیت «باز» می‌ماند؛
 *    پرس‌وجوی کاربر بلافاصله بعد از آن به همان DB می‌رود و کل ورود fail می‌شود،
 *    پس باز بودنِ شرطی عملاً قابل سوءاستفاده نیست (login با DB قطع اصلاً ممکن نیست).
 *  - بهداشت: پاک‌سازی ردیف‌های کهنه‌تر از ۲۴ ساعت، حداکثر یک‌بار در ۱۰ دقیقه
 *    (گلوگاه globalThis — در dev/HMR چند بوت دوباره‌سازی نمی‌شود).
 */

const WINDOW_MS = 60_000
const MAX_FAILURES = 5
const RETENTION_MS = 24 * 3600_000 // جرم‌یابی امنیتی: سجل ۲۴ ساعته
const HYGIENE_INTERVAL_MS = 10 * 60_000

export type LoginRateVerdict = {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

/** گلوگاه زمانی پاک‌سازی دوره‌ای — مشترک بین HMR/بوت‌های چندباره */
const g = globalThis as { __ideaoneLoginAttemptSweep?: number }

function key(username: string, ip: string): { username: string; ip: string } {
  return { username: username.trim().toLowerCase(), ip }
}

/** آیا این username+IP اجازه تلاش دارد؟ (فقط خواندن — ردیفی نمی‌نویسد) */
export async function checkLoginAllowed(username: string, ip: string): Promise<LoginRateVerdict> {
  const now = Date.now()
  const since = new Date(now - WINDOW_MS)
  const k = key(username, ip)
  try {
    const [failures, oldest] = await Promise.all([
      db.loginAttempt.count({ where: { ...k, at: { gte: since } } }),
      db.loginAttempt.findFirst({
        where: { ...k, at: { gte: since } },
        orderBy: { at: 'asc' },
        select: { at: true },
      }),
    ])
    if (failures < MAX_FAILURES) {
      return { allowed: true, remaining: MAX_FAILURES - failures, retryAfterSec: 0 }
    }
    // مهلت از قدیمی‌ترین تلاشِ داخل پنجره — پنجره دقیقاً بعدش باز می‌شود
    const oldestMs = oldest ? oldest.at.getTime() : now
    const retryAfterSec = Math.max(1, Math.ceil((oldestMs + WINDOW_MS - now) / 1000))
    return { allowed: false, remaining: 0, retryAfterSec }
  } catch {
    // قطعی DB: باز بگذار — پرس‌وجوی کاربرِ بعدی به همان DB می‌رود و کل ورود fail می‌شود
    return { allowed: true, remaining: MAX_FAILURES, retryAfterSec: 0 }
  }
}

/** ثبت یک تلاش ناموفق (فقط پس از رد شدن اعتبارسنجی واقعی صدا شود) */
export async function recordLoginFailure(username: string, ip: string): Promise<void> {
  const k = key(username, ip)
  try {
    await db.loginAttempt.create({ data: k })
  } catch {
    // ثبت ناموفق نباید پاسخ ۴۰۱ را عوض کند — سجل LOGIN_FAILED در audit هست
    return
  }
  // پاک‌سازی دوره‌ای ردیف‌های کهنه (گلوگاه‌دار — نه در هر فراخوانی)
  const lastSweep = g.__ideaoneLoginAttemptSweep ?? 0
  if (Date.now() - lastSweep > HYGIENE_INTERVAL_MS) {
    g.__ideaoneLoginAttemptSweep = Date.now()
    try {
      await db.loginAttempt.deleteMany({ where: { at: { lt: new Date(Date.now() - RETENTION_MS) } } })
    } catch {
      // پاک‌سازی فرصت‌طلبانه است — خطا در جلسهٔ بعدی دوباره امتحان می‌شود
    }
  }
}

/** پاک‌سازی شمارنده پس از ورود موفق (کلید همان username+IP) */
export async function clearLoginFailures(username: string, ip: string): Promise<void> {
  try {
    await db.loginAttempt.deleteMany({ where: key(username, ip) })
  } catch {
    // اگر پاک‌سازی نشود، حداکثر یک ۴۲۹ زودهنگام ممکن است — بدترین حالت
  }
}

/** پیکربندی فعلی — برای نمایش در تب امنیت (P0-T22) */
export const LOGIN_RATE_LIMIT_DESC =
  'حداکثر ۵ تلاش ناموفق در دقیقه به تفکیک نام کاربری + نشانی IP — ماندگار در پایگاه داده (پس از ری‌استارت سرویس هم برقرار)'
