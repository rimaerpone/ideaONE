import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { actOnLetter } from '@/modules/office-automation/service'

export const dynamic = 'force-dynamic'

// POST — اقدام روی نامه: ارجاع (با مهلت اختصاصی گام — P2-T10) / پاسخ / تأیید / بایگانی
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireModule('office-automation')
  if (!r.ok) return r.res
  const { id } = await params
  const { action, toUserId, note, answerText, deadlineAt } = await req.json()
  const res = await actOnLetter(r.ctx, id, { action, toUserId, note, answerText, deadlineAt })
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
