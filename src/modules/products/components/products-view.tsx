'use client'

/**
 * نمای مستر دیتای محصول — پوسته چندسندی P1.5:
 *  - داده: TanStack Query (useProductsQuery — کلید مشترک با فرم‌های انبار، مرز = HTTP)
 *  - ناوبری: «محصول جدید» = تب فرم صفحه‌ای (product-page) — دیالوگ حذف شد
 */
import { useState } from 'react'
import { useApp } from '@/store/app'
import { useCanWrite } from '@/hooks/use-can-write'
import { useProductsQuery } from '@/modules/products/queries'
import { useWorkspace } from '@/store/workspace'
import { PageHeader, LoadingState, EmptyState } from '@/components/common/ui-bits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Package, Plus } from 'lucide-react'
import { faNumber } from '@/core/shared/jalali'
import { Badge } from '@/components/ui/badge'

export function ProductsView() {
  const me = useApp((s) => s.me)
  const activeCompany = me?.companies.find((c) => c.id === me.activeCompanyId)
  const isGroup = activeCompany?.type === 'GROUP'
  const canWrite = useCanWrite() // P1-T18 — VIEWER دکمه ثبت نمی‌بیند (گارد سرور هم هست)
  const openNew = useWorkspace((s) => s.openNew)
  const { data, isLoading } = useProductsQuery()
  const [q, setQ] = useState('')

  const products = data?.products ?? null
  const filtered = (products ?? []).filter(
    (p) => !q || p.name.includes(q) || p.code.includes(q) || p.productLine.includes(q) || p.color.includes(q),
  )
  // تبدیل واحد زنده: مترمربع → کارتن → پالت
  const cartons = (p: { totalStockM2: number; cartonArea: number }) => (p.cartonArea > 0 ? p.totalStockM2 / p.cartonArea : 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="مستر دیتا: محصول"
        description="سلسله‌مراتب خط محصول ← آیتم (رنگ/ابعاد/سطح) ← واریانت موجودی (تون/کالیبر/درجه) با تبدیل واحد"
        actions={canWrite ? (
          <Button
            size="sm"
            onClick={() => openNew('products', 'محصول جدید')}
            disabled={isGroup}
            className="gap-1.5"
            title={isGroup ? 'برای ثبت، به شرکت عملیاتی سوئیچ کنید' : undefined}
          >
            <Plus className="h-3.5 w-3.5" /> محصول جدید
          </Button>
        ) : undefined}
      />

      <div className="relative sm:max-w-80">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="جستجو بر اساس نام، کد، خط یا رنگ..." value={q} onChange={(e) => setQ(e.target.value)} className="ps-9" />
      </div>

      {isLoading || products === null ? (
        <LoadingState rows={5} label="در حال بارگذاری مستر دیتا..." />
      ) : filtered.length === 0 ? (
        <EmptyState text="محصولی یافت نشد" hint="جستجو را تغییر دهید؛ مستر دیتای کالا مبنای اسناد انبار و درخواست‌هاست — با «محصول جدید» تکمیل می‌شود." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <div key={p.id} className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold" title={p.name}>{p.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground" dir="ltr">{p.code}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Package className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="border-0">{p.productLine}</Badge>
                <Badge variant="secondary" className="border-0">{p.size}</Badge>
                <Badge variant="secondary" className="border-0">{p.color}</Badge>
                {p.surface ? <Badge variant="secondary" className="border-0">{p.surface}</Badge> : null}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-2.5 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">مترمربع</p>
                  <p className="text-sm font-bold">{faNumber(p.totalStockM2)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">کارتن</p>
                  <p className="text-sm font-bold">{faNumber(cartons(p), 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">مترمربع هر کارتن</p>
                  <p className="text-sm font-bold">{faNumber(p.cartonArea, 2)}</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {p.companyName} · {faNumber(p.cartonsPerPallet)} کارتن در هر پالت
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
