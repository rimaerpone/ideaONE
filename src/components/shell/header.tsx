'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/store/app'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bell, Building2, Check, ChevronDown, LogOut, Menu, PanelRightClose, PanelRightOpen, Search, UserRound } from 'lucide-react'
import { useWorkspace } from '@/store/workspace'
import { useOverlays } from '@/store/overlays'
import { apiGet, apiPost } from '@/core/shared/api-client'
import type { NotificationItem } from '@/types/platform'
import { relativeFa, faDigits } from '@/core/shared/jalali'
import { cn } from '@/lib/utils'
import { ROLE_LABELS } from '@/components/common/ui-bits'
import { useToast, toastInfo } from '@/hooks/use-toast'

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('')
}

export function Header() {
  const { me, switchCompany, logout, toggleSidebar, toggleSidebarCollapsed, sidebarCollapsed, refreshModules, modules } = useApp()
  const openView = useWorkspace((s) => s.openView)
  const setPalette = useOverlays((s) => s.setPalette)
  const rtVersion = useApp((s) => s.rtVersion)
  const rtConnected = useApp((s) => s.rtConnected)
  useToast()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  // شمار نخوانده از سرور (شمار دقیق DB) — نه محاسبه از فهرست ۳۰تایی (باگ G5)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)

  const fetchNotifs = () =>
    apiGet<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications')
      .then((d) => { setNotifications(d.notifications); setUnreadCount(d.unreadCount ?? d.notifications.filter((n) => !n.isRead).length) })
      .catch(() => { /* بی‌صدا */ })

  useEffect(() => {
    if (!me) return
    let alive = true
    const run = () => {
      apiGet<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications')
        .then((d) => {
          if (!alive) return
          setNotifications(d.notifications)
          setUnreadCount(d.unreadCount ?? d.notifications.filter((n) => !n.isRead).length)
        })
        .catch(() => {})
    }
    run()
    // polling به‌عنوان پوشش قطعی سوکت بلادرنگ (تحویل at-least-once)
    const t = setInterval(run, 30000)
    return () => { alive = false; clearInterval(t) }
    // rtVersion: هر رویداد بلادرنگ فوراً بازخوانی می‌کند
  }, [me?.activeCompanyId, rtVersion])

  if (!me) return null
  const activeCompany = me.companies.find((c) => c.id === me.activeCompanyId)
  const unread = unreadCount

  const markAll = async () => {
    await apiPost('/api/notifications', { all: true })
    fetchNotifs()
  }

  const markOne = async (id: string) => {
    await apiPost('/api/notifications', { id })
    fetchNotifs()
  }

  // P1-T17 — نگاشت امن targetView: کلیک اعلان به نمای مقصد می‌رود، مگر آنکه
  // پلاگین مالک نما خاموش باشد (سراسری/شرکتی) → داشبورد + toast راهنما (SC-008)
  // نماهای شخصی (حساب من) مالک پلاگینی ندارند و همیشه قابل ناوبری‌اند (P1-T8)
  const PERSONAL_VIEWS = ['dashboard', 'my-account']
  const openNotification = async (n: NotificationItem) => {
    await markOne(n.id)
    setNotifOpen(false)
    if (!n.targetView) return
    // ناوبری از طریق پوسته چندسندی — تب لیست نما فعال/ساخته می‌شود (P1.5-T3)
    if (PERSONAL_VIEWS.includes(n.targetView)) {
      openView(n.targetView)
      return
    }
    const owner = modules.find((m) => m.menus.some((mi) => mi.viewKey === n.targetView))
    const off = !owner || owner.status !== 'ACTIVE' || owner.companyEnabled === false
    if (!off) {
      openView(n.targetView)
      return
    }
    openView('dashboard')
    toastInfo({
      title: 'ماژول مقصد اعلان فعال نیست',
      description: 'ماژول مربوط به این اعلان برای شرکت فعال شما غیرفعال شده است؛ برای فعال‌سازی با مدیر سامانه تماس بگیرید.',
    })
  }

  const switchTo = async (companyId: string) => {
    if (companyId === me.activeCompanyId) return
    await switchCompany(companyId)
    refreshModules()
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:gap-3 sm:px-5">
      {/* دکمه منو: موبایل = کشوی سایدبار، دسکتاپ = ریل جمع/باز (P1.5-T4) */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => { if (window.innerWidth >= 1024) { toggleSidebarCollapsed() } else { toggleSidebar() } }}
        aria-label={sidebarCollapsed ? 'باز کردن منو' : 'جمع کردن منو'}
        title={sidebarCollapsed ? 'باز کردن منو' : 'جمع کردن منو'}
      >
        <span className="lg:hidden"><Menu className="h-5 w-5" /></span>
        <span className="hidden lg:inline-flex">
          {sidebarCollapsed ? <PanelRightOpen className="h-5 w-5" /> : <PanelRightClose className="h-5 w-5" />}
        </span>
      </Button>

      {/* سوییچر شرکت — کوئری‌های نشست با تغییر شرکت بازتنظیم می‌شوند */}
      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2 px-3">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="hidden max-w-40 truncate sm:inline">{activeCompany?.name ?? 'انتخاب شرکت'}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>شرکت فعال</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {me.companies.map((c) => (
            <DropdownMenuItem key={c.id} onClick={() => switchTo(c.id)} className="gap-2">
              <span className="flex-1 truncate">{c.name}</span>
              {c.id === me.activeCompanyId ? <Check className="h-4 w-4 text-primary" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
        {/* P1-T25 — ورودی قابل مشاهده پالت فرمان (Ctrl+K) */}
        <button
          type="button"
          onClick={() => setPalette(true)}
          className="hidden h-9 items-center gap-2 rounded-lg border bg-muted/40 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted md:flex"
          aria-label="جستجوی فرمان (Ctrl+K)"
        >
          <Search className="h-3.5 w-3.5" />
          <span>جستجو…</span>
          <kbd className="rounded border bg-background px-1.5 py-0.5 font-sans text-[10px] leading-4">Ctrl K</kbd>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setPalette(true)}
          aria-label="جستجوی فرمان"
        >
          <Search className="h-5 w-5" />
        </Button>

        {/* اعلان‌ها */}
        <Popover open={notifOpen} onOpenChange={(o) => { setNotifOpen(o); if (o) fetchNotifs() }}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="اعلان‌ها">
              <Bell className="h-5 w-5" />
              {rtConnected ? (
                <span
                  className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-emerald-500"
                  title="اعلان‌های بلادرنگ فعال است"
                  aria-label="اعلان‌های بلادرنگ فعال است"
                />
              ) : null}
              {unread > 0 ? (
                <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {faDigits(unread)}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0" dir="rtl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">اعلان‌ها</p>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] leading-4',
                    rtConnected
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-muted bg-muted/60 text-muted-foreground',
                  )}
                  title={rtConnected ? 'اتصال بلادرنگ برقرار است' : 'حالت polling هر ۳۰ ثانیه'}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', rtConnected ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/50')} />
                  {rtConnected ? 'بلادرنگ' : 'آفلاین'}
                </span>
              </div>
              {unread > 0 ? (
                <button type="button" onClick={markAll} className="text-xs text-primary hover:underline">
                  علامت‌گذاری همه به‌عنوان خوانده‌شده
                </button>
              ) : null}
            </div>
            <div className="thin-scrollbar max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">اعلانی ندارید</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openNotification(n)}
                    className={cn(
                      'flex w-full flex-col items-start gap-1 border-b px-4 py-3 text-start transition-colors last:border-b-0 hover:bg-muted/60',
                      !n.isRead && 'bg-primary/5',
                    )}
                  >
                    <span className="text-sm font-medium leading-5">{n.title}</span>
                    {n.body ? <span className="text-xs leading-5 text-muted-foreground">{n.body}</span> : null}
                    <span className="text-[10px] text-muted-foreground">{relativeFa(n.createdAt)}</span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* پروفایل کاربر */}
        <DropdownMenu dir="rtl">
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-2 rounded-lg p-1 hover:bg-muted/60" aria-label="حساب کاربری">
              <Avatar className="h-9 w-9 border">
                <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
                  {initials(me.user.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-start leading-tight md:block">
                <p className="text-sm font-medium">{me.user.fullName}</p>
                <p className="text-[11px] text-muted-foreground">{me.user.jobTitle}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <p>{me.user.fullName}</p>
              <p className="text-xs font-normal text-muted-foreground">{activeCompany ? `${activeCompany.name} — ${ROLE_LABELS[activeCompany.role] ?? activeCompany.role}` : ''}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {me.companies.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => switchTo(c.id)} className="gap-2">
                <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 truncate text-xs">{c.name}</span>
                {c.id === me.activeCompanyId ? <Check className="h-4 w-4 text-primary" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="gap-2 text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" />
              خروج از حساب
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
