'use client'

/**
 * هسته مدیریت وضعیت سرور — TanStack Query (P1-T2)
 *
 * چرا: الگوی دستی «refreshKey + useEffect + useState» در هر نما تکرار می‌شد؛
 * کش، بازخوانی هوشمند، تلاش مجدد و ابطال متمرکز (rtVersion → invalidate)
 * حالا یک‌جا مدیریت می‌شود و نماها فقط «کلید + تابع واکشی» تعریف می‌کنند.
 *
 * نمونه سراسری با گارد globalThis تا در HMR دوباره‌سازی نشود.
 */
import { QueryClient } from '@tanstack/react-query'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // داده‌های عملیاتی (نامه/سند/موجودی) به‌سرعت کهنه می‌شوند؛ پنجره تازگی کوتاه
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        // یک تلاش مجدد برای خطاهای گذرا؛ خطای 4xx (منطقی/مجوز) هرگز دوباره نمی‌رود
        retry: (failureCount, error) => {
          const status = (error as { status?: number })?.status
          if (typeof status === 'number' && status >= 400 && status < 500) return false
          return failureCount < 1
        },
      },
      mutations: { retry: false },
    },
  })
}

// گارد HMR — کلاینت بین بارگذاری‌های مجدد زنده می‌ماند تا کش کاربر ریست نشود
const g = globalThis as unknown as { __posQueryClient?: QueryClient }

export function getQueryClient(): QueryClient {
  if (!g.__posQueryClient) g.__posQueryClient = createQueryClient()
  return g.__posQueryClient
}
