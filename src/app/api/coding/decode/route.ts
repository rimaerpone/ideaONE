import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { decodeCode } from '@/core/coding/coding'

export const dynamic = 'force-dynamic'

// GET — رمزگشایی کد: ?code=...&scheme=... (بدون scheme = تشخیص خودکار بین طرحواره‌های فعال)
export async function GET(req: NextRequest) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const code = req.nextUrl.searchParams.get('code') ?? ''
  const scheme = req.nextUrl.searchParams.get('scheme') ?? undefined
  const res = await decodeCode(r.ctx, code, scheme || undefined)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
