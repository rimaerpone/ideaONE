import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { parseListQuery } from '@/core/shared/list-query'
import { listWhFlow } from '@/modules/warehouse/service'

export const dynamic = 'force-dynamic'

// GET — گردش انبار (P3-T2): همه اسناد قطعی‌شده یک انبار در بازه جلالی + جمع ورود/خروج
// قرارداد استاندارد P1-T3: filters=warehouseId(الزامی)/from/to · sort=date|number · page/pageSize
export async function GET(req: NextRequest) {
  const r = await requireModule('warehouse-inventory')
  if (!r.ok) return r.res
  const lq = parseListQuery(req.nextUrl.searchParams, {
    filters: ['warehouseId', 'from', 'to'],
    sort: { date: 'docDate', number: 'docNumber' },
    defaultSort: ['docDate', 'desc'],
  })
  const res = await listWhFlow(r.ctx, lq)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
