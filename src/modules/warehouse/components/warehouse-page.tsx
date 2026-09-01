'use client'

/**
 * صفحه رکورد انبار (P1.5-T13) — جایگزین دیالوگ‌های ایجاد/ویرایش warehouses-admin.
 * - تب «انبار جدید»: فرم ایجاد (کد/نام/نوع) در شرکت فعال → جامه‌ویژه به تب رکورد.
 * - تب رکورد: شناسنامه (کد/شرکت/نوع/موجودی) + فرم ویرایش (نام/نوع/فعال) با گارد موجودی.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useApp } from '@/store/app'
import { useWorkspace, type WorkspaceTab } from '@/store/workspace'
import { useRecordInnerTab } from '@/hooks/use-record-inner-tab'
import { useDirtyTracking } from '@/hooks/use-dirty-tracking'
import { useWarehousesAdminQuery } from '@/modules/warehouse/queries'
import { apiPost } from '@/core/shared/api-client'
import { RecordPageShell } from '@/components/common/record-page-shell'
import { FormSection } from '@/components/common/form-section'
import { KbdHint, RowWarning } from '@/components/common/form-bits'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Save } from 'lucide-react'
import { faNumber } from '@/core/shared/jalali'
import { toastOk, toastErr } from '@/hooks/use-toast'

const KIND_FA: Record<string, string> = { PHYSICAL: 'فیزیکی', VIRTUAL: 'مجازی (حسابی/امانی)', WORKSTATION: 'پای کار ایستگاه' }

export function WarehousePage({ tab }: { tab: WorkspaceTab }) {
  const me = useApp((s) => s.me)
  const activeCompany = me?.companies.find((c) => c.id === me.activeCompanyId)
  const canManage = !!me?.user.isAdmin || activeCompany?.role === 'ADMIN'
  const isNew = tab.recordId === 'new'

  const queryClient = useQueryClient()
  const setTabTitle = useWorkspace((s) => s.setTabTitle)
  const closeTab = useWorkspace((s) => s.closeTab)
  const materializeTab = useWorkspace((s) => s.materializeTab)

  const [busy, setBusy] = useState(false)

  // ---------- فرم ایجاد ----------
  const [f, setF] = useState({ code: '', name: '', kind: 'PHYSICAL' })
  const [fErr, setFErr] = useState<Record<string, string>>({})

  // ---------- فرم ویرایش ----------
  const { data, isLoading, refetch } = useWarehousesAdminQuery()
  const rows = data?.warehouses ?? []
  const wh = rows.find((w) => w.id === tab.recordId) ?? null
  const [eF, setEF] = useState<{ name: string; kind: string; isActive: boolean } | null>(null)
  const eForm = eF ?? (wh ? { name: wh.name, kind: wh.kind, isActive: wh.isActive } : null)

  // بررسی عمیق فرم‌ها — ۱۴۰۵/۰۶: dirty tracking ویرایش + تأیید بستن با تغییرات ذخیره‌نشده
  const editDirty = !!eF && !!wh && (eF.name.trim() !== wh.name || eF.kind !== wh.kind || eF.isActive !== wh.isActive)
  const [confirmCloseEdit, setConfirmCloseEdit] = useState(false)
  // P2.5-U10 — گارد بستن تب کثیف (ادغام با گارد انصراف موجود)
  useDirtyTracking(tab.id, editDirty, 'فرم ویرایش انبار')

  // بررسی عمیق فرم‌ها — پیشنهاد کد بعدی شرکت فعال + نام تکراری زنده
  const activeCompanyCode = activeCompany?.code ?? me?.companies[0]?.code ?? ''
  const suggestedCode = useMemo(() => {
    if (!activeCompanyCode) return ''
    const prefix = `${activeCompanyCode}-`
    const suffixNums = rows
      .filter((w) => w.companyCode === activeCompanyCode && w.code.startsWith(prefix))
      .map((w) => Number(w.code.slice(prefix.length).replace(/\D/g, '')))
      .filter((n) => Number.isFinite(n) && n > 0)
    const next = (suffixNums.length ? Math.max(...suffixNums) : 0) + 1
    return `${prefix}W${next}`
  }, [rows, activeCompanyCode])
  const codeSuggested = useRef(false)
  useEffect(() => {
    if (isNew && !codeSuggested.current && suggestedCode && !f.code) {
      codeSuggested.current = true
      setF((prev) => (prev.code ? prev : { ...prev, code: suggestedCode }))
    }
  }, [isNew, suggestedCode, f.code])
  const dupNameWarehouse = useMemo(
    () => rows.find((w) => w.companyCode === activeCompanyCode && w.name.trim() === f.name.trim() && w.name.trim() !== ''),
    [rows, activeCompanyCode, f.name],
  )

  // همگام‌سازی عنوان تب با نام انبار پس از بارگذاری
  useEffect(() => {
    if (wh?.name) setTabTitle(tab.id, wh.name)
  }, [wh?.name, tab.id, setTabTitle])

  const submitCreate = async () => {
    const errors: Record<string, string> = {}
    if (!/^[A-Za-z0-9._-]{1,16}$/.test(f.code.trim())) errors.code = '۱ تا ۱۶ نویسه لاتین/رقم/نقطه/خط تیره'
    if (f.name.trim().length < 2) errors.name = 'حداقل ۲ نویسه'
    setFErr(errors)
    if (Object.keys(errors).length) return

    setBusy(true)
    try {
      const d = await apiPost<{ id: string }>('/api/warehouses', {
        companyId: me?.activeCompanyId ?? me?.companies[0]?.id,
        code: f.code.trim(),
        name: f.name.trim(),
        kind: f.kind,
      })
      toastOk({ title: 'انبار ایجاد شد', description: `${f.name.trim()} (${f.code.trim()}) — هم‌اکنون در فرم اسناد قابل انتخاب است` })
      await queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      materializeTab(tab.id, d.id, f.name.trim())
    } catch (e) {
      toastErr({ title: 'ایجاد انبار ناموفق بود', description: e instanceof Error ? e.message : 'خطای نامشخص' })
    } finally {
      setBusy(false)
    }
  }

  const submitEdit = async () => {
    if (!wh || !eForm) return
    if (eForm.name.trim().length < 2) {
      toastErr({ description: 'نام انبار حداقل ۲ نویسه باشد' })
      return
    }
    setBusy(true)
    try {
      await apiPost(`/api/warehouses/${wh.id}`, {
        name: eForm.name.trim(),
        kind: eForm.kind,
        isActive: eForm.isActive,
      }, 'PATCH')
      toastOk({ title: 'انبار به‌روزرسانی شد', description: eForm.name.trim() })
      setTabTitle(tab.id, eForm.name.trim())
      await queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      await refetch()
    } catch (e) {
      toastErr({ title: 'به‌روزرسانی ناموفق بود', description: e instanceof Error ? e.message : 'خطای نامشخص' })
    } finally {
      setBusy(false)
    }
  }

  // بررسی عمیق فرم‌ها — Ctrl+Enter = ایجاد انبار
  const onCreateKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void submitCreate()
    }
  }

  // ================= فرم ایجاد =================
  if (isNew) {
    return (
      <RecordPageShell
        viewKey="warehouses"
        icon="Archive"
        title="ثبت انبار جدید"
        badges={f.kind ? <Badge className="border-0 bg-primary/10 text-primary">{KIND_FA[f.kind] ?? f.kind}</Badge> : undefined}
        info={[
          { label: 'نام انبار', value: f.name.trim() || '—' },
          { label: 'کد انبار', value: f.code.trim() ? <span dir="ltr" className="font-mono text-xs">{f.code.trim()}</span> : '—' },
          { label: 'شرکت مالک', value: me?.activeCompanyId ? (activeCompany?.name ?? '—') : (me?.companies[0]?.name ?? '—') },
          { label: 'نوع انبار', value: KIND_FA[f.kind] ?? f.kind },
        ]}
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => closeTab(tab.id)} disabled={busy}>انصراف و بستن تب</Button>
            <Button type="submit" form="new-warehouse-form" disabled={busy || !canManage} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ایجاد انبار
            </Button>
            <span className="ms-auto"><KbdHint keys={['Ctrl', 'Enter']} action="ایجاد انبار" /></span>
          </>
        )}
      >
        <form
          id="new-warehouse-form"
          noValidate
          onSubmit={(e) => { e.preventDefault(); void submitCreate() }}
          onKeyDown={onCreateKeyDown}
          className="space-y-4"
        >
          {/* P2.5-U1 — سکشن‌بندی ERP (الگوی D365 Section) */}
          <FormSection
            title="مشخصات انبار"
            description="کد یکتا در شرکت — پس از ایجاد قابل تغییر نیست (کلید اسناد انبار)"
            cols={3}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="wh-code">کد انبار</Label>
              <Input id="wh-code" dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="مثل ARD-FG1" />
              {fErr.code ? <p className="text-xs text-destructive">{fErr.code}</p> : null}
              {suggestedCode && f.code === suggestedCode ? (
                <p className="text-[11px] text-muted-foreground">کد پیشنهادی (کد بعدی این شرکت) — قابل ویرایش</p>
              ) : null}
              <p className="text-[11px] text-muted-foreground">پس از ایجاد قابل تغییر نیست — کلید اسناد انبار</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wh-name">نام انبار</Label>
              <Input id="wh-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="انبار محصول زمین ۱" />
              {fErr.name ? <p className="text-xs text-destructive">{fErr.name}</p> : null}
              {dupNameWarehouse ? (
                <RowWarning message={`انباری با همین نام در این شرکت موجود است: «${dupNameWarehouse.name}» (${dupNameWarehouse.code})`} />
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label>نوع انبار</Label>
              <Select dir="rtl" value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_FA).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FormSection>
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
            انبار جدید بلافاصله در فیلتر موجودی و فرم اسناد انبار ظاهر می‌شود — بدون نیاز به کش سمت سرور.
          </div>
        </form>
      </RecordPageShell>
    )
  }

  // ================= صفحه رکورد =================
  return (
    <RecordPageShell
      viewKey="warehouses"
      icon="Archive"
      title={wh?.name ?? 'انبار'}
      loading={isLoading}
      error={!isLoading && !wh ? 'انبار در دامنه دید شما یافت نشد' : null}
      onRetry={() => void refetch()}
      badges={wh ? (
        <>
          <Badge variant="secondary" className="border-0 font-mono text-[10px]" dir="ltr">{wh.code}</Badge>
          <Badge variant="secondary" className="border-0">{KIND_FA[wh.kind] ?? wh.kind}</Badge>
          {wh.isActive
            ? <Badge variant="secondary" className="border-0 bg-emerald-100 text-emerald-700">فعال</Badge>
            : <Badge variant="secondary" className="border-0 bg-red-100 text-red-700">غیرفعال</Badge>}
        </>
      ) : undefined}
      info={wh ? [
        { label: 'کد انبار', value: <span dir="ltr" className="font-mono text-xs">{wh.code}</span> },
        { label: 'شرکت مالک', value: wh.companyName },
        { label: 'نوع انبار', value: KIND_FA[wh.kind] ?? wh.kind },
        { label: 'موجودی فعلی', value: wh.stockCount > 0 ? `${faNumber(wh.stockM2)} م² در ${faNumber(wh.stockCount)} قلم` : 'بدون موجودی' },
      ] : undefined}
      footer={canManage && wh && eForm ? (
        <>
          <Button
            type="button" variant="outline"
            disabled={busy}
            onClick={() => { if (editDirty) setConfirmCloseEdit(true); else closeTab(tab.id) }}
          >
            انصراف و بستن تب
          </Button>
          <Button type="submit" form="warehouse-edit-form" disabled={busy || !editDirty} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} ذخیره تغییرات
          </Button>
          {!editDirty ? <span className="text-[11px] text-muted-foreground">تغییری ثبت نشده است</span> : null}
        </>
      ) : undefined}
    >
      {wh && eForm ? (
        canManage ? (
          <form
            id="warehouse-edit-form"
            noValidate
            onSubmit={(e) => { e.preventDefault(); void submitEdit() }}
            className="space-y-4"
          >
            <FormSection
              title="ویرایش انبار"
              description={`کد «${wh.code}» قابل تغییر نیست — کلید اسناد و موجودی`}
              cols={2}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="whe-name">نام انبار</Label>
                <Input
                  id="whe-name"
                  value={eForm.name}
                  onChange={(e) => setEF({ ...eForm, name: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>نوع انبار</Label>
                <Select dir="rtl" value={eForm.kind} onValueChange={(v) => setEF({ ...eForm, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(KIND_FA).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </FormSection>
            <FormSection title="وضعیت بهره‌برداری" description="انبار غیرفعال در فرم اسناد و فیلترها ظاهر نمی‌شود" collapsible persistKey="warehouse-form:ops" cols="free">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="whe-active">فعال</Label>
                <p className="text-[11px] text-muted-foreground">
                  {wh.stockCount > 0
                    ? 'این انبار دارای موجودی است — غیرفعال‌سازی رد می‌شود'
                    : 'انبار غیرفعال در فرم اسناد و فیلترها ظاهر نمی‌شود'}
                </p>
              </div>
              <Switch
                id="whe-active"
                checked={eForm.isActive}
                disabled={wh.stockCount > 0}
                onCheckedChange={(v) => setEF({ ...eForm, isActive: v })}
              />
            </div>
            </FormSection>
          </form>
        ) : (
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <p className="mb-3 text-sm font-bold">عضویت و موجودی</p>
            <p className="text-xs leading-6 text-muted-foreground">
              این انبار متعلق به «{wh.companyName}» است و {wh.stockCount > 0 ? `${faNumber(wh.stockM2)} مترمربع موجودی در ${faNumber(wh.stockCount)} قلم دارد` : 'در حال حاضر موجودی ندارد'}.
              ویرایش انبار نیازمند نقش مدیر (شرکت فعال یا پلتفرم) است.
            </p>
          </div>
        )
      ) : null}

      {/* بررسی عمیق فرم‌ها — بستن تب با تغییرات ذخیره‌نشده ویرایش انبار */}
      <ConfirmDialog
        open={confirmCloseEdit}
        onOpenChange={setConfirmCloseEdit}
        destructive
        title="بستن تب با تغییرات ذخیره‌نشده؟"
        description="تغییرات نام، نوع یا وضعیت انبار هنوز ذخیره نشده است و با بستن تب از دست می‌رود."
        confirmLabel="بله، بستن بدون ذخیره"
        onConfirm={() => { setConfirmCloseEdit(false); closeTab(tab.id) }}
      />
    </RecordPageShell>
  )
}
