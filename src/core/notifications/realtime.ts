import 'server-only'
import { createHmac } from 'node:crypto'

/**
 * لایه بلادرنگ (Realtime) — سمت سرور
 * ------------------------------------------------------------
 * اتصال به مینی‌سرویس socket.io از طریق API داخلی (127.0.0.1:3004).
 *
 * اصول طراحی (مطابق توصیه معماری ممیزی):
 *  - «فایر اند فورگت»: خرابی سرویس بلادرنگ هرگز پاسخ API اصلی را شکست نمی‌دهد؛
 *    سازوکار polling صفحه (هر ۳۰ ثانیه) همیشه پوشش می‌دهد (at-least-once).
 *  - بلیت‌های امضاشده HMAC برای ثبت‌نام کلاینت در اتاق کاربر — بدون افشای
 *    session cookie (httpOnly) و بدون اعتماد کوری به ادعای سمت کلاینت.
 */

const SECRET = process.env.REALTIME_SECRET || 'ideaone-pilot-rt-secret-2026'
const RT_INTERNAL_URL = process.env.REALTIME_INTERNAL_URL || 'http://127.0.0.1:3004'

// ---------- بلیت ثبت‌نام سوکت ----------
// قالب: `<expiresAtMs>.<hmac>` که hmac = HMAC-SHA256(`${userId}:${expiresAtMs}`)
// کلاینت آن را از /api/realtime/ticket می‌گیرد و هنگام register ارائه می‌دهد.
export function signTicket(userId: string, ttlMs = 60_000): string {
  const exp = Date.now() + ttlMs
  const mac = createHmac('sha256', SECRET).update(`${userId}:${exp}`).digest('hex')
  return `${exp}.${mac}`
}

// ---------- ارسال رویداد به کاربران متصل ----------
// غیرمسدودکننده و بی‌صدا — خطا عمداً بلعیده می‌شود تا زنجیره درخواست اصلی
// (مثلاً ثبت ارجاع نامه) هرگز به‌خاطر خرابی لایه push شکست نخورد.
export async function pushRealtime(
  userIds: string[],
  data: Record<string, unknown>,
  event = 'notification',
): Promise<void> {
  const targets = userIds.filter((u) => typeof u === 'string' && u.length > 0)
  if (targets.length === 0) return
  try {
    await fetch(`${RT_INTERNAL_URL}/emit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-key': SECRET },
      body: JSON.stringify({ userIds: targets, event, data }),
      signal: AbortSignal.timeout(2500),
      cache: 'no-store',
    })
  } catch {
    /* سکوت عمدی — polling پوشش می‌دهد */
  }
}
