import { NextRequest, NextResponse } from 'next/server'

/**
 * P0.5-T3 — گارد CSRF برای همهٔ mutationهای API (پیمان Next 16: proxy.ts)
 *
 * چرا الزامی است: کوکی نشست این سامانه در بستر HTTPS/پیش‌نمایش با
 * SameSite=None صادر می‌شود (ضرورت نمایش تعبیه‌شده/iframe — auth.ts
 * sessionCookieAttrs). SameSite=None یعنی مرورگر «حفاظت CSRF بومی» را
 * خاموش می‌کند و کوکی محیطی همراه هر درخواست cross-site ارسال می‌شود؛
 * پس خودِ سرور باید مبدأ را راستی‌آزمایی کند.
 *
 * قواعد (فقط برای POST/PUT/PATCH/DELETE روی /api/*):
 *  ۱. Sec-Fetch-Site: cross-site → 403 (علامت قطعی مرورگر — درخواست از سایت دیگر)
 *  ۲. Origin: null    → 403 (بافت sandbox شده/مبهم — «null» مبدأ معتبر نیست)
 *  ۳. Origin حاضر و نامعتبر (میزبان ≠ میزبان درخواست) → 403
 *  ۴. Origin حاضر و منطبق → مجاز؛ Sec-Fetch-Site: same-origin/same-site → مجاز
 *  ۵. بدون Origin و بدون Sec-Fetch-Site → مجاز (کلاینت غیرمرورگری — اسکریپت‌ها/
 *     باتری‌های تست/ادغام‌های سرور-به-سرور آینده؛ چنین کلاینتی کوکی محیطی مرورگر
 *     ندارد و CSRF اصلاً دربارهٔ او تعریف نمی‌شود)
 *
 * سازگاری: مرورگر واقعی (golden) از صفحهٔ خودِ سامانه درخواست می‌فرستد →
 * Origin منطبق؛ fetch اسکریپتی بدون Origin → قاعدهٔ ۵.
 *
 * توسعهٔ آینده (P10-Moadian و webhooks): هر callback سرور-به-سرور باید یا
 * هدر Origin نفرستد یا در لیست‌سفید مبدأهای مجاز ثبت شود — در
 * docs/product/05-test-coverage.md یادداشت شده است.
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** پاسخ رد — 403 با پیام فارسی (قانون زبان UI) */
function blocked(reason: string): NextResponse {
  return NextResponse.json(
    { error: `درخواست از مبدأ ناشناخته رد شد (${reason})` },
    { status: 403 },
  )
}

type HostParts = { hostname: string; port: string }

/** تجزیهٔ «میزبان[:پورت]» — پشتیبانی IPv6 براکت‌دار و port ضمنی */
function parseHost(raw: string): HostParts {
  let host = raw.trim().toLowerCase()
  if (!host) return { hostname: '', port: '' }
  let port = ''
  if (host.startsWith('[')) {
    // IPv6: [::1]:3000
    const close = host.indexOf(']')
    const hostname = host.slice(1, close === -1 ? undefined : close)
    if (close !== -1 && host[close + 1] === ':') port = host.slice(close + 2)
    return { hostname, port }
  }
  const colon = host.lastIndexOf(':')
  if (colon !== -1) {
    port = host.slice(colon + 1)
    host = host.slice(0, colon)
  }
  return { hostname: host, port }
}

/**
 * مقایسهٔ مبدأ با میزبان درخواست — پشت گیت‌وی، میزبان بیرونی در
 * x-forwarded-host می‌نشیند (اولین مقدار). پورت فقط وقتی هر دو صریح‌اند
 * مقایسه می‌شود؛ پورت ضمنی (۴۴۳ HTTPS / هدر بدون پورت) همیشه پذیرفته است.
 */
function originMatchesHost(originHost: HostParts, expected: HostParts): boolean {
  if (!originHost.hostname || !expected.hostname) return false
  if (originHost.hostname !== expected.hostname) return false
  if (originHost.port && expected.port && originHost.port !== expected.port) return false
  return true
}

export function proxy(req: NextRequest): NextResponse {
  if (!MUTATING.has(req.method)) return NextResponse.next()

  // ۱) علامت قطعی مرورگر
  const secFetchSite = req.headers.get('sec-fetch-site')
  if (secFetchSite === 'cross-site') return blocked('Sec-Fetch-Site: cross-site')

  // ۲/۳/۴) راستی‌آزمایی Origin
  const origin = req.headers.get('origin')
  if (!origin) return NextResponse.next() // ۵) کلاینت غیرمرورگری — بدون مبدأ
  if (origin.toLowerCase() === 'null') return blocked('Origin: null')

  let originUrl: URL
  try {
    originUrl = new URL(origin)
  } catch {
    return blocked('Origin نامعتبر')
  }
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const expected = parseHost(forwardedHost || req.headers.get('host') || '')
  const originParts: HostParts = { hostname: originUrl.hostname, port: originUrl.port }
  if (!originMatchesHost(originParts, expected)) {
    return blocked(`Origin ${originUrl.host} ≠ میزبان ${forwardedHost || req.headers.get('host')}`)
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
