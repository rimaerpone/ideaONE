import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { listModules, toggleModule } from '@/modules/platform/service'

// GET — رجیستری ماژول‌ها + وضعیت فعال‌سازی برای شرکت فعال
export async function GET() {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const res = await listModules(r.ctx)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}

// PATCH — فعال/غیرفعال‌سازی ماژول (سراسری یا به تفکیک شرکت) — فقط مدیر
export async function PATCH(req: NextRequest) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const res = await toggleModule(r.ctx, await req.json())
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
