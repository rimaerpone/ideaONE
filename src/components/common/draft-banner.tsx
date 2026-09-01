'use client'

/**
 * نشانگرهای پیش‌نویس (P1-T24) — دو عنصر کوچک مشترک همه فرم‌های ثبت:
 *  - RestoredDraftBanner: «پیش‌نویس بازیابی شد» + دکمه دورریختن (بالای فرم)
 *  - AutosaveIndicator: وضعیت ذخیره خودکار (در نوار اقدام چسبان)
 */

import { History, RotateCcw, Save } from 'lucide-react'
import { formatJalali } from '@/core/shared/jalali'

export function RestoredDraftBanner({
  savedAt,
  onDiscard,
}: {
  savedAt: number
  onDiscard: () => void
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-xs"
    >
      <History className="h-4 w-4 shrink-0 text-primary" />
      <span className="font-medium">پیش‌نویس بازیابی‌شده</span>
      <span className="text-muted-foreground">
        ذخیره‌شده در {formatJalali(new Date(savedAt), true)} — داده فرم شما پیش از بسته‌شدن محفوظ مانده است.
      </span>
      <button
        type="button"
        onClick={onDiscard}
        className="ms-auto inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-destructive transition-colors hover:bg-destructive/10"
      >
        <RotateCcw className="h-3.5 w-3.5" /> دورریختن پیش‌نویس
      </button>
    </div>
  )
}

export function AutosaveIndicator({ lastSavedAt }: { lastSavedAt: number | null }) {
  if (lastSavedAt !== null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums" dir="rtl">
        <Save className="h-3.5 w-3.5 text-emerald-600" />
        پیش‌نویس ذخیره‌شده در {formatJalali(new Date(lastSavedAt), true)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Save className="h-3.5 w-3.5" />
      ذخیره خودکار پیش‌نویس فعال است
    </span>
  )
}
