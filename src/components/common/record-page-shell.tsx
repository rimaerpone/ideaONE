'use client'

/**
 * قالب مشترک صفحه رکورد ERP (P1.5-T5) — الگوی Odoo:
 *   بردکرامب ← هدر (آیکون + عنوان + نشان‌ها + نوار اقدام) ← نوار وضعیت چرخه عمر
 *   ← شناسنامه رکورد (InfoGrid) ← تب‌های داخلی ← بدنه ← نوار اقدام پایانی چسبان (فرم‌ها)
 * همه صفحات رکورد/فرم از این قالب ساخته می‌شوند — طراحی یکدست، اطلاعات بالای صفحه.
 */

import { useCallback, useContext, createContext } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronRight, X } from 'lucide-react'
import { useWorkspace } from '@/store/workspace'
import { viewLabel } from '@/core/shared/view-meta'
import { IconFor } from '@/components/shell/sidebar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { faDigits } from '@/core/shared/jalali'

/**
 * P1-T26 — نان‌رد موبایل: در عرض <sm به‌جای بردکرامب متن، دکمه بازگشت لمسی تمام‌عرض
 * (ارتفاع ۹ واحد = هدف لمسی آسان) + مسیر کوچک کنار آن؛ دسکتاپ همان بردکرامب قبلی.
 */

/**
 * P2.5-U9 — زمینه «رکورد جاسازی‌شده»: صفحه رکورد داخل پنل نیم‌صفحه FCL رندر شده
 * (کنار فهرست زنده). اثرها: بدون بردکرامب/بازگشت (فهرست کنار دست است) و خطای بدون
 * «بستن تب» (X پنل همان است). صفحات بدون prop-drilling مصرف می‌کنند.
 */
const EmbeddedRecordContext = createContext(false)

/** ارائه‌دهنده زمینه — فقط FclRecordPane باید آن را true بدهد */
export const EmbeddedRecordProvider = EmbeddedRecordContext.Provider

/** آیا این رکورد داخل پنل نیم‌صفحه رندر شده؟ (U9) */
export function useIsEmbeddedRecord(): boolean {
  return useContext(EmbeddedRecordContext)
}

export type StatusStep = { key: string; label: string }

export type InfoItem = {
  label: string
  value: ReactNode
  /** عرض دو ستونه در گرید شناسنامه */
  wide?: boolean
}

/** ناوبری بازگشت: تب لیست همان نما را فعال می‌کند (یا می‌سازد) — تب رکورد باز می‌ماند */
export function useRecordNav(viewKey: string) {
  const tabs = useWorkspace((s) => s.tabs)
  const openView = useWorkspace((s) => s.openView)
  const setActive = useWorkspace((s) => s.setActive)
  return useCallback(() => {
    const listId = `list:${viewKey}`
    if (tabs.some((t) => t.id === listId)) setActive(listId)
    else openView(viewKey)
  }, [tabs, viewKey, setActive, openView])
}

export function RecordPageShell({
  viewKey,
  title,
  icon,
  badges,
  statusSteps,
  statusError,
  actions,
  aside,
  info,
  innerTabs,
  activeInnerTab,
  onInnerTabChange,
  loading,
  error,
  onRetry,
  footer,
  children,
}: {
  viewKey: string
  title: ReactNode
  icon?: string
  badges?: ReactNode
  /** نوار وضعیت چرخه عمر — steps خطی + ایندکس گام جاری */
  statusSteps?: { steps: StatusStep[]; currentIndex: number }
  /** نشان خطای چرخه عمر (مثلاً «ابطال‌شده») — در صورت وجود کنار نوار وضعیت */
  statusError?: string | null
  actions?: ReactNode
  /** محتوای سمت مخالف نوار اقدام (جمع کل، شمار اقلام و…) */
  aside?: ReactNode
  info?: InfoItem[]
  innerTabs?: { key: string; label: string }[]
  activeInnerTab?: string
  onInnerTabChange?: (key: string) => void
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  /** نوار اقدام پایانی چسبان — برای فرم‌ها (ذخیره/انصراف) */
  footer?: ReactNode
  children: ReactNode
}) {
  const back = useRecordNav(viewKey)
  const closeTab = useWorkspace((s) => s.closeTab)
  const activeTabId = useWorkspace((s) => s.activeTabId)
  // U9 — رکورد جاسازی‌شده در پنل نیم‌صفحه: بردکرامب/بازگشت/«بستن تب» معنا ندارند
  const embedded = useIsEmbeddedRecord()

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <p className="font-medium text-destructive">بارگذاری رکورد ناموفق بود</p>
        <p className="mt-1.5 text-sm text-muted-foreground">{error}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <Button size="sm" variant="outline" onClick={onRetry}>تلاش دوباره</Button>
          ) : null}
          {embedded ? null : (
            <Button size="sm" variant="ghost" onClick={() => activeTabId && closeTab(activeTabId)} className="gap-1.5">
              <X className="h-3.5 w-3.5" /> بستن تب
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* نان‌رد موبایل (P1-T26) — دکمه بازگشت لمسی؛ عمق ناوبری در ۳۹۰px واضح */}
      {embedded ? null : (
        <div className="flex items-center gap-2 sm:hidden">
          <button
            type="button"
            onClick={back}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border bg-card px-3 text-xs font-medium shadow-sm transition-colors active:bg-accent"
          >
            <ChevronRight className="h-4 w-4" />
            بازگشت به {viewLabel(viewKey)}
          </button>
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" dir="auto">
            {viewLabel(viewKey)} / {title}
          </span>
        </div>
      )}

      {/* بردکرامب — دسکتاپ (sm به بالا)؛ در پنل نیم‌صفحه فهرست کنار است (U9) */}
      {embedded ? null : (
        <nav aria-label="مسیر" className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" />
            {viewLabel(viewKey)}
          </button>
          <span className="text-muted-foreground/50" aria-hidden>/</span>
          <span className="max-w-72 truncate font-medium text-foreground/80">{title}</span>
        </nav>
      )}

      {/* هدر رکورد */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <IconFor name={icon ?? 'LayoutDashboard'} className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-7 sm:text-xl">{title}</h1>
            {badges ? <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{badges}</div> : null}
          </div>
        </div>

        {/* نوار وضعیت چرخه عمر */}
        {statusSteps ? (
          <div className="border-t px-4 py-3 sm:px-5">
            <Statusbar steps={statusSteps.steps} currentIndex={statusSteps.currentIndex} error={statusError} />
          </div>
        ) : null}

        {/* شناسنامه رکورد */}
        {info && info.length > 0 ? (
          <div className="border-t px-4 py-4 sm:px-5">
            <InfoGrid items={info} />
          </div>
        ) : null}
      </div>

      {/* نوار اقدام */}
      {actions || aside ? (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {aside ? <div className="ms-auto flex flex-wrap items-center gap-2">{aside}</div> : null}
        </div>
      ) : null}

      {/* تب‌های داخلی */}
      {innerTabs && innerTabs.length > 0 ? (
        <Tabs value={activeInnerTab} onValueChange={(v) => onInnerTabChange?.(v)}>
          <TabsList className="h-auto flex-wrap justify-start">
            {innerTabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="text-xs">{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}

      {/* بدنه */}
      {children}

      {/* نوار اقدام پایانی چسبان (فرم‌ها) */}
      {footer ? (
        <div className="sticky bottom-4 z-10 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">{footer}</div>
        </div>
      ) : null}
    </div>
  )
}

/** نوار وضعیت چرخه عمر — گام‌ها از راست (RTL) با اتصال‌های خطی */
function Statusbar({ steps, currentIndex, error }: { steps: StatusStep[]; currentIndex: number; error?: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-0" role="group" aria-label="وضعیت چرخه عمر">
      {steps.map((s, i) => {
        const done = i < currentIndex
        const current = i === currentIndex
        return (
          <div key={s.key} className="flex items-center">
            {i > 0 ? (
              <span className={cn('mx-1 h-px w-6 sm:w-10', done ? 'bg-primary/60' : 'bg-border')} aria-hidden />
            ) : null}
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold transition-colors',
                  done ? 'border-primary bg-primary text-primary-foreground'
                    : current ? 'border-2 border-primary text-primary'
                      : 'border-border text-muted-foreground/70',
                )}
                aria-hidden
              >
                {done ? <Check className="h-3 w-3" /> : faDigits(i + 1)}
              </span>
              <span className={cn('text-xs', current ? 'font-bold text-foreground' : done ? 'font-medium text-foreground/80' : 'text-muted-foreground/70')}>
                {s.label}
              </span>
            </span>
          </div>
        )
      })}
      {error ? (
        <span className="ms-3 inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-[11px] font-medium text-destructive">
          <X className="h-3 w-3" /> {error}
        </span>
      ) : null}
    </div>
  )
}

/** شناسنامه رکورد — گرید اطلاعات کلیدی (شماره/تاریخ/طرف/انبار/…) — P2.5-U1: تا ۶ ستون در مانیتور عریض */
export function InfoGrid({ items }: { items: InfoItem[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {items.map((it, i) => (
        <div key={i} className={cn('min-w-0', it.wide && 'col-span-2 sm:col-span-3 lg:col-span-2 xl:col-span-3')}>
          <dt className="text-[11px] leading-4 text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 text-sm font-medium leading-6 text-foreground" dir="auto">{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
