import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { suggestLetterAi } from '@/modules/office-automation/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST — دستیار هوشمند نامه (طبقه‌بندی + خلاصه + سطح اولویت)
// خروجی فقط «پیشنهاد» است؛ اعمال آن نیازمند تأیید انسانی (HITL) است.
export async function POST(req: NextRequest) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const { letterId } = await req.json()
  const res = await suggestLetterAi(r.ctx, letterId)
  return res.ok ? NextResponse.json({ ok: true, ...res.data }) : jsonError(res.error, res.status)
}
