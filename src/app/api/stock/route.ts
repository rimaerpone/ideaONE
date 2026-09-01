import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { parseListQuery, type ParsedListQuery } from '@/core/shared/list-query'
import { listStock, exportStockCsv } from '@/modules/warehouse/service'
import type { SessionContext } from '@/core/auth/auth'

export const dynamic = 'force-dynamic'

const LIST_OPTIONS = {
  filters: ['warehouseId', 'productId', 'grade'],
  sort: { updated: 'updatedAt', date: 'updatedAt', qty: 'qtyM2' },
  defaultSort: ['updatedAt', 'desc'] as [string, 'asc' | 'desc'],
}

/** پاسخ CSV — text/csv با BOM (اکسل فارسی) + متادیتای سطر در هدر (P2.5-U6) */
async function csvResponse(ctx: SessionContext, lq: ParsedListQuery) {
  const res = await exportStockCsv(ctx, lq)
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

// GET — موجودی به تفکیک تون/کالیبر/درجه (قرارداد استاندارد P1-T3: q/warehouseId/productId/grade/sort/page/pageSize)
// P2.5-U6: ?format=csv → خروجی اکسل با همان فیلترهای فعال (بدون صفحه‌بندی، سقف ۵٬۰۰۰)
export async function GET(req: NextRequest) {
  const r = await requireModule('warehouse-inventory')
  if (!r.ok) return r.res
  const lq = parseListQuery(req.nextUrl.searchParams, LIST_OPTIONS)
  if (req.nextUrl.searchParams.get('format') === 'csv') return csvResponse(r.ctx, lq)
  const res = await listStock(r.ctx, lq)
  return res.ok ? NextResponse.json(res.data) : NextResponse.json({ error: res.error }, { status: res.status ?? 400 })
}
