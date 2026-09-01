import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { listPlatformGovernance, toggleFeatureFlag } from '@/modules/platform/service'

export const dynamic = 'force-dynamic'

// GET — حاکمیت بستر: فلگ‌ها، کانکتورهای یکپارچه‌سازی، کاتالوگ گزارش‌ها، وضعیت زمان‌بند، مصرف AI
export async function GET() {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const res = await listPlatformGovernance(r.ctx)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}

// PATCH — تغییر پرچم ویژگی (فقط مدیر) — بدنه: { key, enabled }
export async function PATCH(req: NextRequest) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const res = await toggleFeatureFlag(r.ctx, await req.json())
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
