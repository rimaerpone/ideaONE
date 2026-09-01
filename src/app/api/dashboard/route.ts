import { NextResponse } from 'next/server'
import { requireCtx } from '@/core/shared/server-helpers'
import { getDashboard } from '@/modules/dashboard/service'

export const dynamic = 'force-dynamic'

// GET — داده داشبورد (شاخص‌ها، نمودارها، فعالیت اخیر و سنجه‌های گیت پایلوت)
// ?range=7|30|90 — بازه تحلیلی نمودارهای روندی (P2.5-U3/D7)؛ مقدار خارج لیست = پیش‌فرض ۳۰
export async function GET(req: Request) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const raw = Number(new URL(req.url).searchParams.get('range') ?? '30')
  const range = raw === 7 || raw === 90 ? raw : 30
  const res = await getDashboard(r.ctx, range)
  return res.ok ? NextResponse.json(res.data) : NextResponse.json({ error: res.error }, { status: res.status ?? 400 })
}
