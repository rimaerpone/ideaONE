import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { bulkArchiveLetters } from '@/modules/office-automation/service'

export const dynamic = 'force-dynamic'

/**
 * POST — اقدام گروهی روی نامه‌ها (P2.5-U2): { action: 'ARCHIVE', ids: string[] }
 * بدنه: { action, ids } — پاسخ: { affected, results[] } (ردِ هر رکورد با دلیل اعلام می‌شود)
 * نکته مسیریابی: سگمنت استاتیک «bulk» بر داینامیک «[id]» اولویت دارد (Next.js App Router).
 */
export async function POST(req: NextRequest) {
  const r = await requireModule('office-automation')
  if (!r.ok) return r.res
  const { action, ids } = (await req.json()) as { action?: string; ids?: string[] }
  if (action !== 'ARCHIVE') return jsonError('عملیات گروهی پشتیبانی نمی‌شود', 400)
  const res = await bulkArchiveLetters(r.ctx, ids)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
