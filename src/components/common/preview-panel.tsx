'use client'

/**
 * پنل پیش‌نمایش کنار فهرست — Master-Detail (P2.5-U4، شکاف G5 بنچمارک)
 * + حالت نیم‌صفحه FCL (P2.5-U9 — پژوهش ۰۲ ت۱/#۸/#۹):
 *
 * الگوی مرجع: Fiori Flexible Column Layout (وسط‌ستون پیش‌نمایش) و
 * Salesforce Split View — پیمایش رکوردی بدون باز/بستن تب:
 *  - کلیک ردیف (دسکتاپ lg+) = انتخاب برای پیش‌نمایش، نه تب جدید
 *  - «تمام‌صفحه» = همان رفتار قبلی (تب رکورد)
 *  - حالت باریک (narrow): پنل فقط-خواندنی ۳۲۰–۵۶۰px (U4)
 *  - حالت نیم‌صفحه (half): قاب رکورد کامل در ~۵۰٪ عرض کنار لیست زنده (U9)
 *
 * ماندگاری (io.ui.v1 — قرارداد U3): کلید «pv:<viewKey>» = { open, width?, mode? }
 *  - open: باز/بسته پنل per کاربر (عرض رفرش زنده می‌ماند)
 *  - width: عرض پنل باریک با دستگیره کشیدنی (۳۲۰ تا ۵۶۰ — تراکم ERP)
 *  - mode: سطح عرض — «باریک» یا «نیم»؛ پیش‌فرض نیم (توصیه پژوهش ۰۲ ت۱:
 *    نیم‌صفحه = رفتار پیش‌فرض دسکتاپ؛ ترجیح قدیمی بدون mode = نیم)
 *
 * نکته چیدمان RTL (#۱۰ پژوهش ۰۲): در flex-row راست‌به‌چپ، جدول سمت راست و
 * پنل سمت چپ می‌نشیند (مثل کتاب — فهرست راست، جزئیات چپ)؛ دستگیره تغییر عرض
 * روی لبه «start» پنل (لبه چسبیده به جدول) است.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { readUiPref, writeUiPref } from '@/core/shared/ui-prefs'
import { useApp } from '@/store/app'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Columns2, Maximize2, PanelRight, X } from 'lucide-react'

const MIN_WIDTH = 320
const MAX_WIDTH = 560
const DEFAULT_WIDTH = 400

/** سطح عرض پنل — سه‌سطح Fiori (باریک/نیم؛ «تمام‌صفحه» اقدام تب است نه حالت) */
export type PanelMode = 'narrow' | 'half'

export function isPanelMode(v: unknown): v is PanelMode {
  return v === 'narrow' || v === 'half'
}

type PanelPref = { open: boolean; width?: number; mode?: PanelMode }

/**
 * مالکیت state پنل per نما — باز/بسته، عرض و سطح عرض، ماندگار در io.ui.v1 (الگوی U3).
 * state واحد {open, width, mode} تا تغییر یکی دیگری را بازنویسی نکند؛
 * ثبت عرض با debounce (کشیدن دستگیره = ده‌ها فراخوانی در ثانیه).
 */
export function usePreviewPanel(viewKey: string) {
  const userId = useApp((s) => s.me?.user.id ?? null)
  const [state, setState] = useState<{ open: boolean; width: number; mode: PanelMode }>(() => {
    const p = userId ? readUiPref<PanelPref>(userId, `pv:${viewKey}`) : null
    return { open: p?.open === true, width: clampWidth(p?.width), mode: isPanelMode(p?.mode) ? p.mode : 'half' }
  })

  // آینه تازه state برای نوشتن debounceشده بدون closure کهنه (همگام‌سازی در effect —
  // نوشتن ref حین رندر ممنوع است؛ دروازه lint)
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setOpen = useCallback((v: boolean) => {
    setState((prev) => {
      if (prev.open === v) return prev
      const next = { ...prev, open: v }
      if (userId) writeUiPref(userId, `pv:${viewKey}`, next)
      return next
    })
  }, [userId, viewKey])

  /** تغییر سطح عرض (U9) — ثبت فوری (رویداد گسسته، نه کشیدن پیوسته) */
  const setMode = useCallback((m: PanelMode) => {
    setState((prev) => {
      if (prev.mode === m) return prev
      const next = { ...prev, mode: m }
      if (userId) writeUiPref(userId, `pv:${viewKey}`, next)
      return next
    })
  }, [userId, viewKey])

  const setWidth = useCallback((w: number) => {
    const cw = clampWidth(w)
    setState((prev) => (prev.width === cw ? prev : { ...prev, width: cw }))
    // ثبت عرض با debounce — کشیدن دستگیره ده‌ها فراخوانی در ثانیه می‌سازد
    if (userId) {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        writeUiPref(userId, `pv:${viewKey}`, stateRef.current)
      }, 250)
    }
  }, [userId, viewKey])

  // flush نهایی هنگام unmount (تغییر عرض لحظه آخر نباید گم شود)
  useEffect(() => () => { if (timerRef.current) { clearTimeout(timerRef.current); writeUiPref(userId ?? undefined, `pv:${viewKey}`, stateRef.current) } }, [userId, viewKey])

  return { open: state.open, setOpen, toggle: () => setOpen(!state.open), width: state.width, setWidth, mode: state.mode, setMode }
}

function clampWidth(w: number | undefined): number {
  if (typeof w !== 'number' || !Number.isFinite(w)) return DEFAULT_WIDTH
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)))
}

/** ردیف اطلاعاتی خلاصه — همان زبان بصری InfoGrid صفحه رکورد */
export function PreviewInfo({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
      {rows.map((r) => (
        <div key={r.label} className="min-w-0">
          <dt className="text-[11px] text-muted-foreground">{r.label}</dt>
          <dd className="truncate text-xs font-medium text-foreground" title={typeof r.value === 'string' ? r.value : undefined}>{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function PreviewPanel({
  title,
  badges,
  onClose,
  onOpenFull,
  openFullLabel = 'باز کردن کامل',
  loading = false,
  error = null,
  emptyHint,
  width,
  onWidthChange,
  mode = 'narrow',
  onModeChange,
  recordContent,
  children,
}: {
  title: ReactNode
  badges?: ReactNode
  onClose: () => void
  /** همان ناوبری قبلی — تب رکورد (پنل فقط-خواندنی است) */
  onOpenFull: () => void
  openFullLabel?: string
  loading?: boolean
  error?: string | null
  /** وقتی هیچ رکوردی انتخاب نشده — راهنمای شروع */
  emptyHint?: string
  width: number
  onWidthChange: (w: number) => void
  /** سطح عرض پنل (U9) — باریک = خلاصه فقط-خواندنی U4؛ نیم = قاب رکورد کامل */
  mode?: PanelMode
  /** تغییر سطح عرض (سگمنت هدر) — نبود = تک‌سطح (سازگاری U4) */
  onModeChange?: (m: PanelMode) => void
  /** محتوای حالت نیم — همان کامپوننت صفحه رکورد (یک کد، دو قاب — U9) */
  recordContent?: ReactNode
  /** محتوای حالت باریک — خلاصه فقط-خواندنی (U4) */
  children?: ReactNode
}) {
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const isHalf = mode === 'half'

  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isHalf) return
    dragRef.current = { startX: e.clientX, startWidth: width }
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }
  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    // پنل در چپ نشسته: کشیدن دستگیره به راست = پهن‌تر
    onWidthChange(dragRef.current.startWidth + (e.clientX - dragRef.current.startX))
  }
  const onHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }

  return (
    <aside
      data-preview-panel
      data-panel-mode={mode}
      aria-label="پیش‌نمایش رکورد"
      style={isHalf ? { width: '50%', minWidth: 420 } : { width }}
      className="relative shrink-0 rounded-xl border bg-card lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-7rem)] lg:flex-col"
    >
      {/* دستگیره تغییر عرض — فقط حالت باریک؛ لبه چسبیده به جدول (start در RTL) */}
      {isHalf ? null : (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="تغییر عرض پنل پیش‌نمایش"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          className="absolute inset-y-2 start-0 z-10 -ms-1 w-2 cursor-col-resize touch-none rounded-full transition-colors hover:bg-primary/30"
        />
      )}

      <header className="flex items-start justify-between gap-2 border-b p-3.5 pb-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-6">{title}</div>
          {badges ? <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{badges}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* سگمنت سطح عرض (U9) — باریک | نیم‌صفحه (#۹ پژوهش ۰۲) */}
          {onModeChange ? (
            <div role="group" aria-label="سطح عرض پنل" className="flex items-center rounded-lg border p-0.5">
              <Button
                variant="ghost" size="sm"
                aria-pressed={!isHalf}
                aria-label="پنل باریک"
                title="پنل باریک — خلاصه رکورد"
                onClick={() => onModeChange('narrow')}
                className={segmentCls(!isHalf)}
              >
                <PanelRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost" size="sm"
                aria-pressed={isHalf}
                aria-label="نیم‌صفحه"
                title="نیم‌صفحه — رکورد کامل کنار فهرست"
                onClick={() => onModeChange('half')}
                className={segmentCls(isHalf)}
              >
                <Columns2 className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
          {/* تمام‌صفحه — فقط حالت نیم (باریک دکمه «باز کردن کامل» فوتر را دارد) */}
          {isHalf ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenFull}
              aria-label="تمام‌صفحه"
              title="تمام‌صفحه — باز کردن رکورد در تب"
              className="h-7 w-7 p-0"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="بستن پیش‌نمایش"
            className="h-7 w-7 shrink-0 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        {loading ? (
          <div className="space-y-2.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : error ? (
          <p className="rounded-lg bg-destructive/10 p-3 text-xs leading-5 text-destructive" role="alert">{error}</p>
        ) : emptyHint ? (
          <p className="px-2 py-10 text-center text-xs leading-6 text-muted-foreground">{emptyHint}</p>
        ) : isHalf ? (
          recordContent ?? null
        ) : (
          children ?? null
        )}
      </div>

      {isHalf ? (
        <footer className="border-t p-2.5">
          <p className="text-center text-[10px] leading-4 text-muted-foreground" dir="rtl">
            <kbd className="rounded border bg-background px-1">↓</kbd> <kbd className="rounded border bg-background px-1">↑</kbd> پیمایش رکورد‌ها
            · <kbd className="rounded border bg-background px-1">Esc</kbd> بستن
            · <kbd className="rounded border bg-background px-1">Ctrl</kbd>+<kbd className="rounded border bg-background px-1">Enter</kbd> تمام‌صفحه
          </p>
        </footer>
      ) : (
        <footer className="border-t p-3">
          <Button size="sm" onClick={onOpenFull} className="w-full gap-1.5" aria-label={openFullLabel}>
            <Maximize2 className="h-3.5 w-3.5" /> {openFullLabel}
          </Button>
          <p className="mt-2 text-center text-[10px] leading-4 text-muted-foreground" dir="rtl">
            <kbd className="rounded border bg-background px-1">↓</kbd> <kbd className="rounded border bg-background px-1">↑</kbd> پیمایش رکورد‌ها
            · <kbd className="rounded border bg-background px-1">Esc</kbd> بستن
          </p>
        </footer>
      )}
    </aside>
  )
}

/** ظاهر دکمه سگمنت — فعال پررنگ (bg-accent)، غیرفعال کم‌رنگ */
function segmentCls(active: boolean): string {
  return `h-6 w-7 rounded-md p-0 ${active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`
}
