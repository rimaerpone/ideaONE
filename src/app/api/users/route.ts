import { NextResponse } from 'next/server'
import { requireCtx } from '@/core/shared/server-helpers'
import { listUsers } from '@/modules/platform/service'
import { createUser } from '@/modules/platform/users'

export const dynamic = 'force-dynamic'

// GET — کاربران دامنه دید (برای انتخاب گیرنده ارجاع و فهرست تنظیمات)
export async function GET() {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const res = await listUsers(r.ctx)
  return res.ok ? NextResponse.json(res.data) : NextResponse.json({ error: res.error }, { status: res.status ?? 400 })
}

// POST — ایجاد کاربر + ماتریس عضویت (P1-T4 — فقط مدیر پلتفرم/ADMIN شرکت)
export async function POST(req: Request) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بدنه درخواست نامعتبر است' }, { status: 400 })
  const res = await createUser(r.ctx, body)
  return res.ok
    ? NextResponse.json(res.data, { status: 201 })
    : NextResponse.json({ error: res.error }, { status: res.status ?? 400 })
}
