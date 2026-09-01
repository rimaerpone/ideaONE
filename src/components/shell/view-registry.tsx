'use client'

/**
 * رجیستری نما (P1.5-T3) — نگاشت viewKey → کامپوننت لیست / صفحه رکورد.
 * AppShell دیگر switch ندارد؛ محتوای تب فعال از همین رجیستری رندر می‌شود.
 * گارد ماژول خاموش (SC-008) برای همه انواع تب (لیست/رکورد) اعمال می‌شود.
 */

import type { ComponentType } from 'react'
import { useApp } from '@/store/app'
import { useActiveTab, useWorkspace } from '@/store/workspace'
import { viewLabel, viewIcon } from '@/core/shared/view-meta'
import { IconFor } from '@/components/shell/sidebar'
import { DashboardView } from '@/modules/dashboard/components/dashboard-view'
import { CartableView } from '@/modules/office-automation/components/cartable-view'
import { LettersView } from '@/modules/office-automation/components/letters-view'
import { ProductsView } from '@/modules/products/components/products-view'
import { PartnersView } from '@/modules/partners/components/partners-view'
import { StockView } from '@/modules/warehouse/components/stock-view'
import { WhDocsView } from '@/modules/warehouse/components/whdocs-view'
import { RequestsView } from '@/modules/warehouse/components/requests-view'
import { ModulesView } from '@/modules/platform/components/modules-view'
import { SettingsView } from '@/modules/platform/components/settings-view'
import { UsersView } from '@/modules/platform/components/users-admin'
import { MyAccountView } from '@/modules/platform/components/my-account'
import { WarehousesView } from '@/modules/warehouse/components/warehouses-view'
import { UserRound } from 'lucide-react'
import { RECORD_VIEWS, type RecordPageProps } from '@/components/shell/record-views'

export type { RecordPageProps } from '@/components/shell/record-views'

/** نمای فهرست (تب لیست) */
const LIST_VIEWS: Record<string, ComponentType> = {
  dashboard: DashboardView,
  cartable: CartableView,
  letters: LettersView,
  products: ProductsView,
  partners: PartnersView,
  stock: StockView,
  whdocs: WhDocsView,
  requests: RequestsView,
  warehouses: WarehousesView,
  modules: ModulesView,
  settings: SettingsView,
  users: UsersView,
  'my-account': MyAccountView,
}

/** صفحه رکورد/فرم (تب رکورد — recordId یا 'new') — رجیستری مشترک با FCL (U9) */
// RECORD_VIEWS از record-views.tsx وارد شد (یک منبع — یک کد، دو قاب)

export function WorkspaceContent() {
  const modules = useApp((s) => s.modules)
  const tab = useActiveTab()

  if (!tab) return <WorkspaceLauncher />

  // گارد ماژول مالک نما — برای تب لیست و تب رکورد یکسان (ADR-008)
  const owner = modules.find((m) => m.menus.some((mi) => mi.viewKey === tab.viewKey))
  const isOff = !!owner && (owner.status !== 'ACTIVE' || owner.companyEnabled === false)
  if (isOff) return <DisabledModule moduleName={owner.name} />

  if (tab.kind === 'list') {
    const View = LIST_VIEWS[tab.viewKey]
    return View ? <View /> : <UnknownView viewKey={tab.viewKey} />
  }

  const Page = RECORD_VIEWS[tab.viewKey]
  if (!Page) {
    const View = LIST_VIEWS[tab.viewKey]
    return View ? <View /> : <UnknownView viewKey={tab.viewKey} />
  }
  return <Page tab={tab} />
}

function UnknownView({ viewKey }: { viewKey: string }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <p className="font-medium">نمای «{viewLabel(viewKey)}» در دسترس نیست</p>
      <p className="mt-2 text-sm text-muted-foreground">این نما در رجیستری پوسته تعریف نشده است.</p>
    </div>
  )
}

function DisabledModule({ moduleName }: { moduleName: string }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <p className="font-medium">پلاگین «{moduleName}» برای شرکت فعال شما غیرفعال است</p>
      <p className="mt-2 text-sm text-muted-foreground">
        وضعیت پلاگین‌ها از «کاتالوگ پلاگین‌ها» و به تفکیک شرکت قابل مدیریت است.
      </p>
    </div>
  )
}

/** حالت خالی پوسته — همه تب‌ها بسته شده‌اند: صفحه راه‌انداز سریع (P1.5-T3) */
function WorkspaceLauncher() {
  const modules = useApp((s) => s.modules)
  const me = useApp((s) => s.me)
  const openView = useWorkspace((s) => s.openView)
  const activeCompany = me?.companies.find((c) => c.id === me.activeCompanyId)
  const canSettings = !!me?.user.isAdmin || activeCompany?.role === 'ADMIN'

  const activeModules = modules
    .filter((m) => m.status === 'ACTIVE' && m.companyEnabled !== false && m.menus.length > 0)
    // «تنظیمات» و «کاربران» فقط برای مدیران (isAdmin یا ADMIN شرکت فعال) — گارد API هم در سرور است
    .map((m) => ({ ...m, menus: m.menus.filter((mi) => !['settings', 'users'].includes(mi.viewKey) || canSettings) }))
    .filter((m) => m.menus.length > 0)

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-bold">یک نما برای شروع انتخاب کنید</h2>
        <p className="mt-1 text-sm text-muted-foreground">تب‌های کاری شما بسته شده‌اند — از اینجا مسیر جدیدی باز کنید.</p>
      </div>
      <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <button
          type="button"
          onClick={() => openView('dashboard')}
          className="flex items-center gap-3 rounded-xl border bg-card p-4 text-start transition-all hover:border-primary/40 hover:shadow-sm"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <IconFor name="LayoutDashboard" className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold">داشبورد</p>
            <p className="text-[11px] text-muted-foreground">نمای کلان و سنجه‌های گیت</p>
          </div>
        </button>
        {activeModules.flatMap((m) =>
          m.menus.map((mi) => (
            <button
              key={mi.viewKey}
              type="button"
              onClick={() => openView(mi.viewKey, mi.label, mi.icon)}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 text-start transition-all hover:border-primary/40 hover:shadow-sm"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <IconFor name={mi.icon} className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{mi.label}</p>
                <p className="truncate text-[11px] text-muted-foreground">{m.name}</p>
              </div>
            </button>
          )),
        )}
        <button
          type="button"
          onClick={() => openView('my-account')}
          className="flex items-center gap-3 rounded-xl border bg-card p-4 text-start transition-all hover:border-primary/40 hover:shadow-sm"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <UserRound className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold">حساب من</p>
            <p className="text-[11px] text-muted-foreground">امنیت، نشست‌ها و گذرواژه</p>
          </div>
        </button>
      </div>
    </div>
  )
}
