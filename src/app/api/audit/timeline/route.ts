import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { entityTimeline } from '@/core/audit/audit'

export const dynamic = 'force-dynamic'

// P2.5-U5 (R1) — خط زمان رکورد: GET /api/audit/timeline?entity=<whitelist>&id=<recordId>
// برخلاف GET /api/audit (گزارش کامل حسابرسی — فقط مدیران)، این مسیر برای همه نقش‌هاست:
// خروجی فقط سجل‌های همان رکورد در دامنه دید شرکت کاربر است (گارد داخل سرویس).
// نهاد مجاز: warehouseDoc · goodsRequest · product · partner · warehouse · user · codeScheme
// (نامه عمداً نه — گردش اختصاصی خودش در تب «گردش نامه» است.)
export async function GET(req: NextRequest) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const entity = req.nextUrl.searchParams.get('entity') ?? ''
  const id = req.nextUrl.searchParams.get('id') ?? ''
  const res = await entityTimeline(r.ctx, entity, id)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status ?? 400)
}
