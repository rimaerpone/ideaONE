import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { listWarehouses } from '@/modules/warehouse/service'
import { listWarehousesForAdmin, createWarehouse } from '@/modules/warehouse/warehouses-admin'

export const dynamic = 'force-dynamic'

// GET — انبارهای فعال دامنه دید (فرم‌های سند) · ?all=1 → فهرست کامل مدیریت (P1-T5)
export async function GET(req: NextRequest) {
  const r = await requireModule('warehouse-inventory')
  if (!r.ok) return r.res
  if (req.nextUrl.searchParams.get('all') === '1') {
    const res = await listWarehousesForAdmin(r.ctx)
    return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
  }
  const res = await listWarehouses(r.ctx)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}

// POST — ایجاد انبار (P1-T5 — فقط مدیر پلتفرم/ADMIN شرکت)
export async function POST(req: NextRequest) {
  const r = await requireModule('warehouse-inventory')
  if (!r.ok) return r.res
  const body = await req.json().catch(() => null)
  if (!body) return jsonError('بدنه درخواست نامعتبر است', 400)
  const res = await createWarehouse(r.ctx, body)
  return res.ok ? NextResponse.json(res.data, { status: 201 }) : jsonError(res.error, res.status)
}
