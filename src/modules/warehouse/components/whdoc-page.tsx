'use client'

/**
 * صفحه رکورد سند انبار (P1.5-T9) — جایگزین دیالوگ جزئیات و دیالوگ فرم ثبت سند.
 * الگوی ERP: هدر اطلاعاتی (نوع/شماره/وضعیت/تاریخ/انبارها/طرف/جمع) + نوار وضعیت
 * (پیش‌نویس → قطعی؛ ابطال خارج از مسیر) + نوار اقدام + جدول اقلام.
 * فرم ثبت هم صفحه است: هدر اطلاعاتِ فرم + بدنه اقلام + جمع زنده + نوار اقدام چسبان.
 */

import { useMemo, useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch, type Control, type FieldValues, type Path } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { useApp } from '@/store/app'
import { useWorkspace, type WorkspaceTab } from '@/store/workspace'
import { useCanWrite } from '@/hooks/use-can-write'
import { useRecordInnerTab } from '@/hooks/use-record-inner-tab'
import { useDirtyTracking } from '@/hooks/use-dirty-tracking'
import { apiPost } from '@/core/shared/api-client'
import { parseNumericInput } from '@/core/shared/normalize'
import { faJalaliDate } from '@/core/forms/schemas'
import { useWarehousesQuery, useProductsOptionsQuery, useWhDocQuery, useProductStockQuery, usePartnerNamesQuery } from '@/modules/warehouse/queries'
import { QK_PREFIX } from '@/core/query/keys'
import { DOC_TYPE_LABELS, StatusBadge, GRADE_LABELS } from '@/components/common/ui-bits'
import { RecordPageShell } from '@/components/common/record-page-shell'
import { FormSection } from '@/components/common/form-section'
import { FieldInput, FieldJalaliDate, FieldSelect, FieldTextarea, FormError, KbdHint, RowError, RowWarning } from '@/components/common/form-bits'
import { SearchSelect } from '@/components/common/search-select'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Copy, Loader2, Plus, Trash2 } from 'lucide-react'
import { formatJalali, faDigits, faNumber, toJalaliInputString } from '@/core/shared/jalali'
import { toastErr, toastOk } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { clearDraft, draftKey, DraftAutosave, useDraftRestore } from '@/hooks/use-draft'
import { AutosaveIndicator, RestoredDraftBanner } from '@/components/common/draft-banner'
import { RecordTimeline } from '@/components/common/record-timeline'

// مقدار نگهبان برای گزینه «بدون» (Radix Select اجازه value خالی نمی‌دهد)
const NONE = 'none'
const GRADE_ORDER = ['1', '2', 'w']
const DOC_TYPES: { value: string; label: string }[] = [
  { value: 'RECEIPT', label: 'رسید (افزایش موجودی)' },
  { value: 'ISSUE', label: 'حواله (کاهش موجودی)' },
  { value: 'TRANSFER', label: 'انتقال بین‌انباری' },
  { value: 'COUNT', label: 'شمارش (اصلاح مغایرت)' },
]
const DOC_STEPS = [
  { key: 'DRAFT', label: 'پیش‌نویس' },
  { key: 'POSTED', label: 'قطعی و اعمال‌شده روی موجودی' },
]

export function WhDocPage({ tab }: { tab: WorkspaceTab }) {
  if (tab.recordId === 'new') return <NewWhDocPage tabId={tab.id} />
  return <WhDocDetailPage recordId={tab.recordId!} />
}

// ---------------- صفحه جزئیات سند ----------------

function WhDocDetailPage({ recordId }: { recordId: string }) {
  const canWrite = useCanWrite()
  const { data, isLoading, error, refetch } = useWhDocQuery(recordId)
  const doc = data?.doc ?? null
  const [pending, setPending] = useState<'POST' | 'CANCEL' | null>(null)
  const [busy, setBusy] = useState(false)
  // P2.5-U5 — تب داخلی رکورد: اقلام | خط زمان؛ U10 — ماندگاری + deep-link (?t=)
  const [innerTab, setInnerTab] = useRecordInnerTab('whdocs', recordId, [{ key: 'items' }, { key: 'timeline' }])
  const queryClient = useQueryClient()

  const decide = async (action: 'POST' | 'CANCEL') => {
    setBusy(true)
    try {
      await apiPost('/api/whdocs/decide', { docId: recordId, action })
      toastOk({ title: 'انجام شد', description: action === 'POST' ? 'سند قطعی و موجودی به‌روزرسانی شد' : 'سند ابطال شد' })
      setPending(null)
      await refetch()
      void queryClient.invalidateQueries({ queryKey: QK_PREFIX.whdocs })
      void queryClient.invalidateQueries({ queryKey: QK_PREFIX.stock })
      void queryClient.invalidateQueries({ queryKey: QK_PREFIX.timeline })
    } catch (e) {
      toastErr({ description: e instanceof Error ? e.message : 'عملیات ناموفق' })
    } finally {
      setBusy(false)
    }
  }

  const totalM2 = useMemo(() => (doc?.items ?? []).reduce((s, i) => s + i.qtyM2, 0), [doc])

  return (
    <>
      <RecordPageShell
        viewKey="whdocs"
        icon="ClipboardCheck"
        title={doc ? `${DOC_TYPE_LABELS[doc.type]} ${faDigits(doc.docNumber)}` : 'سند انبار'}
        loading={isLoading}
        error={error instanceof Error ? error.message : error ? 'سند بارگذاری نشد' : null}
        onRetry={() => void refetch()}
        badges={doc ? (
          <>
            <Badge className="border-0 bg-primary/10 text-primary">سند انبار</Badge>
            <StatusBadge status={doc.status} />
          </>
        ) : null}
        statusSteps={{ steps: DOC_STEPS, currentIndex: doc ? (doc.status === 'POSTED' ? 1 : 0) : 0 }}
        statusError={doc?.status === 'CANCELLED' ? 'ابطال‌شده' : null}
        info={doc ? [
          { label: 'نوع سند', value: DOC_TYPE_LABELS[doc.type] },
          { label: 'تاریخ سند', value: formatJalali(doc.docDate) },
          { label: doc.type === 'TRANSFER' ? 'انبار مبدأ' : 'انبار', value: doc.warehouseName },
          ...(doc.type === 'TRANSFER' ? [{ label: 'انبار مقصد', value: doc.toWarehouseName ?? '—' }] : []),
          { label: 'طرف حساب', value: doc.partnerName ?? '—' },
          { label: 'شرکت', value: doc.companyName },
          { label: 'جمع اقلام', value: `${faNumber(totalM2)} م²` },
          { label: 'شمار اقلام', value: `${faNumber(doc.items.length)} قلم` },
        ] : undefined}
        aside={doc ? (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium tabular-nums text-primary">
            جمع سند: {faNumber(totalM2)} م² · {faDigits(doc.items.length)} قلم
          </span>
        ) : undefined}
        actions={doc && doc.status === 'DRAFT' && canWrite ? (
          <>
            <Button size="sm" onClick={() => setPending('POST')} className="gap-1.5">قطعی‌سازی و اعمال موجودی</Button>
            <Button size="sm" variant="outline" onClick={() => setPending('CANCEL')} className="gap-1.5">ابطال پیش‌نویس</Button>
          </>
        ) : undefined}
        innerTabs={[
          { key: 'items', label: `اقلام (${faNumber(doc?.items.length ?? 0)})` },
          { key: 'timeline', label: 'خط زمان اقدامات' },
        ]}
        activeInnerTab={innerTab}
        onInnerTabChange={setInnerTab}
      >
        {doc ? (
          innerTab === 'timeline'
            ? <RecordTimeline entity="warehouseDoc" recordId={doc.id} />
            : (
          <div className="space-y-4">
            {/* جدول اقلام سند */}
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">#</TableHead>
                    <TableHead className="text-start">کالا</TableHead>
                    <TableHead className="text-center">تون</TableHead>
                    <TableHead className="text-center">کالیبر</TableHead>
                    <TableHead className="text-center">درجه</TableHead>
                    <TableHead className="text-start">مترمربع</TableHead>
                    <TableHead className="text-start hidden md:table-cell">یادداشت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doc.items.map((it, idx) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-xs text-muted-foreground">{faDigits(idx + 1)}</TableCell>
                      <TableCell>
                        <p className="text-xs font-medium">{it.productName}</p>
                        <p className="text-[10px] text-muted-foreground" dir="ltr">{it.productCode}</p>
                      </TableCell>
                      <TableCell className="text-center text-xs">{it.tone ? `تون ${it.tone}` : '—'}</TableCell>
                      <TableCell className="text-center text-xs">{it.caliber || '—'}</TableCell>
                      <TableCell className="text-center text-xs">{GRADE_LABELS[it.grade] ?? it.grade}</TableCell>
                      <TableCell className={cn('text-start text-xs font-bold tabular-nums', it.qtyM2 < 0 && 'text-red-600')}>
                        {faNumber(it.qtyM2)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{it.note ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {doc.note ? (
              <div className="rounded-xl border bg-muted/30 p-4 text-sm leading-6">{doc.note}</div>
            ) : null}
          </div>
            )
        ) : null}
      </RecordPageShell>

      {/* P1-T23 — تأیید اقدام مخرب با متن پیامد */}
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => { if (!o) setPending(null) }}
        destructive={pending === 'CANCEL'}
        busy={busy}
        title={pending === 'POST'
          ? `قطعی‌سازی سند ${doc ? faDigits(doc.docNumber) : ''}؟`
          : `ابطال پیش‌نویس ${doc ? faDigits(doc.docNumber) : ''}؟`}
        description={pending === 'POST'
          ? 'سند قطعی می‌شود و موجودی انبار بلافاصله به تفکیک تون/کالیبر/درجه به‌روزرسانی می‌گردد؛ این عمل در پایلوت برگشت‌ناپذیر است.'
          : 'پیش‌نویس ابطال می‌شود و دیگر قابل قطعی‌سازی نخواهد بود. اقلام آن هیچ اثری روی موجودی نداشته و نخواهند داشت.'}
        confirmLabel={pending === 'POST' ? 'قطعی‌سازی' : 'ابطال پیش‌نویس'}
        onConfirm={() => void decide(pending!)}
      />
    </>
  )
}

// ---------------- فرم ثبت سند انبار (صفحه، نه دیالوگ) ----------------

const docFormSchema = z.object({
  type: z.enum(['RECEIPT', 'ISSUE', 'TRANSFER', 'COUNT']),
  warehouseId: z.string().min(1, 'انبار الزامی است'),
  toWarehouseId: z.string(),
  partnerName: z.string().trim().max(200, 'حداکثر ۲۰۰ نویسه مجاز است'),
  note: z.string().trim().max(1000, 'حداکثر ۱۰۰۰ نویسه مجاز است'),
  docDate: faJalaliDate('تاریخ سند'),
  items: z.array(z.object({
    productId: z.string(),
    tone: z.string(),
    caliber: z.string(),
    grade: z.string(),
    qtyM2: z.string(),
  })),
  // فیلد مجازی — خطای «سطح فرم» اقلام اینجا می‌نشیند تا با خطاهای سطری تداخل نکند
  itemsRoot: z.string(),
}).superRefine((v, ctx) => {
  // آینه سرور: «برای انتقال، انبار مقصد الزامی است»
  if (v.type === 'TRANSFER' && !v.toWarehouseId) {
    ctx.addIssue({ code: 'custom', path: ['toWarehouseId'], message: 'برای انتقال، انبار مقصد الزامی است' })
  }
  // آینه سرور: «مقدار هر قلم باید عددی غیرصفر باشد» — سطرهای بدون کالا نادیده
  v.items.forEach((it, idx) => {
    if (!it.productId) return
    const qty = parseNumericInput(it.qtyM2)
    if (qty === null || qty === 0) {
      ctx.addIssue({ code: 'custom', path: ['items', idx, 'qtyM2'], message: 'مقدار هر قلم باید عددی غیرصفر باشد' })
    }
  })
  const valid = v.items.filter((it) => it.productId && (parseNumericInput(it.qtyM2) ?? 0) !== 0)
  if (valid.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['itemsRoot'], message: 'حداقل یک قلم کالا الزامی است' })
  }
})
type DocFormValues = z.infer<typeof docFormSchema>

const emptyItem = () => ({ productId: '', tone: 'A', caliber: '۱', grade: '1', qtyM2: '' })

/** مقادیر اولیه فرم — جدا از کامپوننت تا در useDraftRestore مبنای merge باشد (P1-T24) */
function whdocDefaults(): DocFormValues {
  return {
    type: 'RECEIPT', warehouseId: '', toWarehouseId: '', partnerName: '', note: '',
    docDate: toJalaliInputString(new Date()), items: [emptyItem()], itemsRoot: '',
  }
}

function NewWhDocPage({ tabId }: { tabId: string }) {
  const me = useApp((s) => s.me)
  const activeCompany = me?.companies.find((c) => c.id === me.activeCompanyId)
  const isGroup = activeCompany?.type === 'GROUP'
  const canWrite = useCanWrite()
  const materializeTab = useWorkspace((s) => s.materializeTab)
  const closeTab = useWorkspace((s) => s.closeTab)
  const queryClient = useQueryClient()
  const warehousesQuery = useWarehousesQuery()
  const productsQuery = useProductsOptionsQuery()
  // بررسی عمیق فرم‌ها — ۱۴۰۵/۰۶: پیشنهاد طرف حساب از شرکای شرکت فعال
  const partnerNamesQuery = usePartnerNamesQuery()
  const [busy, setBusy] = useState(false)

  // P1-T24 — ذخیره خودکار پیش‌نویس per-view شرکت‌محور؛ بازیابی هنگام mount
  const defaults = useMemo(whdocDefaults, [])
  const { initial, savedAt: draftSavedAt } = useDraftRestore('whdocs', me?.activeCompanyId, defaults)
  const storageKey = draftKey('whdocs', me?.activeCompanyId)
  const [restoredAt, setRestoredAt] = useState<number | null>(draftSavedAt)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)

  const { control, handleSubmit, reset, watch, formState: { errors, isDirty } } = useForm<DocFormValues>({
    resolver: zodResolver(docFormSchema),
    defaultValues: initial,
  })
  // P2.5-U10 — گارد بستن تب کثیف: نقطه روی تب + ConfirmDialog پیش از بستن
  useDirtyTracking(tabId, isDirty, 'فرم سند انبار (پیش‌نویس خودکار دارد)')
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const type = watch('type')
  const warehouseId = watch('warehouseId')
  // P1-T22 — useWatch الگوی ارجاع‌شده RHF برای آرایه‌ها: هر تغییرِ قلم (کالا/مقدار) جمع زنده را رفرش می‌کند
  const itemsWatch = useWatch({ control, name: 'items', defaultValue: [] as DocFormValues['items'] })
  const warehouses = (warehousesQuery.data?.warehouses ?? []).filter((w) => !activeCompany || w.companyCode === activeCompany.code)
  const products = (productsQuery.data?.products ?? []).filter((p) => !activeCompany || p.companyCode === activeCompany.code)
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId)
  // P1-T22 — جمع زنده م² در هدر اطلاعاتی فرم (فقط اقلام معتبر: کالا انتخاب‌شده + عدد غیرصفر)
  const liveSum = useMemo(() => (itemsWatch ?? []).reduce((sum, it) => {
    const qty = it.productId ? parseNumericInput(it.qtyM2) : null
    return sum + (qty && qty !== 0 ? qty : 0)
  }, 0), [itemsWatch])
  const validCount = useMemo(() => (itemsWatch ?? []).filter((it) => it.productId && (parseNumericInput(it.qtyM2) ?? 0) !== 0).length, [itemsWatch])
  // بررسی عمیق فرم‌ها — ۱۴۰۵/۰۶: کشف قلم تکراری (کالا+تون+کالیبر+درجه یکسان در دو سطر)
  const duplicateIdxs = useMemo(() => {
    const seen = new Map<string, number[]>()
    ;(itemsWatch ?? []).forEach((it, i) => {
      if (!it.productId) return
      const k = `${it.productId}|${it.tone}|${it.caliber}|${it.grade}`
      seen.set(k, [...(seen.get(k) ?? []), i])
    })
    const dups = new Set<number>()
    for (const idxs of seen.values()) if (idxs.length > 1) idxs.forEach((i) => dups.add(i))
    return dups
  }, [itemsWatch])
  // خطای سطری اقلام — superRefine با path ['items', idx, field] می‌نویسد
  const itemError = (idx: number, key: 'productId' | 'qtyM2') =>
    (errors.items as unknown as Record<number, Record<string, { message?: string }>> | undefined)?.[idx]?.[key]?.message

  const submit = (post: boolean) => handleSubmit(async (v) => {
    setBusy(true)
    try {
      const rows = v.items
        .filter((i) => i.productId)
        .map((i) => ({ ...i, qty: parseNumericInput(i.qtyM2) }))
        .filter((i) => (i.qty ?? 0) !== 0)
      const d = await apiPost<{ id: string; docNumber: number }>('/api/whdocs', {
        type: v.type, warehouseId: v.warehouseId, toWarehouseId: v.toWarehouseId || undefined,
        partnerName: v.partnerName || undefined, note: v.note || undefined, post,
        docDate: v.docDate || undefined,
        items: rows.map((i) => ({
          productId: i.productId,
          tone: i.tone === NONE ? '' : i.tone,
          caliber: i.caliber === NONE ? '' : i.caliber,
          grade: i.grade,
          qtyM2: i.qty as number,
        })),
      })
      toastOk({ title: post ? 'سند قطعی شد' : 'پیش‌نویس ذخیره شد', description: `شماره سند: ${faDigits(d.docNumber)}` })
      clearDraft(storageKey) // P1-T24 — پیش‌نویس پس از ثبت موفق پاک می‌شود
      reset(whdocDefaults())
      void queryClient.invalidateQueries({ queryKey: QK_PREFIX.whdocs })
      void queryClient.invalidateQueries({ queryKey: QK_PREFIX.stock })
      // جامه‌ویژه: تب «سند جدید» → «رسید ۴۵» (P1.5-T1)
      materializeTab(tabId, d.id, `${DOC_TYPE_LABELS[v.type]} ${faDigits(d.docNumber)}`)
    } catch (e) {
      toastErr({ description: e instanceof Error ? e.message : 'ثبت ناموفق' })
    } finally {
      setBusy(false)
    }
  })

  // P1-T24 — دورریختن پیش‌نویس بازیابی‌شده: بازگشت به پیش‌فرض‌ها
  const discardDraft = () => {
    clearDraft(storageKey)
    reset(whdocDefaults())
    setRestoredAt(null)
    setLastSavedAt(null)
  }

  // P1-T27 — Ctrl+Enter = ذخیره پیش‌نویس (مسیر امن) · Ctrl+Shift+Enter = ثبت و قطعی‌سازی
  const onFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit(e.shiftKey)()
    }
  }

  const qtyHint = type === 'ISSUE' ? 'مقدار منفی وارد کنید (کاهش موجودی)' : type === 'COUNT' ? 'کسری/افزایشی شمارش را با علامت وارد کنید' : 'مقدار مثبت (افزایش موجودی)'
    + ' — ارقام فارسی و جداکننده ٫ پذیرفته می‌شود (مثلاً ۱٬۲۰۰٫۵)'

  return (
    <RecordPageShell
      viewKey="whdocs"
      icon="ClipboardCheck"
      title="ثبت سند انبار"
      badges={(
        <>
          <Badge className="border-0 bg-primary/10 text-primary">{DOC_TYPE_LABELS[type]}</Badge>
          <StatusBadge status="DRAFT" />
        </>
      )}
      statusSteps={{ steps: DOC_STEPS, currentIndex: 0 }}
      info={[
        { label: 'شماره سند', value: 'پس از ثبت، خودکار صادر می‌شود' },
        { label: 'شرکت فعال', value: activeCompany?.name ?? '—' },
        { label: 'انبار انتخابی', value: selectedWarehouse?.name ?? '—' },
        { label: 'شمار اقلام معتبر', value: `${faDigits(validCount)} قلم` },
      ]}
      aside={(
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium tabular-nums text-primary">
          جمع زنده: {faNumber(liveSum)} م² · {faDigits(validCount)} قلم معتبر
        </span>
      )}
      footer={(
        <>
          <Button type="button" variant="outline" onClick={() => { clearDraft(storageKey); closeTab(tabId) }}>انصراف و بستن تب</Button>
          <Button type="button" variant="secondary" onClick={submit(false)} disabled={busy || isGroup || !canWrite} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ذخیره پیش‌نویس
          </Button>
          <Button type="button" onClick={submit(true)} disabled={busy || isGroup || !canWrite} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ثبت و قطعی‌سازی
          </Button>
          <span className="ms-auto flex flex-wrap items-center gap-3">
            <KbdHint keys={['Ctrl', 'Enter']} action="ذخیره پیش‌نویس" />
            <KbdHint keys={['Ctrl', 'Shift', 'Enter']} action="ثبت و قطعی‌سازی" />
            <AutosaveIndicator lastSavedAt={lastSavedAt} />
          </span>
          {isGroup ? <p className="text-xs text-amber-600">برای ثبت سند، به یک شرکت عملیاتی سوئیچ کنید.</p> : null}
        </>
      )}
    >
      {/* P1-T24 — بنر بازیابی پیش‌نویس (فقط وقتی ذخیره‌ای موجود بوده) */}
      {restoredAt !== null ? <RestoredDraftBanner savedAt={restoredAt} onDiscard={discardDraft} /> : null}
      <DraftAutosave control={control} storageKey={storageKey} onSaved={setLastSavedAt} />
      <form noValidate className="space-y-4" onKeyDown={onFormKeyDown}>
        {/* P2.5-U1 — سکشن‌بندی ERP: سرشناسه سند / اقلام (الگوی D365 Section) */}
        <FormSection
          title="سرشناسه سند"
          description="نوع، انبار و تاریخ — قطعی‌سازی سند موجودی انبار را در همان تراکنش به‌روز می‌کند"
          cols={3}
        >
          <FieldSelect control={control} name="type" label="نوع سند" options={DOC_TYPES} required />
          <FieldSelect
            control={control} name="warehouseId" label={`انبار ${type === 'TRANSFER' ? 'مبدأ' : ''}`} required
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            placeholder="انتخاب انبار..."
          />
          <FieldJalaliDate control={control} name="docDate" label="تاریخ سند" placeholder="تاریخ سند (پیش‌فرض امروز)" hint="خالی = امروز" />
          {type === 'TRANSFER' ? (
            <FieldSelect
              control={control} name="toWarehouseId" label="انبار مقصد" required
              options={warehouses.filter((w) => w.id !== warehouseId).map((w) => ({ value: w.id, label: w.name }))}
              placeholder="انتخاب انبار مقصد..."
            />
          ) : null}
          {type === 'RECEIPT' || type === 'ISSUE' ? (
            <FieldInput
              control={control} name="partnerName"
              label={type === 'RECEIPT' ? 'طرف حساب (تولید/خرید/مرجوعی)' : 'طرف حساب (فروش/مصرف‌کننده)'}
              placeholder="مثلاً: خط تولید ۱ یا ابنیه مسکن"
              list="whdoc-partner-options"
              hint="نام‌های شرکای شرکت فعال پیشنهاد می‌شود — یا آزاد بنویسید"
            />
          ) : null}
          {/* بررسی عمیق فرم‌ها — datalist طرف حساب از رکوردهای طلایی شرکا */}
          <datalist id="whdoc-partner-options">
            {(partnerNamesQuery.data ?? []).map((n) => <option key={n} value={n} />)}
          </datalist>
        </FormSection>

        {/* اقلام سند */}
        <FormSection
          title="اقلام سند"
          description="جستجوی کالا + مشخصه‌های واریانت (تون/کالیبر/درجه) + متراژ — موجودی زنده زیر هر قلم"
          cols="free"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-primary">
                جمع کل: {faNumber(liveSum)} م² · {faDigits(validCount)} قلم معتبر
              </span>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => append(emptyItem())} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> افزودن قلم
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">{qtyHint}</p>
          <FormError message={errors.itemsRoot?.message} />
          <div className="mt-3 space-y-3">
            {fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-6">
                <div className="col-span-2 space-y-1">
                  <Label className="text-[10px]">کالا</Label>
                  {/* P1-T21 — جستجوی فارسی داخل dropdown برای فهرست بلند کالا */}
                  <Controller
                    control={control}
                    name={`items.${idx}.productId` as const}
                    render={({ field: f }) => (
                      <SearchSelect
                        value={f.value ?? ''}
                        onChange={(v) => f.onChange(v === f.value ? '' : v)}
                        loading={productsQuery.isLoading}
                        placeholder="جستجوی کالا..."
                        aria-label={`انتخاب کالای قلم ${idx + 1}`}
                        options={products.map((p) => ({ value: p.id, label: `${p.name} (${p.size})`, hint: p.code }))}
                      />
                    )}
                  />
                  <RowError message={itemError(idx, 'productId')} />
                  <ItemStockHint
                    warehouseId={warehouseId}
                    productId={itemsWatch?.[idx]?.productId ?? ''}
                    tone={itemsWatch?.[idx]?.tone ?? 'A'}
                    caliber={itemsWatch?.[idx]?.caliber ?? '۱'}
                    grade={itemsWatch?.[idx]?.grade ?? '1'}
                    qtyM2={itemsWatch?.[idx]?.qtyM2 ?? ''}
                    docType={type}
                  />
                  {duplicateIdxs.has(idx) ? (
                    <RowWarning message="قلم تکراری — همین کالا/تون/کالیبر/درجه در سطر دیگری هم هست؛ اگر عمدی نیست، یکی را حذف کنید" />
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">تون</Label>
                  <FieldSelect
                    control={control} name={`items.${idx}.tone` as const} label=""
                    options={[NONE, 'A', 'B', 'C'].map((t) => ({ value: t, label: t === NONE ? 'بدون تون' : `تون ${t}` }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">کالیبر</Label>
                  <FieldSelect
                    control={control} name={`items.${idx}.caliber` as const} label=""
                    options={[NONE, '۱', '۲', '۳'].map((c) => ({ value: c, label: c === NONE ? 'بدون' : c }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">درجه</Label>
                  <FieldSelect
                    control={control} name={`items.${idx}.grade` as const} label=""
                    options={GRADE_ORDER.map((g) => ({ value: g, label: GRADE_LABELS[g] }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">مترمربع</Label>
                  <div className="flex items-center gap-1">
                    {/* P1-T16 — ورودی عددی فارسی‌پذیر؛ اعتبارسنجی آینه سرور در اسکیما */}
                    <ControllerlessNumberInput control={control} name={`items.${idx}.qtyM2` as const} />
                    {/* P1-T22 — کپی قلم: همان کالا/تون/کالیبر/درجه با مقدار خالی */}
                    <Button
                      type="button" size="icon" variant="ghost" aria-label={`کپی قلم ${idx + 1}`}
                      title="کپی این قلم"
                      onClick={() => { const cur = itemsWatch?.[idx]; if (cur) append({ ...cur, qtyM2: '' }) }}
                    >
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    {fields.length > 1 ? (
                      <Button type="button" size="icon" variant="ghost" onClick={() => remove(idx)} aria-label="حذف قلم">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    ) : null}
                  </div>
                  <RowError message={itemError(idx, 'qtyM2')} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <FieldTextarea control={control} name="note" label="یادداشت سند" rows={2} placeholder="توضیح اختیاری..." />
          </div>
        </FormSection>
      </form>
    </RecordPageShell>
  )
}

/** ورودی عددی سطر قلم — type=text تا ورودی فارسی «۱٬۲۰۰٫۵» هم پذیرفته شود */
function ControllerlessNumberInput<F extends FieldValues>({ control, name }: { control: Control<F>; name: Path<F> }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Input dir="ltr" type="text" inputMode="decimal" className="text-left text-xs" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} placeholder="-620" />
      )}
    />
  )
}

/**
 * موجودی زنده کالای قلم در انبار انتخابی (بررسی عمیق فرم‌ها — ۱۴۰۵/۰۶):
 * جمع کل کالا + موجودی همان واریانت (تون/کالیبر/درجه) + هشدار بیش‌برداشت در اسناد کاهشی.
 * فقط نمایش/هشدار است — تصمیم نهایی قطعی‌سازی با سرور است (آینه منطق postDoc).
 */
function ItemStockHint({
  warehouseId, productId, tone, caliber, grade, qtyM2, docType,
}: {
  warehouseId: string
  productId: string
  tone: string
  caliber: string
  grade: string
  qtyM2: string
  docType: string
}) {
  const { data, isLoading } = useProductStockQuery(warehouseId || null, productId || null)
  if (!productId || !warehouseId) return null
  if (isLoading) return <p className="text-[10px] text-muted-foreground">در حال دریافت موجودی…</p>
  const normTone = tone === 'none' ? '' : tone
  const normCaliber = caliber === 'none' ? '' : caliber
  const variantQty = (data?.variants ?? [])
    .filter((v) => (v.tone || '') === normTone && (v.caliber || '') === normCaliber && v.grade === grade)
    .reduce((s, v) => s + v.qtyM2, 0)
  const qty = parseNumericInput(qtyM2)
  const reducing = docType === 'ISSUE' || docType === 'TRANSFER' || docType === 'COUNT'
  const overdraft = reducing && qty !== null && qty < 0 && variantQty + qty < 0
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] leading-4 text-muted-foreground">
        موجودی این کالا در انبار انتخابی: {faNumber(data?.totalM2 ?? 0)} م²
        {variantQty !== 0 ? ` · همین واریانت: ${faNumber(variantQty)} م²` : ''}
      </p>
      {overdraft ? (
        <RowWarning message={`مقدار بیش از موجودی همین واریانت است (${faNumber(variantQty)} م²) — سند در قطعی‌سازی رد می‌شود`} />
      ) : null}
    </div>
  )
}
