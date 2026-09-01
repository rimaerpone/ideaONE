import { NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { listCodeSchemes } from '@/core/coding/coding'

export const dynamic = 'force-dynamic'

// GET — طرحواره‌های کدگذاری فعال دامنه دید (کدساز فرم‌ها؛ همه نقش‌ها می‌خوانند)
export async function GET() {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const res = await listCodeSchemes(r.ctx)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
