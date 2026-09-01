'use client'

import { useState } from 'react'
import { usePartnersQuery } from '@/modules/partners/queries'
import { PageHeader, LoadingState, EmptyState } from '@/components/common/ui-bits'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { HeartHandshake, Users, Info, ShieldCheck, ShieldAlert } from 'lucide-react'
import { faNumber, faDigits } from '@/core/shared/jalali'
import { verifyIranianNationalId, verifyIranianLegalId } from '@persian-tools/persian-tools'

// اعتبار شناسه شریک تجاری (پوشش persian-tools — docs/persian/persian-stack.md)
// ۱۰ رقمی = کد ملی حقیقی · ۱۱ رقمی = شناسه ملی حقوقی
function checkNationalId(nationalId: string): boolean | null {
  const digits = nationalId.replace(/\D/g, '')
  // خروجی persian-tools «boolean | undefined» است — undefined را به «قضاوت نمی‌کنیم» نگاشت می‌کنیم
  if (digits.length === 10) return verifyIranianNationalId(digits) ?? null
  if (digits.length === 11) return verifyIranianLegalId(digits) ?? null
  return null // طول نامتعارف — قضاوت نمی‌کنیم
}

function NationalIdBadge({ nationalId }: { nationalId: string | null }) {
  if (!nationalId) return <span className="text-[11px] text-muted-foreground">بدون شناسه ملی ثبت‌شده</span>
  const valid = checkNationalId(nationalId)
  return (
    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
      <span>شناسه ملی: {faDigits(nationalId)}</span>
      {valid === true ? (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-px text-[9px] font-medium text-emerald-700" title="رقم کنترل معتبر است">
          <ShieldCheck className="h-3 w-3" /> معتبر
        </span>
      ) : valid === false ? (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-px text-[9px] font-medium text-amber-700" title="رقم کنترل نامعتبر — نیازمند بازبینی">
          <ShieldAlert className="h-3 w-3" /> نیازمند بازبینی
        </span>
      ) : null}
    </span>
  )
}

export function PartnersView() {
  const { data, isLoading } = usePartnersQuery()
  const partners = data?.partners ?? null
  const [tab, setTab] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER')

  const list = (partners ?? []).filter((p) => p.kind === tab)

  return (
    <div className="space-y-5">
      <PageHeader
        title="مشتریان و تأمین‌کنندگان"
        description="الگوی «رکورد طلایی گروه + نمونه عملیاتی هر شرکت» — یکپارچگی هلدینگی و استقلال عملیاتی شرکت‌ها"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="CUSTOMER" className="gap-1.5"><Users className="h-3.5 w-3.5" /> مشتریان</TabsTrigger>
            <TabsTrigger value="SUPPLIER" className="gap-1.5"><HeartHandshake className="h-3.5 w-3.5" /> تأمین‌کنندگان</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          نام و شناسه ملی در سطح گروه مدیریت می‌شود؛ اعتبار، شرایط و کد حساب به تفکیک شرکت.
        </p>
      </div>

      {isLoading ? (
        <LoadingState rows={4} label="در حال بارگذاری شرکا..." />
      ) : partners === null || list.length === 0 ? (
        <EmptyState
          text="رکوردی یافت نشد"
          hint={tab === 'CUSTOMER'
            ? 'مشتریان با «رکورد طلایی گروه» نگهداری می‌شوند؛ نام تکراری در شرکت‌های مختلف یکپارچه است.'
            : 'تأمین‌کنندگان (خاک، لعاب، بسته‌بندی و…) اینجا فهرست می‌شوند؛ رکورد طلایی در سطح گروه ثبت می‌شود.'}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((p) => (
            <div key={p.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold">{p.goldenName}</p>
                  <NationalIdBadge nationalId={p.nationalId} />
                </div>
                <Badge variant="secondary" className="shrink-0 border-0 bg-primary/10 text-primary">رکورد طلایی گروه</Badge>
              </div>

              <div className="mt-3 space-y-2">
                {p.instances.length === 0 ? (
                  <p className="text-xs text-muted-foreground">در شرکت‌های در دسترس شما نمونه عملیاتی ندارد</p>
                ) : (
                  p.instances.map((i) => (
                    <div key={i.id} className="rounded-lg bg-muted/50 p-3 text-xs leading-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{i.companyName}</span>
                        {i.accountCode ? <Badge variant="secondary" className="border-0 text-[10px]" dir="ltr">{i.accountCode}</Badge> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                        {i.creditLimit > 0 ? <span>سقف اعتبار: {faNumber(i.creditLimit / 1000000000, 1)} میلیارد تومان</span> : null}
                        {i.terms ? <span>شرایط: {i.terms}</span> : null}
                      </div>
                      {i.note ? <p className="mt-1 text-muted-foreground">یادداشت: {i.note}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
