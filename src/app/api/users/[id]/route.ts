import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { updateUser } from '@/modules/platform/users'

export const dynamic = 'force-dynamic'

// PATCH — ویرایش کاربر: نام/عنوان/مدیر پلتفرم/فعال/غیرفعال + جایگزینی ماتریس عضویت (P1-T4)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return jsonError('بدنه درخواست نامعتبر است', 400)
  const res = await updateUser(r.ctx, id, body)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
