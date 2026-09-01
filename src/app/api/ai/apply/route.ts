import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { applyLetterAi } from '@/modules/office-automation/service'

export const dynamic = 'force-dynamic'

// POST — اعمال پیشنهاد هوش مصنوعی پس از تأیید انسانی (HITL)
export async function POST(req: NextRequest) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const res = await applyLetterAi(r.ctx, await req.json())
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
