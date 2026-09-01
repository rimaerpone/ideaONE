'use client'

/**
 * هوک ثبت کثیفی فرم در store گارد (P2.5-U10) — مصرف: فرم‌های ثبت/ویرایش.
 * tabId تب پوسته است (prop tab.id یا tabId فرم «جدید»); label در متن دیالوگ می‌آید.
 * اثر فقط UX است (نقطه تب + دیالوگ پیش از بستن) — پیش‌نویس خودکار مستقل است.
 */

import { useEffect } from 'react'
import { useDirty } from '@/store/dirty'

export function useDirtyTracking(tabId: string | null | undefined, isDirty: boolean, label: string): void {
  const setDirty = useDirty((s) => s.setDirty)
  const clearDirty = useDirty((s) => s.clearDirty)
  useEffect(() => {
    if (!tabId) return
    if (isDirty) setDirty(tabId, label)
    else clearDirty(tabId)
    return () => { clearDirty(tabId) }
  }, [tabId, isDirty, label, setDirty, clearDirty])
}
