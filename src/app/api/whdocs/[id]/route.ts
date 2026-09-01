import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { getWhDoc, updateWhDocItems } from '@/modules/warehouse/service'

export const dynamic = 'force-dynamic'

// GET — جزئیات سند انبار با اقلام (P1.5-T8 — صفحه رکورد)؛ خارج از دامنه دید = 404
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireModule('warehouse-inventory')
  if (!r.ok) return r.res
  const { id } = await params
  const res = await getWhDoc(r.ctx, id)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}

// PATCH — ویرایش اقلام سند DRAFT (P3-T11 — ویرایش درون‌خطی گرید G6)
// بدنه: { items: [{ productId, tone, caliber, grade, qtyM2, note? }] } — تعویض کامل (put semantics)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireModule('warehouse-inventory')
  if (!r.ok) return r.res
  const { id } = await params
  const body = (await req.json()) as { items?: unknown }
  const res = await updateWhDocItems(r.ctx, id, body?.items)
  return res.ok ? NextResponse.json({ ok: true, ...res.data }) : jsonError(res.error, res.status)
}
