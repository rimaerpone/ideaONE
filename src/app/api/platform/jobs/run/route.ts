import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { runScheduledJob } from '@/modules/platform/service'

export const dynamic = 'force-dynamic'

// POST — اجرای دستی کار زمان‌بند (فقط مدیر) — بدنه: { key } — P2-T11
export async function POST(req: NextRequest) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const res = await runScheduledJob(r.ctx, await req.json())
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
