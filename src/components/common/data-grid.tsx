'use client'

/**
 * جدول سازمانی مشترک (P1-T1 — DataGrid)
 *
 * استاندارد یکنواخت فهرست‌های پلتفرم روی TanStack Table:
 *  - ستون تعریفی با سرعتاز فارسی، مرتب‌سازی (با مقدار مقایسه‌ای صریح)، تراز
 *  - جستجوی سراسری فارسی‌آگاه (ارقام فارسی/عربی، ک/ی عربی، نیم‌فاصله — normalizeFaText)
 *  - صفحه‌بندی کلاینت با شمارنده «از N» فارسی — یا سرور (P1-T12): serverPagination + serverSort
 *  - نمایش/مخفی‌سازی ستون‌ها از منوی چیدمان + ماندگاری per کاربر (P2.5-U3): بودن persistKey
 *    یعنی چیدمان ستون‌ها در localStorage (io.ui.v1) زنده می‌ماند — «تغییر ستون‌ها → refresh → همان تنظیمات»؛
 *    «بازنشانی به پیش‌فرض» هم همان منو است (بدون ثبت سروری — نمای ذخیره‌شده سروری در P6)
 *  - حالت بارگذاری (اسکلتون) و خالی یکسان در همه نماها
 *  - ردیف بازشو (expandedContent) برای جزئیات سند/نامه + ردیف کلیک‌پذیر
 *  - انتخاب گروهی (P2.5-U2): ستون چک‌باکس کنترل‌شده از نما + انتخاب همه/بخشی
 *    سطرهای این صفحه — ردیف غیرقابل انتخاب با isRowSelectable مشخص می‌شود
 *  - لیست مجازی (P1-T35): بیش از ۸۰ سطر → پنجره‌گذاری با @tanstack/react-virtual
 *    (ردیف‌های فاصله‌انداز بالا/پایین؛ اندازه‌گیری پویا با measureElement؛ سرستون چسبان)
 *  - پیش‌نمایش کنار فهرست (P2.5-U4 — Master-Detail): بودن prop preview یعنی
 *    در دسکتاپ (lg+) کلیک ردیف = انتخاب برای پیش‌نمایش (نه تب جدید — الگوی Fiori
 *    FCL / SF Split View)؛ در موبایل رفتار قبلی (کلیک = onRowClick) می‌ماند.
 *    کیبورد: ↑↓ جابه‌جایی فوکوس ردیف (وقتی پنل باز است، پیش‌نمایش زنده جابه‌جا
 *    می‌شود) · Space/Enter روی ردیف = باز کردن پیش‌نمایش · Esc = بستن پنل.
 *    فوکوس ردیف‌ها roving-tabindex است (فقط ردیف فعال tabIndex=0).
 *
 * قاعده مهاجرت: هر نما فقط «تعریف ستون‌ها» می‌نویسد — رفتار جدول همه‌جا یکسان است.
 */
import { Fragment, memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/common/ui-bits'
import { normalizeFaText } from '@/core/shared/normalize'
import { faDigits, faNumber } from '@/core/shared/jalali'
import { readUiPref, writeUiPref } from '@/core/shared/ui-prefs'
import { useIsDesktop } from '@/hooks/use-media-query'
import { useApp } from '@/store/app'
import { ChevronDown, ChevronLeft, ChevronRight, Columns3, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DataGridColumn<T> = {
  /** شناسه ستون (پایدار — برای مرتب‌سازی و چیدمان) */
  key: string
  /** سرستون فارسی */
  header: string
  /** محتوای سلول */
  cell: (row: T) => ReactNode
  /** مقدار مقایسه‌ای مرتب‌سازی — رشته/عدد/بولی؛ نبود = غیرقابل مرتب‌سازی */
  sortValue?: (row: T) => string | number | boolean | null | undefined
  /** کلید مرتب‌سازی سرور (P1-T12) — بودن آن یعنی این ستون در حالت سروری هم قابل مرتب‌سازی است */
  serverSortKey?: string
  align?: 'start' | 'center' | 'end'
  className?: string
  hideOnMobile?: boolean
  /** اجازه مخفی‌سازی توسط کاربر (پیش‌فرض true) */
  enableHiding?: boolean
}

type DataGridProps<T> = {
  columns: DataGridColumn<T>[]
  rows: T[]
  /** در حال واکشی؟ (اسکلتون به‌جای جدول) */
  loading?: boolean
  /** متن حالت خالی (عنوان) */
  emptyText: string
  /** توضیح حالت خالی — پیشنهاد اقدام بعدی (P1-T33) */
  emptyHint?: string
  /** دکمه اقدام حالت خالی (مثلاً «ثبت اولین رکورد») (P1-T33) */
  emptyAction?: ReactNode
  /** فیلدهای جستجوی سراسری — رشته خالی = جستجو مخفی */
  searchKeys?: (row: T) => (string | number | null | undefined)[]
  /** جستجوی کنترل‌شده سمت سرور — بودن آن یعنی جستجو در سرور است نه globalFilter کلاینت */
  searchValue?: string
  onSearchChange?: (v: string) => void
  /** بررسی عمیق فرم‌ها — رویداد کلیدی جستجو (مثلاً Enter = تعهد فوری مقدار debounce‌شده در فراخواننده) */
  onSearchKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  /** عناصر کنار نوار ابزار (فیلترهای اختصاصی نما) */
  toolbar?: ReactNode
  /** مرتب‌سازی اولیه */
  initialSort?: SortingState
  /** اندازه صفحه — 0 = بدون صفحه‌بندی */
  pageSize?: number
  /** P1-T35 — در حالت کلاینت: تغییر اندازه صفحه/«همه» به نما اطلاع داده می‌شود تا واکشی داده را هم‌اندازه کند */
  onPageSizeChange?: (size: number) => void
  onRowClick?: (row: T) => void
  /** ردیف بازشو (جزئیات) — بودن آن دکمه شِوِران می‌سازد */
  expandedContent?: (row: T) => ReactNode
  /** شمار سطر اسکلتون حالت بارگذاری */
  skeletonRows?: number

  /**
   * P2.5-U3 — شخصی‌سازی ماندگار: شناسه پایدار نما (مثل 'letters'). بودن آن یعنی
   * چیدمان نمایش/مخفی‌سازی ستون‌ها per کاربر در localStorage زنده می‌ماند.
   * ستون‌های تازه (کلید جدید در نسخه بعدی) همیشه نمایان شروع می‌شوند — فقط «مخفی‌ها» ذخیره می‌شوند.
   */
  persistKey?: string

  /**
   * صفحه‌بندی کنترل‌شده سرور (P1-T12) — بودن آن یعنی rows فقط «همین یک صفحه» است و
   * شمارنده/ناوبری از total سرور محاسبه می‌شود (نه تعداد سطرهای کلاینت).
   */
  serverPagination?: {
    /** ۰-مبنا */
    pageIndex: number
    pageSize: number
    total: number
    onPageChange: (pageIndex: number) => void
    onPageSizeChange?: (pageSize: number) => void
  }
  /** مرتب‌سازی کنترل‌شده سرور — field همان key ستون است؛ کلیک مجدد جهت را برمی‌گرداند */
  serverSort?: { field: string; dir: 'asc' | 'desc' }
  onServerSortChange?: (field: string, dir: 'asc' | 'desc') => void

  /**
   * P2.5-U4 — پیش‌نمایش کنار فهرست (Master-Detail): بودن آن در دسکتاپ (lg+)
   * کلیک ردیف را به «انتخاب برای پیش‌نمایش» تغییر می‌دهد (Fiori FCL). در موبایل
   * رفتار قبلی (onRowClick) می‌ماند — پنل کنار جدول جایی ندارد.
   * پنل خودش را نما رندر می‌کند (PreviewPanel)؛ گرید فقط رفتار ردیف را عوض می‌کند.
   */
  preview?: {
    /** رکوردِ در حال پیش‌نمایش — null یعنی پنل بسته است (↑↓ فقط فوکوس می‌دهد) */
    selectedId: string | null
    /** درخواست پیش‌نمایش رکورد (کلیک ردیف یا Space/Enter در lg+) */
    onPreview: (row: T) => void
    /** بستن پنل (Esc از روی ردیف — پیش از رسیدن به میان‌بر سراسری «بستن تب») */
    onClose: () => void
    /** P2.5-U9 — تمام‌صفحه: Ctrl+Enter روی ردیف متمرکز = باز کردن رکورد در تب */
    onOpenFull?: () => void
    /**
     * P2.5-U9 — پنل باز است (حتی بدون رکورد انتخابی — وضعیت بازیابی‌شده پس از
     * reload). Esc باید اول پنل را ببندد نه تب فعال را (پیش‌فرض لایه بالایی).
     */
    paneOpen?: boolean
  }

  /**
   * P2.5-U2 — انتخاب گروهی: بودن آن ستون چک‌باکس (اولین ستون) می‌سازد.
   * کنترل‌شده از نما: مالکیت state نزد فراخواننده است تا نوار اقدام گروهی و
   * پاک‌سازی پس از عملیات همان‌جا باشد. «انتخاب همه» فقط سطرهای همین صفحه را
   * می‌گیرد (الگوی D365/Gmail در صفحه‌بندی سروری؛ «همه نتایج جستجو» به P6 می‌رسد).
   */
  bulkSelection?: {
    selectedIds: string[]
    onSelectedIdsChange: (ids: string[]) => void
    /** آینه گارد سروری برای راهنمای کاربر — نبود یعنی همه سطرها قابل انتخاب‌اند */
    isRowSelectable?: (row: T) => boolean
    /** قفل موقت حین اجرای اقدام گروهی (تغییر انتخاب در میانه پرواز ممنوع) */
    disabled?: boolean
    /** برچسب ردیف برای aria-label چک‌باکس — نبود = «انتخاب این ردیف» */
    rowAriaLabel?: (row: T) => string
  }
}

const PAGE_SIZES = [15, 30, 50, 100, 250, 0]

/** آستانه فعال‌سازی خودکار لیست مجازی (P1-T35) — زیر آن رندر عادی سریع‌تر است */
const VIRTUAL_THRESHOLD = 80
/** برچسب اندازه صفحه — ۰ یعنی «همه سطرها» (با لیست مجازی) */
function pageSizeLabel(s: number): string {
  return s === 0 ? 'همه' : `${faDigits(s)} سطر`
}

/**
 * P1-T35 — ردیف جدول memo شده: در اسکرول لیست مجازی، هویت Row در TanStack پایدار است؛
 * فقط ردیف‌های تازه‌وارد به پنجره دید رندر می‌شوند (نه هر ۲۵×۸ سلول در هر فریم).
 * مقایسه سفارشی: هویت row + وضعیت بازشدن + فعال‌بودن مجازی — توابع نادیده گرفته می‌شوند
 * (رفتارشان به row.original و outletهای پایدار zustand وابسته است، نه به هویت closure).
 */
function GridRowInner<T extends { id: string }>({
  row, index, virtualOn, measureRef, expandedContent, isExpanded, onToggleExpand, onRowClick,
  bulkSelected, bulkSelectable, bulkDisabled, onToggleSelect, bulkAriaLabel,
  previewActive, previewSelected, isFocusRow, onRowKeyDown,
}: {
  row: Row<T>
  index: number
  virtualOn: boolean
  measureRef?: (node: HTMLElement | null) => void
  expandedContent?: (row: T) => ReactNode
  isExpanded: boolean
  onToggleExpand: (id: string) => void
  onRowClick?: (row: T) => void
  /** P2.5-U2 — وضعیت انتخاب این ردیف (undefined = گرید بدون انتخاب گروهی) */
  bulkSelected?: boolean
  bulkSelectable?: boolean
  bulkDisabled?: boolean
  onToggleSelect?: (id: string) => void
  bulkAriaLabel?: string
  /** P2.5-U4 — رفتار پیش‌نمایش فعال است (دسکتاپ + prop داده شده) */
  previewActive?: boolean
  /** P2.5-U4 — این ردیف در حال پیش‌نمایش است (هایلایت) */
  previewSelected?: boolean
  /** P2.5-U4 — ردیفِ دارای tabIndex=0 در roving-tabindex */
  isFocusRow?: boolean
  /** P2.5-U4 — رویداد کیبورد ردیف (↑↓/Space/Esc) */
  onRowKeyDown?: (e: React.KeyboardEvent<HTMLTableRowElement>, row: T, index: number) => void
}) {
  return (
    <Fragment>
      <TableRow
        data-index={index}
        data-id={row.original.id}
        data-preview-selected={previewSelected || undefined}
        ref={virtualOn ? measureRef : undefined}
        tabIndex={isFocusRow ? 0 : -1}
        aria-selected={previewActive ? !!previewSelected : undefined}
        onKeyDown={onRowKeyDown ? (e) => onRowKeyDown(e, row.original, index) : undefined}
        className={cn(
          'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
          onRowClick && 'cursor-pointer',
          bulkSelected && 'bg-primary/5',
          previewSelected && 'bg-primary/[0.07] ring-1 ring-inset ring-primary/25',
        )}
        onClick={() => onRowClick?.(row.original)}
      >
        {bulkSelectable !== undefined ? (
          <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={bulkSelected}
              disabled={!bulkSelectable || bulkDisabled}
              onChange={() => onToggleSelect?.(row.original.id)}
              title={!bulkSelectable ? 'این ردیف قابل اقدام گروهی نیست' : undefined}
              aria-label={bulkAriaLabel ?? 'انتخاب این ردیف'}
              aria-disabled={!bulkSelectable || bulkDisabled}
              className="h-4 w-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
            />
          </TableCell>
        ) : null}
        {expandedContent ? (
          <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onToggleExpand(row.original.id)}
              aria-label={isExpanded ? 'بستن جزئیات' : 'نمایش جزئیات'}
              aria-expanded={isExpanded}
              className="rounded-md p-1 hover:bg-muted"
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} />
            </button>
          </TableCell>
        ) : null}
        {row.getVisibleCells().map((cell) => {
          const meta = (cell.column.columnDef.meta ?? {}) as { align?: string; className?: string; hideOnMobile?: boolean }
          return (
            <TableCell
              key={cell.id}
              className={cn(
                'align-middle',
                meta.align === 'center' && 'text-center',
                meta.align === 'end' && 'text-end',
                meta.hideOnMobile && 'hidden md:table-cell',
                meta.className,
              )}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          )
        })}
      </TableRow>
      {isExpanded && expandedContent ? (
        <TableRow>
          <TableCell
            colSpan={row.getVisibleCells().length + 1 + (bulkSelectable !== undefined ? 1 : 0)}
            className="border-t bg-muted/20 p-4"
          >
            {expandedContent(row.original)}
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  )
}
const GridRow = memo(
  GridRowInner,
  (a, b) => a.row === b.row && a.isExpanded === b.isExpanded && a.virtualOn === b.virtualOn
    && a.bulkSelected === b.bulkSelected && a.bulkSelectable === b.bulkSelectable && a.bulkDisabled === b.bulkDisabled
    && a.previewSelected === b.previewSelected && a.isFocusRow === b.isFocusRow && a.previewActive === b.previewActive,
) as typeof GridRowInner

export function DataGrid<T extends { id: string }>({
  columns, rows, loading = false, emptyText, emptyHint, emptyAction, searchKeys, searchValue, onSearchChange, onSearchKeyDown, toolbar, initialSort,
  pageSize = 15, onPageSizeChange, onRowClick, expandedContent, skeletonRows = 6, serverPagination, serverSort, onServerSortChange, bulkSelection, persistKey, preview,
}: DataGridProps<T>) {
  const [internalFilter, setInternalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? [])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [size, setSize] = useState(pageSize)

  // P2.5-U3 — چیدمان ستون‌ها: state کنترل‌شده تا ماندگاری per کاربر ممکن شود.
  // پیش‌فرض = همه نمایان؛ «مخفی‌های ذخیره‌شده» در lazy initializer خوانده می‌شوند (الگوی
  // use-draft — گریدها فقط پس از احراز هویت سمت کلاینت mount می‌شوند، پس SSR همگام است)
  const userId = useApp((s) => s.me?.user.id ?? null)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    if (!persistKey || !userId) return {}
    const stored = readUiPref<{ hidden: string[] }>(userId, `cols:${persistKey}`)
    if (!stored || !Array.isArray(stored.hidden) || stored.hidden.length === 0) return {}
    // ستون تازه (نسخه بعدی) همیشه نمایان شروع می‌شود؛ ستون غیرقابل مخفی‌سازی هم اعمال نمی‌شود
    const hideable = new Set(columns.filter((c) => c.enableHiding !== false).map((c) => c.key))
    const hidden = stored.hidden.filter((k) => hideable.has(k))
    return hidden.length > 0 ? Object.fromEntries(hidden.map((k) => [k, false])) : {}
  })

  // تغییر چیدمان (منوی ستون‌ها) → ثبت در همان لحظه؛ «مخفی‌ها» ذخیره می‌شوند نه کل نقشه
  const onColumnVisibilityChange = useCallback((updater: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => {
    setColumnVisibility((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (persistKey && userId) {
        writeUiPref(userId, `cols:${persistKey}`, { hidden: Object.keys(next).filter((k) => next[k] === false) })
      }
      return next
    })
  }, [persistKey, userId])

  /** بازنشانی چیدمان به پیش‌فرض نمای (همه ستون‌های مجاز نمایان) */
  const resetColumnLayout = useCallback(() => {
    setColumnVisibility({})
    if (persistKey && userId) writeUiPref(userId, `cols:${persistKey}`, { hidden: [] })
  }, [persistKey, userId])

  // P1-T35 — ظرف اسکرول لیست مجازی (فقط وقتی ردیف‌ها از آستانه گذشت)
  const scrollRef = useRef<HTMLDivElement>(null)

  // P2.5-U4 — پیش‌نمایش Master-Detail فقط در دسکتاپ (lg+) فعال است؛
  // در موبایل رفتار قبلی (کلیک = onRowClick → تب رکورد) می‌ماند.
  const isDesktop = useIsDesktop()
  const previewActive = !!preview && isDesktop

  // P2.5-U4 — roving tabindex: فقط ردیف فعال (یا اولین ردیف تا فوکوس اولیه ممکن باشد)
  const [focusId, setFocusId] = useState<string | null>(null)
  const focusRow = useCallback((id: string) => {
    setFocusId(id)
    const el = scrollRef.current?.querySelector<HTMLTableRowElement>(`tr[data-id="${CSS.escape(id)}"]`)
    if (el) {
      el.scrollIntoView({ block: 'nearest' })
      // در لیست مجازی، رندیر ردیف پس از scrollIntoView ممکن است یک فریم طول بکشد
      requestAnimationFrame(() => {
        const fresh = scrollRef.current?.querySelector<HTMLTableRowElement>(`tr[data-id="${CSS.escape(id)}"]`)
        if (fresh) fresh.focus()
      })
    }
  }, [])

  /**
   * P2.5-U4 — کیبورد ردیف: ↑↓ جابه‌جایی فوکوس (با پیش‌نمایش زنده اگر پنل باز است)،
   * Space/Enter = باز کردن پیش‌نمایش ردیف متمرکز، Esc = بستن پنل.
   * فقط وقتی رویداد از خود ردیف آمده (نه از دکمه/چک‌باکس درون سلول).
   * الگوی ref تازه (مانند bulkRef در U2): ردیف‌های memo شده closure کهنه نبینند —
   * selectedId درون closure کهنه باعث تصمیم غلط «پنل باز است؟» می‌شد.
   */
  const previewRef = useRef(preview)
  previewRef.current = preview
  const previewActiveRef = useRef(previewActive)
  previewActiveRef.current = previewActive
  // rowsRef پس از محاسبه rows_ تازه می‌شود (اعلان در جای خود — TDZ)
  const onRowKeyDown = useCallback((e: React.KeyboardEvent<HTMLTableRowElement>, row: T, index: number) => {
    const p = previewRef.current
    if (!p) return
    if (e.target !== e.currentTarget) return
    const move = (delta: 1 | -1) => {
      const next = rowsRef.current[index + delta]
      if (!next) return
      e.preventDefault()
      focusRow(next.original.id)
      // پیش‌نمایش زنده فقط وقتی پنل باز است — با پنل بسته، کلید فقط فوکوس می‌دهد
      if (previewActiveRef.current && p.selectedId != null) p.onPreview(next.original)
    }
    if (e.key === 'ArrowDown') return move(1)
    if (e.key === 'ArrowUp') return move(-1)
    if ((e.code === 'Space' || e.key === 'Enter') && previewActiveRef.current && !e.ctrlKey) {
      e.preventDefault()
      p.onPreview(row)
      return
    }
    // U9 — Ctrl+Enter روی ردیف متمرکز = تمام‌صفحه (تب رکورد) — پنل باز، تب کامل
    if (e.ctrlKey && e.key === 'Enter' && previewActiveRef.current && p.onOpenFull) {
      e.preventDefault()
      p.onOpenFull()
      return
    }
    // U9 — Esc با پنل باز (حتی بدون رکورد انتخابی): بستن پنل، نه تب فعال.
    // پیش‌تر selectedId!=null بود → پس از reload (پنل باز، بدون انتخاب) Esc به
    // میان‌بر سراسری می‌رسید و تب فهرست بسته می‌شد (کشف تست U9).
    if (e.key === 'Escape' && previewActiveRef.current && (p.selectedId != null || p.paneOpen)) {
      e.preventDefault()
      e.stopPropagation() // پیش از میان‌بر سراسری «بستن تب» (KeyboardShortcuts)
      p.onClose()
    }
  }, [focusRow])

  // حالت سرور (P1-T12): صفحه‌بندی/مرتب‌سازی در سرور — rows فقط یک صفحه است
  const serverMode = !!serverPagination
  const serverSortMode = !!serverSort && !!onServerSortChange
  const activePageSize = serverMode ? serverPagination.pageSize : size

  // دو حالت جستجو: کنترل‌شده (سرور — مثل نامه‌ها) یا داخلی (کلاینت — مثل موجودی)
  const serverSearch = typeof searchValue === 'string' && !!onSearchChange
  const globalFilter = serverSearch ? '' : internalFilter
  const showSearch = !!searchKeys || serverSearch

  // کلیک سرستون در حالت سروری — کلید سرور ستون به سرور می‌رود (toggle جهت)
  const toggleServerSort = (key: string) => {
    if (!onServerSortChange) return
    if (serverSort && serverSort.field === key) onServerSortChange(key, serverSort.dir === 'asc' ? 'desc' : 'asc')
    else onServerSortChange(key, 'desc')
  }
  const serverSortKeyOf = (key: string) => columns.find((c) => c.key === key)?.serverSortKey

  const tableColumns = useMemo<ColumnDef<T>[]>(() => columns.map((col) => ({
    id: col.key,
    header: col.header,
    accessorFn: col.sortValue ? (row: T) => col.sortValue!(row) : undefined,
    enableSorting: !!col.sortValue,
    enableHiding: col.enableHiding !== false,
    sortUndefined: 'last',
    cell: ({ row }) => col.cell(row.original),
    meta: { align: col.align, className: col.className, hideOnMobile: col.hideOnMobile },
  })), [columns])

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: { sorting: serverSortMode ? [] : sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange,
    onGlobalFilterChange: serverSearch ? undefined : setInternalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: serverSortMode ? undefined : getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: !serverMode && size > 0 ? getPaginationRowModel() : undefined,
    // P1-T35 — «همه» (size=0): مدل صفحه‌بندی در نمونه جدول کش می‌شود و حذف prop آن را
    // برنمی‌گرداند؛ manualPagination مسیر نهایی را به ردیف‌های پیش از صفحه‌بندی برمی‌گرداند.
    manualPagination: !serverMode && size === 0,
    globalFilterFn: (row, _columnId, filterValue) => {
      if (!searchKeys) return true
      const q = normalizeFaText(String(filterValue ?? ''))
      if (!q) return true
      const haystack = searchKeys(row.original)
        .filter((v) => v !== null && v !== undefined)
        .map((v) => normalizeFaText(String(v)))
        .join(' \u0000 ')
      return haystack.includes(q)
    },
    initialState: { pagination: { pageSize: size } },
  })

  // تغییر اندازه صفحه از خارج (pageSize ثابت هر نما) — فقط حالت کلاینت.
  // نکته: size=0 یعنی «همه» (P1-T35) — setPageSize صفر را به ۱ گیره می‌کند و
  // حلقه بی‌نهایت می‌سازد؛ در حالت ۰ مدل صفحه‌بندی اصلاً نصب نیست و نیازی به سنک نیست.
  if (!serverMode && size > 0 && table.getState().pagination.pageSize !== size) {
    table.setPageSize(size)
  }

  const rows_ = table.getRowModel().rows
  // P2.5-U4 — ref تازه فهرست ردیف‌ها برای onRowKeyDown (بدون closure کهنه)
  const rowsRef = useRef(rows_)
  rowsRef.current = rows_
  // شمارنده و ناوبری — در حالت سرور از total/page سرور (P1-T12)
  const total = serverMode ? serverPagination.total : table.getFilteredRowModel().rows.length
  const pageCount = serverMode
    ? Math.max(1, Math.ceil(serverPagination.total / Math.max(1, activePageSize)))
    : (table.getPageCount() || 1)
  const pageIndex = serverMode ? serverPagination.pageIndex : table.getState().pagination.pageIndex
  const from = total === 0 ? 0 : pageIndex * activePageSize + 1
  const to = Math.min((pageIndex + 1) * activePageSize, total)
  const colCount = table.getVisibleLeafColumns().length

  // P1-T35 — لیست مجازی: فقط ردیف‌های داخل پنجره دید + دو ردیف فاصله‌انداز بالا/پایین.
  // اندازه‌گیری پویا (measureElement) یعنی ردیف‌های چندخطی هم درست محاسبه می‌شوند.
  const virtualOn = !loading && rows_.length > VIRTUAL_THRESHOLD
  const rowVirtualizer = useVirtualizer({
    count: rows_.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 45,
    overscan: 12,
    getItemKey: (i) => rows_[i]?.original.id ?? i,
    enabled: virtualOn,
  })
  const virtualItems = virtualOn ? rowVirtualizer.getVirtualItems() : []
  const padTop = virtualItems.length > 0 ? Math.max(0, virtualItems[0].start) : 0
  const padBottom = virtualItems.length > 0
    ? Math.max(0, rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end)
    : 0

  // P1-T35 — callbackهای پایدار: هویت ثابت از مرور مجازی تا TableRowهای memo شده دیده شود
  const measureRef = useCallback((node: HTMLElement | null) => { if (node) rowVirtualizer.measureElement(node) }, [rowVirtualizer])
  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  // P2.5-U2 — انتخاب گروهی: callback پایدار با ref تازه (ردیفهای memo شده closure کهنه نبینند)
  const bulkRef = useRef(bulkSelection)
  bulkRef.current = bulkSelection
  const toggleSelect = useCallback((id: string) => {
    const bs = bulkRef.current
    if (!bs || bs.disabled) return
    bs.onSelectedIdsChange(
      bs.selectedIds.includes(id) ? bs.selectedIds.filter((x) => x !== id) : [...bs.selectedIds, id],
    )
  }, [])

  // وضعیت «انتخاب همه این صفحه» — سرستون: کامل / ناقص (indeterminate) / خالی
  const selectableRowIds = bulkSelection
    ? rows_.filter((r) => (bulkSelection.isRowSelectable?.(r.original) ?? true)).map((r) => r.original.id)
    : []
  const selectedIdSet = useMemo(() => new Set(bulkSelection?.selectedIds ?? []), [bulkSelection?.selectedIds])
  const allPageSelected = bulkSelection ? selectableRowIds.length > 0 && selectableRowIds.every((id) => selectedIdSet.has(id)) : false
  const somePageSelected = bulkSelection ? selectableRowIds.some((id) => selectedIdSet.has(id)) : false
  const toggleAllPage = () => {
    const bs = bulkRef.current
    if (!bs || bs.disabled || selectableRowIds.length === 0) return
    if (allPageSelected) {
      // حذف فقط انتخاب‌های همین صفحه — انتخاب‌های معتبر بیرون صفحه دست‌نخورده می‌ماند
      const drop = new Set(selectableRowIds)
      bs.onSelectedIdsChange(bs.selectedIds.filter((id) => !drop.has(id)))
    } else {
      bs.onSelectedIdsChange([...new Set([...bs.selectedIds, ...selectableRowIds])])
    }
  }

  // P2.5-U4 — رفتار کلیک ردیف: در دسکتاپ با preview فعال، کلیک = پیش‌نمایش
  // (الگوی Fiori FCL — پیمایش بدون باز/بستن تب)؛ در موبایل/بدون preview،
  // رفتار قبلی نما (onRowClick → معمولاً تب رکورد) دست‌نخورده می‌ماند.
  const effectiveRowClick = previewActive && preview
    ? (row: T) => { focusRow(row.id); preview.onPreview(row) }
    : onRowClick

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        {showSearch ? (
          <div className="relative w-full sm:w-72">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={serverSearch ? searchValue : internalFilter}
              onChange={(e) => {
                const v = e.target.value
                if (serverSearch) onSearchChange(v)
                else { setInternalFilter(v); table.setPageIndex(0) }
              }}
              onKeyDown={onSearchKeyDown}
              placeholder="جستجو..."
              className="ps-9"
              aria-label="جستجوی سراسری جدول"
              data-grid-search
            />
          </div>
        ) : null}
        {toolbar ? <div className="flex flex-1 flex-wrap items-center gap-2">{toolbar}</div> : null}
        <div className={cn('flex items-center gap-2', !showSearch && !toolbar && 'ms-auto')}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" aria-label="چیدمان ستون‌ها">
                <Columns3 className="h-3.5 w-3.5" /> ستون‌ها
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>نمایش ستون‌ها</DropdownMenuLabel>
              {table.getAllLeafColumns().filter((c) => c.getCanHide()).map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={c.getIsVisible()}
                  onCheckedChange={(v) => c.toggleVisibility(!!v)}
                  dir="rtl"
                  onSelect={(e) => e.preventDefault()}
                >
                  {columns.find((col) => col.key === c.id)?.header ?? c.id}
                </DropdownMenuCheckboxItem>
              ))}
              {persistKey ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem dir="rtl" onSelect={() => resetColumnLayout()}>
                    بازنشانی به پیش‌فرض
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          {PAGE_SIZES.length > 1 && (activePageSize > 0 || !serverMode) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 tabular-nums" aria-label="اندازه صفحه">
                  {pageSizeLabel(activePageSize)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {PAGE_SIZES.filter((s) => s === 0 || s <= Math.max(50, activePageSize) || activePageSize === 0).map((s) => (
                  <DropdownMenuCheckboxItem
                    key={s}
                    checked={s === activePageSize}
                    onCheckedChange={() => {
                      if (serverMode) serverPagination.onPageSizeChange?.(s)
                      else { setSize(s); table.setPageIndex(0); onPageSizeChange?.(s) }
                    }}
                    dir="rtl"
                    onSelect={(e) => e.preventDefault()}
                  >
                    {s === 0 ? 'همه سطرها (لیست مجازی)' : `${faDigits(s)} سطر در صفحه`}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 rounded-xl border bg-card p-3">
          {Array.from({ length: skeletonRows }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : rows_.length === 0 ? (
        <EmptyState text={emptyText} hint={emptyHint} action={emptyAction} />
      ) : (
        <div
          ref={scrollRef}
          className={cn('overflow-x-auto rounded-xl border bg-card', virtualOn && 'max-h-[70vh] overflow-y-auto')}
        >
          <Table>
            <TableHeader className={cn(virtualOn && 'sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]')}>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {bulkSelection ? (
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        ref={(el) => { if (el) el.indeterminate = somePageSelected && !allPageSelected }}
                        onChange={toggleAllPage}
                        disabled={bulkSelection.disabled || selectableRowIds.length === 0}
                        aria-label="انتخاب همه سطرهای این صفحه"
                        className="h-4 w-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </TableHead>
                  ) : null}
                  {expandedContent ? <TableHead className="w-10" aria-label="جزئیات" /> : null}
                  {hg.headers.map((header) => {
                    const meta = (header.column.columnDef.meta ?? {}) as { align?: string; hideOnMobile?: boolean }
                    const canSort = serverSortMode ? !!serverSortKeyOf(header.id) : header.column.getCanSort()
                    const sorted = serverSortMode
                      ? (serverSort && serverSortKeyOf(header.id) && serverSort.field === serverSortKeyOf(header.id) ? serverSort.dir : null)
                      : header.column.getIsSorted()
                    return (
                      <TableHead
                        key={header.id}
                        className={cn(
                          'text-start',
                          meta.align === 'center' && 'text-center',
                          meta.align === 'end' && 'text-end',
                          meta.hideOnMobile && 'hidden md:table-cell',
                        )}
                      >
                        {canSort ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              if (serverSortMode && serverSortKeyOf(header.id)) toggleServerSort(serverSortKeyOf(header.id)!)
                              else header.column.getToggleSortingHandler()?.(e)
                            }}
                            className="inline-flex items-center gap-1 font-medium hover:text-primary"
                            aria-label={`مرتب‌سازی بر اساس ${String(header.column.columnDef.header)}`}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === 'asc' ? <ChevronDown className="h-3 w-3 rotate-180" /> : sorted === 'desc' ? <ChevronDown className="h-3 w-3" /> : null}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {/* P1-T35 — ردیف فاصله‌انداز بالا (لیست مجازی) */}
              {virtualOn && padTop > 0 ? (
                <tr aria-hidden style={{ height: padTop }}>
                  <td colSpan={colCount + (expandedContent ? 1 : 0) + (bulkSelection ? 1 : 0)} className="p-0" />
                </tr>
              ) : null}
              {(virtualOn
                ? virtualItems.map((vi) => ({ row: rows_[vi.index], index: vi.index }))
                : rows_.map((row, index) => ({ row, index }))
              ).map(({ row, index }) => (
                <GridRow
                  key={row.original.id}
                  row={row}
                  index={index}
                  virtualOn={virtualOn}
                  measureRef={measureRef}
                  expandedContent={expandedContent}
                  isExpanded={expandedContent ? expandedId === row.original.id : false}
                  onToggleExpand={toggleExpand}
                  onRowClick={effectiveRowClick}
                  bulkSelected={bulkSelection ? selectedIdSet.has(row.original.id) : undefined}
                  bulkSelectable={bulkSelection ? (bulkSelection.isRowSelectable?.(row.original) ?? true) : undefined}
                  bulkDisabled={bulkSelection?.disabled}
                  onToggleSelect={toggleSelect}
                  bulkAriaLabel={bulkSelection?.rowAriaLabel?.(row.original)}
                  previewActive={previewActive}
                  previewSelected={preview ? preview.selectedId === row.original.id : false}
                  isFocusRow={preview ? (focusId === row.original.id || (focusId === null && index === 0)) : undefined}
                  onRowKeyDown={onRowKeyDown}
                />
              ))}
              {/* P1-T35 — ردیف فاصله‌انداز پایین (لیست مجازی) */}
              {virtualOn && padBottom > 0 ? (
                <tr aria-hidden style={{ height: padBottom }}>
                  <td colSpan={colCount + (expandedContent ? 1 : 0) + (bulkSelection ? 1 : 0)} className="p-0" />
                </tr>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && activePageSize > 0 && total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground tabular-nums">
            نمایش {faDigits(from)} تا {faDigits(to)} از {faNumber(total)} سطر
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline" size="sm"
              onClick={() => (serverMode ? serverPagination.onPageChange(pageIndex - 1) : table.previousPage())}
              disabled={serverMode ? pageIndex <= 0 : !table.getCanPreviousPage()} aria-label="صفحه قبل"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="min-w-16 text-center text-xs text-muted-foreground tabular-nums">
              صفحه {faDigits(pageIndex + 1)} از {faDigits(pageCount)}
            </span>
            <Button
              variant="outline" size="sm"
              onClick={() => (serverMode ? serverPagination.onPageChange(pageIndex + 1) : table.nextPage())}
              disabled={serverMode ? pageIndex >= pageCount - 1 : !table.getCanNextPage()} aria-label="صفحه بعد"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
