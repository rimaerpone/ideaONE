'use client'

import { useState } from 'react'
import { useApp } from '@/store/app'
import { apiPost } from '@/core/shared/api-client'
import { PageHeader } from '@/components/common/ui-bits'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { AlertCircle, Building2, Globe, Puzzle, Layers } from 'lucide-react'
import { toastOk, toastErr } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { LAYER_LABELS, DOMAIN_LABELS, type ModuleInfo } from '@/types/platform'
import { IconFor } from '@/components/shell/sidebar'

const LAYER_ORDER = ['FOUNDATION', 'OPERATIONS', 'INTELLIGENCE'] as const
const LAYER_DESC: Record<string, string> = {
  FOUNDATION: 'زیربنای مشترک همه شرکت‌ها: داشبورد، مستر دیتا و حاکمیت خود پلتفرم',
  OPERATIONS: 'پلاگین‌های کسب‌وکار در ۷ دامنه — پوشش کامل چشم‌انداز ۲۶ پلاگینی سند منبع',
  INTELLIGENCE: 'لایه هوشمندی: عوامل AI، استودیو کم‌کد، گزارش‌ساز و کاتالوگ',
}

export function ModulesView() {
  const { modules, me, refreshModules, switchCompany } = useApp()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [scope, setScope] = useState<'company' | 'global'>('company')
  // P1-T23 — غیرفعال‌سازی (به‌ویژه سراسری) در انتظار تأیید
  const [pendingOff, setPendingOff] = useState<{ m: ModuleInfo; useScope: 'company' | 'global' } | null>(null)

  if (!me) return null
  const activeCompany = me.companies.find((c) => c.id === me.activeCompanyId)
  const isAdmin = me.user.isAdmin
  const activeRole = activeCompany?.role
  const canManage = isAdmin || activeRole === 'ADMIN'

  const toggle = async (moduleId: string, enabled: boolean, useScope: 'company' | 'global') => {
    setBusyId(moduleId)
    try {
      await apiPost('/api/modules', { moduleId, scope: useScope, enabled }, 'PATCH')
      await refreshModules()
      setPendingOff(null)
      toastOk({
        title: 'رجیستری به‌روزرسانی شد',
        description: useScope === 'company'
          ? `${enabled ? 'فعال‌سازی' : 'غیرفعال‌سازی'} برای ${activeCompany?.name}`
          : `تغییر سراسری پلاگین — همه شرکت‌ها متأثر می‌شوند`,
      })
    } catch (e) {
      toastErr({ title: 'خطا', description: e instanceof Error ? e.message : 'تغییر وضعیت ناموفق بود' })
    } finally {
      setBusyId(null)
    }
  }

  // غیرفعال‌سازی = پیامد‌دار (کاربران نما را از دست می‌دهند) → تأیید صریح (P1-T23)
  const requestToggle = (moduleId: string, enabled: boolean, useScope: 'company' | 'global') => {
    if (enabled) { void toggle(moduleId, true, useScope); return }
    const m = modules.find((x) => x.id === moduleId) ?? null
    if (m) setPendingOff({ m, useScope })
  }

  const byLayer = LAYER_ORDER.map((layer) => ({
    layer,
    domains: [...new Set(modules.filter((m) => m.layer === layer).map((m) => m.domain))]
      .map((domain) => ({ domain, items: modules.filter((m) => m.layer === layer && m.domain === domain) })),
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="کاتالوگ پلاگین‌ها"
        description={`معماری پلاگین‌محور با تاکسونومی سه‌لایه (ADR-008) — ${modules.length} پلاگین در ۳ لایه و ۹ دامنه؛ ناوبری، دسترسی و نقشه گسترش از همین رجیستری ساخته می‌شود`}
      />

      {/* نوار وضعیت دامنه مدیریت */}
      <Card className="border-primary/25 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-primary" />
            {scope === 'company' ? (
              <span>مدیریت برای شرکت: <b>{activeCompany?.name ?? '—'}</b></span>
            ) : (
              <span className="flex items-center gap-1"><Globe className="h-4 w-4 text-primary" /> تغییر سراسری (همه شرکت‌ها)</span>
            )}
          </div>
          <div className="flex items-center gap-3 sm:ms-auto">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <Switch checked={scope === 'global'} onCheckedChange={(v) => setScope(v ? 'global' : 'company')} disabled={!isAdmin} />
              دامنه سراسری
            </label>
            {!canManage ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5" /> فقط مدیر سامانه می‌تواند تغییر دهد
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {byLayer.map(({ layer, domains }) => (
        <div key={layer} className="space-y-3">
          <div className="rounded-xl border bg-muted/40 px-4 py-2.5">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Layers className="h-4 w-4 text-primary" /> لایه {LAYER_LABELS[layer]}
              <span className="ms-auto text-[11px] font-normal text-muted-foreground">{LAYER_DESC[layer]}</span>
            </h2>
          </div>
          {domains.map(({ domain, items }) => (
            <div key={domain} className="space-y-2">
              <p className="px-1 text-xs font-medium text-muted-foreground">{DOMAIN_LABELS[domain] ?? domain}</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((m) => (
                  <ModuleCard
                    key={m.id}
                    m={m}
                    busy={busyId === m.id}
                    canManage={canManage}
                    globalScope={scope === 'global' && isAdmin}
                    onToggle={requestToggle}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      {activeCompany?.type === 'GROUP' ? (
        <p className="text-xs text-muted-foreground">
          در نمای هلدینگ، تغییر وضعیت روی شرکت انتخابی از منوی شرکت (هدر) اعمال می‌شود. برای مدیریت یک شرکت، ابتدا به آن سوئیچ کنید.
        </p>
      ) : null}

      {/* P1-T23 — تأیید غیرفعال‌سازی با متن پیامد */}
      <ConfirmDialog
        open={!!pendingOff}
        onOpenChange={(o) => { if (!o) setPendingOff(null) }}
        destructive
        busy={!!pendingOff && busyId === pendingOff.m.id}
        title={`غیرفعال‌سازی «${pendingOff?.m.name ?? ''}»؟`}
        description={pendingOff?.useScope === 'global'
          ? 'این پلاگین برای همه شرکت‌های هلدینگ خاموش می‌شود؛ کاربران آن شرکت‌ها بلافاصله دسترسی به نما و داده‌های این ماژول را از دست می‌دهند (داده‌ها حفظ می‌شود).'
          : `این پلاگین برای ${activeCompany?.name ?? 'شرکت فعال'} خاموش می‌شود؛ کاربران همین شرکت بلافاصله دسترسی به نما و داده‌های این ماژول را از دست می‌دهند (داده‌ها حفظ می‌شود).`}
        confirmLabel="غیرفعال‌سازی"
        onConfirm={() => { if (pendingOff) void toggle(pendingOff.m.id, false, pendingOff.useScope) }}
      />

      <p className="flex items-start gap-1.5 rounded-xl border border-dashed p-4 text-xs leading-6 text-muted-foreground">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        پلاگین‌های غیرفعال، ظرفیت معماری سند منبع را رزرو می‌کنند: فاز تحقق هرکدام در ستون فاز مشخص است و فعال‌سازی سراسری
        صرفاً نقطه اتصال معماری را فراهم می‌کند. وابستگی هر پلاگین (dependsOn) تضمین می‌کند ترتیب فعال‌سازی منطقی بماند.
      </p>
    </div>
  )
}

function ModuleCard({
  m, busy, canManage, globalScope, onToggle,
}: {
  m: ModuleInfo
  busy: boolean
  canManage: boolean
  globalScope: boolean
  onToggle: (id: string, enabled: boolean, scope: 'company' | 'global') => void
}) {
  const companyOn = m.companyEnabled !== false && m.status === 'ACTIVE'
  const isFuture = m.status === 'INACTIVE'
  const deps = (() => { try { return JSON.parse(m.dependsOn || '[]') as string[] } catch { return [] } })()

  return (
    <Card className={cn('transition-all', isFuture && 'border-dashed opacity-80', companyOn && !isFuture && 'border-primary/30')}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IconFor name={m.icon} className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{m.name}</p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground" dir="ltr">v{m.version} · {m.code}</p>
            </div>
          </div>
          <Switch
            checked={companyOn}
            disabled={!canManage || busy || globalScope}
            onCheckedChange={(v) => onToggle(m.id, v, globalScope ? 'global' : 'company')}
            aria-label={`تغییر وضعیت ${m.name}`}
          />
        </div>
        <p className="min-h-10 text-xs leading-5 text-muted-foreground">{m.description}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {isFuture ? (
            <Badge variant="secondary" className="border-0 bg-amber-100 text-amber-700">فاز {m.targetPhase} — در نقشه راه</Badge>
          ) : (
            <Badge variant="secondary" className="border-0 bg-emerald-100 text-emerald-700">فعال</Badge>
          )}
          {m.companyEnabled === false ? (
            <Badge variant="secondary" className="border-0 bg-red-100 text-red-700">غیرفعال در این شرکت</Badge>
          ) : null}
          {m.menus.length > 0 ? (
            <Badge variant="secondary" className="border-0 bg-secondary text-secondary-foreground">{m.menus.length} نما</Badge>
          ) : null}
          {deps.length > 0 ? (
            <span className="font-mono text-[10px] text-muted-foreground" dir="ltr">→ {deps.join(', ')}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
