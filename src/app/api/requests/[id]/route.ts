import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { getRequest } from '@/modules/warehouse/requests'

export const dynamic = 'force-dynamic'

// GET — جزئیات درخواست کالا با اقلام (P1.5-T8 — صفحه رکورد)؛ خارج از دامنه دید = 404
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireModule('warehouse-inventory')
  if (!r.ok) return r.res
  const { id } = await params
  const res = await getRequest(r.ctx, id)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
