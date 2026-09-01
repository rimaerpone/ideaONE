'use client'

import { useMemo, useState } from 'react'
import { useStockQuery, useWarehousesQuery } from '@/modules/warehouse/queries'
import type { StockItem } from '@/types/platform'
import { PageHeader, GRADE_LABELS } from '@/components/common/ui-bits'
import { DataGrid, type DataGridColumn } from '@/components/common/data-grid'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Archive, Boxes, Download } from 'lucide-react'
import { useCsvExport } from '@/hooks/use-csv-export'
import { faNumber, relativeFa } from '@/core/shared/jalali'
import { useWorkspace } from '@/store/workspace'

const GRADE_ORDER = ['1', '2', 'w']

export function StockView() {
  const openView = useWorkspace((s) => s.openView)
  const [warehouseId, setWarehouseId] = useState('all')
  const [grade, setGrade] = useState('all')
  const [unit, setUnit] = useState<'m2' | 'carton'>('m2')
  // P1-T35 — اندازه واکشی با انتخاب کاربر هم‌اندازه می‌شود («همه» = ۳۰۰۰ سطر با لیست مجازی)
  const [fetchSize, setFetchSize] = useState(100)

  // فیلتر سمت سرور — تغییر فیلتر = کلید جدید = واکشی تازه (قرارداد فیلتر = P1-T3)
  const { data, isLoading } = useStockQuery(warehouseId, grade, fetchSize)
  // P2.5-U6 — خروجی CSV با همان فیلتر انبار/درجه فعال
  const csv = useCsvExport()
  const warehousesQuery = useWarehousesQuery()
  const items = data?.items ?? []

  const totalM2 = items.reduce((s, i) => s + i.qtyM2, 0)

  const columns = useMemo<DataGridColumn<StockItem>[]>(() => {
    // تبدیل واحد داخل memo — خروجی کارتن از مترمربع محاسبه می‌شود
    const fmt = (i: StockItem) => (unit === 'm2' ? faNumber(i.qtyM2) : faNumber(i.product.cartonArea > 0 ? i.qtyM2 / i.product.cartonArea : 0, 0))
    return [
    {
      key: 'product', header: 'کالا', enableHiding: false,
      cell: (i) => (
        <div>
          <p className="font-medium">{i.product.name}</p>
          <p className="text-[11px] text-muted-foreground" dir="ltr">{i.product.code} · {i.product.size}</p>
        </div>
      ),
      sortValue: (i) => i.product.name,
    },
    {
      key: 'warehouse', header: 'انبار',
      cell: (i) => (
        <div>
          <p className="text-xs">{i.warehouse.name}</p>
          <p className="text-[10px] text-muted-foreground">{i.warehouse.companyName}</p>
        </div>
      ),
      sortValue: (i) => i.warehouse.name,
    },
    { key: 'tone', header: 'تون', align: 'center', cell: (i) => i.tone ? `تون ${i.tone}` : '—', sortValue: (i) => i.tone ?? '' },
    { key: 'caliber', header: 'کالیبر', align: 'center', cell: (i) => i.caliber || '—', sortValue: (i) => i.caliber ?? '' },
    {
      key: 'grade', header: 'درجه', align: 'center',
      cell: (i) => (
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${
          i.grade === '1' ? 'bg-emerald-100 text-emerald-700' : i.grade === '2' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
        }`}>
          {GRADE_LABELS[i.grade] ?? i.grade}
        </span>
      ),
      sortValue: (i) => i.grade,
    },
    {
      key: 'qty', header: unit === 'm2' ? 'مترمربع' : 'کارتن', align: 'start', enableHiding: false,
      cell: (i) => <span className="font-bold tabular-nums">{fmt(i)}</span>,
      sortValue: (i) => (unit === 'm2' ? i.qtyM2 : (i.product.cartonArea > 0 ? i.qtyM2 / i.product.cartonArea : 0)),
    },
    { key: 'updatedAt', header: 'آخرین به‌روزرسانی', align: 'start', hideOnMobile: true, cell: (i) => <span className="text-[11px] text-muted-foreground">{relativeFa(i.updatedAt)}</span>, sortValue: (i) => new Date(i.updatedAt).getTime() },
    ]
  }, [unit])

  const warehouses = warehousesQuery.data?.warehouses ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="موجودی انبار"
        description={`موجودی به تفکیک تون، کالیبر و درجه — جمع دامنه دید: ${faNumber(totalM2)} مترمربع`}
        actions={(
          // P2.5-U6 — خروجی اکسل موجودی با فیلترهای فعال؛ برای همه نقش‌ها (خواندن)
          <Button
            size="sm"
            variant="outline"
            disabled={csv.busy || isLoading}
            onClick={() => void csv.download('/api/stock', () => {
              const p = new URLSearchParams({ sort: 'updatedAt:desc' })
              if (warehouseId !== 'all') p.set('warehouseId', warehouseId)
              if (grade !== 'all') p.set('grade', grade)
              return p
            })}
            className="gap-1.5"
            title="خروجی CSV با همان فیلترهای فعال — قابل باز شدن در اکسل"
          >
            <Download className="h-3.5 w-3.5" /> خروجی اکسل
          </Button>
        )}
      />

      <DataGrid
        columns={columns}
        rows={items}
        loading={isLoading}
        persistKey="stock"
        emptyText="موجودی‌ای با این فیلترها یافت نشد"
        emptyHint="فیلتر انبار یا درجه را تغییر دهید؛ موجودی فقط با ثبت سند انبار (رسید/حواله/انتقال/شمارش) جابه‌جا می‌شود."
        searchKeys={(i) => [i.product.name, i.product.code, i.product.size, i.warehouse.name, i.tone, i.caliber]}
        initialSort={[{ id: 'product', desc: false }]}
        onPageSizeChange={(s) => setFetchSize(s === 0 ? 3000 : Math.max(100, s))}
        toolbar={(
          <>
            <Select dir="rtl" value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="w-52"><SelectValue placeholder="همه انبارها" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه انبارها</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tabs value={grade} onValueChange={(v) => setGrade(v)}>
              <TabsList>
                <TabsTrigger value="all">همه درجات</TabsTrigger>
                {GRADE_ORDER.map((g) => (
                  <TabsTrigger key={g} value={g}>{GRADE_LABELS[g] ?? g}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Tabs value={unit} onValueChange={(v) => setUnit(v as 'm2' | 'carton')}>
              <TabsList>
                <TabsTrigger value="m2">مترمربع</TabsTrigger>
                <TabsTrigger value="carton">کارتن</TabsTrigger>
              </TabsList>
            </Tabs>
            {/* P1.5-T13: مدیریت انبارها به نمای اختصاصی تب‌محور منتقل شد (جایگزین دیالوگ) */}
            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={() => openView('warehouses')}
            >
              <Archive className="h-4 w-4" /> انبارها
            </Button>
          </>
        )}
      />

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Boxes className="h-3.5 w-3.5" />
        تبدیل واحد در سطح مدل محصول انجام می‌شود (مترمربع هر کارتن) نه در لایه نمایش — مطابق توصیه معماری مستر دیتا.
      </p>
    </div>
  )
}
