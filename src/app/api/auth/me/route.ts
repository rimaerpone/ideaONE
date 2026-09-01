import { NextResponse } from 'next/server'
import { jsonError } from '@/core/shared/server-helpers'
import { getSessionCtx, mePayload } from '@/core/auth/auth'

export const dynamic = 'force-dynamic'

// GET — کاربر جاری + شرکت‌های عضو + شمار اعلان نخوانده
export async function GET() {
  const ctx = await getSessionCtx()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const res = await mePayload(ctx)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
