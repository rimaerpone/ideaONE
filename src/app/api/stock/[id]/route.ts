import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { getStockCard } from '@/modules/warehouse/service'

export const dynamic = 'force-dynamic'

// GET — کارت حساب کالا (P3-T1/T3): شناسه قلم موجودی + گردش کامل واریانت روی انبار
// پارامترهای اختیاری بازه: from/to (جلالی YYYY/MM/DD — ارقام فارسی پذیرفته می‌شوند)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireModule('warehouse-inventory')
  if (!r.ok) return r.res
  const { id } = await params
  const sp = req.nextUrl.searchParams
  const res = await getStockCard(r.ctx, id, {
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
  })
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
