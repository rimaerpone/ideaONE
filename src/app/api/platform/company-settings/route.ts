import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { listCompanySettings, changeCompanySetting } from '@/modules/platform/service'

export const dynamic = 'force-dynamic'

// GET — تنظیمات شرکت فعال (دید درخواست کالا + سقف اعلان) — فقط مدیر
export async function GET() {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const res = await listCompanySettings(r.ctx)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}

// PATCH — تغییر یک تنظیم شرکت — بدنه: { key, value }
export async function PATCH(req: NextRequest) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const res = await changeCompanySetting(r.ctx, await req.json())
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
