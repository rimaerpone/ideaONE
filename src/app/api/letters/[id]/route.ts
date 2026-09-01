import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { getLetter } from '@/modules/office-automation/service'

export const dynamic = 'force-dynamic'

// GET — جزئیات نامه با تاریخچه ارجاع
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireModule('office-automation')
  if (!r.ok) return r.res
  const { id } = await params
  const res = await getLetter(r.ctx, id)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
