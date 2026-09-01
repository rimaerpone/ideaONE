'use client'

/**
 * نوار تب کاری (P1.5-T2) — پوسته چندسندی به سبک Axelor/راهکاران.
 * قواعد: کلیک = فعال‌سازی · دکمه × یا کلیک‌وسط = بستن · سرریز = اسکرول افقی.
 * RTL: چیدمان از راست شروع می‌شود (dir=rtl پوسته)؛ فقط کلاس‌های منطقی (CH-24).
 */

import { useMemo, useRef } from 'react'
import { X } from 'lucide-react'
import { useWorkspace, type WorkspaceTab } from '@/store/workspace'
import { useDirty } from '@/store/dirty'
import { useApp } from '@/store/app'
import { IconFor } from '@/components/shell/sidebar'
import { cn } from '@/lib/utils'

/** P2.5-U10 (#24) — رنگ آیکون تب از ماژول مالک نما — اسکن سریع ۸ تب باز.
 *  پالت ثابت سمت کلاینت (رنگ در DB نیست — افزودن فیلد شِما نمی‌ارزد) */
const MODULE_ICON_COLORS: Record<string, string> = {
  'office-automation': 'text-sky-600',
  warehouse: 'text-amber-600',
  products: 'text-emerald-600',
  partners: 'text-violet-600',
  dashboard: 'text-rose-600',
  platform: 'text-slate-500',
}

export function WorkspaceTabs() {
  const tabs = useWorkspace((s) => s.tabs)
  const activeTabId = useWorkspace((s) => s.activeTabId)
  const setActive = useWorkspace((s) => s.setActive)
  const requestClose = useDirty((s) => s.requestClose)
  const dirty = useDirty((s) => s.dirty)
  // viewKey → کد ماژول مالک (برای رنگ آیکون) — مشتق خالص از ماژول‌ها
  const modules = useApp((s) => s.modules)
  const ownerByView = useMemo(() => {
    const m = new Map<string, string>()
    for (const mod of modules) for (const mi of mod.menus) m.set(mi.viewKey, mod.code)
    return m
  }, [modules])
  const stripRef = useRef<HTMLDivElement>(null)

  // اسکرول نرم هنگام باز شدن تب جدید در انتهای نوار
  const onWheel = (e: React.WheelEvent) => {
    const el = stripRef.current
    if (!el) return
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      // اسکرول عمودی ماوس → اسکرول افقی نوار تب (عادت کروم)
      el.scrollLeft += e.deltaY
    }
  }

  if (tabs.length === 0) return null

  return (
    <div
      ref={stripRef}
      onWheel={onWheel}
      role="tablist"
      aria-label="تب‌های کاری"
      className="thin-scrollbar sticky top-16 z-20 flex h-11 items-end gap-0.5 overflow-x-auto border-b bg-muted/60 px-1.5 pt-1.5 backdrop-blur"
    >
      {tabs.map((tab) => (
        <TabChip
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          isDirty={!!dirty[tab.id]}
          iconColor={MODULE_ICON_COLORS[ownerByView.get(tab.viewKey) ?? ''] ?? 'text-muted-foreground'}
          onSelect={() => setActive(tab.id)}
          onClose={() => requestClose(tab.id)}
        />
      ))}
    </div>
  )
}

function TabChip({ tab, active, isDirty, iconColor, onSelect, onClose }: {
  tab: WorkspaceTab
  active: boolean
  /** P2.5-U10 (#۴) — فرم با تغییرات ذخیره‌نشده (نقطه کهربایی مثل VS Code) */
  isDirty: boolean
  /** P2.5-U10 (#24) — رنگ آیکون از ماژول مالک */
  iconColor: string
  onSelect: () => void
  onClose: () => void
}) {
  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={0}
      title={tab.title}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      // کلیک‌وسط ماوس = بستن تب (عادت مرورگر)
      onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose() } }}
      className={cn(
        'group relative mb-[-1px] flex h-9 w-36 min-w-24 max-w-56 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-t-md border-x border-t px-2.5 text-xs transition-colors sm:w-44',
        active
          ? 'z-10 border-border bg-background font-medium text-foreground'
          : 'border-transparent text-muted-foreground hover:bg-muted/80',
      )}
    >
      <IconFor name={tab.icon} className={cn('h-3.5 w-3.5 shrink-0', active ? iconColor : 'text-muted-foreground')} />
      <span className="min-w-0 flex-1 truncate text-start">{tab.title}</span>
      {/* نقطه کثیفی (U10 #۴) — فرم تغییرات ذخیره‌نشده دارد */}
      {isDirty ? (
        <span
          data-dirty-dot
          title="تغییرات ذخیره‌نشده"
          aria-label="تب با تغییرات ذخیره‌نشده"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
          aria-hidden
        />
      ) : null}
      {/* نشانگر تب رکورد — تمایز بصری با تب لیست */}
      {tab.kind === 'record' && tab.recordId !== 'new' && !isDirty ? (
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', active ? 'bg-primary' : 'bg-primary/40')} aria-hidden />
      ) : null}
      <button
        type="button"
        aria-label={`بستن ${tab.title}`}
        title="بستن تب"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className={cn(
          'shrink-0 rounded p-0.5 transition-opacity hover:bg-foreground/10',
          active ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60',
        )}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
