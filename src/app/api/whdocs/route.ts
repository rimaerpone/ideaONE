import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { parseListQuery, type ParsedListQuery } from '@/core/shared/list-query'
import { createWhDoc, listWhDocs, exportWhDocsCsv } from '@/modules/warehouse/service'
import type { SessionContext } from '@/core/auth/auth'

export const dynamic = 'force-dynamic'

const LIST_OPTIONS = {
  filters: ['type', 'status', 'warehouseId'],
  sort: { date: 'docDate', number: 'docNumber', type: 'type', status: 'status', partner: 'partnerName' },
  defaultSort: ['docDate', 'desc'] as [string, 'asc' | 'desc'],
}

/** پاسخ CSV — text/csv با BOM (اکسل فارسی) + متادیتای سطر در هدر (P2.5-U6) */
async function csvResponse(ctx: SessionContext, lq: ParsedListQuery) {
  const res = await exportWhDocsCsv(ctx, lq)
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

// GET — اسناد انبار دامنه دید (قرارداد استاندارد P1-T3: q/type/status/warehouseId/sort/page/pageSize)
// P2.5-U6: ?format=csv → خروجی اکسل با همان فیلترهای فعال (بدون صفحه‌بندی، سقف ۵٬۰۰۰)
export async function GET(req: NextRequest) {
  const r = await requireModule('warehouse-inventory')
  if (!r.ok) return r.res
  const lq = parseListQuery(req.nextUrl.searchParams, LIST_OPTIONS)
  if (req.nextUrl.searchParams.get('format') === 'csv') return csvResponse(r.ctx, lq)
  const res = await listWhDocs(r.ctx, lq)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}

// POST — ثبت سند انبار (پیش‌نویس یا قطعی)
export async function POST(req: NextRequest) {
  const r = await requireModule('warehouse-inventory')
  if (!r.ok) return r.res
  const res = await createWhDoc(r.ctx, await req.json())
  return res.ok ? NextResponse.json({ ok: true, ...res.data }) : jsonError(res.error, res.status)
}
