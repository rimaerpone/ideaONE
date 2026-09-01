import { NextRequest, NextResponse } from 'next/server'
import { jsonError } from '@/core/shared/server-helpers'
import { login } from '@/core/auth/auth'

export const dynamic = 'force-dynamic'

// استخراج IP کلاینت برای محدودسازی نرخ (P0-T20) — پشت گیت‌وی Caddy، x-forwarded-for ملاک است
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]?.trim() || 'local'
  return req.headers.get('x-real-ip') ?? 'local'
}

// POST — ورود با نشست scrypt + کوکی httpOnly (منطق در core/auth؛ نرخ و لاگ ناموفق: P0-T20/T21؛
// متادیتای دستگاه نشست + تشخیص دستگاه جدید: P1-T8/T19)
export async function POST(req: NextRequest) {
  const { username, password } = await req.json().catch(() => ({ username: '', password: '' }))
  const res = await login(username, password, clientIp(req), req.headers.get('user-agent') ?? '')
  // توکن نشست در بدنه پاسخ — پشتیبان کوکی در بافت‌های تعبیه‌شده (iframe پیش‌نمایش)
  if (res.ok) return NextResponse.json({ ok: true, token: res.data?.token })
  const headers = res.status === 429 ? { 'Retry-After': '60' } : undefined
  return jsonError(res.error, res.status, headers)
}
