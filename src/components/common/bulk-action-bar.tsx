'use client'

/**
 * نوار اقدام گروهی شناور (P2.5-U2 — شکاف G3 بنچمارک ERP)
 *
 * الگو: هنگام انتخاب ≥۱ ردیف در فهرست‌ها، نوار شناور پایین صفحه ظاهر می‌شود
 * (الگوی Gmail/D365) — شمار انتخاب فارسی + دکمه‌های اقدام (children) + لغو انتخاب.
 * اقدام اصلی همیشه از ConfirmDialog می‌گذرد (قاعده P1-T23) و نتیجه سرور با
 * toastBulkResult جمع‌بندی می‌شود: «ردِ هر رکورد اعلام می‌شود، سکوت ممنوع».
 */

import { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { faDigits, faNumber } from '@/core/shared/jalali'
import { toastErr, toastInfo, toastOk } from '@/hooks/use-toast'

type BulkActionBarProps = {
  /** شمار ردیف‌های انتخاب‌شده — صفر یعنی نوار رندر نمی‌شود */
  count: number
  /** لغو همه انتخاب‌ها */
  onClear: () => void
  /** دکمه‌های اقدام (مثلاً «بایگانی گروهی») */
  children: ReactNode
  /** قفل حین پرواز درخواست — دکمه لغو هم غیرفعال می‌شود */
  busy?: boolean
}

export function BulkActionBar({ count, onClear, children, busy = false }: BulkActionBarProps) {
  if (count <= 0) return null
  return (
    <div
      className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
      role="region"
      aria-label="نوار اقدام گروهی"
    >
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl border bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur animate-in slide-in-from-bottom-4 fade-in duration-200">
        <span className="text-sm font-medium tabular-nums" aria-live="polite">
          {faNumber(count)} مورد انتخاب شد
        </span>
        <span className="h-5 w-px bg-border" aria-hidden="true" />
        {children}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClear}
          disabled={busy}
          aria-label="لغو انتخاب‌ها"
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ---------------- توست جمع‌بندی نتیجه اقدام گروهی ----------------

/** نتیجه سرور برای هر رکورد — number نامرئی (null) یعنی رکورد اصلاً در دامنه نبود */
export type BulkResultItem = { id: string; number: number | null; ok: boolean; error?: string }

type ToastBulkArgs = {
  /** شمار رکوردهایی که اقدام رویشان انجام شد */
  affected: number
  results: BulkResultItem[]
  /** واحد شمارش — «نامه» / «درخواست» */
  unit: string
  /** عنوان اقدام — «بایگانی گروهی» / «تأیید گروهی» */
  actionTitle: string
  /** فعل نتیجه — «بایگانی شد» / «تأیید شد» */
  doneVerb: string
}

/**
 * قرارداد گزارش (P2.5 §۳): همه موفق → توست موفق؛ بخشی رد شد → اطلاع با فهرست
 * دلایل رد (تا ۳ مورد + «و N مورد دیگر»)؛ هیچ موفق → خطا. رکورد ردشده هرگز
 * بی‌صدا حذف نمی‌شود — کاربر می‌داند کدام رکورد و چرا.
 */
export function toastBulkResult({ affected, results, unit, actionTitle, doneVerb }: ToastBulkArgs): void {
  const failed = results.filter((r) => !r.ok)
  const failedParts = failed
    .slice(0, 3)
    .map((f) => `${unit} ${faDigits(f.number ?? 0)}: ${f.error ?? 'رد شد'}`)
  const more = failed.length > 3 ? ` (و ${faNumber(failed.length - 3)} مورد دیگر)` : ''

  if (failed.length === 0 && affected > 0) {
    toastOk({
      title: `${actionTitle} انجام شد`,
      description: `${faNumber(affected)} ${unit} ${doneVerb}.`,
      duration: 5000, // نتیجه اقدام گروهی فرصت خواندن می‌خواهد (N رکورد در یک نگاه)
    })
  } else if (affected > 0) {
    toastInfo({
      title: `${actionTitle}: ${faNumber(affected)} ${doneVerb}، ${faNumber(failed.length)} رد شد`,
      description: `${failedParts.join('؛ ')}${more}`,
      duration: 9000,
    })
  } else {
    toastErr({
      title: `${actionTitle} انجام نشد`,
      description: `هیچ ${unit}ای ${doneVerb}${failedParts.length > 0 ? ` — ${failedParts.join('؛ ')}${more}` : ''}`,
    })
  }
}
