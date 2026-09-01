import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { parseListQuery } from '@/core/shared/list-query'
import { createRequest, decideRequest, listRequests } from '@/modules/warehouse/requests'

export const dynamic = 'force-dynamic'

// GET — درخواست‌های کالا در دامنه دید (قرارداد استاندارد P1-T3: q/status/warehouseId/sort/page/pageSize)
export async function GET(req: NextRequest) {
  const r = await requireModule('warehouse-inventory')
  if (!r.ok) return r.res
  const lq = parseListQuery(req.nextUrl.searchParams, {
    filters: ['status', 'warehouseId'],
    sort: { createdAt: 'createdAt', date: 'createdAt', number: 'reqNumber' },
    defaultSort: ['createdAt', 'desc'],
  })
  const res = await listRequests(r.ctx, lq)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}

// POST — ثبت درخواست کالا جدید
export async function POST(req: NextRequest) {
  const r = await requireModule('warehouse-inventory')
  if (!r.ok) return r.res
  const res = await createRequest(r.ctx, await req.json())
  return res.ok ? NextResponse.json({ ok: true, ...res.data }) : jsonError(res.error, res.status)
}

// PATCH — تصمیم روی درخواست (تأیید/رد/تأمین)
export async function PATCH(req: NextRequest) {
  const r = await requireModule('warehouse-inventory')
  if (!r.ok) return r.res
  const res = await decideRequest(r.ctx, await req.json())
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
