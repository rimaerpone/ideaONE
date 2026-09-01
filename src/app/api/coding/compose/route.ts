import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { composeCode } from '@/core/coding/coding'

export const dynamic = 'force-dynamic'

// POST — اعتبارسنجی + ترکیب کد از اجزا؛ صدور شمارنده (issueCounters) فقط نقش نوشتن
export async function POST(req: NextRequest) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const body = (await req.json()) as { schemeCode?: string; parts?: Record<string, string>; issueCounters?: string[] }
  const res = await composeCode(r.ctx, {
    schemeCode: String(body?.schemeCode ?? ''),
    parts: body?.parts ?? {},
    issueCounters: body?.issueCounters ?? [],
  })
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
