import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { updateWarehouse } from '@/modules/warehouse/warehouses-admin'

export const dynamic = 'force-dynamic'

// PATCH — ویرایش انبار: نام/kind/غیرفعال (P1-T5) — کد تغییرناپذیر (کلید اسناد)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return jsonError('بدنه درخواست نامعتبر است', 400)
  const res = await updateWarehouse(r.ctx, id, body)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
