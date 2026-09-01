import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { decideWhDoc } from '@/modules/warehouse/service'

export const dynamic = 'force-dynamic'

// POST — قطعی یا ابطال سند انبار
export async function POST(req: NextRequest) {
  const r = await requireModule('warehouse-inventory')
  if (!r.ok) return r.res
  const res = await decideWhDoc(r.ctx, await req.json())
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
