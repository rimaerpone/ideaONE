'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/store/app'
import { useWorkspace } from '@/store/workspace'
import { apiGet } from '@/core/shared/api-client'
import type { DashboardData } from '@/types/platform'
import { PageHeader, StatCard, LoadingState } from '@/components/common/ui-bits'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Inbox, MailOpen, AlertTriangle, ClipboardCheck, Boxes, FileCheck2, Sparkles, Puzzle, Building2 } from 'lucide-react'
import { faNumber, faDigits, relativeFa } from '@/core/shared/jalali'
import { readUiPref, writeUiPref } from '@/core/shared/ui-prefs'
import { cn } from '@/lib/utils'

const PIE_COLORS = ['#C0623B', '#7d9a6c', '#b58a3c', '#d9b48a', '#8a6f5c']

/** بازه‌های مجاز تحلیلی (D7) — سطل ۹۰ روزه هفتگی است، بقیه روزانه */
const RANGES: { days: 7 | 30 | 90; label: string }[] = [
  { days: 7, label: '۷ روز' },
  { days: 30, label: '۳۰ روز' },
  { days: 90, label: '۹۰ روز' },
]

/**
 * D7 — چیپ دلتا نسبت به دوره هم‌طول قبل (analytical card الگوی Fiori):
 * دوره قبل صفر = «اولین دوره با داده» (درصد بی‌معناست)؛ جهت با رنگ و متن فارسی.
 */
function DeltaChip({ current, previous, unit }: { current: number; previous: number; unit: string }) {
  if (previous === 0) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
        {current > 0 ? `اولین دوره با ${unit}` : 'بدون داده در هر دو دوره'}
      </span>
    )
  }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) {
    return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">بدون تغییر</span>
  }
  const up = pct > 0
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-medium',
        up
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
          : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
      )}
      dir="rtl"
    >
      {`${faDigits(Math.abs(pct))}٪ ${up ? 'افزایش' : 'کاهش'} نسبت به دوره قبل`}
    </span>
  )
}

export function DashboardView() {
  const me = useApp((s) => s.me)
  const openView = useWorkspace((s) => s.openView)
  const [error, setError] = useState<string | null>(null)

  // D7 — بازه تحلیلی نمودارها؛ انتخاب کاربر per-user ماندگار است (P2.5-U3).
  // خواندن در lazy initializer (الگوی use-draft) — داشبورد فقط پس از احراز هویت mount می‌شود
  const [range, setRange] = useState<7 | 30 | 90>(() => {
    if (!me) return 30
    const stored = readUiPref<7 | 30 | 90>(me.user.id, 'dashrange')
    return stored === 7 || stored === 30 || stored === 90 ? stored : 30
  })
  const applyRange = (r: 7 | 30 | 90) => {
    setRange(r)
    if (me) writeUiPref(me.user.id, 'dashrange', r)
  }

  // داده + پارامترهایی که با آن واکشی شده — «تازگی» از مقایسه مشتق می‌شود (نه reset دستی):
  // تغییر بازه/شرکت → داده فعلی کهنه → LoadingState تا رسیدن پاسخ تازه
  const [fetched, setFetched] = useState<{ data: DashboardData; range: number; companyId: string | null } | null>(null)
  useEffect(() => {
    if (!me) return
    let alive = true
    apiGet<DashboardData>(`/api/dashboard?range=${range}`)
      .then((d) => { if (alive) setFetched({ data: d, range, companyId: me.activeCompanyId ?? null }) })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'خطا در دریافت داشبورد') })
    return () => { alive = false }
  }, [me, me?.activeCompanyId, range])
  const data = fetched && fetched.range === range && fetched.companyId === (me?.activeCompanyId ?? null) ? fetched.data : null

  if (!me) return null
  const activeCompany = me.companies.find((c) => c.id === me.activeCompanyId)
  const scopeName = activeCompany?.type === 'GROUP' ? 'هلدینگ (همه شرکت‌ها)' : activeCompany?.name ?? ''
  const isHoldingScope = activeCompany?.type === 'GROUP'
  // D3 — داشبورد نقش‌محور: بلوک حاکمیت فقط برای مدیران (هم‌قاعده با گارد «تنظیمات/کاربران»)
  const canGovern = !!me.user.isAdmin || activeCompany?.role === 'ADMIN'

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`داشبورد ${scopeName}`}
        description={`خوش آمدید، ${me.user.fullName} — ${me.user.jobTitle ?? ''}`}
      />

      {!data ? (
        <LoadingState rows={6} />
      ) : (
        <>
          {/* KPIهای عملیاتی — D1: هر کارت به نمای همان سنجه می‌رود (الگوی Fiori Tile / D365) */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              title="کارتابل من" value={faNumber(data.kpis.cartableCount)}
              sub={`${faNumber(data.kpis.openLetters)} نامه در جریان کل`} icon={<Inbox className="h-5 w-5" />} tone="primary"
              onClick={() => openView('cartable', 'کارتابل', 'Inbox')} hint="رفتن به کارتابل — نامه‌های در انتظار اقدام شما"
            />
            <StatCard
              title="نامه‌های نزدیک به مهلت" value={faNumber(data.kpis.urgentLetters)}
              sub={data.kpis.overdueLetters > 0
                ? `${faNumber(data.kpis.overdueLetters)} نامه مهلت‌گذشته — بقیه ≤ ۳ روز`
                : 'مهلت ≤ ۳ روز'}
              icon={<AlertTriangle className="h-5 w-5" />} tone={data.kpis.overdueLetters > 0 ? 'danger' : 'warning'}
              onClick={() => openView('letters', 'نامه‌ها', 'Mail')} hint="رفتن به دفتر مکاتبات"
            />
            <StatCard
              title="درخواست کالای باز" value={faNumber(data.kpis.pendingRequests)}
              sub="در انتظار تصمیم مدیران" icon={<ClipboardCheck className="h-5 w-5" />} tone={data.kpis.pendingRequests > 0 ? 'warning' : 'success'}
              onClick={() => openView('requests', 'درخواست کالا', 'ClipboardList')} hint="رفتن به درخواست‌های کالا"
            />
            <StatCard
              title="موجودی کل (مترمربع)" value={faNumber(data.kpis.stockTotalM2)}
              sub={`${faNumber(data.kpis.postedDocs)} سند قطعی · ${faNumber(data.kpis.draftDocs)} پیش‌نویس`} icon={<Boxes className="h-5 w-5" />} tone="default"
              onClick={() => openView('stock', 'موجودی انبار', 'Boxes')} hint="رفتن به موجودی انبار"
            />
          </div>

          {/* D7 — بازه تحلیلی نمودارهای روندی (انتخاب ماندگار per کاربر)؛ KPIها سنجه لحظه‌ای‌اند و بازه نمی‌گیرند */}
          <div className="flex flex-wrap items-center justify-between gap-2" data-dash-range>
            <p className="text-xs text-muted-foreground">بازه نمودارهای روندی</p>
            <div
              className="flex items-center gap-1 rounded-lg border bg-card p-0.5"
              role="group"
              aria-label="بازه زمانی نمودارهای روندی"
            >
              {RANGES.map((r) => (
                <button
                  key={r.days}
                  type="button"
                  onClick={() => applyRange(r.days)}
                  aria-pressed={range === r.days}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs transition-colors',
                    range === r.days
                      ? 'bg-primary font-medium text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* تحلیل نامه‌ها (D7) — روند ثبت در بازه + ترکیب نوع؛ سطل‌های روزانه/هفتگی */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  روند نامه‌ها
                  <span className="text-xs font-normal text-muted-foreground">
                    {`${faNumber(data.lettersInRange)} نامه ثبت‌شده در ${faDigits(range)} روز اخیر`}
                  </span>
                  <DeltaChip current={data.lettersInRange} previous={data.lettersPrevRange} unit="نامه" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.letterTrend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} reversed minTickGap={12} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} orientation="right" />
                      <Tooltip contentStyle={{ fontFamily: 'inherit', fontSize: 12, direction: 'rtl', borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} />
                      <Bar dataKey="وارده" stackId="a" fill="#C0623B" />
                      <Bar dataKey="صادره" stackId="a" fill="#7d9a6c" />
                      <Bar dataKey="داخلی" stackId="a" fill="#b58a3c" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">ترکیب نامه‌ها بر اساس نوع</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.lettersByType} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                        {data.lettersByType.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontFamily: 'inherit', fontSize: 12, direction: 'rtl', borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* تحلیل انبار (D7) — روند اسناد در همان بازه + ترکیب موجودی به تفکیک درجه */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  روند اسناد انبار (قطعی‌شده)
                  <span className="text-xs font-normal text-muted-foreground">
                    {`${faNumber(data.docsInRange)} سند قطعی در ${faDigits(range)} روز اخیر`}
                  </span>
                  <DeltaChip current={data.docsInRange} previous={data.docsPrevRange} unit="سند" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.docTrend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} reversed minTickGap={12} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} orientation="right" />
                      <Tooltip contentStyle={{ fontFamily: 'inherit', fontSize: 12, direction: 'rtl', borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} />
                      <Bar dataKey="رسید" fill="#C0623B" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="حواله" fill="#7d9a6c" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* موجودی به تفکیک درجه */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">موجودی به تفکیک درجه</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.stockByGrade.length === 0 ? (
                  <p className="text-sm text-muted-foreground">موجودی ثبت نشده است</p>
                ) : (
                  data.stockByGrade.map((g) => {
                    const total = data.stockByGrade.reduce((s, x) => s + x.value, 0) || 1
                    return (
                      <div key={g.name}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span>{g.name}</span>
                          <span className="text-muted-foreground">{faNumber(g.value)} مترمربع</span>
                        </div>
                        <Progress value={(g.value / total) * 100} />
                      </div>
                    )
                  })
                )}
                <button type="button" onClick={() => openView('stock', 'موجودی انبار', 'Boxes')} className="text-xs text-primary hover:underline">
                  مشاهده جزئیات موجودی ←
                </button>
              </CardContent>
            </Card>
          </div>

          {/* D6 — نمای مقایسه‌ای شرکت‌ها (فقط دامنه هلدینگ) */}
          {isHoldingScope && data.perCompany.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4 text-primary" />
                  نمای شرکت‌های هلدینگ
                  <span className="text-xs font-normal text-muted-foreground">مقایسه بار عملیاتی و موجودی به تفکیک شرکت</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-start">شرکت</TableHead>
                      <TableHead className="text-center">نامه در جریان</TableHead>
                      <TableHead className="text-center">درخواست باز</TableHead>
                      <TableHead className="text-center">موجودی (مترمربع)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.perCompany.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={c.lettersInProgress > 0 ? 'secondary' : 'outline'}>{faNumber(c.lettersInProgress)}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={c.pendingRequests > 0 ? 'secondary' : 'outline'}>{faNumber(c.pendingRequests)}</Badge>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">{faNumber(c.stockM2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {/* فهرست‌های عملیاتی — انبارهای پر + فید فعالیت (عرض کامل‌تر پس از انتقال ترکیب درجه به ردیف تحلیل) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* انبارهای پر */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">انبارهای با بیشترین موجودی</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.stockByWarehouse.map((w) => (
                  <div key={w.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{w.name}</span>
                    <span className="shrink-0 text-muted-foreground">{faNumber(w.value)} م²</span>
                  </div>
                ))}
                {data.stockByWarehouse.length === 0 ? <p className="text-sm text-muted-foreground">داده‌ای موجود نیست</p> : null}
              </CardContent>
            </Card>

            {/* فعالیت اخیر — D4: نویز نشست (ورود/خروج/سوییچ) سمت سرور فیلتر شده است */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">آخرین فعالیت‌ها</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="thin-scrollbar max-h-64 space-y-3 overflow-y-auto">
                  {data.recentActivity.map((a) => (
                    <li key={a.id} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          <span className="font-medium">{a.userName}</span>
                          {' — '}{a.action} {a.entity}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{relativeFa(a.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                  {data.recentActivity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">فعالیت کسب‌وکاری ثبت نشده است</p>
                  ) : null}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* D2+D3 — حاکمیت و راهبری: ویژه مدیران؛ کاربر عملیاتی فقط داشبورد عملیاتی می‌بیند */}
          {canGovern ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <FileCheck2 className="h-4 w-4 text-primary" />
                  حاکمیت و راهبری
                  <Badge variant="secondary" className="text-[10px]">ویژه مدیران</Badge>
                  <span className="text-xs font-normal text-muted-foreground">
                    ({faNumber(data.gateMeta.passCount)} از {faNumber(data.gateMeta.total)} سنجه گیت پاس)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Puzzle className="h-3.5 w-3.5" />
                    پلاگین‌ها: {faNumber(data.kpis.pluginCatalog.active)} فعال از {faNumber(data.kpis.pluginCatalog.total)}
                    ({faNumber(data.kpis.pluginCatalog.layers.OPERATIONS)} عملیاتی · {faNumber(data.kpis.pluginCatalog.layers.INTELLIGENCE)} هوشمندی · {faNumber(data.kpis.pluginCatalog.layers.FOUNDATION)} بستر)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    غنی‌سازی AI: {faNumber(data.kpis.aiAssistedLetters)} نامه (HITL)
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  {data.gate.map((g) => {
                    const value = g.value
                    const passed = value !== null && (g.kind === 'count' ? value <= g.target : value >= g.target)
                    const hasValue = value !== null
                    // نوار پیشرفت: برای درصد نسبت به هدف؛ برای شمار خطا معکوس (صفر = کامل)
                    const raw = hasValue && g.kind === 'percent' && g.target > 0 ? (value / g.target) * 100 : null
                    const pct = hasValue ? (raw !== null ? Math.min(100, Math.round(raw)) : g.kind === 'count' && value <= g.target ? 100 : 0) : 0
                    return (
                      <div key={g.id}>
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-1.5 text-xs leading-5 sm:text-sm">
                            {g.label}
                            {hasValue ? (
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                                  passed
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                                    : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                                }`}
                              >
                                {passed ? 'پاس' : 'عدم پاس'}
                              </span>
                            ) : null}
                          </span>
                          <span className={`shrink-0 font-bold ${passed ? 'text-emerald-600' : hasValue ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {hasValue ? (g.kind === 'percent' ? `${faDigits(Math.round(value))}٪` : faNumber(value)) : '—'}
                          </span>
                        </div>
                        <Progress value={pct} className={hasValue && !passed ? '[&>div]:bg-red-500' : undefined} />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {g.kind === 'percent' ? `هدف: ≥ ${faDigits(g.target)}٪ — ` : `هدف: ${faDigits(g.target)} — `}
                          {g.detail}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* نوار هوش مصنوعی */}
          <Card className="border-primary/25 bg-primary/5">
            <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium">دستیار هوشمند نامه‌ها — موج صفر هوش مصنوعی</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  طبقه‌بندی، خلاصه‌سازی و تشخیص اولویت نامه‌ها با مدل زبانی؛ اعمال پیشنهادها فقط با تأیید شما (حکمرانی HITL).
                  تاکنون {faNumber(data.kpis.aiAssistedLetters)} نامه با کمک هوش مصنوعی غنی‌سازی شده است.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <MailOpen className="hidden h-4 w-4 text-muted-foreground sm:block" />
                <button type="button" onClick={() => openView('cartable', 'کارتابل', 'Inbox')} className="text-sm font-medium text-primary hover:underline">
                  شروع از کارتابل ←
                </button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
