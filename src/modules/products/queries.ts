'use client'

/**
 * کوئری‌های دامنه مستر دیتای محصول (P1.5-T11) — مرز ماژول = HTTP؛
 * کلید کش qkProducts مشترک با «گزینه‌های کالای» فرم‌های انبار تا کش بین نماها به اشتراک برود.
 */
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/core/shared/api-client'
import { qkProducts } from '@/core/query/keys'
import { useApp } from '@/store/app'
import type { Product } from '@/types/platform'

/** فهرست محصولات دامنه دید + جمع موجودی */
export function useProductsQuery() {
  const me = useApp((s) => s.me)
  return useQuery({
    queryKey: qkProducts(),
    queryFn: () => apiGet<{ products: Product[] }>('/api/products'),
    enabled: !!me,
    staleTime: 60_000,
  })
}
