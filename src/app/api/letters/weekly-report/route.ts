import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { buildCartableWeeklyReport } from '@/modules/office-automation/service'

export const dynamic = 'force-dynamic'

/** پاسخ Markdown — نام فایل ASCII (هدر Latin-1 است؛ رقم جلالی مجاز نیست) */
function mdResponse(markdown: string, fromISO: string): NextResponse {
  return new NextResponse(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="cartable-weekly-${fromISO.slice(0, 10)}.md"`,
    },
  })
}

// GET — P2-T13 گزارش هفتگی کارتابل (فقط مدیر): خلاصه ورود/اقدام/معطل به‌ازای کاربر
// پارامترها: from/to (جلالی، پیش‌فرض شنبه جاری تا الان) · staleDays (پیش‌فرض ۳) · preset (this/last) · ?format=md
export async function GET(req: NextRequest) {
  const r = await requireModule('office-automation')
  if (!r.ok) return r.res
  const sp = req.nextUrl.searchParams
  const res = await buildCartableWeeklyReport(r.ctx, {
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    staleDays: sp.get('staleDays') ?? undefined,
    preset: sp.get('preset') ?? undefined,
  })
  if (!res.ok) return jsonError(res.error, res.status)
  if (sp.get('format') === 'md') return mdResponse(res.data.markdown, res.data.from)
  return NextResponse.json(res.data)
}
