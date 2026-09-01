import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { listMySessions, revokeMySessions } from '@/core/auth/auth'

export const dynamic = 'force-dynamic'

// GET — نشست‌های فعال کاربر با آخرین فعالیت و دستگاه (P1-T8)
export async function GET() {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const res = await listMySessions(r.ctx)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}

// DELETE — پایان نشست‌ها (P1-T8): { exceptCurrent: true } فقط بقیه، false همه دستگاه‌ها
export async function DELETE(req: NextRequest) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const body = await req.json().catch(() => ({ exceptCurrent: true }))
  const res = await revokeMySessions(r.ctx, body.exceptCurrent !== false)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
