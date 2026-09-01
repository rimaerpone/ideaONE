'use client'

import {
  LayoutDashboard, Inbox, Mail, Package, Users, Boxes, ClipboardList, ClipboardCheck,
  Puzzle, Settings, Factory, Landmark, HeartHandshake, UserRound, Sparkles, Image,
  X, Building2, Archive, MessageSquare, Briefcase, Wallet, Receipt, Banknote,
  CalendarCheck, Network, FlaskConical, BadgeCheck, Wrench, Calculator, Bot,
  BarChart3, Workflow, BookOpen, Pin, Cable, Cog, Weight, ShoppingCart, Truck,
  LifeBuoy, Globe, Scale, Gauge,
} from 'lucide-react'
import { useState } from 'react'
import { useApp } from '@/store/app'
import { useWorkspace, useActiveTab } from '@/store/workspace'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DOMAIN_LABELS, type ModuleInfo } from '@/types/platform'
import { viewLabel, viewIcon } from '@/core/shared/view-meta'
import { readUiPref, writeUiPref } from '@/core/shared/ui-prefs'
import { faDigits } from '@/core/shared/jalali'

// آیکون‌های مجاز رجیستری — CH-19 دروازه کیفیت پوشش این فهرست را از seed راستی‌آزمایی می‌کند
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Inbox, Mail, Package, Users, Boxes, ClipboardList, ClipboardCheck,
  Puzzle, Settings, Factory, Landmark, HeartHandshake, UserRound, Sparkles, Image,
  Archive, MessageSquare, Briefcase, Wallet, Receipt, Banknote, CalendarCheck, Network,
  FlaskConical, BadgeCheck, Wrench, Calculator, Bot, BarChart3, Workflow, BookOpen,
  Cable, Cog, Weight, ShoppingCart, Truck, LifeBuoy, Globe, Scale, Gauge, Building2,
}

export function IconFor({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? LayoutDashboard
  return <Icon className={className} />
}

const LAYER_ORDER = ['FOUNDATION', 'OPERATIONS', 'INTELLIGENCE']

/**
 * N2 (P2.5-U3) — دکمه پین/برداشتن پین کنار آیتم منو؛ hover ظاهر می‌شود،
 * وقتی پین است همیشه پیدا است. روی موبایل (کشو) و ریل مخفی — شخصی‌سازی دسکتاپی است،
 * لیست پین‌شده خودش در همه حالت‌ها دیده می‌شود.
 */
function PinToggle({ viewKey, label, pinned, onToggle, className }: {
  viewKey: string
  label: string
  pinned: boolean
  onToggle: (viewKey: string) => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(viewKey) }}
      aria-pressed={pinned}
      aria-label={pinned ? `برداشتن پین ${label}` : `پین کردن ${label}`}
      title={pinned ? 'برداشتن از دسترسی سریع' : 'افزودن به دسترسی سریع'}
      className={cn(
        'shrink-0 rounded-md p-1 text-sidebar-foreground/60 transition-opacity hover:text-sidebar-foreground focus-visible:opacity-100',
        pinned ? 'opacity-100' : 'opacity-0 group-hover/menu-item:opacity-100 focus-visible:opacity-100',
        className,
      )}
    >
      <Pin className={cn('h-3.5 w-3.5', pinned && 'fill-primary text-primary')} aria-hidden />
    </button>
  )
}

export function Sidebar() {
  const { modules, me, sidebarOpen, closeSidebar, sidebarCollapsed } = useApp()
  const activeTab = useActiveTab()
  const openView = useWorkspace((s) => s.openView)
  // هایلایت منوی مالکِ تب فعال — تب رکورد «نامه ۱۲۳»، منوی «نامه‌ها» را روشن نگه می‌دارد
  const activeViewKey = activeTab?.viewKey ?? 'dashboard'

  const activeCompany = me?.companies.find((c) => c.id === me.activeCompanyId)
  // P1-T14 — «تنظیمات» و «کاربران» فقط برای مدیران (isAdmin یا ADMIN شرکت فعال)؛ گارد API هم در سرور است
  const canSettings = !!me?.user.isAdmin || activeCompany?.role === 'ADMIN'
  // منو از رجیستری پلاگین‌ها ساخته می‌شود (ADR-008): پلاگین → دامنه → لایه → منوها
  const activeModules = modules
    .filter((m) => m.status === 'ACTIVE' && m.companyEnabled !== false && m.menus.length > 0)
    .map((m) => ({ ...m, menus: m.menus.filter((mi) => !['settings', 'users'].includes(mi.viewKey) || canSettings) }))
    .filter((m) => m.menus.length > 0)

  // N2 — نماهای پین‌شده (دسترسی سریع): per کاربر در localStorage؛ فقط viewKey ذخیره
  // می‌شود تا برچسب/آیکون همیشه از رجیستری زنده بخواند و پینِ نمای خارج از دسترس رندر نشود.
  // خواندن در lazy initializer (الگوی use-draft) — سایدبار فقط پس از احراز هویت mount می‌شود
  const userId = me?.user.id ?? null
  const [pins, setPins] = useState<string[]>(() => {
    if (!userId) return []
    const stored = readUiPref<string[]>(userId, 'pins')
    return Array.isArray(stored) ? stored.filter((k) => typeof k === 'string').slice(0, 8) : []
  })
  const togglePin = (viewKey: string) => {
    if (!userId) return
    setPins((prev) => {
      const next = prev.includes(viewKey) ? prev.filter((k) => k !== viewKey) : [...prev.slice(-7), viewKey]
      writeUiPref(userId, 'pins', next)
      return next
    })
  }
  const availableKeys = new Set<string>()
  for (const m of activeModules) for (const mi of m.menus) availableKeys.add(mi.viewKey)
  availableKeys.add('my-account')
  const visiblePins = pins.filter((k) => availableKeys.has(k))

  const sections: { domain: string; modules: ModuleInfo[] }[] = []
  for (const layer of LAYER_ORDER) {
    for (const m of activeModules.filter((x) => x.layer === layer)) {
      let sec = sections.find((s) => s.domain === m.domain)
      if (!sec) { sec = { domain: m.domain, modules: [] }; sections.push(sec) }
      sec.modules.push(m)
    }
  }

  // حالت ریل دسکتاپ (P1.5-T4): فقط آیکون‌ها + tooltip بومی
  const rail = sidebarCollapsed

  return (
    <>
      {/* پوشش موبایل */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={closeSidebar} aria-hidden />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-72 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:transition-[width]',
          rail ? 'lg:w-[60px]' : 'lg:w-72',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className={cn('flex items-center justify-between border-b border-sidebar-border px-4 py-4', rail && 'lg:justify-center lg:px-2')}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary">
              <Building2 className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <div className={cn('min-w-0', rail && 'lg:hidden')}>
              <p className="truncate text-sm font-bold">پلتفرم عملیاتی سازمانی</p>
              <p className="truncate text-[11px] text-sidebar-foreground/60">هلدینگ کاشی و سرامیک</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="text-sidebar-foreground lg:hidden" onClick={closeSidebar} aria-label="بستن منو">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {activeCompany ? (
          <div className={cn('border-b border-sidebar-border px-4 py-3', rail && 'lg:px-2')}>
            {rail ? (
              <Badge
                variant="secondary"
                title={activeCompany.type === 'GROUP' ? 'نمای هلدینگ' : activeCompany.name}
                className="hidden w-full justify-center bg-sidebar-accent text-sidebar-accent-foreground lg:inline-flex"
              >
                {activeCompany.type === 'GROUP' ? 'هلدینگ' : activeCompany.name.slice(0, 3)}
              </Badge>
            ) : null}
            <Badge
              variant="secondary"
              className={cn('bg-sidebar-accent text-sidebar-accent-foreground', rail && 'lg:hidden')}
            >
              {activeCompany.type === 'GROUP' ? 'نمای هلدینگ' : activeCompany.name}
            </Badge>
          </div>
        ) : null}

        <nav className="thin-scrollbar flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="ناوبری اصلی">
          {/* N2 — دسترسی سریع: نماهای پین‌شده کاربر (بالای منو، پیش از دامنه‌ها) */}
          {visiblePins.length > 0 ? (
            <div>
              <p className={cn('mb-1.5 px-2 text-[10px] font-medium uppercase text-sidebar-foreground/50', rail && 'lg:hidden')}>
                دسترسی سریع
              </p>
              <ul className="space-y-0.5">
                {visiblePins.map((k) => {
                  const label = viewLabel(k)
                  const isActive = activeViewKey === k
                  return (
                    <li key={k} className="group/menu-item">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title={rail ? label : undefined}
                          onClick={() => { openView(k); closeSidebar() }}
                          className={cn(
                            'flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                            rail && 'lg:justify-center lg:px-0',
                            isActive
                              ? 'bg-sidebar-primary font-medium text-sidebar-primary-foreground'
                              : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                          )}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <IconFor name={viewIcon(k)} className="h-4 w-4 shrink-0" />
                          <span className={cn('truncate', rail && 'lg:hidden')}>{label}</span>
                        </button>
                        <PinToggle viewKey={k} label={label} pinned onToggle={togglePin} className={cn('max-lg:hidden', rail && 'lg:hidden')} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          {sections.map((sec) => (
            <div key={sec.domain}>
              <p className={cn('mb-1.5 px-2 text-[10px] font-medium uppercase text-sidebar-foreground/50', rail && 'lg:hidden')}>
                {DOMAIN_LABELS[sec.domain] ?? sec.domain}
              </p>
              {sec.modules.map((m) => (
                <div key={m.id} className="mb-1">
                  {/* N1 — سربرگ ماژول فقط وقتی نامش با برچسب دامنه فرق دارد (رفع «انبار و لجستیک» دوبار) */}
                  {m.menus.length > 1 && m.name !== (DOMAIN_LABELS[sec.domain] ?? sec.domain) ? (
                    <p className={cn('mb-0.5 px-2 pt-1 text-[11px] font-medium text-sidebar-foreground/60', rail && 'lg:hidden')}>{m.name}</p>
                  ) : null}
                  <ul className="space-y-0.5">
                    {m.menus.map((mi) => {
                      const isActive = activeViewKey === mi.viewKey
                      const pinned = pins.includes(mi.viewKey)
                      return (
                        <li key={mi.viewKey} className="group/menu-item">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              title={rail ? mi.label : undefined}
                              onClick={() => { openView(mi.viewKey, mi.label, mi.icon); closeSidebar() }}
                              className={cn(
                                'flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                                m.menus.length > 1 && 'ps-4',
                                rail && 'lg:justify-center lg:px-0 lg:ps-0',
                                isActive
                                  ? 'bg-sidebar-primary font-medium text-sidebar-primary-foreground'
                                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                              )}
                              aria-current={isActive ? 'page' : undefined}
                            >
                              <IconFor name={mi.icon} className="h-4 w-4 shrink-0" />
                              <span className={cn('truncate', rail && 'lg:hidden')}>{mi.label}</span>
                            </button>
                            <PinToggle
                              viewKey={mi.viewKey} label={mi.label} pinned={pinned} onToggle={togglePin}
                              className={cn('max-lg:hidden', rail && 'lg:hidden')}
                            />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ))}

          {/* حساب من — نمای شخصی امنیتی (P1-T6/T7/T8)؛ خارج از رجیستری پلاگین‌ها
              و همیشه قابل دسترس، حتی وقتی همه پلاگین‌ها خاموش باشند */}
          <div className="mt-2 border-t border-sidebar-border pt-3">
            <div className="group/menu-item">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title={rail ? 'حساب من' : undefined}
                  onClick={() => { openView('my-account'); closeSidebar() }}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    rail && 'lg:justify-center lg:px-0',
                    activeViewKey === 'my-account'
                      ? 'bg-sidebar-primary font-medium text-sidebar-primary-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  )}
                  aria-current={activeViewKey === 'my-account' ? 'page' : undefined}
                >
                  <UserRound className="h-4 w-4 shrink-0" />
                  <span className={cn('truncate', rail && 'lg:hidden')}>حساب من</span>
                </button>
                <PinToggle
                  viewKey="my-account" label="حساب من" pinned={pins.includes('my-account')} onToggle={togglePin}
                  className={cn('max-lg:hidden', rail && 'lg:hidden')}
                />
              </div>
            </div>
          </div>
        </nav>

        <div className={cn('border-t border-sidebar-border px-4 py-3', rail && 'lg:hidden')}>
          <p className="text-[10px] leading-4 text-sidebar-foreground/50">
            پایلوت فاز ۱ · نسخه ۱.۰.۰
            <br />
            {modules.length > 0
              ? `${faDigits(modules.length)} پلاگین در ۳ لایه — معماری مونولیت ماژولار`
              : 'معماری مونولیت ماژولار — رجیستری در حال بارگذاری…'}
          </p>
        </div>
      </aside>
    </>
  )
}
