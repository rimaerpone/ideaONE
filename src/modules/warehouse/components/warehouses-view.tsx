'use client'

/**
 * نمای فهرست انبارها (P1.5-T13) — جایگزین دیالوگ «مدیریت انبارها» (warehouses-admin).
 * نمای کامل تب‌محور: جدول دامنه دید + ایجاد (تب رکورد جدید) + ویرایش (تب رکورد انبار).
 * انبار جدید بلافاصوله در فیلتر موجودی و فرم اسناد ظاهر می‌شود (بدون کش سمت سرور).
 */

import { useMemo } from 'react'
import { useApp } from '@/store/app'
import { useWorkspace } from '@/store/workspace'
import { useWarehousesAdminQuery } from '@/modules/warehouse/queries'
import { PageHeader } from '@/components/common/ui-bits'
import { DataGrid, type DataGridColumn } from '@/components/common/data-grid'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { faNumber } from '@/core/shared/jalali'

const KIND_FA: Record<string, string> = { PHYSICAL: 'فیزیکی', VIRTUAL: 'مجازی (حسابی/امانی)', WORKSTATION: 'پای کار ایستگاه' }

export function WarehousesView() {
  const me = useApp((s) => s.me)
  const activeCompany = me?.companies.find((c) => c.id === me.activeCompanyId)
  const canManage = !!me?.user.isAdmin || activeCompany?.role === 'ADMIN'

  const openRecord = useWorkspace((s) => s.openRecord)
  const openNew = useWorkspace((s) => s.openNew)

  const { data, isLoading } = useWarehousesAdminQuery()
  const rows = data?.warehouses ?? []

  const columns = useMemo<DataGridColumn<typeof rows[number]>[]>(() => [
    {
      key: 'name', header: 'انبار', enableHiding: false,
      cell: (w) => (
        <div>
          <p className="font-medium">{w.name}</p>
          <p className="font-mono text-[10px] text-muted-foreground" dir="ltr">{w.code}</p>
        </div>
      ),
      sortValue: (w) => w.name,
    },
    { key: 'company', header: 'شرکت', cell: (w) => <span className="text-xs text-muted-foreground">{w.companyName}</span>, sortValue: (w) => w.companyName },
    { key: 'kind', header: 'نوع', cell: (w) => <span className="text-xs">{KIND_FA[w.kind] ?? w.kind}</span>, sortValue: (w) => w.kind },
    {
      key: 'stock', header: 'موجودی',
      cell: (w) => w.stockCount > 0
        ? <span className="text-xs">{faNumber(w.stockM2)} م² <span className="text-muted-foreground">({faNumber(w.stockCount)} قلم)</span></span>
        : <span className="text-xs text-muted-foreground">—</span>,
      sortValue: (w) => w.stockM2,
    },
    {
      key: 'isActive', header: 'وضعیت',
      cell: (w) => w.isActive
        ? <Badge variant="secondary" className="border-0 bg-emerald-100 text-emerald-700">فعال</Badge>
        : <Badge variant="secondary" className="border-0 bg-red-100 text-red-700">غیرفعال</Badge>,
      sortValue: (w) => (w.isActive ? 1 : 0),
    },
  ], [])

  return (
    <div className="space-y-5">
      <PageHeader
        title="انبارها"
        description={`انبارهای دامنه دید شما — ${canManage ? 'برای ایجاد یا ویرایش، رکورد انبار را باز کنید' : 'نمای فقط‌خواندنی؛ مدیریت نیازمند نقش مدیر'} · کد انبار پس از ایجاد قابل تغییر نیست (کلید اسناد انبار)`}
        actions={canManage ? (
          <Button size="sm" className="gap-1.5" onClick={() => openNew('warehouses')}>
            <Plus className="h-4 w-4" /> انبار جدید
          </Button>
        ) : undefined}
      />

      <DataGrid
        columns={columns}
        rows={rows}
        loading={isLoading}
        persistKey="warehouses"
        emptyText="انباری در دامنه دید شما یافت نشد"
        emptyHint="انبارهای شرکت فعال اینجا فهرست می‌شوند؛ برای افزودن، «انبار جدید» را بزنید یا از پالت Ctrl+K اقدام «انبار جدید» را اجرا کنید."
        searchKeys={(w) => [w.name, w.code, w.companyName, KIND_FA[w.kind] ?? w.kind]}
        initialSort={[{ id: 'name', desc: false }]}
        onRowClick={(w) => openRecord('warehouses', w.id, w.name)}
      />

      <p className="text-xs leading-6 text-muted-foreground">
        انبار دارای موجودی (بیش از صفر) قابل غیرفعال‌سازی نیست — ابتدا موجودی را با حواله یا انتقال تخلیه کنید.
        انبار غیرفعال در فرم اسناد و فیلترهای موجودی ظاهر نمی‌شود اما سابقه اسناد آن محفوظ است.
      </p>
    </div>
  )
}
