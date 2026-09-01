'use client'

/**
 * اتصال رویداد بلادرنگ → کش سرور (P1-T2)
 *
 * هر اعلان socket (rtVersion++) یعنی داده‌ای در سرور تغییر کرده است:
 *  - اعلانِ دارای نمای هدف (مثلاً «نامه جدید» → letters) فقط همان دامنه را ابطال می‌کند
 *  - اعلان بدون نمای هدف → همه دامنه‌های فهرستی ابطال می‌شوند (محافظه‌کارانه)
 *
 * این هوک یک‌بار در پوسته سوار می‌شود؛ نماها هیچ چیز درباره سوکت نمی‌دانند —
 * فقط useQuery می‌نویسند و بازخوانی خودکار را می‌گیرند (رفتار یکسان در همه نماها).
 */
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useApp } from '@/store/app'
import { QK_PREFIX } from './keys'

// نگاشت «نمای هدف اعلان» → دامنه‌های داده‌ای که تغییر کرده‌اند
const VIEW_TO_DOMAINS: Readonly<Record<string, readonly (readonly string[])[]>> = {
  letters: [QK_PREFIX.letters],
  cartable: [QK_PREFIX.letters],
  whdocs: [QK_PREFIX.whdocs, QK_PREFIX.stock],
  stock: [QK_PREFIX.stock, QK_PREFIX.whdocs],
  requests: [QK_PREFIX.requests, QK_PREFIX.stock],
  products: [QK_PREFIX.products],
  partners: [QK_PREFIX.partners],
  dashboard: [QK_PREFIX.dashboard],
}

const ALL_LIST_DOMAINS = Object.values(VIEW_TO_DOMAINS).flat()

export function useRtInvalidation() {
  const rtVersion = useApp((s) => s.rtVersion)
  const rtLastView = useApp((s) => s.rtLastView)
  const queryClient = useQueryClient()
  // نسخه صفر (بوت اولیه) ابطال نمی‌کند
  const prevVersion = useRef(rtVersion)

  useEffect(() => {
    if (prevVersion.current === rtVersion) return
    prevVersion.current = rtVersion

    const domains = (rtLastView && VIEW_TO_DOMAINS[rtLastView]) || ALL_LIST_DOMAINS
    for (const domain of domains) {
      void queryClient.invalidateQueries({ queryKey: domain })
    }
  }, [rtVersion, rtLastView, queryClient])
}
