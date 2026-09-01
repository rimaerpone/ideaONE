import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { parseListQuery, type ParsedListQuery } from '@/core/shared/list-query'
import { createLetter, listLetters, exportLettersCsv } from '@/modules/office-automation/service'
import type { SessionContext } from '@/core/auth/auth'

export const dynamic = 'force-dynamic'

const LIST_OPTIONS = {
  filters: ['box', 'type', 'status', 'urgency'],
  sort: { createdAt: 'createdAt', date: 'createdAt', number: 'number', type: 'type', status: 'status', subject: 'subject' },
  defaultSort: ['createdAt', 'desc'] as [string, 'asc' | 'desc'],
}

/** پاسخ CSV — text/csv با BOM (اکسل فارسی) + متادیتای سطر در هدر (P2.5-U7 / P2-T20) */
async function csvResponse(ctx: SessionContext, lq: ParsedListQuery) {
  const res = await exportLettersCsv(ctx, lq)
  if (!res.ok) return jsonError(res.error, res.status)
  return new NextResponse(res.data.csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${res.data.filename}"`,
      'X-Csv-Rows': String(res.data.rows),
      'X-Csv-Capped': res.data.capped ? '1' : '0',
    },
  })
}

// GET — فهرست نامه‌ها (قرارداد استاندارد P1-T3: q/box/type/status/urgency/sort/page/pageSize)
// P2.5-U7: ?format=csv → خروجی اکسل نامه‌ها با همان فیلترهای فعال (بدون صفحه‌بندی، سقف ۵٬۰۰۰)
export async function GET(req: NextRequest) {
  const r = await requireModule('office-automation')
  if (!r.ok) return r.res
  const lq = parseListQuery(req.nextUrl.searchParams, LIST_OPTIONS)
  if (req.nextUrl.searchParams.get('format') === 'csv') return csvResponse(r.ctx, lq)
  const res = await listLetters(r.ctx, lq)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}

// POST — ثبت نامه جدید با شماره‌گذاری خودکار
export async function POST(req: NextRequest) {
  const r = await requireModule('office-automation')
  if (!r.ok) return r.res
  const res = await createLetter(r.ctx, await req.json())
  return res.ok ? NextResponse.json({ ok: true, ...res.data }) : jsonError(res.error, res.status)
}
