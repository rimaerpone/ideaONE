import { NextRequest, NextResponse } from 'next/server'
import { requireCtx, jsonError } from '@/core/shared/server-helpers'
import { parseListQuery, type ParsedListQuery } from '@/core/shared/list-query'
import { listAudit, exportAuditCsv } from '@/modules/platform/service'
import type { SessionContext } from '@/core/auth/auth'

export const dynamic = 'force-dynamic'

// P1-T15 — گزینه‌های قرارداد فهرست حسابرسی: فیلترهای غنی (اقدام/موجودیت/شرکت/بازه جلالی)
const AUDIT_LIST_OPTIONS = {
  filters: ['action', 'entity', 'companyId', 'from', 'to'],
  sort: { createdAt: 'createdAt', date: 'createdAt' },
  defaultSort: ['createdAt', 'desc'] as [string, 'asc' | 'desc'],
  defaultPageSize: 30, // همسان با اندازه صفحه پیش‌فرض DataGrid تب حسابرسی
}

// پاسخ CSV — text/csv با BOM (اکسل فارسی) + متادیتای سطر در هدر برای بازخورد toast
async function csvResponse(ctx: SessionContext, lq: ParsedListQuery) {
  const res = await exportAuditCsv(ctx, lq)
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

// GET — گزارش حسابرسی + جریان رویدادهای Outbox
// P1-T14: فقط مدیران (isAdmin/ADMIN شرکت فعال) — گارد داخل سرویس
// P1-T15: فیلترهای غنی + خروجی CSV اکسل فارسی (format=csv)
export async function GET(req: NextRequest) {
  const r = await requireCtx()
  if (!r.ok) return r.res
  const lq = parseListQuery(req.nextUrl.searchParams, AUDIT_LIST_OPTIONS)
  if (req.nextUrl.searchParams.get('format') === 'csv') return csvResponse(r.ctx, lq)
  const res = await listAudit(r.ctx, lq)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status ?? 400)
}
