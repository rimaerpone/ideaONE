'use client'

/**
 * کوئری‌های دامنه انبار (P1-T2/T3/T12) — موجودی، اسناد، درخواست کالا، فهرست انبارها
 * فهرست‌های سروری با پاکت استاندارد (items/total/page/pageSize/pageCount) و keepPreviousData.
 *
 * نکته مرز: هوک «گزینه‌های کالا» عمداً اینجاست نه در ماژول products —
 * فرم‌های سند/درخواست از API عمومی کالا می‌خوانند (مرز ماژول = HTTP، CH-06)؛
 * کلید کش با qkProducts مشترک است تا کش بین نماها به اشتراک برود.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiGet } from '@/core/shared/api-client'
import { qkProducts, qkRequests, qkStock, qkWarehouses, qkWhdocs } from '@/core/query/keys'
import { useApp } from '@/store/app'
import type { GoodsRequest, GoodsRequestDetail, Product, StockItem, Warehouse, WhDoc, WhDocDetail, ListEnvelope } from '@/types/platform'

export type ListSort = { field: string; dir: 'asc' | 'desc' }

export function useStockQuery(warehouseId: string, grade: string, pageSize = 100) {
  const me = useApp((s) => s.me)
  const companyId = me?.activeCompanyId ?? ''
  return useQuery({
    queryKey: [...qkStock(companyId, warehouseId, grade), String(pageSize)],
    queryFn: async (): Promise<ListEnvelope<StockItem>> => {
      const base = new URLSearchParams({ pageSize: '100' })
      if (warehouseId !== 'all') base.set('warehouseId', warehouseId)
      if (grade !== 'all') base.set('grade', grade)
      // P1-T35 — حالت «همه»: سقف قرارداد فهرست ۱۰۰ سطر است؛
      // صفحه‌های بعدی موازی واکشی و به‌ترتیب ادغام می‌شوند (مرتب‌سازی پایدار سرور).
      if (pageSize <= 100) {
        return apiGet<ListEnvelope<StockItem>>(`/api/stock?${base.toString()}`)
      }
      const first = await apiGet<ListEnvelope<StockItem>>(`/api/stock?${base.toString()}&page=1`)
      const pages = first.pageCount ?? 1
      if (pages <= 1) return first
      const rest = await Promise.all(
        Array.from({ length: pages - 1 }, (_, i) =>
          apiGet<ListEnvelope<StockItem>>(`/api/stock?${base.toString()}&page=${i + 2}`),
        ),
      )
      return {
        ...first,
        items: [...first.items, ...rest.flatMap((r) => r.items)],
        pageSize: first.total,
      }
    },
    enabled: !!me,
  })
}

export type WhDocsListParams = { q: string; type: string; page: number; pageSize: number; sort: ListSort }

/** فهرست سروری اسناد انبار */
export function useWhDocsQuery(p: WhDocsListParams) {
  const me = useApp((s) => s.me)
  const companyId = me?.activeCompanyId ?? ''
  return useQuery({
    queryKey: qkWhdocs(companyId, p.q, p.type, p.page, p.pageSize, `${p.sort.field}:${p.sort.dir}`),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(p.page), pageSize: String(p.pageSize), sort: `${p.sort.field}:${p.sort.dir}`,
      })
      if (p.q) params.set('q', p.q)
      if (p.type !== 'all') params.set('type', p.type)
      return apiGet<ListEnvelope<WhDoc>>(`/api/whdocs?${params.toString()}`)
    },
    enabled: !!me,
    placeholderData: keepPreviousData,
  })
}

/** جزئیات یک سند انبار (P1.5-T9 — صفحه رکورد) */
export function useWhDocQuery(docId: string | null) {
  const me = useApp((s) => s.me)
  return useQuery({
    queryKey: ['whdoc', 'detail', docId],
    queryFn: () => apiGet<{ doc: WhDocDetail }>(`/api/whdocs/${docId}`),
    enabled: !!me && !!docId,
  })
}

export type RequestsListParams = { status: string; page: number; pageSize: number }

/** فهرست سروری درخواست‌های کالا (کارت‌ها با ناوبری «از N») — فیلتر وضعیت در سرور */
export function useRequestsQuery(p: RequestsListParams) {
  const me = useApp((s) => s.me)
  const companyId = me?.activeCompanyId ?? ''
  return useQuery({
    queryKey: qkRequests(companyId, p.status, p.page, p.pageSize),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) })
      if (p.status !== 'all') params.set('status', p.status)
      return apiGet<ListEnvelope<GoodsRequest>>(`/api/requests?${params.toString()}`)
    },
    enabled: !!me,
    placeholderData: keepPreviousData,
  })
}

/** جزئیات یک درخواست کالا (P1.5-T10 — صفحه رکورد) */
export function useRequestQuery(requestId: string | null) {
  const me = useApp((s) => s.me)
  return useQuery({
    queryKey: ['request', 'detail', requestId],
    queryFn: () => apiGet<{ request: GoodsRequestDetail }>(`/api/requests/${requestId}`),
    enabled: !!me && !!requestId,
  })
}

/** انبارهای دامنه دید — کش مشترک بین نمای موجودی و فرم سند */
export function useWarehousesQuery() {
  const me = useApp((s) => s.me)
  return useQuery({
    queryKey: qkWarehouses(),
    queryFn: () => apiGet<{ warehouses: Warehouse[] }>('/api/warehouses'),
    enabled: !!me,
    staleTime: 60_000,
  })
}

/** فهرست کامل انبارها برای مدیریت (?all=1 — شامل غیرفعال‌ها و آمار موجودی) — P1.5-T13 */
export function useWarehousesAdminQuery() {
  const me = useApp((s) => s.me)
  return useQuery({
    queryKey: ['warehouses', 'admin', me?.activeCompanyId ?? ''],
    queryFn: () => apiGet<{ warehouses: WarehouseAdminRow[] }>('/api/warehouses?all=1'),
    enabled: !!me,
  })
}

export type WarehouseAdminRow = {
  id: string
  code: string
  name: string
  kind: string
  isActive: boolean
  companyName: string
  companyCode: string
  companyId: string
  stockM2: number
  stockCount: number
}

/** گزینه‌های کالا برای فرم‌های سند/درخواست — مرز HTTP، کلید مشترک با نمای کالا */
export function useProductsOptionsQuery() {
  const me = useApp((s) => s.me)
  return useQuery({
    queryKey: qkProducts(),
    queryFn: () => apiGet<{ products: Product[] }>('/api/products'),
    enabled: !!me,
    staleTime: 60_000,
  })
}

// ---------------- بررسی عمیق فرم‌ها (۱۴۰۵/۰۶) — نمایش موجودی زنده و پیشنهاد طرف حساب ----------------

export type ProductStockSummary = {
  totalM2: number
  variants: { tone: string; caliber: string; grade: string; qtyM2: number }[]
}

/**
 * موجودی یک کالا در یک انبار — برای نمایش زنده در فرم سند/درخواست زیر انتخاب کالا.
 * فیلتر productId سمت سرور (قرارداد استاندارد P1-T3)؛ پاسخ کوچک و کش‌شده است.
 */
export function useProductStockQuery(warehouseId: string | null | undefined, productId: string | null | undefined) {
  const me = useApp((s) => s.me)
  const wid = warehouseId || ''
  const pid = productId || ''
  return useQuery({
    queryKey: ['stock', 'product', me?.activeCompanyId ?? '', wid, pid],
    queryFn: async (): Promise<ProductStockSummary> => {
      const d = await apiGet<ListEnvelope<StockItem>>(`/api/stock?warehouseId=${wid}&productId=${pid}&pageSize=100`)
      const variants = d.items.map((i) => ({ tone: i.tone ?? '', caliber: i.caliber ?? '', grade: i.grade ?? '', qtyM2: i.qtyM2 }))
      return { totalM2: d.items.reduce((s, i) => s + i.qtyM2, 0), variants }
    },
    enabled: !!me && !!wid && !!pid,
    staleTime: 30_000,
  })
}

/** نام‌های رکورد طلایی شرکای شرکت فعال — برای datalist «طرف حساب» فرم سند (مرز ماژول = HTTP) */
export function usePartnerNamesQuery() {
  const me = useApp((s) => s.me)
  const activeCode = me?.companies.find((c) => c.id === me?.activeCompanyId)?.code ?? ''
  return useQuery({
    queryKey: ['partners', 'names', me?.activeCompanyId ?? ''],
    queryFn: async (): Promise<string[]> => {
      const d = await apiGet<{ partners: { goldenName: string; instances: { companyCode: string }[] }[] }>('/api/partners')
      const names = d.partners
        .filter((p) => p.instances.some((i) => i.companyCode === activeCode))
        .map((p) => p.goldenName)
      return Array.from(new Set(names))
    },
    enabled: !!me && !!activeCode,
    staleTime: 60_000,
  })
}
