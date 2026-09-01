'use client'

/**
 * صفحه رکورد درخواست کالا (P1.5-T10) — جایگزین دیالوگ فرم ثبت؛ تصمیم‌ها در نوار اقدام صفحه.
 * هدر: شماره/وضعیت/متقاضی/انبار/موعد + نوار وضعیت (در انتظار → تأیید → تأمین؛ رد = خارج از مسیر).
 * فرم ثبت هم صفحه است: پس از ذخیره، تب با جامه‌ویژه به «درخواست N» تبدیل می‌شود.
 */

import { useMemo, useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
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
import { useRequestQuery, useWarehousesQuery, useProductsOptionsQuery, useProductStockQuery } from '@/modules/warehouse/queries'
import { QK_PREFIX } from '@/core/query/keys'
import { StatusBadge } from '@/components/common/ui-bits'
import { RecordPageShell } from '@/components/common/record-page-shell'
import { FormSection } from '@/components/common/form-section'
import { FieldInput, FieldSelect, FieldTextarea, FormError, KbdHint, RowError, RowWarning } from '@/components/common/form-bits'
import { SearchSelect } from '@/components/common/search-select'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { RecordTimeline } from '@/components/common/record-timeline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Check, Copy, Loader2, Plus, Trash2, X } from 'lucide-react'
import { formatJalali, formatJalaliLong, faDigits, faNumber } from '@/core/shared/jalali'
import { toastErr, toastOk } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { clearDraft, draftKey, DraftAutosave, useDraftRestore } from '@/hooks/use-draft'
import { AutosaveIndicator, RestoredDraftBanner } from '@/components/common/draft-banner'

const REQ_STEPS = [
  { key: 'PENDING', label: 'در انتظار تأیید' },
  { key: 'APPROVED', label: 'تأییدشده' },
  { key: 'FULFILLED', label: 'تأمین‌شده' },
]

export function RequestPage({ tab }: { tab: WorkspaceTab }) {
  if (tab.recordId === 'new') return <NewRequestPage tabId={tab.id} />
  return <RequestDetailPage recordId={tab.recordId!} />
}

// ---------------- صفحه جزئیات درخواست ----------------

function RequestDetailPage({ recordId }: { recordId: string }) {
  const me = useApp((s) => s.me)
  const activeCompany = me?.companies.find((c) => c.id === me.activeCompanyId)
  const canDecide = activeCompany?.role === 'ADMIN' || activeCompany?.role === 'MANAGER'
  const { data, isLoading, error, refetch } = useRequestQuery(recordId)
  const req = data?.request ?? null
  const [pendingReject, setPendingReject] = useState(false)
  const [busy, setBusy] = useState(false)
  // P2.5-U5 — تب داخلی رکورد: اقلام | خط زمان؛ U10 — ماندگاری + deep-link (?t=)
  const [innerTab, setInnerTab] = useRecordInnerTab('requests', recordId, [{ key: 'items' }, { key: 'timeline' }])
  const queryClient = useQueryClient()

  const decide = async (action: 'APPROVE' | 'REJECT' | 'FULFILL') => {
    setBusy(true)
    try {
      await apiPost('/api/requests', { id: recordId, action }, 'PATCH')
      toastOk({ title: 'ثبت شد', description: 'وضعیت درخواست و اعلان به متقاضی ارسال شد' })
      setPendingReject(false)
      await refetch()
      void queryClient.invalidateQueries({ queryKey: QK_PREFIX.requests })
      void queryClient.invalidateQueries({ queryKey: QK_PREFIX.timeline })
    } catch (e) {
      toastErr({ description: e instanceof Error ? e.message : 'عملیات ناموفق' })
    } finally {
      setBusy(false)
    }
  }

  const totalM2 = useMemo(() => (req?.items ?? []).reduce((s, i) => s + i.qtyM2, 0), [req])
  const stepIndex = req ? (req.status === 'FULFILLED' ? 2 : req.status === 'APPROVED' ? 1 : 0) : 0

  return (
    <>
      <RecordPageShell
        viewKey="requests"
        icon="ClipboardList"
        title={req ? `درخواست کالا ${faDigits(req.reqNumber)}` : 'درخواست کالا'}
        loading={isLoading}
        error={error instanceof Error ? error.message : error ? 'درخواست بارگذاری نشد' : null}
        onRetry={() => void refetch()}
        badges={req ? (
          <>
            <Badge className="border-0 bg-primary/10 text-primary">درخواست کالا</Badge>
            <StatusBadge status={req.status} />
          </>
        ) : null}
        statusSteps={{ steps: REQ_STEPS, currentIndex: stepIndex }}
        statusError={req?.status === 'REJECTED' ? 'ردشده' : null}
        info={req ? [
          { label: 'متقاضی', value: `${req.requesterName}${req.requesterTitle ? ` — ${req.requesterTitle}` : ''}` },
          { label: 'انبار', value: req.warehouseName },
          { label: 'واحد مصرف‌کننده', value: req.neededFor ?? '—' },
          { label: 'تاریخ ثبت', value: formatJalaliLong(req.createdAt) },
          { label: 'شرکت', value: req.companyName },
          ...(req.decidedAt ? [{ label: 'تاریخ تصمیم', value: formatJalali(req.decidedAt) }] : []),
        ] : undefined}
        aside={req ? (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium tabular-nums text-primary">
            جمع درخواست: {faNumber(totalM2)} م² · {faDigits(req.items.length)} قلم
          </span>
        ) : undefined}
        actions={req && canDecide ? (
          req.status === 'PENDING' ? (
            <>
              <Button size="sm" onClick={() => void decide('APPROVE')} disabled={busy} className="gap-1">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} تأیید درخواست
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPendingReject(true)} disabled={busy} className="gap-1">
                <X className="h-3.5 w-3.5" /> رد درخواست
              </Button>
            </>
          ) : req.status === 'APPROVED' ? (
            <Button size="sm" variant="secondary" onClick={() => void decide('FULFILL')} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} اعلام تأمین‌شده
            </Button>
          ) : undefined
        ) : undefined}
        innerTabs={[
          { key: 'items', label: `اقلام (${faNumber(req?.items.length ?? 0)})` },
          { key: 'timeline', label: 'خط زمان اقدامات' },
        ]}
        activeInnerTab={innerTab}
        onInnerTabChange={setInnerTab}
      >
        {req ? (
          innerTab === 'timeline'
            ? <RecordTimeline entity="goodsRequest" recordId={req.id} />
            : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">#</TableHead>
                    <TableHead className="text-start">کالا</TableHead>
                    <TableHead className="text-center">ابعاد</TableHead>
                    <TableHead className="text-start">مترمربع</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {req.items.map((it, idx) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-xs text-muted-foreground">{faDigits(idx + 1)}</TableCell>
                      <TableCell>
                        <p className="text-xs font-medium">{it.productName}</p>
                        <p className="text-[10px] text-muted-foreground" dir="ltr">{it.productCode}</p>
                      </TableCell>
                      <TableCell className="text-center text-xs">{it.size}</TableCell>
                      <TableCell className="text-start text-xs font-bold tabular-nums">{faNumber(it.qtyM2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {req.note ? (
              <div className="rounded-xl border bg-muted/30 p-4 text-sm leading-6">{req.note}</div>
            ) : null}
          </div>
            )
        ) : null}
      </RecordPageShell>

      {/* P1-T23 — تأیید رد درخواست با متن پیامد */}
      <ConfirmDialog
        open={pendingReject}
        onOpenChange={setPendingReject}
        destructive
        busy={busy}
        title={`رد درخواست ${req ? faDigits(req.reqNumber) : ''}؟`}
        description="درخواست رد می‌شود و نتیجه بلافاصله به متقاضی اعلان می‌شود؛ درخواست ردشده دیگر قابل تأیید نیست."
        confirmLabel="رد درخواست"
        onConfirm={() => void decide('REJECT')}
      />
    </>
  )
}

// ---------------- فرم ثبت درخواست (صفحه، نه دیالوگ) ----------------

const requestFormSchema = z.object({
  warehouseId: z.string().min(1, 'انبار الزامی است'),
  neededFor: z.string().trim().max(200, 'حداکثر ۲۰۰ نویسه مجاز است'),
  note: z.string().trim().max(1000, 'حداکثر ۱۰۰۰ نویسه مجاز است'),
  items: z.array(z.object({
    productId: z.string(),
    qtyM2: z.string(),
  })),
  // فیلد مجازی — خطای «سطح فرم» اقلام اینجا می‌نشیند تا با خطاهای سطری تداخل نکند
  itemsRoot: z.string(),
}).superRefine((v, ctx) => {
  // آینه سرور: «مقدار هر قلم باید عددی مثبت باشد» — سطرهای بدون کالا نادیده
  v.items.forEach((it, idx) => {
    if (!it.productId) return
    const qty = parseNumericInput(it.qtyM2)
    if (qty === null || qty <= 0) {
      ctx.addIssue({ code: 'custom', path: ['items', idx, 'qtyM2'], message: 'مقدار هر قلم باید عددی مثبت باشد' })
    }
  })
  const valid = v.items.filter((it) => it.productId && (parseNumericInput(it.qtyM2) ?? 0) > 0)
  if (valid.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['itemsRoot'], message: 'حداقل یک قلم کالا الزامی است' })
  }
})
type RequestFormValues = z.infer<typeof requestFormSchema>

/** مقادیر اولیه فرم درخواست — مبنای merge پیش‌نویس (P1-T24) */
function requestDefaults(): RequestFormValues {
  return { warehouseId: '', neededFor: '', note: '', items: [{ productId: '', qtyM2: '' }], itemsRoot: '' }
}

function NewRequestPage({ tabId }: { tabId: string }) {
  const me = useApp((s) => s.me)
  const activeCompany = me?.companies.find((c) => c.id === me.activeCompanyId)
  const isGroup = activeCompany?.type === 'GROUP'
  const canWrite = useCanWrite()
  const materializeTab = useWorkspace((s) => s.materializeTab)
  const closeTab = useWorkspace((s) => s.closeTab)
  const queryClient = useQueryClient()
  const warehousesQuery = useWarehousesQuery()
  const productsQuery = useProductsOptionsQuery()
  const [busy, setBusy] = useState(false)

  // P1-T24 — ذخیره خودکار پیش‌نویس درخواست
  const defaults = useMemo(requestDefaults, [])
  const { initial, savedAt: draftSavedAt } = useDraftRestore('requests', me?.activeCompanyId, defaults)
  const storageKey = draftKey('requests', me?.activeCompanyId)
  const [restoredAt, setRestoredAt] = useState<number | null>(draftSavedAt)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)

  const { control, handleSubmit, reset, watch, formState: { errors, isDirty } } = useForm<RequestFormValues>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: initial,
  })
  // P2.5-U10 — گارد بستن تب کثیف (پیش‌نویس خودکار دارد)
  useDirtyTracking(tabId, isDirty, 'فرم درخواست کالا (پیش‌نویس خودکار دارد)')
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  // P1-T22 — useWatch الگوی ارجاع‌شده RHF برای آرایه‌ها
  const itemsWatch = useWatch({ control, name: 'items', defaultValue: [] as RequestFormValues['items'] })
  const warehouses = (warehousesQuery.data?.warehouses ?? []).filter((w) => !activeCompany || w.companyCode === activeCompany.code)
  const products = (productsQuery.data?.products ?? []).filter((p) => !activeCompany || p.companyCode === activeCompany.code)
  const warehouseId = watch('warehouseId')
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId)
  // P1-T22 — جمع زنده م² در هدر اطلاعاتی فرم (فقط اقلام معتبر مثبت)
  const liveSum = useMemo(() => (itemsWatch ?? []).reduce((sum, it) => {
    const qty = it.productId ? parseNumericInput(it.qtyM2) : null
    return sum + (qty && qty > 0 ? qty : 0)
  }, 0), [itemsWatch])
  const validCount = useMemo(() => (itemsWatch ?? []).filter((it) => it.productId && (parseNumericInput(it.qtyM2) ?? 0) > 0).length, [itemsWatch])
  // بررسی عمیق فرم‌ها — ۱۴۰۵/۰۶: کشف کالای تکراری در دو سطر
  const duplicateIdxs = useMemo(() => {
    const seen = new Map<string, number[]>()
    ;(itemsWatch ?? []).forEach((it, i) => {
      if (!it.productId) return
      seen.set(it.productId, [...(seen.get(it.productId) ?? []), i])
    })
    const dups = new Set<number>()
    for (const idxs of seen.values()) if (idxs.length > 1) idxs.forEach((i) => dups.add(i))
    return dups
  }, [itemsWatch])
  const itemError = (idx: number, key: 'productId' | 'qtyM2') =>
    (errors.items as unknown as Record<number, Record<string, { message?: string }>> | undefined)?.[idx]?.[key]?.message

  const submit = handleSubmit(async (v) => {
    setBusy(true)
    try {
      const rows = v.items
        .filter((i) => i.productId)
        .map((i) => ({ ...i, qty: parseNumericInput(i.qtyM2) }))
        .filter((i) => (i.qty ?? 0) > 0)
      const d = await apiPost<{ id: string; reqNumber: number }>('/api/requests', {
        warehouseId: v.warehouseId, neededFor: v.neededFor || undefined, note: v.note || undefined,
        items: rows.map((i) => ({ productId: i.productId, qtyM2: i.qty as number })),
      })
      toastOk({ title: 'درخواست ثبت شد', description: `شماره درخواست: ${faDigits(d.reqNumber)} — اعلان به مدیران ارسال شد` })
      clearDraft(storageKey) // P1-T24 — پیش‌نویس پس از ثبت موفق پاک می‌شود
      reset(requestDefaults())
      void queryClient.invalidateQueries({ queryKey: QK_PREFIX.requests })
      // جامه‌ویژه: تب «درخواست جدید» → «درخواست N» (P1.5-T1)
      materializeTab(tabId, d.id, `درخواست ${faDigits(d.reqNumber)}`)
    } catch (e) {
      toastErr({ description: e instanceof Error ? e.message : 'ثبت ناموفق' })
    } finally {
      setBusy(false)
    }
  })

  // P1-T24 — دورریختن پیش‌نویس بازیابی‌شده
  const discardDraft = () => {
    clearDraft(storageKey)
    reset(requestDefaults())
    setRestoredAt(null)
    setLastSavedAt(null)
  }

  // P1-T27 — Ctrl+Enter = ثبت درخواست
  const onFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <RecordPageShell
      viewKey="requests"
      icon="ClipboardList"
      title="ثبت درخواست کالا"
      badges={<StatusBadge status="PENDING" />}
      statusSteps={{ steps: REQ_STEPS, currentIndex: 0 }}
      info={[
        { label: 'شماره درخواست', value: 'پس از ثبت، خودکار صادر می‌شود' },
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
          <Button type="submit" form="new-request-form" disabled={busy || isGroup || !canWrite} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ثبت درخواست
          </Button>
          <span className="ms-auto flex items-center gap-3"><KbdHint keys={['Ctrl', 'Enter']} action="ثبت درخواست" /><AutosaveIndicator lastSavedAt={lastSavedAt} /></span>
          {isGroup ? <p className="text-xs text-amber-600">برای ثبت درخواست، به یک شرکت عملیاتی سوئیچ کنید.</p> : null}
        </>
      )}
    >
      {/* P1-T24 — بنر بازیابی پیش‌نویس + ذخیره خودکار */}
      {restoredAt !== null ? <RestoredDraftBanner savedAt={restoredAt} onDiscard={discardDraft} /> : null}
      <DraftAutosave control={control} storageKey={storageKey} onSaved={setLastSavedAt} />
      <form id="new-request-form" noValidate onSubmit={submit} onKeyDown={onFormKeyDown} className="space-y-4">
        {/* P2.5-U1 — سکشن‌بندی ERP (الگوی D365 Section) */}
        <FormSection
          title="سرشناسه درخواست"
          description="انبار و واحد مصرف‌کننده — پس از ثبت، شماره درخواست خودکار صادر و به مدیران اعلان می‌شود"
          cols={2}
        >
          <FieldSelect
            control={control} name="warehouseId" label="انبار" required
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))} placeholder="انتخاب انبار..."
          />
          <FieldInput control={control} name="neededFor" label="واحد مصرف‌کننده" placeholder="مثلاً: واحد بازرگانی" />
        </FormSection>

        <FormSection
          title="اقلام درخواست"
          description="جستجوی کالا + متراژ — موجودی زنده و هشدار کافی‌بودن زیر هر قلم"
          cols="free"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-primary">
              جمع کل: {faNumber(liveSum)} م² · {faDigits(validCount)} قلم معتبر
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => append({ productId: '', qtyM2: '' })} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> افزودن قلم
            </Button>
          </div>
          <FormError message={errors.itemsRoot?.message} />
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            مقدار عددی مثبت است — ارقام فارسی و جداکننده ٫ پذیرفته می‌شود (مثلاً ۱٬۲۰۰٫۵).
          </p>
          <div className="mt-3 space-y-3">
            {fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-3 gap-2 rounded-lg border p-3">
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
                    qtyM2={itemsWatch?.[idx]?.qtyM2 ?? ''}
                  />
                  {duplicateIdxs.has(idx) ? (
                    <RowWarning message="کالای تکراری — همین کالا در سطر دیگری هم هست؛ برای مقدار بیشتر، همان سطر را ویرایش کنید" />
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">مترمربع</Label>
                  <div className="flex items-center gap-1">
                    {/* P1-T16 — ورودی عددی فارسی‌پذیر؛ اعتبارسنجی آینه سرور در اسکیما */}
                    <FieldInput control={control} name={`items.${idx}.qtyM2` as const} label="" dir="ltr" type="text" placeholder="۱۲۰ یا 120" />
                    {/* P1-T22 — کپی قلم با مقدار خالی */}
                    <Button
                      type="button" size="icon" variant="ghost" aria-label={`کپی قلم ${idx + 1}`} title="کپی این قلم"
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
            <FieldTextarea control={control} name="note" label="توضیح" rows={2} placeholder="هدف از درخواست..." />
          </div>
          <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
            پس از ثبت، اعلان به مدیران شرکت فعال ارسال می‌شود؛ وضعیت درخواست در همین صفحه (نوار وضعیت بالا) پیگیری می‌شود.
          </div>
        </FormSection>
      </form>
    </RecordPageShell>
  )
}

/**
 * موجودی زنده کالای درخواستی در انبار انتخابی (بررسی عمیق فرم‌ها — ۱۴۰۵/۰۶):
 * «موجودی فعلی: X م²» + هشدار کهربایی اگر مقدار درخواست بیش از موجودی است
 * (درخواست بالاتر از موجودی مجاز است — تأمین از خرید/تولید — ولی متقاضی باید بداند).
 */
function ItemStockHint({ warehouseId, productId, qtyM2 }: { warehouseId: string; productId: string; qtyM2: string }) {
  const { data, isLoading } = useProductStockQuery(warehouseId || null, productId || null)
  if (!productId || !warehouseId) return null
  if (isLoading) return <p className="text-[10px] text-muted-foreground">در حال دریافت موجودی…</p>
  const total = data?.totalM2 ?? 0
  const qty = parseNumericInput(qtyM2)
  const short = qty !== null && qty > 0 && qty > total
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] leading-4 text-muted-foreground">موجودی فعلی این کالا در انبار انتخابی: {faNumber(total)} م²</p>
      {short ? (
        <RowWarning message={`مقدار درخواست بیش از موجودی فعلی است (${faNumber(total)} م²) — تأمین مازاد نیازمند خرید/تولید است`} />
      ) : null}
    </div>
  )
}
