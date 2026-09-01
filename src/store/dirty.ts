'use client'

/**
 * ردیابی فرم‌های کثیف + گارد بستن تب (P2.5-U10 — پیوند #۴/#۲۶ پژوهش ۰۲)
 *
 * الگوی VS Code: تب فرمِ با تغییرات ذخیره‌نشده نقطه کهربایی می‌گیرد؛ بستن آن
 * (× تب / کلیک‌وسط / Esc سراسری) از ConfirmDialog می‌گذرد — «دور انداختن تغییرات»
 * مخرب است و صریح اعلام می‌شود. مسیر بستن یک‌کانالی است: requestClose(id).
 *
 * فرم‌ها خودشان با useDirtyTracking ثبت می‌کنند (tabId + dirty + برچسب);
 * پس از ذخیره/انصراف، clearDirty صدا می‌شود (تب دیگر کثیف نیست).
 * نکته: پیش‌نویس خودکار (io.draft.v1) مستقل کار می‌کند — گارد فقط هشدار UX است.
 */

import { create } from 'zustand'
import { useWorkspace } from '@/store/workspace'

type DirtyState = {
  /** tabId → برچسب فرم کثیف (متن دیالوگ) */
  dirty: Record<string, string>
  /** تبِ در انتظار تأیید بستن (دیالوگ باز است) */
  pendingClose: string | null
  /** ثبت/رفع کثیفی فرم — توسط useDirtyTracking صدا می‌شود */
  setDirty: (tabId: string, label: string) => void
  clearDirty: (tabId: string) => void
  /** مسیر واحد بستن: کثیف → دیالوگ؛ تمیز → بستن فوری */
  requestClose: (tabId: string) => void
  /** تأیید دیالوگ — واقعاً ببند (و کثیفی را پاک کن) */
  confirmClose: () => void
  /** انصراف — برگشت به فرم */
  cancelClose: () => void
}

export const useDirty = create<DirtyState>((set, get) => ({
  dirty: {},
  pendingClose: null,

  setDirty: (tabId, label) => set((s) => (s.dirty[tabId] === label ? s : { dirty: { ...s.dirty, [tabId]: label } })),

  clearDirty: (tabId) => set((s) => {
    if (!(tabId in s.dirty) && s.pendingClose !== tabId) return s
    const next = { ...s.dirty }
    delete next[tabId]
    return { dirty: next, pendingClose: s.pendingClose === tabId ? null : s.pendingClose }
  }),

  requestClose: (tabId) => {
    const label = get().dirty[tabId]
    if (label) set({ pendingClose: tabId })
    else useWorkspace.getState().closeTab(tabId)
  },

  confirmClose: () => {
    const id = get().pendingClose
    if (!id) return
    set((s) => {
      const next = { ...s.dirty }
      delete next[id]
      return { dirty: next, pendingClose: null }
    })
    useWorkspace.getState().closeTab(id)
  },

  cancelClose: () => set({ pendingClose: null }),
}))
