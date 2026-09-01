'use client'

/**
 * سکشن فرم ERP (P2.5-U1) — الگوی مرجع: «Section» در Dynamics 365 و «Group» در Odoo.
 *
 * نقش: فرم‌های متراکم ERP بدون گروه‌بندی عنوان‌دار، «دیده» نمی‌شوند — سکشن
 * مرز چشمی و ناوبری ذهنی می‌سازد: عنوان گروه + توضیح کوتاه + بدنه فیلدها.
 *
 * قرارداد:
 *  - `cols` (پیش‌فرض ۲): بدنه گرید پاسخ‌گو می‌شود (۱ ستون موبایل / ۲ در sm / ۳ در lg اگر cols=3)
 *  - `cols="free"`: بدنه آزاد است (فرزند خودش چیدمان می‌کند — جدول اقلام، ماتریس و…)
 *  - `collapsible`: فقط برای سکشن‌های اختیاری/کم‌کاربرد (پیش‌فرض باز) — نه برای همه؛
 *    قاعده ERP: فیلد پنهان‌شده پشت سکشن بسته، فیلد فراموش‌شده است
 *  - `persistKey` (P2.5-U3): ماندگاری حالت باز/بسته per کاربر در localStorage (io.ui.v1) —
 *    انتخاب کاربر بین بازدیدها زنده می‌ماند؛ فقط همراه collapsible معنا دارد
 *  - عنوان سکشن «برچسب» است نه دکمه (وقتی collapsible نیست) — div سمانتیک section
 */

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readUiPref, writeUiPref } from '@/core/shared/ui-prefs'
import { useApp } from '@/store/app'

export function FormSection({
  title,
  description,
  cols,
  collapsible = false,
  defaultOpen = true,
  persistKey,
  bodyClassName,
  children,
  className,
}: {
  title: string
  /** توضیح یک‌خطی زیر عنوان — «چرا این گروه فیلد وجود دارد» */
  description?: string
  /** ستون‌های بدنه: ۲ (پیش‌فرض) یا ۳ (۳ در lg+) یا «free» (چیدمان آزاد فرزند) */
  cols?: 2 | 3 | 'free'
  collapsible?: boolean
  defaultOpen?: boolean
  /** P2.5-U3 — شناسه پایدار سکشن برای ماندگاری باز/بسته per کاربر (مثل 'letter-new:attachments') */
  persistKey?: string
  bodyClassName?: string
  children: ReactNode
  className?: string
}) {
  // P2.5-U3 — شناسه کاربر برای ماندگاری per-user (این زیردرخت فقط پس از احراز هویت mount می‌شود)
  const userId = useApp((s) => s.me?.user.id ?? null)
  const [open, setOpen] = useState(() => {
    // خواندن حالت ذخیره‌شده در lazy initializer (الگوی use-draft) — در SSR به پیش‌فرض می‌رسد
    if (!persistKey || !userId) return defaultOpen
    const stored = readUiPref<{ open: boolean }>(userId, `sec:${persistKey}`)
    return stored && typeof stored.open === 'boolean' ? stored.open : defaultOpen
  })

  const toggle = () => {
    setOpen((v) => {
      const next = !v
      if (persistKey && userId) writeUiPref(userId, `sec:${persistKey}`, { open: next })
      return next
    })
  }

  const header = (
    <>
      <p className="text-sm font-bold leading-5 text-foreground">{title}</p>
      {description ? <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</p> : null}
    </>
  )

  return (
    <section aria-label={title} className={cn('overflow-hidden rounded-xl border bg-card', className)}>
      {collapsible ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex w-full items-center gap-2 border-b bg-muted/40 px-4 py-2.5 text-start transition-colors hover:bg-muted/70 sm:px-5"
        >
          {header}
          <ChevronDown className={cn('ms-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} aria-hidden />
        </button>
      ) : (
        <div className="border-b bg-muted/40 px-4 py-2.5 sm:px-5">{header}</div>
      )}

      {open ? (
        <div
          className={cn(
            'p-4 sm:p-5',
            cols === 3 && 'grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3',
            cols !== 'free' && cols !== 3 && 'grid gap-x-4 gap-y-4 sm:grid-cols-2',
            bodyClassName,
          )}
        >
          {children}
        </div>
      ) : null}
    </section>
  )
}
