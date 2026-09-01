import { NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { getSecurityOverview } from '@/modules/platform/service'

export const dynamic = 'force-dynamic'

// GET — نمای امنیت بستر (P0-T22): گذرواژه‌های نمایشی، تلاش‌های ورود ناموفق، نشست‌های فعال
export async function GET() {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const res = await getSecurityOverview(r.ctx)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
