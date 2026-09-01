'use client'

/**
 * تب داخلی رکورد — ماندگاری + deep-link (P2.5-U10)
 *
 * قواعد:
 *  - مقدار اولیه: ?t آدرس boot (لینک مستقیم — مصرف یک‌باره) → ترجیح ذخیره‌شده
 *    (آخرین تب داخلی همان رکورد) → تب اول
 *  - تغییر تب: ثبت ترجیح io.ui.v1 «it:<viewKey>» = { [recordId]: tabKey }
 *    با سقف ۱۰۰ رکورد (سرریز = بازنشانی — رشد بی‌کران ممنوع) + replaceState ?t=
 *  - خواندن ترجیح در lazy initializer (الگوی U3 — این زیردرخت فقط پس از
 *    احراز هویت mount می‌شود، پس SSR همگام است؛ setState همگام در effect ممنوع)
 */

import { useCallback, useEffect, useState } from 'react'
import { readUiPref, writeUiPref } from '@/core/shared/ui-prefs'
import { useApp } from '@/store/app'
import { clearBootInnerTab, takeBootInnerTab } from '@/store/workspace'

const MAX_TRACKED = 100
type InnerTabMap = Record<string, string>

/** همگام‌سازی ?t آدرس با تب داخلی فعال (رکورد فعال باید مالک URL باشد) */
function syncInnerTabUrl(viewKey: string, recordId: string, tabKey: string) {
  if (typeof window === 'undefined' || typeof history === 'undefined') return
  try {
    const url = new URL(window.location.href)
    const rec = url.searchParams.get('rec')
    // فقط وقتی URL همین رکورد را نشان می‌دهد (وگرنه آدرس تب دیگری را خراب نکنیم)
    if (rec === `${viewKey}:${recordId}`) {
      url.searchParams.set('t', tabKey)
      history.replaceState(history.state, '', url)
    }
  } catch {
    /* بی‌صدا */
  }
}

export function useRecordInnerTab(
  viewKey: string,
  recordId: string | null | undefined,
  tabs: { key: string; label?: string }[],
): [string, (key: string) => void] {
  const userId = useApp((s) => s.me?.user.id ?? null)
  const validKeys = tabs.map((t) => t.key)
  const [active, setActive] = useState<string>(() => {
    if (!recordId || validKeys.length === 0) return validKeys[0] ?? ''
    // ۱) لینک مستقیم (?t) — مصرف یک‌باره
    const boot = takeBootInnerTab(viewKey, recordId)
    if (boot && validKeys.includes(boot)) return boot
    // ۲) آخرین تب همین رکورد (io.ui.v1)
    const saved = userId ? readUiPref<InnerTabMap>(userId, `it:${viewKey}`) : null
    const key = saved?.[recordId]
    if (key && validKeys.includes(key)) return key
    // ۳) تب اول
    return validKeys[0]
  })

  const change = useCallback((key: string) => {
    if (!validKeys.includes(key)) return
    setActive(key)
    if (!recordId || !userId) return
    // ثبت ترجیح — فقط انحراف از تب اول (سقف ۱۰۰ رکورد؛ سرریز = بازنشانی)
    try {
      const saved = readUiPref<InnerTabMap>(userId, `it:${viewKey}`) ?? {}
      const next: InnerTabMap = Object.keys(saved).length >= MAX_TRACKED ? {} : saved
      next[recordId] = key
      writeUiPref(userId, `it:${viewKey}`, next)
    } catch {
      /* ترجیح اختیاری است */
    }
    syncInnerTabUrl(viewKey, recordId, key)
  }, [userId, viewKey, recordId, validKeys])

  // ?t آدرس فقط یک گام boot است — پس از mount پاک می‌شود (هر دو رندر StrictMode خوانده‌اند)
  useEffect(() => {
    if (recordId) clearBootInnerTab(viewKey, recordId)
  }, [viewKey, recordId])

  return [active, change]
}
