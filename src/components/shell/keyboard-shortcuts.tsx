'use client'

/**
 * میان‌برهای کیبورد سراسری (P1-T27):
 *  - Ctrl+K        پالت فرمان (P1-T25) — همه‌جا، حتی داخل فیلد
 *  - «/»           فوکوس جستجوی جدول نمای فعال (data-grid-search)؛ نبود = پالت فرمان
 *  - «؟» یا «?»    راهنمای میان‌برها
 *  - Esc           بستن تب فعال — فقط وقتی فوکوس داخل فیلد ورودی نیست و هیچ پنجره/منوی
 *                  باز نیست (Radix خودش Esc را مدیریت می‌کند). پیش‌نویس فرم‌ها با P1-T24 محفوظ است.
 *  - Ctrl+Enter    ثبت فرم (داخل فرم‌ها — در خود فرم‌ها پیاده شده؛ اینجا فقط مستند می‌شود)
 *
 * تشخیص فیزیکی با e.code (مستقل از چیدمان فارسی/انگلیسی)؛ «؟» با e.key تا چیدمان فارسی هم پوشش داده شود.
 */

import { useEffect } from 'react'
import { useWorkspace } from '@/store/workspace'
import { useDirty } from '@/store/dirty'
import { useOverlays } from '@/store/overlays'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Keyboard } from 'lucide-react'

/** آیا رویداد کلید در عنصر ورودی رخ داده؟ (Esc داخل فیلد نباید تب را ببندد) */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/** آیا پنجره/منو/پاپ‌آور Radix بازی است؟ (Esc باید کار خودش را بکند) */
function anyOverlayOpen(): boolean {
  return !!document.querySelector('[data-state="open"]')
}

export function KeyboardShortcuts() {
  const togglePalette = useOverlays((s) => s.togglePalette)
  const setPalette = useOverlays((s) => s.setPalette)
  const toggleHelp = useOverlays((s) => s.toggleHelp)
  const activeTabId = useWorkspace((s) => s.activeTabId)
  const requestClose = useDirty((s) => s.requestClose)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K / Cmd+K — پالت فرمان (حتی داخل فیلد؛ استاندارد ناوبری است)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault()
        togglePalette()
        return
      }

      // کلیدهای تک‌حرفی فقط وقتی کاربر در حال تایپ نیست
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return

      if (e.key === '?' || e.key === '؟' || (e.shiftKey && e.code === 'Slash')) {
        // «؟» — راهنمای میان‌برها (چیدمان فارسی و انگلیسی + تشخیص فیزیکی مقاوم)
        e.preventDefault()
        toggleHelp()
        return
      }

      if (e.code === 'Slash') {
        // «/» — جستجوی جدول نمای فعال؛ نبود = پالت فرمان
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>('input[data-grid-search]')
        if (input) input.focus()
        else setPalette(true)
        return
      }

      if (e.key === 'Escape') {
        // Esc — بستن تب فعال (وقتی پنجره/منویی باز نیست و داخل فیلد نیستیم).
        // U10 — از مسیر گارد کثیف می‌گذرد: فرم ذخیره‌نشده = ConfirmDialog، نه بستن بی‌هشدار
        if (anyOverlayOpen()) return
        if (activeTabId) {
          e.preventDefault()
          requestClose(activeTabId)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [togglePalette, setPalette, toggleHelp, activeTabId, requestClose])

  return <KeyboardHelpDialog />
}

/** راهنمای میان‌برها — باز با «؟» یا از اقدامات پالت فرمان (P1-T27) */
function KeyboardHelpDialog() {
  const helpOpen = useOverlays((s) => s.helpOpen)
  const setHelp = useOverlays((s) => s.setHelp)

  const rows: { keys: string[]; desc: string; scope: string }[] = [
    { keys: ['Ctrl', 'K'], desc: 'پالت فرمان — جستجوی نما، نامه، محصول، شریک و اقدامات', scope: 'همه‌جا' },
    { keys: ['/'], desc: 'فوکوس روی جستجوی جدول نمای فعال', scope: 'فهرست‌ها' },
    { keys: ['؟'], desc: 'همین راهنما', scope: 'همه‌جا' },
    { keys: ['Esc'], desc: 'بستن تب فعال — پیش‌نویس فرم با ذخیره خودکار محفوظ می‌ماند', scope: 'پوسته' },
    { keys: ['Ctrl', 'Enter'], desc: 'ثبت فرم (نامه، درخواست، محصول، سند انبار)', scope: 'فرم‌های ثبت' },
    { keys: ['Ctrl', 'Shift', 'Enter'], desc: 'ثبت و قطعی‌سازی سند انبار (اعمال روی موجودی)', scope: 'فرم سند انبار' },
    { keys: ['↑', '↓'], desc: 'پیمایش ردیف‌های فهرست — با پنل پیش‌نمایش باز، رکورد بعدی/قبلی نمایش داده می‌شود', scope: 'فهرست‌های پیش‌نمایش‌دار' },
    { keys: ['Space'], desc: 'پیش‌نمایش رکوردِ ردیف متمرکز در پنل کناری (نه تب جدید)', scope: 'فهرست‌های پیش‌نمایش‌دار' },
    { keys: ['Esc'], desc: 'بستن پنل پیش‌نمایش (وقتی باز است)', scope: 'فهرست‌های پیش‌نمایش‌دار' },
    { keys: ['↑', '↓'], desc: 'جابه‌جایی بین نتایج پالت فرمان', scope: 'پالت فرمان' },
    { keys: ['Enter'], desc: 'اجرای نتیجه انتخاب‌شده', scope: 'پالت فرمان' },
  ]

  return (
    <Dialog open={helpOpen} onOpenChange={setHelp}>
      <DialogContent dir="rtl" className="max-w-lg" aria-describedby={undefined}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Keyboard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-base">راهنمای میان‌برهای کیبورد</DialogTitle>
            <DialogDescription className="text-xs">
              برای کار روزانه با نامه‌ها و اسناد، بدون بردن دست به ماوس.
            </DialogDescription>
          </div>
        </div>
        <div className="mt-2 overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.keys.join('+')}:${r.scope}`} className={i % 2 === 1 ? 'bg-muted/40' : undefined}>
                  <td className="w-40 border-e px-3 py-2.5 align-middle">
                    <span className="flex flex-wrap items-center gap-1">
                      {r.keys.map((k) => (
                        <kbd key={k} className="rounded-md border bg-background px-1.5 py-0.5 font-sans text-[11px] leading-4 text-foreground/80">{k}</kbd>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 leading-6">{r.desc}</td>
                  <td className="w-24 px-3 py-2.5 text-[11px] text-muted-foreground">{r.scope}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] leading-5 text-muted-foreground">
          میان‌برها مستقل از چیدمان کیبورد فارسی/انگلیسی کار می‌کنند (تشخیص فیزیکی کلید).
        </p>
      </DialogContent>
    </Dialog>
  )
}
