'use client'

/**
 * نمای درخواست کالا — پوسته چندسندی P1.5:
 *  - داده: TanStack Query با فهرست سروری (فیلتر وضعیت + صفحه‌بندی «از N»)
 *  - ناوبری: کلیک کارت = تبِ صفحه درخواست (شناسنامه + اقلام + تصمیم‌ها در نوار اقدام)
 *  - فرم ثبت درخواست = صفحه مستقل (request-page) — دیالوگ حذف شد
 *  - P2.5-U2 — انتخاب گروهی روی کارت‌ها (فهرست کارتی طبق SPEC انبار می‌ماند):
 *    فقط مدیران شرکت فعال و فقط درخواست‌های «در انتظار» انتخاب‌پذیرند — آینه گارد
 *    سروری decideRequest؛ نوار اقدام گروهی مشترک با نامه‌ها (BulkActionBar).
 *  - P2.5-U4 — پیش‌نمایش کنار فهرست (Master-Detail): در دسکتاپ کلیک کارت =
 *    پنل کناری فقط-خواندنی؛ «باز کردن کامل» = تب رکورد. موبایل = رفتار قبلی.
 * فهرست کارتی می‌ماند — گردشکار تأیید/رد طبیعت کارت دارد؛ جدول = stock/letters/whdocs
 */
import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useApp } from '@/store/app'
import { useCanWrite } from '@/hooks/use-can-write'
import { useIsDesktop } from '@/hooks/use-media-query'
import { useRequestsQuery } from '@/modules/warehouse/queries'
import { useWorkspace } from '@/store/workspace'
import type { GoodsRequest } from '@/types/platform'
import { PageHeader, LoadingState, EmptyState, StatusBadge } from '@/components/common/ui-bits'
import { usePreviewPanel } from '@/components/common/preview-panel'
import { FclRecordPane } from '@/components/shell/fcl-record-pane'
import { RequestPreviewContent } from '@/modules/warehouse/components/request-preview'
import { BulkActionBar, toastBulkResult, type BulkResultItem } from '@/components/common/bulk-action-bar'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { QK_PREFIX } from '@/core/query/keys'
import { apiPost } from '@/core/shared/api-client'
import { toastErr } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Check, ChevronLeft, ChevronRight, Plus, Sparkles, X } from 'lucide-react'
import { formatJalali, faDigits, faNumber } from '@/core/shared/jalali'
import { cn } from '@/lib/utils'

type BulkAction = 'APPROVE' | 'REJECT'

export function RequestsView() {
  const me = useApp((s) => s.me)
  const activeCompany = me?.companies.find((c) => c.id === me.activeCompanyId)
  const isGroup = activeCompany?.type === 'GROUP'
  const canWrite = useCanWrite() // P1-T18 — VIEWER دکمه ثبت نمی‌بیند (گارد سرور هم هست)
  // آینه گارد سروری decideRequest — تصمیم فقط برای مدیران شرکت فعال
  const canDecide = activeCompany?.role === 'ADMIN' || activeCompany?.role === 'MANAGER'
  const openRecord = useWorkspace((s) => s.openRecord)
  const openNew = useWorkspace((s) => s.openNew)
  const queryClient = useQueryClient()
  // P1-T12 — فهرست سروری: فیلتر وضعیت در سرور + صفحه‌بندی «از N»
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(0) // ۰-مبنا
  const pageSize = 12
  const { data, isLoading } = useRequestsQuery({ status: filter, page: page + 1, pageSize })

  // P2.5-U2 — انتخاب گروهی روی کارت‌ها (فقط در انتظار + فقط مدیران)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pendingBulk, setPendingBulk] = useState<BulkAction | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  // P2.5-U4 — پیش‌نمایش Master-Detail (pv:requests)
  const isDesktop = useIsDesktop()
  const panel = usePreviewPanel('requests')
  const [previewId, setPreviewId] = useState<string | null>(null)

  const list = data?.items ?? []
  const total = data?.total ?? 0
  const pageCount = data?.pageCount ?? 1
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min((page + 1) * pageSize, total)

  // P2.5-U2 — آینه کامل گارد سروری decideRequest: نقش مدیر در شرکت فعال + در انتظار
  // + متعلق به شرکت فعال (سرور هر درخواست شرکت دیگر را رد می‌کند — UI نباید بگوید می‌شود)
  const isSelectable = useCallback(
    (r: GoodsRequest) => canDecide && r.status === 'PENDING' && !!activeCompany && r.companyCode === activeCompany.code,
    [canDecide, activeCompany],
  )
  const selectableIds = useMemo(
    () => list.filter(isSelectable).map((r) => r.id),
    [list, isSelectable],
  )
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id))
  const toggleAll = () => {
    setSelectedIds((prev) => {
      if (allSelected) return prev.filter((id) => !selectableIds.includes(id))
      return [...new Set([...prev, ...selectableIds])]
    })
  }

  const runBulk = async (action: BulkAction) => {
    setBulkBusy(true)
    try {
      const res = await apiPost<{ affected: number; results: BulkResultItem[] }>('/api/requests/bulk', {
        action,
        ids: selectedIds,
      })
      toastBulkResult({
        affected: res.affected,
        results: res.results,
        unit: 'درخواست',
        actionTitle: action === 'APPROVE' ? 'تأیید گروهی' : 'رد گروهی',
        doneVerb: action === 'APPROVE' ? 'تأیید شد' : 'رد شد',
      })
      setSelectedIds([])
      setPendingBulk(null)
      void queryClient.invalidateQueries({ queryKey: QK_PREFIX.requests })
      void queryClient.invalidateQueries({ queryKey: QK_PREFIX.dashboard })
    } catch (e) {
      toastErr({ description: e instanceof Error ? e.message : 'اقدام گروهی ناموفق بود' })
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="درخواست کالا"
        description="گردشکار درخواست از انبار: ثبت متقاضی ← تأیید/رد مدیران ← تأمین — با اعلان خودکار در هر مرحله"
        actions={canWrite ? (
          <Button
            size="sm"
            onClick={() => openNew('requests', 'درخواست جدید')}
            disabled={isGroup}
            className="gap-1.5"
            title={isGroup ? 'برای ثبت درخواست، به شرکت عملیاتی سوئیچ کنید' : undefined}
          >
            <Plus className="h-3.5 w-3.5" /> درخواست جدید
          </Button>
        ) : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        {['all', 'PENDING', 'APPROVED', 'REJECTED', 'FULFILLED'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setFilter(s); setPage(0); setSelectedIds([]) }}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
              filter === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
            )}
          >
            {s === 'all' ? 'همه' : StatusBadgeLabel(s)}
          </button>
        ))}
        {/* P2.5-U2 — انتخاب همه درخواست‌های «در انتظار» این صفحه */}
        {canDecide && selectableIds.length > 0 ? (
          <label className="ms-auto flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = !allSelected && selectedIds.length > 0 }}
              onChange={toggleAll}
              disabled={bulkBusy}
              aria-label="انتخاب همه درخواست‌های در انتظار این صفحه"
              className="h-4 w-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
            />
            انتخاب همه در انتظار ({faDigits(selectableIds.length)})
          </label>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingState rows={4} label="در حال بارگذاری درخواست‌ها..." />
      ) : list.length === 0 ? (
        <EmptyState text="درخواستی یافت نشد" hint="فیلتر وضعیت را تغییر دهید؛ برای درخواست کالا از انبار، «درخواست جدید» را بزنید." />
      ) : (
        /* P2.5-U4/U9 — کارت‌ها راست، پنل چپ (فقط دسکتاپ) */
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="grid gap-3 lg:grid-cols-2">
              {list.map((r) => (
                <RequestCard
                  key={r.id}
                  r={r}
                  selectable={isSelectable(r)}
                  selected={selectedIds.includes(r.id)}
                  previewed={isDesktop && panel.open && previewId === r.id}
                  selectDisabled={bulkBusy}
                  onToggleSelect={(id) => setSelectedIds((prev) => (
                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                  ))}
                  onOpen={() => openRecord('requests', r.id, `درخواست ${faDigits(r.reqNumber)}`)}
                  onPreview={isDesktop ? () => { setPreviewId(r.id); panel.setOpen(true) } : undefined}
                />
              ))}
            </div>
            {/* P1-T12 — ناوبری «از N» فهرست سروری */}
            {total > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground tabular-nums">
                  نمایش {faDigits(from)} تا {faDigits(to)} از {faNumber(total)} درخواست
                </p>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => { setPage((p) => Math.max(0, p - 1)); setSelectedIds([]) }} disabled={page <= 0} aria-label="صفحه قبل">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <span className="min-w-16 text-center text-xs text-muted-foreground tabular-nums">
                    صفحه {faDigits(page + 1)} از {faDigits(pageCount)}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => { setPage((p) => Math.min(pageCount - 1, p + 1)); setSelectedIds([]) }} disabled={page >= pageCount - 1} aria-label="صفحه بعد">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {/* پنل فقط در دسکتاپ — موبایل رفتار تب مستقیم دارد؛
              U9: حالت نیم = همان صفحه رکورد کامل داخل پنل (یک کد، دو قاب) */}
          {isDesktop && panel.open ? (
            <FclRecordPane
              viewKey="requests"
              recordId={previewId}
              title={(() => {
                const r = list.find((x) => x.id === previewId)
                return r ? `درخواست ${faDigits(r.reqNumber)} — ${r.requesterName}` : 'پیش‌نمایش درخواست'
              })()}
              onClose={() => panel.setOpen(false)}
              onOpenFull={() => {
                const r = list.find((x) => x.id === previewId)
                if (r) openRecord('requests', r.id, `درخواست ${faDigits(r.reqNumber)}`)
              }}
              panel={panel}
              emptyHint="روی یک درخواست کلیک کنید تا اینجا نمایش داده شود."
            >
              {previewId ? <RequestPreviewContent requestId={previewId} /> : null}
            </FclRecordPane>
          ) : null}
        </div>
      )}

      {/* P2.5-U2 — نوار اقدام گروهی شناور (تأیید/رد گروهی درخواست‌های در انتظار) */}
      {canDecide && selectedIds.length > 0 ? (
        <BulkActionBar count={selectedIds.length} onClear={() => setSelectedIds([])} busy={bulkBusy}>
          <Button size="sm" onClick={() => setPendingBulk('APPROVE')} disabled={bulkBusy} className="gap-1.5">
            <Check className="h-3.5 w-3.5" /> تأیید گروهی
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPendingBulk('REJECT')} disabled={bulkBusy} className="gap-1.5 text-destructive hover:text-destructive">
            <X className="h-3.5 w-3.5" /> رد گروهی
          </Button>
        </BulkActionBar>
      ) : null}

      <ConfirmDialog
        open={pendingBulk === 'APPROVE'}
        onOpenChange={(o) => { if (!o) setPendingBulk(null) }}
        title="تأیید گروهی درخواست‌ها"
        description={`${faNumber(selectedIds.length)} درخواست در انتظار انتخاب کرده‌اید؛ با تأیید، وضعیت همه «تأییدشده» می‌شود، تاریخ تصمیم ثبت می‌گردد و به متقاضی هر درخواست اعلان می‌رود. درخواست‌هایی که قبلاً تعیین تکلیف شده باشند رد می‌شوند و در نتیجه اعلام می‌گردد.`}
        confirmLabel="تأیید درخواست‌ها"
        busy={bulkBusy}
        onConfirm={() => void runBulk('APPROVE')}
      />
      <ConfirmDialog
        open={pendingBulk === 'REJECT'}
        onOpenChange={(o) => { if (!o) setPendingBulk(null) }}
        title="رد گروهی درخواست‌ها"
        description={`${faNumber(selectedIds.length)} درخواست در انتظار انتخاب کرده‌اید؛ با تأیید، وضعیت همه «ردشده» می‌شود و به متقاضی هر درخواست اعلان می‌رود. رد گروهی برگشت‌پذیر نیست — هر درخواست باید دوباره ثبت شود.`}
        confirmLabel="رد درخواست‌ها"
        destructive
        busy={bulkBusy}
        onConfirm={() => void runBulk('REJECT')}
      />
    </div>
  )
}

function RequestCard({
  r, onOpen, onPreview, selectable, selected, previewed, selectDisabled, onToggleSelect,
}: {
  r: GoodsRequest
  /** باز کردن تب رکورد (موبایل — در دسکتاپ فقط از دکمه «باز کردن کامل») */
  onOpen: () => void
  /** P2.5-U4 — انتخاب برای پیش‌نمایش (دسکتاپ؛ undefined = موبایل: کلیک = تب) */
  onPreview?: () => void
  /** P2.5-U2 — true فقط برای کارت‌های قابل اقدام گروهی (مدیر + در انتظار + شرکت فعال) */
  selectable: boolean
  selected: boolean
  /** P2.5-U4 — این کارت در پنل پیش‌نمایش باز است */
  previewed?: boolean
  selectDisabled?: boolean
  onToggleSelect: (id: string) => void
}) {
  return (
    <div
      data-preview-selected={previewed || undefined}
      className={cn(
        'relative rounded-xl border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm',
        selected && 'border-primary/60 ring-2 ring-primary/20',
        previewed && 'border-primary/50 ring-1 ring-primary/25',
      )}
    >
      {selectable ? (
        <div className="absolute end-3 top-3 z-10">
          <input
            type="checkbox"
            checked={selected}
            disabled={selectDisabled}
            onChange={() => onToggleSelect(r.id)}
            aria-label={`انتخاب درخواست ${faDigits(r.reqNumber)}`}
            aria-disabled={selectDisabled}
            className="h-4 w-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
          />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => (onPreview ? onPreview() : onOpen())}
        className="w-full text-start"
      >
        <div className="flex flex-wrap items-center gap-2 pe-7">
          <Badge className="border-0 bg-primary/10 text-primary">درخواست {faDigits(r.reqNumber)}</Badge>
          <StatusBadge status={r.status} />
          <span className="ms-auto text-[11px] text-muted-foreground">{formatJalali(r.createdAt)} · {r.companyCode}</span>
        </div>
        <p className="mt-2 text-sm font-medium">{r.requesterName} — {r.requesterTitle ?? 'کاربر'}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">انبار: {r.warehouseName}{r.neededFor ? ` · مصرف: ${r.neededFor}` : ''}</p>
        <div className="mt-3 space-y-1.5 rounded-lg bg-muted/50 p-3">
          {r.items.map((i) => (
            <div key={i.id} className="flex items-center justify-between text-xs">
              <span className="truncate">{i.productName} ({i.size})</span>
              <span className="shrink-0 font-medium tabular-nums">{faNumber(i.qtyM2)} م²</span>
            </div>
          ))}
        </div>
        {r.note ? <p className="mt-2 text-xs leading-5 text-muted-foreground">«{r.note}»</p> : null}
        <p className="mt-2 flex items-center gap-1 text-[11px] text-primary">
          <Sparkles className="h-3 w-3" /> مشاهده جزئیات و اقدام در صفحه درخواست
        </p>
      </button>
    </div>
  )
}

function StatusBadgeLabel(s: string) {
  return ({ PENDING: 'در انتظار', APPROVED: 'تأییدشده', REJECTED: 'ردشده', FULFILLED: 'تأمین‌شده' } as Record<string, string>)[s] ?? s
}
