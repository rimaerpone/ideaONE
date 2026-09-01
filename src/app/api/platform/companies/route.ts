import { NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { listCompaniesForAdmin } from '@/modules/platform/users'

export const dynamic = 'force-dynamic'

// GET — فهرست همه شرکت‌ها برای ماتریس عضویت کاربر (P1-T4 — فقط مدیر پلتفرم/ADMIN شرکت)
export async function GET() {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const res = await listCompaniesForAdmin(r.ctx)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
