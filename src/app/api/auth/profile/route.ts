import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { updateMyProfile } from '@/modules/platform/users'

export const dynamic = 'force-dynamic'

// PATCH — ویرایش پروفایل خود کاربر: نام کامل و عنوان شغلی (P1-T6)
export async function PATCH(req: NextRequest) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const body = await req.json().catch(() => null)
  if (!body) return jsonError('بدنه درخواست نامعتبر است', 400)
  const res = await updateMyProfile(r.ctx, body)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
