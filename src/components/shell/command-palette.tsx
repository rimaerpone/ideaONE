'use client'

/**
 * پالت فرمان (P1-T25) — ناوبری سراسری با Ctrl+K (الگوی Odoo/Axelor/VSCode).
 * گروه‌های نتیجه: «اقدامات پرکاربرد» · «نماها» · «نامه‌ها» (جستجوی سروری) · «محصولات» · «شرکا» (کش مشترک).
 *  - نماها: از رجیستری منوی پلاگین‌ها با همان گاردهای سایدبار (ماژول فعال + مدیر برای settings/users)
 *  - اقدامات: فرم‌های ثبت (گارد canWrite و شرکت عملیاتی) + راهنمای میان‌برها
 *  - نامه‌ها: جستجوی سروری q (قرارداد P1-T3) — فقط q ≥ ۲ نویسه؛ نتیجه = تب رکورد نامه
 *  - محصولات/شرکا: فیلتر کلاینت فارسی‌آگاه روی کش مشترک؛ نتیجه = نمای فهرست (رکورد اختصاصی در P4 ساخته می‌شود)
 *  - کیبورد کامل: ↑↓ جابه‌جایی · Enter انتخاب · Home/End · Esc بستن (Radix)
 * این یک «ابزار ناوبری» است نه پاپ‌آپ اطلاعاتی — اصل «نمایش اطلاعات در صفحه کامل» برقرار است.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApp } from '@/store/app'
import { useWorkspace } from '@/store/workspace'
import { useOverlays } from '@/store/overlays'
import { useCanWrite } from '@/hooks/use-can-write'
import { apiGet } from '@/core/shared/api-client'
import { normalizeFaText } from '@/core/shared/normalize'
import { viewLabel } from '@/core/shared/view-meta'
import { IconFor } from '@/components/shell/sidebar'
import { useProductsQuery } from '@/modules/products/queries'
import { usePartnersQuery } from '@/modules/partners/queries'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/common/ui-bits'
import type { ListEnvelope, LetterListItem } from '@/types/platform'
import { faDocNumber } from '@/core/shared/jalali'
import { cn } from '@/lib/utils'
import { FilePlus2, ClipboardCheck, ClipboardList, Package, Keyboard, Mail, Package as PackageIcon, HeartHandshake, Search } from 'lucide-react'

type PaletteItem = {
  key: string
  group: 'actions' | 'views' | 'letters' | 'products' | 'partners'
  icon: React.ReactNode
  label: string
  hint?: string
  /** متن جستجوی کلاینت (label + hint + keywords) */
  keywords?: string
  run: () => void
}

const GROUP_LABELS: Record<PaletteItem['group'], string> = {
  actions: 'اقدامات پرکاربرد',
  views: 'نماها',
  letters: 'نامه‌ها',
  products: 'محصولات',
  partners: 'شرکا',
}

const LETTER_TYPE_SHORT: Record<string, string> = { INCOMING: 'وارده', OUTGOING: 'صادره', INTERNAL: 'داخلی' }
const PARTNER_KIND_LABEL: Record<string, string> = { CUSTOMER: 'مشتری', SUPPLIER: 'تأمین‌کننده' }

/** جستجوی سروری نامه — قرارداد P1-T3 (q/pageSize)؛ فقط وقتی پالت باز و q ≥ ۲ */
function usePaletteLetters(q: string, enabled: boolean) {
  const me = useApp((s) => s.me)
  const companyId = me?.activeCompanyId
  return useQuery({
    queryKey: ['palette', 'letters', companyId, q],
    queryFn: () => apiGet<ListEnvelope<LetterListItem>>(
      `/api/letters?q=${encodeURIComponent(q)}&pageSize=5&sort=createdAt:desc`,
    ),
    enabled: enabled && q.trim().length >= 2,
    staleTime: 15_000,
  })
}

export function CommandPalette() {
  const open = useOverlays((s) => s.paletteOpen)
  const setPalette = useOverlays((s) => s.setPalette)
  const setHelp = useOverlays((s) => s.setHelp)
  const modules = useApp((s) => s.modules)
  const me = useApp((s) => s.me)
  const canWrite = useCanWrite()
  const { openView, openRecord, openNew } = useWorkspace()

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // debounce جستجو — نامه‌ها سروری است؛ ۲۵۰ms تا با هر کلید درخواست نرود
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  // بازنشانی وضعیت با هر باز شدن پالت — الگوی render-phase (بدون setState در effect)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setQuery('')
      setDebounced('')
      setActiveIndex(0)
    }
  }
  // فوکوس ورودی پس از باز شدن (اثر جانبی — جای درست effect)
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const activeCompany = me?.companies.find((c) => c.id === me.activeCompanyId)
  const isGroup = activeCompany?.type === 'GROUP'
  const canSettings = !!me?.user.isAdmin || activeCompany?.role === 'ADMIN'

  // ---------- منابع داده ----------
  const lettersQuery = usePaletteLetters(debounced, open)
  const productsQuery = useProductsQuery()
  const partnersQuery = usePartnersQuery()

  const items = useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = []
    const q = normalizeFaText(debounced)
    const matches = (s: string) => !q || normalizeFaText(s).includes(q)

    // --- نماها (همان گاردهای سایدبار/راه‌انداز) ---
    const viewItems: PaletteItem[] = [{ key: 'view:dashboard', group: 'views', icon: <IconFor name="LayoutDashboard" className="h-4 w-4" />, label: 'داشبورد', hint: 'نمای کلان و سنجه‌های گیت', keywords: 'dashboard', run: () => openView('dashboard') }]
    for (const m of modules) {
      if (m.status !== 'ACTIVE' || m.companyEnabled === false) continue
      for (const mi of m.menus) {
        if (['settings', 'users'].includes(mi.viewKey) && !canSettings) continue
        if (viewItems.some((v) => v.key === `view:${mi.viewKey}`)) continue
        viewItems.push({
          key: `view:${mi.viewKey}`, group: 'views',
          icon: <IconFor name={mi.icon} className="h-4 w-4" />,
          label: mi.label, hint: m.name, keywords: mi.viewKey,
          run: () => openView(mi.viewKey, mi.label, mi.icon),
        })
      }
    }
    viewItems.push({ key: 'view:my-account', group: 'views', icon: <IconFor name="UserRound" className="h-4 w-4" />, label: 'حساب من', hint: 'امنیت، نشست‌ها و گذرواژه', keywords: 'account profile', run: () => openView('my-account') })

    // --- اقدامات پرکاربرد ---
    if (canWrite && !isGroup) {
      out.push(
        { key: 'act:new-letter', group: 'actions', icon: <FilePlus2 className="h-4 w-4" />, label: 'ثبت نامه جدید', hint: 'فرم کامل در تب جدید', keywords: 'نامه جدید letter', run: () => openNew('letters') },
        { key: 'act:new-whdoc', group: 'actions', icon: <ClipboardCheck className="h-4 w-4" />, label: 'ثبت سند انبار جدید', hint: 'رسید / حواله / انتقال / شمارش', keywords: 'سند انبار whdoc', run: () => openNew('whdocs') },
        { key: 'act:new-request', group: 'actions', icon: <ClipboardList className="h-4 w-4" />, label: 'ثبت درخواست کالا', hint: 'درخواست از انبار برای واحد مصرف‌کننده', keywords: 'درخواست request', run: () => openNew('requests') },
        { key: 'act:new-product', group: 'actions', icon: <Package className="h-4 w-4" />, label: 'ثبت محصول جدید', hint: 'مستر دیتای شرکت فعال', keywords: 'محصول product', run: () => openNew('products') },
      )
    }
    out.push({ key: 'act:help', group: 'actions', icon: <Keyboard className="h-4 w-4" />, label: 'راهنمای میان‌برهای کیبورد', hint: 'کلید «؟»', keywords: 'کیبورد shortcut help', run: () => setHelp(true) })

    const filteredActions = out.filter((a) => matches(`${a.label} ${a.hint ?? ''} ${a.keywords ?? ''}`))
    const filteredViews = viewItems.filter((v) => matches(`${v.label} ${v.hint ?? ''} ${v.keywords ?? ''}`))

    // --- نامه‌ها (سروری) ---
    const letterItems: PaletteItem[] = (lettersQuery.data?.items ?? [])
      .slice(0, 5)
      .map((l) => ({
        key: `letter:${l.id}`, group: 'letters' as const,
        icon: <Mail className="h-4 w-4" />,
        label: l.subject,
        hint: `نامه ${faDocNumber(l.number, l.createdAt)} · ${LETTER_TYPE_SHORT[l.type] ?? l.type} · ${l.companyName}`,
        run: () => openRecord('letters', l.id, l.subject),
      }))

    // --- محصولات (کلاینت، کش مشترک) — فقط وقتی جستجویی هست (حالت خالی: نماها+اقدامات کافی‌اند) ---
    const productItems: PaletteItem[] = q.length === 0 ? [] : (productsQuery.data?.products ?? [])
      .filter((p) => matches(`${p.name} ${p.code} ${p.productLine} ${p.size} ${p.color} ${p.companyName}`))
      .slice(0, 5)
      .map((p) => ({
        key: `product:${p.id}`, group: 'products' as const,
        icon: <PackageIcon className="h-4 w-4" />,
        label: `${p.name} (${p.size})`,
        hint: `${p.code} · ${p.companyName}`,
        run: () => openView('products'),
      }))

    // --- شرکا (کلاینت، کش مشترک) — فقط وقتی جستجویی هست ---
    const partnerItems: PaletteItem[] = q.length === 0 ? [] : (partnersQuery.data?.partners ?? [])
      .filter((p) => matches(`${p.goldenName} ${p.nationalId ?? ''} ${PARTNER_KIND_LABEL[p.kind] ?? ''}`))
      .slice(0, 5)
      .map((p) => ({
        key: `partner:${p.id}`, group: 'partners' as const,
        icon: <HeartHandshake className="h-4 w-4" />,
        label: p.goldenName,
        hint: `${PARTNER_KIND_LABEL[p.kind] ?? p.kind} · ${p.instances.length > 0 ? p.instances.map((i) => i.companyName).join('، ') : 'بدون نمونه عملیاتی'}`,
        run: () => openView('partners'),
      }))

    return [...filteredActions, ...filteredViews, ...letterItems, ...productItems, ...partnerItems]
  }, [debounced, modules, canSettings, canWrite, isGroup, lettersQuery.data, productsQuery.data, partnersQuery.data, openView, openRecord, openNew, setHelp])

  // گروه‌بندی حفظ‌شده برای رندر عنوان‌ها
  const groups = useMemo(() => {
    const seen = new Map<PaletteItem['group'], PaletteItem[]>()
    for (const it of items) {
      const arr = seen.get(it.group) ?? []
      arr.push(it)
      seen.set(it.group, arr)
    }
    return [...seen.entries()]
  }, [items])

  // بازنشانی انتخاب فعال با تغییر جستجو — الگوی render-phase
  const [prevDebounced, setPrevDebounced] = useState(debounced)
  if (prevDebounced !== debounced) {
    setPrevDebounced(debounced)
    setActiveIndex(0)
  }

  // اسکرول آیتم فعال به دید (رفتار استاندارد پالت)
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const runItem = (item: PaletteItem) => {
    setPalette(false)
    // اجرا پس از بسته شدن پالت تا فوکوس در فرم/نمای مقصد بنشیند
    requestAnimationFrame(() => item.run())
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveIndex(items.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[activeIndex]
      if (item) runItem(item)
    }
  }

  let flatIndex = -1

  return (
    <Dialog open={open} onOpenChange={setPalette}>
      <DialogContent
        dir="rtl"
        showCloseButton={false}
        className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus() }}
      >
        <DialogTitle className="sr-only">پالت فرمان — جستجوی سراسری</DialogTitle>
        {/* ورودی جستجو */}
        <div className="flex items-center gap-2.5 border-b px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="جستجوی نما، نامه، محصول، شریک یا اقدام…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="جستجوی فرمان"
            autoComplete="off"
            spellCheck={false}
          />
          {debounced.length >= 2 && lettersQuery.isFetching ? (
            <span className="text-[10px] text-muted-foreground">در حال جستجو…</span>
          ) : null}
        </div>

        {/* نتایج */}
        <div ref={listRef} className="thin-scrollbar max-h-[55vh] overflow-y-auto p-2" role="listbox" aria-label="نتایج جستجو">
          {items.length === 0 ? (
            <EmptyState
              compact
              text="چیزی یافت نشد"
              hint={debounced ? `نتیجه‌ای برای «${debounced}» پیدا نشد؛ جستجو را کوتاه‌تر کنید یا از نماها شروع کنید.` : 'عبارتی بنویسید تا نماها، رکوردها و اقدامها فیلتر شوند.'}
            />
          ) : (
            groups.map(([group, groupItems]) => (
              <div key={group} className="mb-1">
                <p className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground">{GROUP_LABELS[group]}</p>
                {groupItems.map((item) => {
                  flatIndex += 1
                  const idx = flatIndex
                  const isActive = idx === activeIndex
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      data-idx={idx}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => runItem(item)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start transition-colors',
                        isActive ? 'bg-primary/10' : 'hover:bg-muted/60',
                      )}
                    >
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.label}</span>
                        {item.hint ? <span className="block truncate text-[11px] text-muted-foreground">{item.hint}</span> : null}
                      </span>
                      {isActive ? <span className="shrink-0 rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">Enter</span> : null}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* راهنمای کیبورد پایین پالت */}
        <div className="flex flex-wrap items-center gap-3 border-t bg-muted/40 px-4 py-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> جابه‌جایی</span>
          <span className="flex items-center gap-1"><Kbd>Enter</Kbd> انتخاب</span>
          <span className="flex items-center gap-1"><Kbd>Esc</Kbd> بستن</span>
          <span className="ms-auto flex items-center gap-1"><Kbd>؟</Kbd> راهنمای کامل میان‌برها</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-background px-1.5 py-0.5 font-sans text-[10px] leading-4 text-foreground/70">{children}</kbd>
}
