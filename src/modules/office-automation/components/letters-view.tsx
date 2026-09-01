'use client'

/**
 * نمای دبیرخانه — مهاجرت‌یافته به P1-T1/T2/T3/T12 + پوسته چندسندی P1.5:
 *  - فهرست: DataGrid سازمانی در حالت سرور (جستجو + مرتب‌سازی + صفحه‌بندی همه در سرور)
 *  - داده: TanStack Query — keepPreviousData بدون پرش؛ شمارنده «از N» از total سرور
 *  - ناوبری: کلیک ردیف = تبِ رکورد نامه؛ «ثبت نامه جدید» = تب فرم (دیالوگ‌ها حذف شدند)
 *  - P2.5-U2 — انتخاب گروهی + بایگانی گروهی: ستون چک‌باکس (فقط برای نقش‌های نویسنده)
 *    آینه گارد سروری: انتخاب‌پذیر = در کارتابل من یا پیش‌نویس، و نه بایگانی‌شده.
 *  - P2.5-U4 — پیش‌نمایش کنار فهرست (Master-Detail): در دسکتاپ کلیک ردیف =
 *    پیش‌نمایش پنل کناری (نه تب جدید — Fiori FCL)؛ «باز کردن کامل» = تب رکورد.
 *    در موبایل رفتار قبلی (کلیک = تب رکورد) می‌ماند. پنل فقط-خواندنی است.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLettersQuery, type LetterBox, type ListSort } from '@/modules/office-automation/queries'
import type { LetterListItem } from '@/types/platform'
import { PageHeader, LETTER_TYPE_LABELS, StatusBadge } from '@/components/common/ui-bits'
import { DataGrid, type DataGridColumn } from '@/components/common/data-grid'
import { usePreviewPanel } from '@/components/common/preview-panel'
import { FclRecordPane } from '@/components/shell/fcl-record-pane'
import { LetterPreviewBadges, LetterPreviewContent } from '@/modules/office-automation/components/letter-preview'
import { BulkActionBar, toastBulkResult, type BulkResultItem } from '@/components/common/bulk-action-bar'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { QK_PREFIX } from '@/core/query/keys'
import { useWorkspace } from '@/store/workspace'
import { useIsDesktop } from '@/hooks/use-media-query'
import { useCanWrite } from '@/hooks/use-can-write'
import { apiPost } from '@/core/shared/api-client'
import { toastErr } from '@/hooks/use-toast'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Archive, Download, Plus, Sparkles } from 'lucide-react'
import { faNumber, formatJalali } from '@/core/shared/jalali'
import { useCsvExport } from '@/hooks/use-csv-export'
import { HighlightFa } from '@/components/common/highlight-fa'

export function LettersView() {
  const openRecord = useWorkspace((s) => s.openRecord)
  const openNew = useWorkspace((s) => s.openNew)
  const queryClient = useQueryClient()
  const [box, setBox] = useState<LetterBox>('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0) // ۰-مبنا (قرارداد DataGrid)
  const [pageSize, setPageSize] = useState(15)
  const [sort, setSort] = useState<ListSort>({ field: 'createdAt', dir: 'desc' })
  const canWrite = useCanWrite() // P1-T18 — VIEWER دکمه ثبت نمی‌بیند (گارد سرور هم هست)

  // P2.5-U4 — پیش‌نمایش Master-Detail: انتخاب رکورد + پنل ماندگار (pv:letters)
  const isDesktop = useIsDesktop()
  const panel = usePreviewPanel('letters')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const openPreview = useCallback((l: LetterListItem) => {
    setPreviewId(l.id)
    panel.setOpen(true)
  }, [panel])

  // P2.5-U2 — انتخاب گروهی (مالکیت state نزد نما؛ DataGrid فقط رندر می‌کند)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pendingArchive, setPendingArchive] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const { data, isLoading } = useLettersQuery({ box, q, page: page + 1, pageSize, sort })
  const letters = data?.items ?? []
  // P2.5-U7 / P2-T20 — خروجی اکسل نامه‌ها با همان جعبه/جستجو/مرتب‌سازی فعال
  const csv = useCsvExport()

  // آینه گارد سروری actOnLetter: دارنده فعلی من یا پیش‌نویس؛ و بایگانی‌شده دوباره نمی‌شود
  const isRowSelectable = useCallback(
    (l: LetterListItem) => (l.isMine || l.status === 'DRAFT') && l.status !== 'ARCHIVED',
    [],
  )

  // هرز‌سازی انتخاب‌ها به سطرهای نمایان — «N مورد انتخاب شد» همیشه قابل تطبیق با صفحه است
  const pageKey = useMemo(() => letters.map((l) => l.id).join(','), [letters])
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.length === 0) return prev
      const ids = new Set(pageKey ? pageKey.split(',') : [])
      const kept = prev.filter((id) => ids.has(id))
      return kept.length === prev.length ? prev : kept
    })
  }, [pageKey])

  const runBulkArchive = async () => {
    setBulkBusy(true)
    try {
      const res = await apiPost<{ affected: number; results: BulkResultItem[] }>('/api/letters/bulk', {
        action: 'ARCHIVE',
        ids: selectedIds,
      })
      toastBulkResult({
        affected: res.affected,
        results: res.results,
        unit: 'نامه',
        actionTitle: 'بایگانی گروهی',
        doneVerb: 'بایگانی شد',
      })
      setSelectedIds([])
      setPendingArchive(false)
      void queryClient.invalidateQueries({ queryKey: QK_PREFIX.letters })
      void queryClient.invalidateQueries({ queryKey: QK_PREFIX.dashboard })
    } catch (e) {
      toastErr({ description: e instanceof Error ? e.message : 'اقدام گروهی ناموفق بود' })
    } finally {
      setBulkBusy(false)
    }
  }

  // P2-T5 — هایلایت واژه‌های جستجو در ستون موضوع/طرف — q در وابستگی‌ها (columns با جستجو بازساخته می‌شود)
  const columns = useMemo<DataGridColumn<LetterListItem>[]>(() => [
    {
      key: 'type', header: 'نوع', align: 'center', serverSortKey: 'type',
      cell: (l) => <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{LETTER_TYPE_LABELS[l.type]}</span>,
      sortValue: (l) => l.type,
    },
    { key: 'status', header: 'وضعیت', align: 'center', serverSortKey: 'status', cell: (l) => <StatusBadge status={l.status} />, sortValue: (l) => l.status },
    {
      key: 'subject', header: 'موضوع', enableHiding: false, serverSortKey: 'subject',
      cell: (l) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-6"><HighlightFa text={l.subject} query={q} /></p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {l.urgency === 'URGENT' ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">فوری</span> : null}
            {l.confidentiality !== 'NORMAL' ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">محرمانه</span> : null}
            {l.aiCategory ? (
              <span className="flex items-center gap-1 text-[11px] text-primary">
                <Sparkles className="h-3 w-3" /> {l.aiCategory}
              </span>
            ) : null}
          </div>
        </div>
      ),
      sortValue: (l) => l.subject,
    },
    {
      key: 'party', header: 'فرستنده / گیرنده',
      cell: (l) => {
        const label = l.type === 'INCOMING' ? `از: ${l.senderTitle ?? '—'}` : l.type === 'OUTGOING' ? `به: ${l.receiverTitle ?? '—'}` : `ثبت: ${l.creatorName}`
        return <span className="text-xs text-muted-foreground"><HighlightFa text={label} query={q} /></span>
      },
      sortValue: (l) => l.senderTitle ?? l.receiverTitle ?? l.creatorName ?? '',
    },
    { key: 'holder', header: 'دارنده فعلی', hideOnMobile: true, cell: (l) => <span className="text-xs text-muted-foreground">{l.holderName ?? '—'}</span>, sortValue: (l) => l.holderName ?? '' },
    { key: 'company', header: 'شرکت', align: 'center', hideOnMobile: true, cell: (l) => <span className="text-[11px] text-muted-foreground">{l.companyName ?? '—'}</span>, sortValue: (l) => l.companyName ?? '' },
    { key: 'createdAt', header: 'تاریخ ثبت', align: 'start', serverSortKey: 'createdAt', cell: (l) => <span className="text-[11px] text-muted-foreground">{formatJalali(l.createdAt)}</span>, sortValue: (l) => new Date(l.createdAt).getTime() },
  ], [q])

  return (
    <div className="space-y-5">
      <PageHeader
        title="اتوماسیون اداری و دبیرخانه"
        description="ثبت نامه وارده/صادره/داخلی با شماره‌گذاری خودکار، ارجاع با تاریخچه کامل و دستیار هوشمند"
        actions={(
          <>
            {canWrite ? (
              <Button size="sm" onClick={() => openNew('letters', 'نامه جدید')} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> ثبت نامه جدید
              </Button>
            ) : null}
            {/* P2.5-U7 — خروجی اکسل نامه‌ها با فیلترهای فعال؛ برای همه نقش‌ها (خواندن — آینه U6) */}
            <Button
              size="sm"
              variant="outline"
              disabled={csv.busy || isLoading}
              onClick={() => void csv.download('/api/letters', () => {
                const p = new URLSearchParams({ sort: `${sort.field}:${sort.dir}` })
                if (box !== 'all') p.set('box', box)
                if (q) p.set('q', q)
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
            rows={letters}
            loading={isLoading}
            persistKey="letters"
            emptyText="نامه‌ای یافت نشد"
            emptyHint="جستجو یا فیلتر جعبه را تغییر دهید؛ برای ثبت اولین نامه، «نامه جدید» را بزنید یا Ctrl+K را فشار دهید."
            onRowClick={(l) => openRecord('letters', l.id, l.subject)}
            preview={{
              selectedId: panel.open ? previewId : null,
              onPreview: openPreview,
              onClose: () => panel.setOpen(false),
              paneOpen: panel.open,
              // U9 — Ctrl+Enter روی ردیف متمرکز = تمام‌صفحه
              onOpenFull: () => {
                const l = letters.find((x) => x.id === previewId)
                if (l) openRecord('letters', l.id, l.subject)
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
            bulkSelection={canWrite ? {
              selectedIds,
              onSelectedIdsChange: setSelectedIds,
              isRowSelectable,
              disabled: bulkBusy,
              rowAriaLabel: (l) => `انتخاب نامه ${l.subject}`,
            } : undefined}
            toolbar={(
              <Tabs value={box} onValueChange={(v) => { setBox(v as LetterBox); setPage(0); setSelectedIds([]) }}>
                <TabsList>
                  <TabsTrigger value="all">همه</TabsTrigger>
                  <TabsTrigger value="inbox">کارتابل من</TabsTrigger>
                  <TabsTrigger value="sent">ثبت‌شده توسط من</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          />
        </div>

        {/* پنل فقط در دسکتاپ — موبایل رفتار تب مستقیم دارد؛
            U9: حالت نیم = همان صفحه رکورد کامل داخل پنل (یک کد، دو قاب) */}
        {isDesktop && panel.open ? (
          <FclRecordPane
            viewKey="letters"
            recordId={previewId}
            title={letters.find((l) => l.id === previewId)?.subject ?? 'پیش‌نمایش نامه'}
            onClose={() => panel.setOpen(false)}
            onOpenFull={() => {
              const l = letters.find((x) => x.id === previewId)
              if (l) openRecord('letters', l.id, l.subject)
            }}
            panel={panel}
          >
            {previewId ? <LetterPreviewContent letterId={previewId} /> : null}
          </FclRecordPane>
        ) : null}
      </div>

      {/* P2.5-U2 — نوار اقدام گروهی شناور */}
      {canWrite && selectedIds.length > 0 ? (
        <BulkActionBar count={selectedIds.length} onClear={() => setSelectedIds([])} busy={bulkBusy}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPendingArchive(true)}
            disabled={bulkBusy}
            className="gap-1.5"
          >
            <Archive className="h-3.5 w-3.5" /> بایگانی گروهی
          </Button>
        </BulkActionBar>
      ) : null}

      <ConfirmDialog
        open={pendingArchive}
        onOpenChange={setPendingArchive}
        title="بایگانی گروهی نامه‌ها"
        description={`${faNumber(selectedIds.length)} نامه انتخاب کرده‌اید؛ با تأیید، همه به حالت «بایگانی» می‌روند، دارنده فعلی‌شان پاک می‌شود و دیگر قابل پاسخ/تأیید نیستند. برای هر نامه یک رکورد حسابرسی ثبت می‌شود. نامه‌هایی که در کارتابل شما نباشند رد می‌شوند و در نتیجه اعلام می‌گردد.`}
        confirmLabel="بایگانی کن"
        busy={bulkBusy}
        onConfirm={() => void runBulkArchive()}
      />
    </div>
  )
}
