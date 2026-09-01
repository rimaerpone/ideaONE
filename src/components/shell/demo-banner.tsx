'use client'

import { useEffect, useState } from 'react'
import { TriangleAlert, X } from 'lucide-react'

/**
 * بنر «محیط دمو» (P0-T22) — قابل بستن و ماندگار بین بازدیدها.
 * گذرواژه‌های نمایشی seed و داده ساختگی فقط برای جلسات نمایش‌اند؛
 * در استقرار واقعی این بنر به همراه seed نمایشی حذف می‌شود.
 */
const DISMISS_KEY = 'ideaone.demo-banner.dismissed'

export function DemoBanner() {
  const [hidden, setHidden] = useState(true) // تا خواندن localStorage چیزی نمایش نده (بدون فلش SSR)

  useEffect(() => {
    // خواندن localStorage بعد از رندر اول (SSR-safe) — با الگوی microtask مطابق قاعده set-state-in-effect
    let alive = true
    Promise.resolve().then(() => {
      if (!alive) return
      try {
        setHidden(window.localStorage.getItem(DISMISS_KEY) === '1')
      } catch {
        setHidden(false) // localStorage در دسترس نیست — بنر را نشان بده
      }
    })
    return () => { alive = false }
  }, [])

  if (hidden) return null

  const dismiss = () => {
    setHidden(true)
    try { window.localStorage.setItem(DISMISS_KEY, '1') } catch { /* خصوصی‌سازی مرورگر بسته است */ }
  }

  return (
    <div className="border-b border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/60 dark:text-amber-200">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 sm:px-6">
        <TriangleAlert className="h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1 text-xs leading-5">
          <span className="font-bold">محیط نمایشی (دمو) — </span>
          داده‌ها و گذرواژه‌ها ساختگی‌اند و برای جلسات نمایش قابلیت‌هاست؛ در تصمیم‌گیری عملیاتی استفاده نشود.
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="بستن بنر محیط نمایشی"
          className="rounded-md p-1 hover:bg-amber-100 dark:hover:bg-amber-900/50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
