import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { issuePalletId } from '@/core/coding/coding'

export const dynamic = 'force-dynamic'

// POST (P0.5-T2) — صدور شناسنامهٔ پالت ۱۴کاراکتری = کد مادر (۱۲ موجود) + ۲ رقم سری
// طبق سند «دستورالعمل کدگذاری محصولات» شرکت — مصرف شمارنده فقط نقش نوشتن (VIEWER 403)
export async function POST(req: NextRequest) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const body = (await req.json()) as { schemeCode?: string; motherCode?: string; parts?: Record<string, string> }
  const res = await issuePalletId(r.ctx, {
    schemeCode: String(body?.schemeCode ?? ''),
    motherCode: typeof body?.motherCode === 'string' ? body.motherCode : undefined,
    parts: body?.parts,
  })
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
