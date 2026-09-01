'use client'

/**
 * انتخاب‌گر قابل جستجو (P1-T21) — برای گزینه‌های زیاد (کالا/شریک با ۲۰۰+ آیتم)
 *
 *  - جستجوی فارسی‌آگاه داخل dropdown (normalizeFaText: ارقام فارسی/عربی، ک/ی عربی، نیم‌فاصله)
 *  - صفحه‌بندی داخلی: ۳۰ نتیجه اول + «نمایش N مورد دیگر»
 *  - کیبورد: ↑/↓ حرکت، Enter انتخاب، Esc بستن
 *  - hint = زیرمتن گزینه (مثلاً کد کالا زیر نام)
 * وابستگی جدیدی اضافه نشده — همان Popover/Input/Button موجود.
 */
import { useId, useMemo, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronsUpDown, Loader2, Search, UserRoundCheck } from 'lucide-react'
import { normalizeFaText } from '@/core/shared/normalize'
import { faDigits } from '@/core/shared/jalali'
import { cn } from '@/lib/utils'

export type SearchSelectOption = {
  value: string
  label: string
  /** زیرمتن اختیاری — کد/اندازه/شرکت زیر نام */
  hint?: string
}

const PAGE = 30

type Props = {
  options: SearchSelectOption[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  loading?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

export function SearchSelect({
  options, value, onChange, placeholder = 'انتخاب...', searchPlaceholder = 'جستجو...',
  emptyText = 'موردی یافت نشد', loading = false, disabled = false, className, ...aria
}: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [active, setActive] = useState(0)
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const needle = normalizeFaText(q)
    if (!needle) return options
    return options.filter((o) => {
      const hay = normalizeFaText(`${o.label} ${o.hint ?? ''}`)
      return hay.includes(needle)
    })
  }, [options, q])

  const visible = filtered.slice(0, limit)
  const rest = filtered.length - visible.length

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
    setQ('')
    setLimit(PAGE)
    setActive(0)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, visible.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = visible[active]
      if (opt) pick(opt.value)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) { setQ(''); setLimit(PAGE); setActive(0); setTimeout(() => inputRef.current?.focus(), 30) }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled}
          aria-label={aria['aria-label'] ?? placeholder}
          className={cn('h-9 w-full justify-between font-normal', className)}
        >
          {loading && !selected ? (
            <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> در حال بارگذاری…</span>
          ) : selected ? (
            <span className="flex min-w-0 flex-col items-start">
              <span className="w-full truncate text-sm">{selected.label}</span>
              {selected.hint ? <span className="w-full truncate text-[10px] text-muted-foreground" dir="ltr">{selected.hint}</span> : null}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0" align="start" dir="rtl">
        <div className="flex items-center gap-2 border-b px-2.5 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setLimit(PAGE); setActive(0) }}
            onKeyDown={onKey}
            placeholder={searchPlaceholder}
            className="h-7 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            aria-label={searchPlaceholder}
            aria-controls={listId}
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1" role="listbox" id={listId} aria-label={placeholder}>
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyText}</p>
          ) : (
            <>
              {visible.map((o, i) => (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => pick(o.value)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-start text-sm transition-colors',
                    i === active && 'bg-accent',
                    o.value === value && 'font-medium text-primary',
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{o.label}</span>
                    {o.value === value ? <UserRoundCheck className="h-3.5 w-3.5 shrink-0" /> : null}
                  </span>
                  {o.hint ? <span className="w-full truncate text-[10px] text-muted-foreground" dir="ltr">{o.hint}</span> : null}
                </button>
              ))}
              {rest > 0 ? (
                <button
                  type="button"
                  onClick={() => setLimit((l) => l + PAGE)}
                  className="w-full rounded-md px-2.5 py-2 text-center text-xs text-primary hover:bg-accent"
                >
                  نمایش {faDigits(rest)} مورد دیگر
                </button>
              ) : null}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
