import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { resetUserPassword } from '@/modules/platform/users'

export const dynamic = 'force-dynamic'

// POST — بازنشانی گذرواژه کاربر توسط مدیر (P1-T7) — همه نشست‌های او ابطال می‌شود
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return jsonError('بدنه درخواست نامعتبر است', 400)
  const res = await resetUserPassword(r.ctx, id, body.password)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
