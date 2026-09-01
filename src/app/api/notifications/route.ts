import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { listNotifications, markNotificationsRead } from '@/modules/platform/service'

export const dynamic = 'force-dynamic'

// GET — اعلان‌های کاربر (۳۰ مورد اخیر + شمار نخوانده)
export async function GET() {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const res = await listNotifications(r.ctx)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}

// POST — علامت‌گذاری خوانده‌شده (یکی یا همه)
export async function POST(req: NextRequest) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const res = await markNotificationsRead(r.ctx, await req.json())
  return res.ok ? NextResponse.json({ ok: true }) : jsonError(res.error, res.status)
}
