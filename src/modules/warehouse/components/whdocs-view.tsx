'use client'

/**
 * نمای اسناد انبار — پوسته چندسندی P1.5:
 *  - فهرست: DataGrid در حالت سرور (جستجو + فیلتر نوع + مرتب‌سازی + صفحه‌بندی همه در سرور)
 *  - ناوبری: کلیک ردیف = تبِ صفحه سند (هدر اطلاعاتی + اقلام + اقدامات قطعی/ابطال)
 *  - فرم ثبت سند چندقلمی = صفحه مستقل (whdoc-page) با هدر اطلاعات و جمع زنده
 *  - P2.5-U4 — پیش‌نمایش کنار فهرست (Master-Detail): در دسکتاپ کلیک ردیف =
 *    پنل کناری فقط-خواندنی؛ «باز کردن کامل» = تب رکورد. موبایل = رفتار قبلی.
 * دیالوگ‌های جزئیات و فرم حذف شدند (بازخورد کاربر: پاپ‌آپ جای نمایش اطلاعات نیست).
 */
import { useMemo, useState } from 'react'
import { useApp } from '@/store/app'
import { useCanWrite } from '@/hooks/use-can-write'
import { useWhDocsQuery, type ListSort } from '@/modules/warehouse/queries'
import { useWorkspace } from '@/store/workspace'
import { useIsDesktop } from '@/hooks/use-media-query'
import { usePreviewPanel } from '@/components/common/preview-panel'
import type { WhDoc } from '@/types/platform'
import { PageHeader, DOC_TYPE_LABELS, StatusBadge } from '@/components/common/ui-bits'
import { DataGrid, type DataGridColumn } from '@/components/common/data-grid'
import { FclRecordPane } from '@/components/shell/fcl-record-pane'
import { WhDocPreviewContent } from '@/modules/warehouse/components/whdoc-preview'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Download } from 'lucide-react'
import { useCsvExport } from '@/hooks/use-csv-export'
import { formatJalali, faDigits } from '@/core/shared/jalali'
import { cn } from '@/lib/utils'

export function WhDocsView() {
  const me = useApp((s) => s.me)
  const activeCompany = me?.companies.find((c) => c.id === me.activeCompanyId)
  const isGroup = activeCompany?.type === 'GROUP'
  const canWrite = useCanWrite() // P1-T18 — VIEWER دکمه ثبت نمی‌بیند (گارد سرور هم هست)
  const openRecord = useWorkspace((s) => s.openRecord)
  const openNew = useWorkspace((s) => s.openNew)
  // P1-T12 — فهرست سروری: جستجو/فیلتر نوع/مرتب‌سازی/صفحه همه به سرور می‌روند
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(15)
  const [sort, setSort] = useState<ListSort>({ field: 'date', dir: 'desc' })
  const { data, isLoading } = useWhDocsQuery({ q, type: filter, page: page + 1, pageSize, sort })
  // P2.5-U6 — خروجی CSV با همان فیلتر/جستجو/مرتب‌سازی فعال
  const csv = useCsvExport()

  // P2.5-U4 — پیش‌نمایش Master-Detail (pv:whdocs)
  const isDesktop = useIsDesktop()
  const panel = usePreviewPanel('whdocs')
  const [previewId, setPreviewId] = useState<string | null>(null)

  const docs = data?.items ?? []

  const columns = useMemo<DataGridColumn<WhDoc>[]>(() => [
    {
      key: 'doc', header: 'سند', enableHiding: false, serverSortKey: 'number',
      cell: (d) => <Badge className="border-0 bg-primary/10 text-primary">{DOC_TYPE_LABELS[d.type]} · {faDigits(d.docNumber)}</Badge>,
      sortValue: (d) => d.docNumber,
    },
    { key: 'status', header: 'وضعیت', align: 'center', serverSortKey: 'status', cell: (d) => <StatusBadge status={d.status} />, sortValue: (d) => d.status },
    { key: 'partner', header: 'طرف حساب', serverSortKey: 'partner', cell: (d) => <span className="text-xs text-muted-foreground">{d.partnerName ?? '—'}</span>, sortValue: (d) => d.partnerName ?? '' },
    {
      key: 'warehouse', header: 'انبار',
      cell: (d) => <span className="text-xs text-muted-foreground">{d.warehouseName}{d.toWarehouseName ? ` ← ${d.toWarehouseName}` : ''}</span>,
      sortValue: (d) => d.warehouseName,
    },
    { key: 'items', header: 'اقلام', align: 'center', hideOnMobile: true, cell: (d) => <span className="text-[11px] tabular-nums text-muted-foreground">{faDigits(d.items.length)} قلم</span>, sortValue: (d) => d.items.length },
    { key: 'date', header: 'تاریخ سند', align: 'start', serverSortKey: 'date', cell: (d) => <span className="text-[11px] text-muted-foreground">{formatJalali(d.docDate)}</span>, sortValue: (d) => new Date(d.docDate).getTime() },
    { key: 'company', header: 'شرکت', align: 'start', hideOnMobile: true, cell: (d) => <span className="text-[11px] text-muted-foreground">{d.companyCode}</span>, sortValue: (d) => d.companyCode },
  ], [])

  return (
    <div className="space-y-5">
      <PageHeader
        title="اسناد انبار"
        description="رسید، حواله، انتقال و شمارش — سند ابتدا پیش‌نویس است و پس از قطعی‌سازی، موجودی به تفکیک تون/کالیبر/درجه به‌روزرسانی می‌شود"
        actions={(
          <>
            {canWrite ? (
              <Button
                size="sm"
                onClick={() => openNew('whdocs', 'سند جدید')}
                disabled={isGroup}
                className="gap-1.5"
                title={isGroup ? 'برای ثبت سند، به شرکت عملیاتی سوئیچ کنید' : undefined}
              >
                <Plus className="h-3.5 w-3.5" /> سند جدید
              </Button>
            ) : null}
            {/* P2.5-U6 — خروجی اکسل اسناد با فیلترهای فعال؛ برای همه نقش‌ها (خواندن) */}
            <Button
              size="sm"
              variant="outline"
              disabled={csv.busy || isLoading}
              onClick={() => void csv.download('/api/whdocs', () => {
                const p = new URLSearchParams({ sort: `${sort.field}:${sort.dir}` })
                if (q) p.set('q', q)
                if (filter !== 'all') p.set('type', filter)
                return p
              })}
              className="gap-1.5"
              title="خروجی CSV با همان فیلترهای فعال — قابل باز شدن در اکسل"
            >
              <Download className="h-3.5 w-3.5" /> خروجی اکسل
            </Button>
          </>
        )}
      />

      {/* P2.5-U4/U9 — Master-Detail + FCL: جدول راست، پنل چپ (RTL flex-row) */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <DataGrid
            columns={columns}
            rows={docs}
            loading={isLoading}
            persistKey="whdocs"
            emptyText="سندی یافت نشد"
            emptyHint="جستجو را پاک کنید یا نوع سند را تغییر دهید؛ برای ثبت اولین سند، «سند جدید» را بزنید."
            initialSort={[{ id: 'date', desc: true }]}
            onRowClick={(d) => openRecord('whdocs', d.id, `${DOC_TYPE_LABELS[d.type]} ${faDigits(d.docNumber)}`)}
            preview={{
              selectedId: panel.open ? previewId : null,
              onPreview: (d) => { setPreviewId(d.id); panel.setOpen(true) },
              onClose: () => panel.setOpen(false),
              paneOpen: panel.open,
              // U9 — Ctrl+Enter روی ردیف متمرکز = تمام‌صفحه
              onOpenFull: () => {
                const d = docs.find((x) => x.id === previewId)
                if (d) openRecord('whdocs', d.id, `${DOC_TYPE_LABELS[d.type]} ${faDigits(d.docNumber)}`)
              },
            }}
            searchValue={q}
            onSearchChange={(v) => { setQ(v); setPage(0) }}
            serverPagination={{
              pageIndex: page,
              pageSize,
              total: data?.total ?? 0,
              onPageChange: setPage,
              onPageSizeChange: (s) => { setPageSize(s); setPage(0) },
            }}
            serverSort={sort}
            onServerSortChange={(field, dir) => { setSort({ field, dir }); setPage(0) }}
            toolbar={(
              <div className="flex flex-wrap gap-2">
                {['all', 'RECEIPT', 'ISSUE', 'TRANSFER', 'COUNT'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setFilter(t); setPage(0) }}
                    className={cn(
                      'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                      filter === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
                    )}
                  >
                    {t === 'all' ? 'همه اسناد' : DOC_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            )}
          />
        </div>

        {/* پنل فقط در دسکتاپ — موبایل رفتار تب مستقیم دارد؛
            U9: حالت نیم = همان صفحه رکورد کامل داخل پنل (یک کد، دو قاب) */}
        {isDesktop && panel.open ? (
          <FclRecordPane
            viewKey="whdocs"
            recordId={previewId}
            title={(() => {
              const d = docs.find((x) => x.id === previewId)
              return d ? `${DOC_TYPE_LABELS[d.type]} ${faDigits(d.docNumber)}` : 'پیش‌نمایش سند'
            })()}
            onClose={() => panel.setOpen(false)}
            onOpenFull={() => {
              const d = docs.find((x) => x.id === previewId)
              if (d) openRecord('whdocs', d.id, `${DOC_TYPE_LABELS[d.type]} ${faDigits(d.docNumber)}`)
            }}
            panel={panel}
          >
            {previewId ? <WhDocPreviewContent docId={previewId} /> : null}
          </FclRecordPane>
        ) : null}
      </div>
    </div>
  )
}
