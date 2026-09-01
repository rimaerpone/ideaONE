import { NextRequest, NextResponse } from 'next/server'
import { jsonError } from '@/core/shared/server-helpers'
import { getSessionCtx, switchCompany } from '@/core/auth/auth'

export const dynamic = 'force-dynamic'

// POST — سوییچ شرکت فعال (فقط با عضویت معتبر)
export async function POST(req: NextRequest) {
  const ctx = await getSessionCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { companyId } = await req.json()
  const res = await switchCompany(ctx, companyId)
  return res.ok ? NextResponse.json({ ok: true }) : jsonError(res.error, res.status)
}
