'use client'

/**
 * صفحه فرم ثبت محصول (P1.5-T11) — جایگزین NewProductDialog؛ ارتقا به RHF + zod
 * با هدر اطلاعاتی (شرکت مالک، خط/رنگ/ابعاد زنده) و نوار اقدام چسبان.
 * پس از ذخیره، تب «محصول جدید» با جامه‌ویژه به تب رکورد محصول تبدیل می‌شود.
 */

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { useApp } from '@/store/app'
import { useWorkspace, type WorkspaceTab } from '@/store/workspace'
import { useCanWrite } from '@/hooks/use-can-write'
import { useDirtyTracking } from '@/hooks/use-dirty-tracking'
import { apiPost } from '@/core/shared/api-client'
import { parseNumericInput } from '@/core/shared/normalize'
import { faOptionalNumber } from '@/core/forms/schemas'
import { QK_PREFIX } from '@/core/query/keys'
import { useProductsQuery } from '@/modules/products/queries'
import { RecordPageShell } from '@/components/common/record-page-shell'
import { FormSection } from '@/components/common/form-section'
import { CharCount, FieldInput, KbdHint, RowWarning } from '@/components/common/form-bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { formatJalali } from '@/core/shared/jalali'
import { toastErr, toastOk } from '@/hooks/use-toast'
import { clearDraft, draftKey, DraftAutosave, useDraftRestore } from '@/hooks/use-draft'
import { AutosaveIndicator, RestoredDraftBanner } from '@/components/common/draft-banner'
import { CodeComposer } from '@/components/common/code-composer'

// آینه پیام‌های سرور modules/products/service.ts
// بررسی عمیق فرم‌ها — ۱۴۰۵/۰۶: فیلدهای عددی کارتن با اعتبارسنجی زیر فیلد (قبلاً ورودی نامعتبر بی‌صدا صفر می‌شد)
const productFormSchema = z.object({
  code: z.string().trim().min(1, 'کد کالا الزامی است').max(60, 'حداکثر ۶۰ نویسه'),
  name: z.string().trim().min(1, 'نام آیتم الزامی است').max(200, 'حداکثر ۲۰۰ نویسه'),
  productLine: z.string().trim().min(1, 'خط محصول الزامی است').max(120, 'حداکثر ۱۲۰ نویسه'),
  size: z.string().trim().min(1, 'ابعاد الزامی است').max(60, 'حداکثر ۶۰ نویسه'),
  color: z.string().trim().min(1, 'رنگ الزامی است').max(60, 'حداکثر ۶۰ نویسه'),
  surface: z.string().trim().max(60, 'حداکثر ۶۰ نویسه'),
  cartonArea: faOptionalNumber('مترمربع هر کارتن'),
  cartonsPerPallet: faOptionalNumber('کارتن در هر پالت'),
})
type ProductFormValues = z.infer<typeof productFormSchema>

/** مقادیر اولیه فرم محصول — مبنای merge پیش‌نویس (P1-T24) */
function productDefaults(): ProductFormValues {
  return { code: '', name: '', productLine: '', size: '', color: '', surface: '', cartonArea: '', cartonsPerPallet: '' }
}

export function ProductPage({ tab }: { tab: WorkspaceTab }) {
  const me = useApp((s) => s.me)
  const activeCompany = me?.companies.find((c) => c.id === me.activeCompanyId)
  const isGroup = activeCompany?.type === 'GROUP'
  const canWrite = useCanWrite()
  const materializeTab = useWorkspace((s) => s.materializeTab)
  const closeTab = useWorkspace((s) => s.closeTab)
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  // بررسی عمیق فرم‌ها — ۱۴۰۵/۰۶: بررسی زنده یکتایی کد کالا در برابر فهرست موجود
  const productsQuery = useProductsQuery()

  // P1-T24 — ذخیره خودکار پیش‌نویس محصول
  const defaults = useMemo(productDefaults, [])
  const { initial, savedAt: draftSavedAt } = useDraftRestore('products', me?.activeCompanyId, defaults)
  const storageKey = draftKey('products', me?.activeCompanyId)
  const [restoredAt, setRestoredAt] = useState<number | null>(draftSavedAt)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)

  const { control, handleSubmit, reset, watch, setValue, formState: { isDirty } } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: initial,
  })
  // P2.5-U10 — گارد بستن تب کثیف (پیش‌نویس خودکار دارد)
  useDirtyTracking(tab.id, isDirty, 'فرم ثبت محصول (پیش‌نویس خودکار دارد)')

  // کدساز ساختارمند — «درج در فرم»: کد + نگاشت اجزای معنادار به فیلدهای مستردیتا (mapsTo)
  // کار دست کاربر محترم است: درج صریح دکمه دارد و فیلد پرشده را هم می‌پوشاند (کاربر خواسته)
  const onComposerInsert = (code: string, mapping: Record<string, string>) => {
    setValue('code', code, { shouldDirty: true })
    if (mapping.size) setValue('size', mapping.size, { shouldDirty: true })
    if (mapping.color) setValue('color', mapping.color, { shouldDirty: true })
    if (mapping.surface) setValue('surface', mapping.surface, { shouldDirty: true })
    if (mapping.productLine) setValue('productLine', mapping.productLine, { shouldDirty: true })
  }

  const submit = handleSubmit(async (v) => {
    setBusy(true)
    try {
      const d = await apiPost<{ id: string }>('/api/products', {
        code: v.code, name: v.name, productLine: v.productLine, size: v.size,
        color: v.color, surface: v.surface || undefined,
        // P1-T16 — نرمال‌سازی عددی کامل (ارقام فارسی/عربی، جداکننده ٫ و ٬)
        cartonArea: parseNumericInput(v.cartonArea) ?? 0,
        cartonsPerPallet: parseNumericInput(v.cartonsPerPallet) ?? 0,
      })
      toastOk({ title: 'محصول ثبت شد', description: `${v.name} در مستر دیتای شرکت فعال ثبت شد` })
      clearDraft(storageKey) // P1-T24 — پیش‌نویس پس از ثبت موفق پاک می‌شود
      reset(productDefaults())
      void queryClient.invalidateQueries({ queryKey: QK_PREFIX.products })
      // جامه‌ویژه: تب «محصول جدید» → تب رکورد (نمای فهرست کالا مجدد بازخوانی می‌شود)
      materializeTab(tab.id, d.id, v.name)
    } catch (e) {
      toastErr({ description: e instanceof Error ? e.message : 'ثبت ناموفق' })
    } finally {
      setBusy(false)
    }
  })

  // P1-T24 — دورریختن پیش‌نویس بازیابی‌شده
  const discardDraft = () => {
    clearDraft(storageKey)
    reset(productDefaults())
    setRestoredAt(null)
    setLastSavedAt(null)
  }

  // P1-T27 — Ctrl+Enter = ثبت محصول
  const onFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  const name = watch('name')
  const productLine = watch('productLine')
  const size = watch('size')
  const color = watch('color')
  const codeVal = watch('code')
  const cartonAreaVal = watch('cartonArea')
  const cartonsPerPalletVal = watch('cartonsPerPallet')
  const dupCodeProduct = useMemo(() => {
    const c = codeVal.trim().toLowerCase()
    if (!c) return null
    return (productsQuery.data?.products ?? []).find((p) => p.code.toLowerCase() === c) ?? null
  }, [codeVal, productsQuery.data])

  return (
    <RecordPageShell
      viewKey="products"
      icon="Package"
      title="ثبت محصول جدید"
      badges={productLine ? <Badge className="border-0 bg-primary/10 text-primary">{productLine}</Badge> : undefined}
      info={[
        { label: 'نام آیتم', value: name || '—' },
        { label: 'ابعاد', value: size || '—' },
        { label: 'رنگ', value: color || '—' },
        { label: 'شرکت مالک', value: activeCompany?.name ?? '—' },
        { label: 'تاریخ ثبت', value: formatJalali(new Date().toISOString()) },
        { label: 'کد کالا', value: watch('code') || '—' },
      ]}
      footer={(
        <>
          <Button type="button" variant="outline" onClick={() => { clearDraft(storageKey); closeTab(tab.id) }}>انصراف و بستن تب</Button>
          <Button type="submit" form="new-product-form" disabled={busy || isGroup || !canWrite} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ثبت محصول
          </Button>
          <span className="ms-auto flex items-center gap-3"><KbdHint keys={['Ctrl', 'Enter']} action="ثبت محصول" /><AutosaveIndicator lastSavedAt={lastSavedAt} /></span>
          {isGroup ? <p className="text-xs text-amber-600">برای ثبت محصول، به یک شرکت عملیاتی سوئیچ کنید.</p> : null}
        </>
      )}
    >
      {/* P1-T24 — بنر بازیابی پیش‌نویس + ذخیره خودکار */}
      {restoredAt !== null ? <RestoredDraftBanner savedAt={restoredAt} onDiscard={discardDraft} /> : null}
      <DraftAutosave control={control} storageKey={storageKey} onSaved={setLastSavedAt} />
      <form id="new-product-form" noValidate onSubmit={submit} onKeyDown={onFormKeyDown} className="space-y-4">
        {/* کدساز ساختارمند (موتور کدگذاری) — اختیاری: کد از اجزای استاندارد ساخته می‌شود */}
        <FormSection
          title="کدساز ساختارمند (اختیاری)"
          description="کد را از اجزای استاندارد بسازید یا کد موجود را رمزگشایی کنید — طرحواره‌های شرکت (کاشی ۲۰ کاراکتری و…) داده‌محورند"
          cols="free"
        >
          <CodeComposer onInsert={onComposerInsert} compact family="PRODUCT" />
        </FormSection>

        {/* P2.5-U1 — سکشن‌بندی ERP: هویت / مشخصات فنی (الگوی D365 Section) */}
        <FormSection
          title="هویت محصول"
          description="کد یکتا در سطح گروه و نام تجاری — مالک رکورد: شرکت فعال (تولیدکننده)"
          cols={2}
        >
          <FieldInput
            control={control} name="code" label="کد کالا" required dir="ltr" placeholder="از کدساز یا ARD-P60-WHT"
            hint={dupCodeProduct ? undefined : 'از کدساز بالا بسازید یا دستی وارد کنید — یکتا در سطح گروه'}
            extra={(
              <>
                <CharCount value={codeVal} max={60} />
                {dupCodeProduct ? (
                  <RowWarning message={`این کد قبلاً ثبت شده است: «${dupCodeProduct.name}» (${dupCodeProduct.companyName}) — ثبت نهایی با خطای سرور رد می‌شود`} />
                ) : null}
              </>
            )}
          />
          <FieldInput
            control={control} name="name" label="نام آیتم" required placeholder="پرسلان پولیش سفید کلاسیک"
            extra={<CharCount value={name} max={200} />}
          />
          <FieldInput control={control} name="productLine" label="خط محصول" required placeholder="پرسلان پولیش" />
          <FieldInput control={control} name="size" label="ابعاد" required placeholder="۶۰×۶۰" />
        </FormSection>

        <FormSection
          title="مشخصات فنی و بسته‌بندی"
          description="سطح و مبانی تبدیل واحد م² ↔ کارتن ↔ پالت — مبنا اسناد انبار"
          cols={3}
        >
          <FieldInput control={control} name="color" label="رنگ" required placeholder="سفید" />
          <FieldInput control={control} name="surface" label="سطح" placeholder="پولیش / مات / روستیک" />
          <FieldInput
            control={control} name="cartonArea" label="مترمربع هر کارتن" dir="ltr" placeholder="1.44"
            hint="مبنای تبدیل واحد م² ↔ کارتن ↔ پالت"
            extra={<CharCount value={cartonAreaVal} max={20} />}
          />
          <FieldInput
            control={control} name="cartonsPerPallet" label="کارتن در هر پالت" dir="ltr" placeholder="36"
            extra={<CharCount value={cartonsPerPalletVal} max={20} />}
          />
        </FormSection>
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
          محصول در مستر دیتای شرکت فعال ثبت می‌شود (مالک رکورد: شرکت تولیدکننده)؛ واریانت‌های موجودی (تون/کالیبر/درجه) با اسناد انبار ساخته می‌شوند.
        </div>
      </form>
    </RecordPageShell>
  )
}
