import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { bulkDecideRequests } from '@/modules/warehouse/requests'

export const dynamic = 'force-dynamic'

/**
 * POST — تصمیم گروهی روی درخواست‌های کالا (P2.5-U2): { action: 'APPROVE' | 'REJECT', ids: string[] }
 * پاسخ: { affected, results[] } — گارد نقش/وضعیت رکورد‌به‌رکورد در سرویس اعمال می‌شود.
 * نکته مسیریابی: سگمنت استاتیک «bulk» بر داینامیک «[id]» اولویت دارد (Next.js App Router).
 */
export async function POST(req: NextRequest) {
  const r = await requireModule('warehouse-inventory')
  if (!r.ok) return r.res
  const { action, ids } = (await req.json()) as { action?: string; ids?: string[] }
  const res = await bulkDecideRequests(r.ctx, ids, action ?? '')
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
