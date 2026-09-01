'use client'

/**
 * هوک مدیا‌کوئری SSR-امن (P2.5-U4) — تشخیص عرض نمایش برای رفتارهای واکنش‌گرا
 * که «عمداً» بین دسکتاپ و موبایل فرق می‌کنند (مثل پنل پیش‌نمایش کنار فهرست).
 *
 * پیاده‌سازی با useSyncExternalStore (الگوی استاندارد matchMedia — بدون
 * setState همگام در effect؛ دروازه lint):
 *  - getServerSnapshot = false (پوسته فقط پس از احراز هویت سمت کلاینت mount
 *    می‌شود، پس پرش هیدریشن نداریم)
 *  - اشتراک با addEventListener('change') — سبک و استاندارد
 */

import { useCallback, useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onStoreChange)
      return () => mql.removeEventListener('change', onStoreChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/** میان‌بر: آیا نمایش در دست‌کم lg (۱۰۲۴px) است؟ — آستانه پنل پیش‌نمایش U4 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}
