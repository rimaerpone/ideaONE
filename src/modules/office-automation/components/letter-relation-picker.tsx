'use client'

/**
 * انتخاب‌گر عطف نامه (P2-T9 / R9) — Popover با جستجوی سروری
 *
 * چرا جستجوی سروری نه فهرست محلی: نامه‌ها ۱۰هزار+ ردیف‌اند و فهرست کامل در
 * مرورگر نمی‌گنجد؛ همان قرارداد فهرست (FTS شماره نمایشی/موضوع/طرف) با pageSize=8
 * بازخوانده می‌شود — جستجوی «و ۱۴۰۵/۴۲» هم از همین مسیر جواب می‌گیرد.
 *
 * قرارداد: value = { id, subject } | null — والد فقط همین را نگه می‌دارد
 * (نمایش برچسب با subject؛ شماره نمایشی هنگام انتخاب از نتیجه سرور می‌آید).
 */

import { useEffect, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Link2, Loader2, Search, X } from 'lucide-react'
import { apiGet } from '@/core/shared/api-client'
import type { ListEnvelope, LetterListItem } from '@/types/platform'
import { LETTER_TYPE_LABELS } from '@/components/common/ui-bits'
import { StatusBadge } from '@/components/common/ui-bits'
import { cn } from '@/lib/utils'

export type RelationValue = { id: string; subject: string; displayNumber?: string } | null

const RESULT_COUNT = 8
const DEBOUNCE_MS = 350
const MIN_QUERY = 2

type Props = {
  value: RelationValue
  onChange: (v: RelationValue) => void
  disabled?: boolean
  /** متن دکمه در حالت بدون انتخاب */
  placeholder?: string
  /** دکمهٔ جدا برای حذف انتخاب (والد تصمیم می‌گیرد) */
  showClear?: boolean
  onClear?: () => void
  className?: string
  'aria-label'?: string
}

export function LetterRelationPicker({
  value, onChange, disabled = false, placeholder = 'عطف به نامه…', showClear = true, onClear, className, ...aria
}: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [items, setItems] = useState<LetterListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  // debounce جستجو — پس از ۳۵۰ms بی‌تحرک به سرور می‌رود
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [q])

  // جستجوی سرور (قرارداد فهرست نامه‌ها: FTS + fallback contains) —
  // بدنه effect فقط همگام‌سازی با سیستم بیرونی (لغو درخواست قبلی)؛ همهٔ setStateها داخل
  // تابع async جدا (قاعده react-hooks/set-state-in-effect)
  const runSearch = async (raw: string) => {
    const q = raw.trim()
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    if (q.length < MIN_QUERY) { setItems([]); setErr(null); setLoading(false); return }
    setLoading(true)
    setErr(null)
    try {
      const data = await apiGet<ListEnvelope<LetterListItem>>(
        `/api/letters?box=all&page=1&pageSize=${RESULT_COUNT}&sort=createdAt:desc&q=${encodeURIComponent(q)}`,
        { signal: ac.signal },
      )
      if (ac.signal.aborted) return
      setItems(data.items ?? [])
      setActive(0)
    } catch (e) {
      if (ac.signal.aborted || (e as Error).name === 'AbortError') return
      setErr(e instanceof Error ? e.message : 'جستجوی نامه ناموفق بود')
      setItems([])
    } finally {
      if (!ac.signal.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    void runSearch(debounced)
    return () => { abortRef.current?.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, open])

  const pick = (l: LetterListItem) => {
    onChange({ id: l.id, subject: l.subject, displayNumber: l.displayNumber })
    setOpen(false)
    setQ('')
    setDebounced('')
    setItems([])
  }

  const clear = () => {
    onChange(null)
    if (onClear) onClear()
  }

  // کیبورد داخل فیلد جستجو: ↑/↓ حرکت، Enter انتخاب
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); pick(items[active]) }
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} {...aria}>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setQ(''); setDebounced(''); setItems([]) } }}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="gap-1.5"
            title="جستجوی سروری در شماره/موضوع/فرستنده/گیرنده نامه‌ها"
          >
            <Link2 className="h-3.5 w-3.5" />
            {value ? (value.displayNumber ?? value.subject.slice(0, 40)) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[26rem] p-0" dir="rtl">
          <div className="flex items-center gap-2 border-b p-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="جستجو: شماره، موضوع، فرستنده یا گیرنده…"
              className="h-8 border-0 shadow-none focus-visible:ring-0"
            />
            {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : null}
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {debounced.length < MIN_QUERY ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                حداقل {MIN_QUERY} نویسه بنویسید — جستجو روی شماره نمایشی، موضوع و طرف‌های نامه
              </p>
            ) : err ? (
              <p className="px-3 py-6 text-center text-xs text-destructive">{err}</p>
            ) : items.length === 0 && !loading ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">نامه‌ای یافت نشد</p>
            ) : (
              items.map((l, i) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => pick(l)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex w-full flex-col items-start gap-1 rounded-md px-3 py-2 text-start text-sm hover:bg-accent',
                    i === active && 'bg-accent',
                  )}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="font-medium text-primary">{l.displayNumber}</span>
                    <Badge className="border-0 bg-primary/10 px-1.5 py-0 text-[10px] text-primary">{LETTER_TYPE_LABELS[l.type] ?? l.type}</Badge>
                    <StatusBadge status={l.status} />
                    <span className="ms-auto shrink-0 text-[10px] text-muted-foreground">{l.companyName}</span>
                  </span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">{l.subject}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
      {value ? (
        <span className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
          <Link2 className="h-3 w-3 text-primary" />
          <span className="max-w-48 truncate">{value.subject}</span>
        </span>
      ) : null}
      {showClear && value ? (
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={disabled} className="h-7 w-7 p-0" title="حذف عطف">
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  )
}
