'use client'

/**
 * ذخیره خودکار پیش‌نویس فرم‌های بزرگ (P1-T24)
 *
 * قرارداد:
 *  - کلید: `io.draft.v1:<companyId>:<viewKey>` — شرکت‌محور تا سوییچ شرکت پیش‌نویس شرکت دیگر را نشکند
 *  - ساختار: { v: 1, savedAt: number, values } — نسخه‌دار تا تغییر اسکیما پیش‌نویس قدیمی را بی‌خطر رد کند
 *  - بازیابی: فقط فیلدهای موجود در defaults مرج (merge سطح‌اول) — فیلد حذف‌شده از اسکیما نادیده، فیلد جدید از default
 *  - پاک‌سازی: پس از ثبت موفق، انصراف صریح و «دورریختن پیش‌نویس»
 *  - بستن تب (× یا Esc) پیش‌نویس را پاک «نمی‌کند» — بازگشت به فرم داده را برمی‌گرداند (هم‌راستا با پوسته چندسندی P1.5)
 *
 * سقف حجم ۲۵۶KB — پیش‌نویس غیرعادی (مثلاً متن ۱۰هزار نویسه‌ای تکرارشونده) ذخیره نمی‌شود.
 */

import { useEffect, useRef, useState } from 'react'
import { useFormState, useWatch, type Control, type FieldValues } from 'react-hook-form'

export const DRAFT_PREFIX = 'io.draft.v1'
export const DRAFT_VERSION = 1
/** سقف حجم JSON پیش‌نویس (کاراکتر) */
const DRAFT_MAX_CHARS = 256_000
/** تأخیر debounce ذخیره پس از آخرین تغییر (میلی‌ثانیه) */
export const DRAFT_DEBOUNCE_MS = 700

export type DraftEnvelope<T> = { v: 1; savedAt: number; values: T }

export function draftKey(viewKey: string, companyId: string | null | undefined): string {
  return `${DRAFT_PREFIX}:${companyId ?? 'none'}:${viewKey}`
}

export function readDraft<T extends object>(key: string): DraftEnvelope<T> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DraftEnvelope<T>
    if (
      !parsed || parsed.v !== DRAFT_VERSION
      || typeof parsed.savedAt !== 'number'
      || !parsed.values || typeof parsed.values !== 'object'
    ) return null
    return parsed
  } catch {
    return null
  }
}

export function writeDraft<T extends object>(key: string, values: T): number | null {
  if (typeof window === 'undefined') return null
  try {
    const payload = JSON.stringify({ v: DRAFT_VERSION, savedAt: Date.now(), values })
    if (payload.length > DRAFT_MAX_CHARS) return null
    window.localStorage.setItem(key, payload)
    return Date.now()
  } catch {
    return null // حافظه پر یا دسترسی مسدود — بی‌صدا
  }
}

export function clearDraft(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* بی‌صدا */
  }
}

/**
 * بازیابی یک‌باره پیش‌نویس هنگام mount فرم.
 * کامپوننت‌های فرم فقط سمت کلاینت رندر می‌شوند (پوسته پس از احراز هویت) — بدون ریسک ناهم‌خوانی SSR.
 */
export function useDraftRestore<T extends object>(
  viewKey: string,
  companyId: string | null | undefined,
  defaults: T,
): { initial: T; savedAt: number | null } {
  const [state] = useState(() => {
    const draft = readDraft<T>(draftKey(viewKey, companyId))
    if (!draft) return { initial: defaults, savedAt: null as number | null }
    const initial = { ...(defaults as Record<string, unknown>) }
    const dv = draft.values as Record<string, unknown>
    for (const k of Object.keys(defaults)) {
      if (k in dv && dv[k] !== undefined) initial[k] = dv[k]
    }
    return { initial: initial as T, savedAt: draft.savedAt }
  })
  return state
}

/**
 * ذخیره خودکار debounced — کامپوننت جدا تا با هر کلید، والد دوباره رندر نشود.
 * فقط وقتی فرم dirty است ذخیره می‌کند (مقدار اولیه پس از بازیابی بی‌دلیل بازنویسی نمی‌شود).
 * onSaved پس از هر ذخیره موفق صدا می‌شود (برای نشانگر «ذخیره‌شده در HH:MM»).
 */
export function DraftAutosave<T extends FieldValues>({
  control,
  storageKey,
  onSaved,
}: {
  control: Control<T>
  storageKey: string
  onSaved?: (at: number) => void
}): null {
  const values = useWatch({ control })
  const { isDirty } = useFormState({ control })
  // الگوی latest-ref: کال‌بک تازه بدون رندر اضافه در دسترس effect می‌ماند
  const onSavedRef = useRef(onSaved)
  useEffect(() => {
    onSavedRef.current = onSaved
  }, [onSaved])

  useEffect(() => {
    if (!isDirty) return
    const timer = setTimeout(() => {
      const at = writeDraft(storageKey, values as unknown as object)
      if (at !== null) onSavedRef.current?.(at)
    }, DRAFT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [values, isDirty, storageKey])

  return null
}
