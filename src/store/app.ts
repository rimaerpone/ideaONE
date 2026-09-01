'use client'

import { create } from 'zustand'
import { apiGet, apiPost, saveSessionToken } from '@/core/shared/api-client'
import { useWorkspace } from '@/store/workspace'
import type { MeResponse, ModuleInfo } from '@/types/platform'

// ترجیح جمع‌بودن سایدبار دسکتاپ (P1.5-T4) — localStorage نه sessionStorage چون ترجیح پایدار کاربر است
const SIDEBAR_KEY = 'io.sidebar.collapsed'
function loadSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

type AppState = {
  booted: boolean
  me: MeResponse | null
  modules: ModuleInfo[]
  /** کشوی سایدبار در موبایل */
  sidebarOpen: boolean
  /** حالت ریل آیکونی در دسکتاپ (P1.5-T4) */
  sidebarCollapsed: boolean
  rtVersion: number      // شمارنده رویدادهای بلادرنگ — هر bump یعنی اعلان جدید
  rtLastView: string | null // آخرین نمای هدفِ رویداد بلادرنگ — برای ابطال هدفمند کوئری‌ها (P1-T2)
  rtConnected: boolean   // وضعیت اتصال سوکت بلادرنگ
  boot: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  switchCompany: (companyId: string) => Promise<void>
  refreshModules: () => Promise<void>
  refreshUnread: () => Promise<void>
  refreshMe: () => Promise<void>
  toggleSidebar: () => void
  closeSidebar: () => void
  toggleSidebarCollapsed: () => void
  bumpRt: (targetView?: string | null) => void
  setRtConnected: (v: boolean) => void
}

export const useApp = create<AppState>((set, get) => ({
  booted: false,
  me: null,
  modules: [],
  sidebarOpen: false,
  sidebarCollapsed: loadSidebarCollapsed(),
  rtVersion: 0,
  rtLastView: null,
  rtConnected: false,

  boot: async () => {
    try {
      const me = await apiGet<MeResponse>('/api/auth/me')
      const { modules } = await apiGet<{ modules: ModuleInfo[] }>('/api/modules')
      set({ me, modules, booted: true })
    } catch {
      set({ me: null, modules: [], booted: true })
    }
  },

  login: async (username, password) => {
    const res = await apiPost<{ ok: boolean; token?: string }>('/api/auth/login', { username, password })
    // پشتیبان کوکی در بافت تعبیه‌شده — توکن نشست برای درخواست‌های بعدی
    saveSessionToken(res?.token)
    await get().boot()
  },

  logout: async () => {
    saveSessionToken(null)
    // تب‌های کاری شرکت/کاربر قبلی نباید برای نشست بعدی بمانند (P1.5-T1)
    useWorkspace.getState().resetWorkspace()
    try {
      await apiPost('/api/auth/logout')
    } finally {
      set({ me: null, modules: [] })
    }
  },

  switchCompany: async (companyId) => {
    await apiPost('/api/auth/switch-company', { companyId })
    // داده تب‌های باز شرکت‌محور است — پوسته به داشبورد برمی‌گردد (P1.5-T1)
    useWorkspace.getState().resetWorkspace()
    await get().boot()
  },

  refreshModules: async () => {
    if (!get().me) return
    try {
      const { modules } = await apiGet<{ modules: ModuleInfo[] }>('/api/modules')
      set({ modules })
    } catch {
      /* نادیده گرفتن خطا در بازخوانی */
    }
  },

  refreshUnread: async () => {
    if (!get().me) return
    try {
      const { unreadCount } = await apiGet<{ unreadCount: number }>('/api/notifications')
      const me = get().me
      if (me) set({ me: { ...me, unreadCount } })
    } catch {
      /* نادیده گرفتن */
    }
  },

  refreshMe: async () => {
    if (!get().me) return
    try {
      const me = await apiGet<MeResponse>('/api/auth/me')
      set({ me })
    } catch {
      /* نادیده گرفتن خطا در بازخوانی */
    }
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
  toggleSidebarCollapsed: () => {
    const next = !get().sidebarCollapsed
    set({ sidebarCollapsed: next })
    try {
      window.localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
    } catch {
      /* حافظه مسدود — ترجیح فقط در این نشست می‌ماند */
    }
  },

  // ---------- بلادرنگ ----------
  bumpRt: (targetView) => set((s) => ({ rtVersion: s.rtVersion + 1, rtLastView: targetView ?? null })),
  setRtConnected: (v: boolean) => set({ rtConnected: v }),
}))
