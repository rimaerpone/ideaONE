import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { changeMyPassword } from '@/core/auth/auth'

export const dynamic = 'force-dynamic'

// POST — تغییر گذرواژه توسط خود کاربر (P1-T7): گذرواژه فعلی + سیاست ۸ نویسه +
// ابطال همه نشست‌های دیگر (فقط نشست جاری می‌ماند)
export async function POST(req: NextRequest) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const body = await req.json().catch(() => null)
  if (!body) return jsonError('بدنه درخواست نامعتبر است', 400)
  const res = await changeMyPassword(r.ctx, body.currentPassword, body.newPassword)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
