'use client'

/**
 * پوسته چندسندی (P1.5-T1) — مدیریت تب‌های کاری
 * الگوی مرجع: Axelor/راهکاران — هر نما یا رکورد = یک تب قابل بستن.
 * قواعد:
 *  - dedup: باز کردن همان نما/رکورد، تب موجود را فعال می‌کند (نه تب تکراری)
 *  - فرم «جدید»: تب new:<viewKey> — پس از ذخیره با جامه‌ویژه (materialize) به تب رکورد تبدیل می‌شود
 *  - فقط تب فعال mount است؛ داده در TanStack Query زنده می‌ماند
 *  - persist در sessionStorage: refresh وسط کار تب‌ها را برمی‌گرداند (هم‌راستا با P1-T24)
 *  - P2.5-U10 — آدرس‌پذیری: تب فعال در URL (?view= / ?rec=<view>:<id>&t=<تب داخلی>)؛
 *    لینک مستقیم به رکورد/تب داخلی در boot بازیابی می‌شود؛ Back = تب قبلی (popstate).
 *    openRecord/openNew = pushState (گام تاریخ جدید)؛ تغییر انتخاب/تب داخلی = replaceState.
 */

import { create } from 'zustand'
import { viewIcon, viewLabel } from '@/core/shared/view-meta'

export type WorkspaceTabKind = 'list' | 'record'

export type WorkspaceTab = {
  id: string
  kind: WorkspaceTabKind
  viewKey: string
  /** برای kind=record — شناسه رکورد یا 'new' برای فرم ثبت */
  recordId?: string
  title: string
  icon: string
}

const STORAGE_KEY = 'io.workspace.v1'

function dashboardTab(): WorkspaceTab {
  return { id: `list:dashboard`, kind: 'list', viewKey: 'dashboard', title: viewLabel('dashboard'), icon: viewIcon('dashboard') }
}

type Persisted = { tabs: WorkspaceTab[]; activeTabId: string | null }

// ─── P2.5-U10 — آدرس‌پذیری (?view / ?rec & ?t) ───

/** پارامتر ?t از URL در boot — مصرف یک‌باره توسط useRecordInnerTab */
let bootInnerTab: { viewKey: string; recordId: string; tab: string } | null = null

function parseRecParam(raw: string | null): { viewKey: string; recordId: string } | null {
  if (!raw) return null
  const i = raw.indexOf(':')
  if (i <= 0 || i >= raw.length - 1) return null
  return { viewKey: raw.slice(0, i), recordId: raw.slice(i + 1) }
}

/** خواندن URL هنگام بارگذاری ماژول — ?rec بر sessionStorage مقدم است (لینک مستقیم) */
function urlTabAtBoot(): WorkspaceTab | null {
  if (typeof window === 'undefined') return null
  try {
    const p = new URL(window.location.href).searchParams
    const rec = parseRecParam(p.get('rec'))
    if (rec) {
      if (p.get('t')) bootInnerTab = { viewKey: rec.viewKey, recordId: rec.recordId, tab: p.get('t') as string }
      return { id: `rec:${rec.viewKey}:${rec.recordId}`, kind: 'record', viewKey: rec.viewKey, recordId: rec.recordId, title: viewLabel(rec.viewKey), icon: viewIcon(rec.viewKey) }
    }
    const view = p.get('view')
    if (view) return { id: `list:${view}`, kind: 'list', viewKey: view, title: viewLabel(view), icon: viewIcon(view) }
    return null
  } catch {
    return null
  }
}

/** پارامتر ?t انتظارِ boot برای رکورد مشخص — خواندن غیرمخرب (StrictMode دو بار mount می‌کند؛
 *  پاک‌سازی پس از اولین mount با clearBootInnerTab از effect انجام می‌شود) */
export function takeBootInnerTab(viewKey: string, recordId: string): string | null {
  if (bootInnerTab && bootInnerTab.viewKey === viewKey && bootInnerTab.recordId === recordId) {
    return bootInnerTab.tab
  }
  return null
}

/** پاک‌سازی ?t پس از mount (effect — بعد از هر دو رندر StrictMode اجرا می‌شود) */
export function clearBootInnerTab(viewKey: string, recordId: string): void {
  if (bootInnerTab && bootInnerTab.viewKey === viewKey && bootInnerTab.recordId === recordId) {
    bootInnerTab = null
  }
}

/** نگاشت تب فعال به URL — همیشه replaceState (push فقط در openRecord/openNew) */
function syncUrl(tabs: WorkspaceTab[], activeTabId: string | null) {
  if (typeof window === 'undefined' || typeof history === 'undefined') return
  try {
    const t = tabs.find((x) => x.id === activeTabId)
    const url = new URL(window.location.href)
    if (!t) {
      url.searchParams.delete('rec'); url.searchParams.delete('view'); url.searchParams.delete('t')
    } else if (t.kind === 'record' && t.recordId && t.recordId !== 'new') {
      url.searchParams.set('rec', `${t.viewKey}:${t.recordId}`)
      url.searchParams.delete('view')
      // ?t را فقط خود رکورد مدیریت می‌کند (useRecordInnerTab) — اینجا دست نمی‌زنیم
    } else {
      url.searchParams.set('view', t.viewKey)
      url.searchParams.delete('rec'); url.searchParams.delete('t')
    }
    history.replaceState({ ioTabs: tabs.map((x) => x.id), ioActive: activeTabId }, '', url)
  } catch {
    /* بی‌صدا — URL اختیاری است */
  }
}

function loadPersisted(): Persisted | null {
  if (typeof window === 'undefined') return null
  // لینک مستقیم (?rec/?view) بر sessionStorage مقدم است — تبش ساخته/فعال می‌شود
  const urlTab = urlTabAtBoot()
  if (urlTab) {
    let tabs: WorkspaceTab[] = []
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Persisted
        if (Array.isArray(parsed.tabs)) tabs = parsed.tabs.filter((t) => t && typeof t.id === 'string' && typeof t.viewKey === 'string' && typeof t.title === 'string')
      }
    } catch { /* بی‌صدا */ }
    if (!tabs.some((t) => t.id === urlTab.id)) tabs = [...tabs, urlTab]
    // ثبت وضعیت بازیابی‌شده — رفرشِ همان لینک هم باید رکورد را نگه دارد (U10)
    persist(tabs, urlTab.id)
    return { tabs, activeTabId: urlTab.id }
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Persisted
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return null
    // پاکسازی تب‌های ناقص/نامعتبر (مثلاً از نسخه قدیمی)
    const tabs = parsed.tabs.filter((t) => t && typeof t.id === 'string' && typeof t.viewKey === 'string' && typeof t.title === 'string')
    if (tabs.length === 0) return null
    const activeTabId = tabs.some((t) => t.id === parsed.activeTabId) ? parsed.activeTabId : tabs[0].id
    return { tabs, activeTabId }
  } catch {
    return null
  }
}

function persist(tabs: WorkspaceTab[], activeTabId: string | null) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId }))
  } catch {
    /* حافظه پر یا دسترسی مسدود — بی‌صدا */
  }
}

type WorkspaceState = {
  tabs: WorkspaceTab[]
  activeTabId: string | null
  /** باز کردن/فعال کردن تب لیست یک نما (از سایدبار، اعلان، داشبورد) */
  openView: (viewKey: string, title?: string, icon?: string) => void
  /** باز کردن تب رکورد (از فهرست‌ها) — dedup با همان رکورد */
  openRecord: (viewKey: string, recordId: string, title?: string) => void
  /** تب فرم ثبت جدید — فقط یکی در آن واحد برای هر نما */
  openNew: (viewKey: string, title?: string) => void
  closeTab: (id: string) => void
  closeOthers: (id: string) => void
  setActive: (id: string) => void
  /** به‌روزرسانی عنوان تب پس از بارگذاری داده (مثلاً موضوع نامه) */
  setTabTitle: (id: string, title: string) => void
  /** جامه‌ویژه: تب «جدید» پس از ذخیره به تب رکوردِ ذخیره‌شده تبدیل می‌شود */
  materializeTab: (id: string, recordId: string, title: string) => void
  /** پاکسازی در سوییچ شرکت/خروج — داده تب‌ها شرکت‌محورند */
  resetWorkspace: () => void
}

const initial = loadPersisted() ?? { tabs: [dashboardTab()], activeTabId: dashboardTab().id }

export const useWorkspace = create<WorkspaceState>((set, get) => {
  const commit = (tabs: WorkspaceTab[], activeTabId: string | null, opts?: { skipUrl?: boolean }) => {
    persist(tabs, activeTabId)
    if (!opts?.skipUrl) syncUrl(tabs, activeTabId)
    set({ tabs, activeTabId })
  }

  // P2.5-U10 — دکمه Back/Forward مرورگر = جابه‌جایی تبِ همان گام تاریخ
  // (فقط در کلاینت؛ boot یک‌باره — popstate با state معتبر = setActive بدون push)
  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', (e) => {
      const st = e.state as { ioActive?: string | null } | null
      const id = st?.ioActive ?? null
      const state = useWorkspace.getState()
      if (id && state.tabs.some((t) => t.id === id) && id !== state.activeTabId) {
        state.setActive(id)
      }
    })
  }

  return {
    tabs: initial.tabs,
    activeTabId: initial.activeTabId,

    openView: (viewKey, title, icon) => {
      const id = `list:${viewKey}`
      const t = get().tabs.find((x) => x.id === id)
      if (t) {
        // عنوان/آیکون جدید از منو به‌روزرسانی می‌شود (مثلاً بعد از تغییر نام پلاگین)
        commit(get().tabs.map((x) => (x.id === id ? { ...x, title: title ?? x.title, icon: icon ?? x.icon } : x)), id)
        return
      }
      commit([...get().tabs, { id, kind: 'list', viewKey, title: title ?? viewLabel(viewKey), icon: icon ?? viewIcon(viewKey) }], id)
    },

    openRecord: (viewKey, recordId, title) => {
      const id = `rec:${viewKey}:${recordId}`
      const tabs = get().tabs
      const t = tabs.find((x) => x.id === id)
      if (t) {
        commit(tabs.map((x) => (x.id === id && title ? { ...x, title } : x)), id)
        return
      }
      commit([...tabs, { id, kind: 'record', viewKey, recordId, title: title ?? viewLabel(viewKey), icon: viewIcon(viewKey) }], id)
      // U10 — گام تاریخ جدید (Back = برگشت به تب قبلی)؛ commit خودش replaceState کرد
      try { history.pushState({ ioTabs: get().tabs.map((x) => x.id), ioActive: id }, '', window.location.href) } catch { /* بی‌صدا */ }
    },

    openNew: (viewKey, title) => {
      const id = `new:${viewKey}`
      const tabs = get().tabs
      if (tabs.some((x) => x.id === id)) {
        commit(tabs, id)
        return
      }
      commit([...tabs, { id, kind: 'record', viewKey, recordId: 'new', title: title ?? `${viewLabel(viewKey)} — جدید`, icon: viewIcon(viewKey) }], id)
      try { history.pushState({ ioTabs: get().tabs.map((x) => x.id), ioActive: id }, '', window.location.href) } catch { /* بی‌صدا */ }
    },

    closeTab: (id) => {
      const tabs = get().tabs
      const idx = tabs.findIndex((x) => x.id === id)
      if (idx === -1) return
      const next = tabs.filter((x) => x.id !== id)
      const activeTabId = get().activeTabId === id
        ? (next[Math.min(idx, next.length - 1)]?.id ?? null)
        : get().activeTabId
      commit(next, activeTabId)
    },

    closeOthers: (id) => {
      const t = get().tabs.find((x) => x.id === id)
      if (!t) return
      commit([t], id)
    },

    setActive: (id) => {
      if (get().tabs.some((x) => x.id === id)) commit(get().tabs, id)
    },

    setTabTitle: (id, title) => {
      const tabs = get().tabs
      if (!tabs.some((x) => x.id === id)) return
      commit(tabs.map((x) => (x.id === id ? { ...x, title } : x)), get().activeTabId)
    },

    materializeTab: (id, recordId, title) => {
      const tabs = get().tabs
      const idx = tabs.findIndex((x) => x.id === id)
      if (idx === -1) return
      const t = tabs[idx]
      const newId = `rec:${t.viewKey}:${recordId}`
      const next = [...tabs]
      // اگر تبِ همان رکورد از قبل وجود دارد (نادر): تب قدیمی حذف و این تب جایگزین می‌شود
      const dupIdx = next.findIndex((x) => x.id === newId)
      const insertIdx = dupIdx !== -1 && dupIdx < idx ? idx - 1 : idx
      if (dupIdx !== -1) next.splice(dupIdx, 1)
      next.splice(insertIdx, 1, { id: newId, kind: 'record', viewKey: t.viewKey, recordId, title, icon: t.icon })
      commit(next, newId)
    },

    resetWorkspace: () => {
      const home = dashboardTab()
      commit([home], home.id)
    },
  }
})

/** تب فعال (برای نماها/سایدبار — هایلایت منوی مالک تب فعال) */
export function useActiveTab(): WorkspaceTab | null {
  return useWorkspace((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null)
}
