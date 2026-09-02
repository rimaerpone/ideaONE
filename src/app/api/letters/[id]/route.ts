import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { getLetter, setLetterRelation } from '@/modules/office-automation/service'

export const dynamic = 'force-dynamic'

// GET — جزئیات نامه با تاریخچه ارجاع + زنجیره عطف (P2-T9)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireModule('office-automation')
  if (!r.ok) return r.res
  const { id } = await params
  const res = await getLetter(r.ctx, id)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}

// PATCH — عطف/حذف عطف نامه (P2-T9 — دوسویه؛ گارد دامنه/حلقه/عمق در سرویس)
// بدنه: { relationLetterId: string | null } — null/خالی = حذف عطف
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireModule('office-automation')
  if (!r.ok) return r.res
  const { id } = await params
  const b = (await req.json().catch(() => ({}))) as { relationLetterId?: string | null }
  const res = await setLetterRelation(r.ctx, id, b.relationLetterId ?? null)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
