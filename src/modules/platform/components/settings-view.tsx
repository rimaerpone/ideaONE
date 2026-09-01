'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '@/store/app'
import { apiGet, apiPost, apiDownload } from '@/core/shared/api-client'
import type { AuditData, AuditLogItem, GovernanceData, SecurityData, WeeklyReportData } from '@/types/platform'
import { PageHeader, LoadingState, EmptyState } from '@/components/common/ui-bits'
import { useAuditLogsQuery } from '@/modules/platform/queries'
import { DataGrid, type DataGridColumn } from '@/components/common/data-grid'
import { JalaliDatePicker } from '@/components/common/jalali-date-picker'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Activity, Radio, Flag, Plug, ShieldAlert, Download, FilterX, Loader2, Building2, TriangleAlert, X, RotateCcw, Printer, Play, ClipboardCopy, FileText } from 'lucide-react'
import { formatJalali, faDigits, faNumber, parseJalaliInput, toJalaliInputString } from '@/core/shared/jalali'
import { actionLabelFa, ACTION_FA } from '@/core/shared/audit-labels'
import { parseNumericInput } from '@/core/shared/normalize'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toastOk, toastErr } from '@/hooks/use-toast'

const KIND_FA: Record<string, string> = {
  TAX: 'مالیات', BANK: 'بانک', ATTENDANCE: 'حضور و غیاب', E_INVOICE: 'صورتحساب الکترونیکی',
  LEGACY: 'سیستم‌های موجود', GENERIC: 'عمومی',
}
const REASON_FA: Record<string, string> = {
  unknown_user: 'کاربر ناشناس', inactive: 'کاربر غیرفعال', bad_password: 'گذرواژه نادرست',
  rate_limited: 'مسدود توسط محدودیت نرخ',
}
const STATUS_FA: Record<string, string> = { PLANNED: 'برنامه‌ریزی‌شده', CONFIGURED: 'پیکربندی‌شده', LIVE: 'فعال' }
const DIRECTION_FA: Record<string, string> = { OUTBOUND: 'خروجی', INBOUND: 'ورودی', BIDIRECTIONAL: 'دوطرفه' }
const CATEGORY_FA: Record<string, string> = { OPERATIONAL: 'عملیاتی', MANAGEMENT: 'مدیریتی', COMPLIANCE: 'انطباقی' }

type Tab = 'company' | 'security' | 'audit' | 'events' | 'flags' | 'integrations'

type CompanySettingsData = {
  settings: { 'requests.visibility': 'ALL' | 'SELF_MANAGERS'; 'requests.notifyCeilingM2': string; 'letterhead.subtitle': string; 'letterhead.footer': string }
  companyName: string | null
}

export function SettingsView() {
  const me = useApp((s) => s.me)
  const [tab, setTab] = useState<Tab>('audit')
  const [gov, setGov] = useState<GovernanceData | null>(null)
  const [security, setSecurity] = useState<SecurityData | null>(null)
  const [busyFlag, setBusyFlag] = useState<string | null>(null)
  // P1-T29/T30 — تنظیمات شرکت فعال (دید درخواست کالا + سقف اعلان مدیران)
  const [companyCfg, setCompanyCfg] = useState<CompanySettingsData | null>(null)
  const [busySetting, setBusySetting] = useState<string | null>(null)
  const [ceilingDraft, setCeilingDraft] = useState('')
  // P2.5-U7 — پیش‌نویس سربرگ چاپ (دو فیلد، یک ذخیره منطقی)
  const [lhSubtitleDraft, setLhSubtitleDraft] = useState('')
  const [lhFooterDraft, setLhFooterDraft] = useState('')
  const [lhErr, setLhErr] = useState<string | null>(null)
  // بررسی عمیق فرم‌ها — ۱۴۰۵/۰۶: خطای inline زیر فیلد سقف (نه فقط toast)
  const [ceilingErr, setCeilingErr] = useState<string | null>(null)

  // P2-T13 — گزارش هفتگی کارتابل: preset + آستانه معطلی + بارگذاری
  const [wrPreset, setWrPreset] = useState<'this' | 'last'>('this')
  const [wrStale, setWrStale] = useState('3')
  const [wr, setWr] = useState<WeeklyReportData | null>(null)
  const [wrBusy, setWrBusy] = useState(false)
  const [wrErr, setWrErr] = useState<string | null>(null)
  const [wrPrinting, setWrPrinting] = useState(false)

  // P1-T14 — گارد تنظیمات: مدیر پلتفرم یا ADMIN شرکت فعال (آینه گارد سرور)
  const isAdmin = !!me?.user.isAdmin
  const activeCompany = me?.companies.find((c) => c.id === me.activeCompanyId)
  const canSettings = isAdmin || activeCompany?.role === 'ADMIN'

  // P1-T15 — فیلترهای حسابرسی (شرکت/اقدام/بازه جلالی/جستجو) + صفحه‌بندی سروری
  const [q, setQ] = useState('')
  const [fAction, setFAction] = useState('')
  const [fCompany, setFCompany] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [page, setPage] = useState(0) // ۰-مبنا (قرارداد DataGrid)
  const [pageSize, setPageSize] = useState(30)
  const [sort, setSort] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: 'createdAt', dir: 'desc' })
  const [csvBusy, setCsvBusy] = useState(false)

  // بررسی عمیق فرم‌ها — ۱۴۰۵/۰۶: debounce جستجوی حسابرسی (هر کلید = یک کوئری سرور نباشد)
  const [qDebounced, setQDebounced] = useState('')
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onQChange = (v: string) => {
    setQ(v)
    setPage(0)
    if (qTimer.current) clearTimeout(qTimer.current)
    qTimer.current = setTimeout(() => setQDebounced(v), 350)
  }
  // بررسی عمیق فرم‌ها — Enter = تعهد فوری جستجوی debounce‌شده (بدون انتظار ۳۵۰ms)
  const onQKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (qTimer.current) clearTimeout(qTimer.current)
    setQDebounced(q)
  }
  useEffect(() => () => { if (qTimer.current) clearTimeout(qTimer.current) }, [])

  // بررسی عمیق فرم‌ها — بازه معکوس: از تاریخ بعد از تا تاریخ
  const rangeReversed = useMemo(() => {
    if (!fFrom || !fTo) return false
    const from = parseJalaliInput(fFrom)
    const to = parseJalaliInput(fTo)
    return !!from && !!to && from.getTime() > to.getTime()
  }, [fFrom, fTo])

  // بررسی عمیق فرم‌ها — بازه‌های سریع جلالی (امروز/۷/۳۰/۹۰ روز اخیر)
  const applyRangePreset = (days: number) => {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - (days - 1))
    setFFrom(toJalaliInputString(from))
    setFTo(toJalaliInputString(to))
    setPage(0)
  }
  const activePreset = useMemo(() => {
    if (!fFrom || !fTo) return 0
    const from = parseJalaliInput(fFrom)
    const to = parseJalaliInput(fTo)
    if (!from || !to) return 0
    const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1
    return [1, 7, 30, 90].includes(days) ? days : 0
  }, [fFrom, fTo])

  const auditQuery = useAuditLogsQuery(
    { q: qDebounced, action: fAction, entity: '', companyId: fCompany, from: fFrom, to: fTo, page: page + 1, pageSize, sort: `${sort.field}:${sort.dir}` },
    canSettings,
  )
  const audit: AuditData | undefined = auditQuery.data

  const loadGov = useCallback(() => {
    apiGet<GovernanceData>('/api/platform/governance').then(setGov).catch(() => setGov({ flags: [], connectors: [], reports: [], jobs: [], aiInvocations: [] }))
  }, [])

  const loadCompanyCfg = useCallback(() => {
    apiGet<CompanySettingsData>('/api/platform/company-settings')
      .then((d) => {
        setCompanyCfg(d)
        setCeilingDraft(String(Number(d.settings['requests.notifyCeilingM2']) || 0))
        setLhSubtitleDraft(d.settings['letterhead.subtitle'] ?? '')
        setLhFooterDraft(d.settings['letterhead.footer'] ?? '')
      })
      .catch(() => setCompanyCfg(null))
  }, [])

  useEffect(() => {
    if (!me || !canSettings) return
    loadGov()
    loadCompanyCfg()
    if (isAdmin) apiGet<SecurityData>('/api/platform/security').then(setSecurity).catch(() => setSecurity(null))
  }, [me, me?.activeCompanyId, loadGov, loadCompanyCfg, isAdmin, canSettings])

  // ذخیره یک تنظیم شرکت (P1-T29/T30) — بدنه: { key, value }
  const saveCompanySetting = async (key: string, value: string, okTitle: string) => {
    setBusySetting(key)
    try {
      await apiPost('/api/platform/company-settings', { key, value }, 'PATCH')
      loadCompanyCfg()
      toastOk({ title: okTitle, description: `${activeCompany?.name ?? 'شرکت فعال'} — تغییر بلافاصله اعمال می‌شود` })
    } catch (e) {
      toastErr({ title: 'خطا در ذخیره تنظیم', description: e instanceof Error ? e.message : 'تغییر ناموفق بود' })
    } finally {
      setBusySetting(null)
    }
  }

  // بررسی عمیق فرم‌ها — ذخیره سقف با خطای inline + Enter
  const saveCeiling = () => {
    const n = parseNumericInput(ceilingDraft)
    if (n === null || n < 0) {
      setCeilingErr('سقف باید عددی نامنفی باشد — ارقام فارسی هم پذیرفته می‌شود')
      return
    }
    setCeilingErr(null)
    void saveCompanySetting('requests.notifyCeilingM2', String(n), 'سقف اعلان ذخیره شد')
  }

  // P2.5-U7 / P2-T7 — ذخیره سربرگ چاپ (هر دو کلید با هم — یک تغییر منطقی)
  const saveLetterhead = async () => {
    const subtitle = lhSubtitleDraft.trim()
    const footer = lhFooterDraft.trim()
    if (subtitle.length > 120) { setLhErr('سطر سربرگ حداکثر ۱۲۰ نویسه است'); return }
    if (footer.length > 200) { setLhErr('پاورقی چاپ حداکثر ۲۰۰ نویسه است'); return }
    setLhErr(null)
    setBusySetting('letterhead')
    try {
      await apiPost('/api/platform/company-settings', { key: 'letterhead.subtitle', value: subtitle }, 'PATCH')
      await apiPost('/api/platform/company-settings', { key: 'letterhead.footer', value: footer }, 'PATCH')
      loadCompanyCfg()
      toastOk({ title: 'سربرگ چاپ ذخیره شد', description: 'نامه‌های این شرکت از این پس با این سربرگ چاپ می‌شوند' })
    } catch (e) {
      toastErr({ title: 'خطا در ذخیره سربرگ', description: e instanceof Error ? e.message : 'تغییر ناموفق بود' })
    } finally {
      setBusySetting(null)
    }
  }

  const toggleFlag = async (key: string, enabled: boolean) => {
    setBusyFlag(key)
    try {
      await apiPost('/api/platform/governance', { key, enabled }, 'PATCH')
      loadGov()
      toastOk({ title: 'پرچم ویژگی به‌روزرسانی شد', description: `${key} → ${enabled ? 'فعال' : 'غیرفعال'}` })
    } catch (e) {
      toastErr({ title: 'خطا', description: e instanceof Error ? e.message : 'تغییر ناموفق بود' })
    } finally {
      setBusyFlag(null)
    }
  }

  // P2-T11 — اجرای دستی کار زمان‌بند (فقط مدیر): تست/عملیات فوری بدون انتظار دور بعدی
  const [busyJob, setBusyJob] = useState<string | null>(null)
  const runJob = async (key: string) => {
    setBusyJob(key)
    try {
      const d = await apiPost<{ note: string }>('/api/platform/jobs/run', { key })
      loadGov()
      toastOk({ title: 'کار زمان‌بند اجرا شد', description: d.note })
    } catch (e) {
      toastErr({ title: 'اجرای کار ناموفق بود', description: e instanceof Error ? e.message : 'خطا' })
    } finally {
      setBusyJob(null)
    }
  }

  // ---------- P2-T13 — گزارش هفتگی کارتابل (فقط مدیر — آینه گارد سرور requireSettingsAdmin) ----------
  const wrQuery = useMemo(
    () => `/api/letters/weekly-report?preset=${wrPreset}&staleDays=${encodeURIComponent(wrStale)}`,
    [wrPreset, wrStale],
  )
  const loadWeeklyReport = useCallback(async () => {
    if (!canSettings) return
    setWrBusy(true)
    setWrErr(null)
    try {
      setWr(await apiGet<WeeklyReportData>(wrQuery))
    } catch (e) {
      setWr(null)
      setWrErr(e instanceof Error ? e.message : 'دریافت گزارش ناموفق بود')
    } finally {
      setWrBusy(false)
    }
  }, [wrQuery, canSettings])
  // بارگذاری خودکار در ورود به تب یکپارچه‌سازی (یک بار per تغییر preset/آستانه)
  useEffect(() => {
    if (tab === 'integrations' && canSettings) void loadWeeklyReport()
  }, [tab, canSettings, loadWeeklyReport])

  // چاپ: پورتال گزارش رندر می‌شود، سپس print؛ afterprint حالت را برمی‌گرداند
  useEffect(() => {
    const done = () => setWrPrinting(false)
    window.addEventListener('afterprint', done)
    return () => window.removeEventListener('afterprint', done)
  }, [])
  const printWeeklyReport = () => {
    if (!wr) return
    setWrPrinting(true)
    setTimeout(() => window.print(), 120)
  }
  // رونوشت Markdown — گزارش در پیام/ایمیل/مستند قابل چسباندن است
  const copyWeeklyReport = async () => {
    if (!wr) return
    try {
      await navigator.clipboard.writeText(wr.markdown)
      toastOk({ title: 'رونوشت گزارش آماده است', description: 'متن Markdown گزارش در حافظه کپی شد' })
    } catch {
      toastErr({ title: 'رونوشت ناموفق بود', description: 'مرورگر اجازه دسترسی به حافظه را نداد' })
    }
  }
  // دانلود فایل .md — همان پاسخ سرور با Content-Disposition
  const downloadWeeklyReport = async () => {
    try {
      await apiDownload(wrQuery + '&format=md', 'cartable-weekly.md')
    } catch (e) {
      toastErr({ title: 'دانلود ناموفق بود', description: e instanceof Error ? e.message : 'خطا' })
    }
  }

  // خروجی CSV — همان فیلترهای فعال تب حسابرسی (P1-T15)
  const exportCsv = async () => {
    setCsvBusy(true)
    try {
      const params = new URLSearchParams({ format: 'csv', sort: `${sort.field}:${sort.dir}` })
      if (q) params.set('q', q)
      if (fAction) params.set('action', fAction)
      if (fCompany) params.set('companyId', fCompany)
      if (fFrom) params.set('from', fFrom)
      if (fTo) params.set('to', fTo)
      const meta = await apiDownload(`/api/audit?${params.toString()}`, 'audit.csv')
      toastOk({
        title: 'خروجی CSV آماده شد',
        description: meta.rows !== null
          ? `${faNumber(meta.rows)} سجل حسابرسی دریافت شد${meta.capped ? ' (سقف ۵٬۰۰۰ سطر — بازه را محدودتر کنید)' : ''} — با کدگذاری UTF-8 قابل باز شدن در اکسل`
          : 'فایل CSV با کدگذاری UTF-8 دریافت شد',
      })
    } catch (e) {
      toastErr({ title: 'خطا در دریافت CSV', description: e instanceof Error ? e.message : 'دریافت ناموفق بود' })
    } finally {
      setCsvBusy(false)
    }
  }

  const resetFilters = () => {
    setQ(''); setFAction(''); setFCompany(''); setFFrom(''); setFTo(''); setPage(0)
  }
  const hasFilters = !!(q || fAction || fCompany || fFrom || fTo)

  // پاک‌سازی شرکت فیلتر هنگام سوئیچ شرکت فعال (شرکت خارج از دامنه دید → خطای سرور)
  useEffect(() => {
    if (fCompany && !me?.companies.some((c) => c.id === fCompany)) setFCompany('')
  }, [me, fCompany])

  // بررسی عمیق فرم‌ها — تراشه‌های فیلتر فعال برای حذف تک‌تک + شمار سجل مطابق
  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = []
    if (q) chips.push({ key: 'q', label: `جستجو: ${q}`, clear: () => { setQ(''); setQDebounced('') } })
    if (fAction) chips.push({ key: 'action', label: `اقدام: ${actionLabelFa(fAction)}`, clear: () => setFAction('') })
    if (fCompany) {
      const name = me?.companies.find((c) => c.id === fCompany)?.name ?? ''
      chips.push({ key: 'company', label: `شرکت: ${name}`, clear: () => setFCompany('') })
    }
    if (fFrom) chips.push({ key: 'from', label: `از ${fFrom}`, clear: () => setFFrom('') })
    if (fTo) chips.push({ key: 'to', label: `تا ${fTo}`, clear: () => setFTo('') })
    return chips
  }, [q, fAction, fCompany, fFrom, fTo, me])

  const auditColumns = useMemo<DataGridColumn<AuditLogItem>[]>(() => [
    {
      key: 'createdAt', header: 'زمان', serverSortKey: 'createdAt',
      cell: (l) => <span className="whitespace-nowrap text-[11px] text-muted-foreground">{formatJalali(l.createdAt, true)}</span>,
      sortValue: (l) => new Date(l.createdAt).getTime(),
    },
    { key: 'userName', header: 'کاربر', cell: (l) => <span className="text-xs font-medium">{l.userName}</span>, sortValue: (l) => l.userName },
    { key: 'companyName', header: 'شرکت', hideOnMobile: true, cell: (l) => <span className="text-[11px] text-muted-foreground">{l.companyName}</span>, sortValue: (l) => l.companyName },
    {
      key: 'action', header: 'اقدام', align: 'center',
      cell: (l) => <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{actionLabelFa(l.action)}</span>,
      sortValue: (l) => l.action,
    },
    {
      key: 'entity', header: 'موجودیت', hideOnMobile: true,
      cell: (l) => (
        <div className="min-w-0">
          <p className="text-xs">{l.entity}</p>
          {l.entityId ? <p className="font-mono text-[10px] text-muted-foreground" dir="ltr">{l.entityId.slice(0, 12)}</p> : null}
        </div>
      ),
      sortValue: (l) => l.entity,
    },
    {
      key: 'details', header: 'جزئیات', hideOnMobile: true, enableHiding: true,
      cell: (l) => <span className="block max-w-64 truncate text-[11px] text-muted-foreground" dir="ltr">{l.details ?? '—'}</span>,
    },
  ], [])

  const actionOptions = useMemo(() => Object.keys(ACTION_FA).sort((a, b) => actionLabelFa(a).localeCompare(actionLabelFa(b), 'fa')), [])

  // ---------- گارد دسترسی (P1-T14): غیرمدیر هرگز وارد نما نمی‌شود ----------
  if (me && !canSettings) {
    return (
      <div className="space-y-5">
        <PageHeader title="تنظیمات و حاکمیت بستر" description="کاربران و نقش‌ها، حسابرسی، پرچم‌های ویژگی و یکپارچه‌سازی" />
        <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/30">
          <CardContent className="flex items-start gap-3 p-6 text-sm leading-7">
            <ShieldAlert className="mt-1 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-bold">دسترسی به تنظیمات بستر فقط برای مدیران سامانه مجاز است.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                این بخش شامل سجل حسابرسی، پرچم‌های ویژگی، کانکتورهای یکپارچه‌سازی و مدیریت کاربران است.
                اگر مسئولیتی مدیریتی دارید، از مدیر سامانه درخواست ارتقای نقش کنید (ماتریس دسترسی در سند امنیت §۳).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="تنظیمات و حاکمیت بستر"
        description="حسابرسی، رویدادهای Outbox، پرچم‌های ویژگی، کانکتورهای یکپارچه‌سازی، کاتالوگ گزارش‌ها و مصرف AI — مدیریت کاربران به نمای اختصاصی «کاربران» منتقل شد"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="thin-scrollbar max-w-full overflow-x-auto">
          <TabsTrigger value="company" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> شرکت</TabsTrigger>
          {isAdmin ? (
            <TabsTrigger value="security" className="gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> امنیت</TabsTrigger>
          ) : null}
          <TabsTrigger value="audit" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> حسابرسی</TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5"><Radio className="h-3.5 w-3.5" /> رویدادها</TabsTrigger>
          <TabsTrigger value="flags" className="gap-1.5"><Flag className="h-3.5 w-3.5" /> پرچم‌های ویژگی</TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5"><Plug className="h-3.5 w-3.5" /> یکپارچه‌سازی و گزارش‌ها</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* P1-T29/T30 — تنظیمات شرکت فعال: دید درخواست کالا + سقف اعلان مدیران */}
      {tab === 'company' ? (
        companyCfg === null ? <LoadingState rows={3} /> : (
          <div className="space-y-3">
            <p className="text-xs leading-6 text-muted-foreground">
              این تنظیمات فقط برای شرکت فعال ({companyCfg.companyName ?? activeCompany?.name ?? '—'}) اعمال می‌شود و بلافاصله حاکم است.
              شرکت هلدینگ (GROUP) تنظیم مستقل خود را دارد که بر نمای تجمعی حاکم می‌شود.
            </p>

            {/* P1-T29 — دید درخواست کالا */}
            <Card>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">دید درخواست‌های کالا</p>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">
                    در حالت «خودم + مدیران»، کارشناسان و بازدیدکنندگان فقط درخواست‌های ثبت‌شدهٔ خودشان را می‌بینند؛
                    مدیران و مدیران سیستم همه درخواست‌های شرکت را می‌بینند. حالت پیش‌فرض «همه» است.
                  </p>
                </div>
                <Select
                  value={companyCfg.settings['requests.visibility']}
                  disabled={busySetting === 'requests.visibility'}
                  onValueChange={(v) => {
                    // بررسی عمیق فرم‌ها — توست با مقدار قدیم ← جدید برای شفافیت تغییر
                    const oldFa = companyCfg.settings['requests.visibility'] === 'SELF_MANAGERS' ? 'خودم + مدیران' : 'همه'
                    const newFa = v === 'SELF_MANAGERS' ? 'خودم + مدیران' : 'همه'
                    void saveCompanySetting('requests.visibility', v, `دید درخواست‌ها: ${oldFa} ← ${newFa}`)
                  }}
                >
                  <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">همه (پیش‌فرض)</SelectItem>
                    <SelectItem value="SELF_MANAGERS">خودم + مدیران</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* P1-T30 — سقف اعلان مدیران */}
            <Card>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">سقف اعلان درخواست کالا (مترمربع)</p>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">
                    با سقف مثبت، فقط درخواست‌های با مجموع متراژ بالای سقف برای مدیران اعلان می‌سازد؛
                    درخواست‌های کوچک روتین‌اند و در فهرست درخواست‌ها قابل پیگیری‌اند. مقدار ۰ = اعلان همه درخواست‌ها (پیش‌فرض).
                    پس از فعال‌سازی ماژول مالی، این سقف به مبلغ ریالی ارتقا می‌یابد (pre-finance).
                  </p>
                </div>
                <div className="flex w-full items-center gap-2 sm:w-80">
                  <Input
                    dir="ltr"
                    inputMode="decimal"
                    className="flex-1 text-left"
                    placeholder="مثلاً ۲۰۰"
                    value={ceilingDraft}
                    onChange={(e) => { setCeilingDraft(e.target.value); if (ceilingErr) setCeilingErr(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveCeiling() } }}
                    aria-label="سقف اعلان در مترمربع"
                    aria-invalid={!!ceilingErr}
                    disabled={busySetting === 'requests.notifyCeilingM2'}
                  />
                  <Button
                    variant="secondary"
                    disabled={busySetting === 'requests.notifyCeilingM2' || ceilingDraft === String(Number(companyCfg.settings['requests.notifyCeilingM2']) || 0)}
                    onClick={() => saveCeiling()}
                  >
                    {busySetting === 'requests.notifyCeilingM2' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ذخیره'}
                  </Button>
                  {/* بررسی عمیق فرم‌ها — بازگردانی مقدار ذخیره‌شده وقتی پیش‌نویس واگرا شده */}
                  {ceilingDraft !== String(Number(companyCfg.settings['requests.notifyCeilingM2']) || 0) ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="بازگردانی به مقدار ذخیره‌شده"
                      title="بازگردانی به مقدار ذخیره‌شده"
                      disabled={busySetting === 'requests.notifyCeilingM2'}
                      onClick={() => { setCeilingDraft(String(Number(companyCfg.settings['requests.notifyCeilingM2']) || 0)); setCeilingErr(null) }}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                {ceilingErr ? <p className="w-full text-xs font-medium text-destructive sm:w-80" role="alert">{ceilingErr}</p> : null}
                <div className="w-full space-y-1 sm:w-80">
                  <p className="text-[11px] text-muted-foreground">
                    ذخیره‌شده فعلی: {faNumber(Number(companyCfg.settings['requests.notifyCeilingM2']) || 0)} م² · Enter = ذخیره
                  </p>
                  {/* بررسی عمیق فرم‌ها — تفسیر زنده معنای مقدار پیش‌نویس (چه اتفاقی با این سقف می‌افتد؟) */}
                  {(() => {
                    if (ceilingErr) return null
                    const n = parseNumericInput(ceilingDraft)
                    if (n === null) return null
                    return (
                      <p className="text-[11px] font-medium leading-5 text-primary" aria-live="polite">
                        {n > 0
                          ? `تفسیر: فقط درخواست‌های با مجموع بالاتر از ${faNumber(n)} م² اعلان می‌سازند`
                          : 'تفسیر: همهٔ درخواست‌ها اعلان می‌سازند (پیش‌فرض)'}
                      </p>
                    )
                  })()}
                </div>
              </CardContent>
            </Card>

            {/* P2.5-U7 / P2-T7 — سربرگ چاپ نامه */}
            <Card>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <Printer className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-bold">سربرگ چاپ نامه</p>
                </div>
                <p className="text-xs leading-6 text-muted-foreground">
                  متن سربرگ نسخه چاپی (A4) نامه‌های همین شرکت: «سطر سربرگ» زیر نام شرکت می‌نشیند
                  (مثلاً نام قانونی یا شعار) و «پاورقی» در انتهای صفحه چاپ می‌شود (نشانی/تلفن).
                  هر دو اختیاری‌اند؛ خالی بگذارید تا فقط نام شرکت چاپ شود. در صفحه هر نامه، دکمه «چاپ» این سربرگ را اعمال می‌کند.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="letterhead-subtitle">سطر سربرگ (حداکثر ۱۲۰ نویسه)</Label>
                    <Input
                      id="letterhead-subtitle"
                      placeholder="مثلاً: گروه تولیدی کاشی و سرامیک"
                      value={lhSubtitleDraft}
                      maxLength={120}
                      disabled={busySetting === 'letterhead'}
                      onChange={(e) => { setLhSubtitleDraft(e.target.value); if (lhErr) setLhErr(null) }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="letterhead-footer">پاورقی چاپ (حداکثر ۲۰۰ نویسه)</Label>
                    <Input
                      id="letterhead-footer"
                      placeholder="مثلاً: اصفهان، شهرک صنعتی سایه — تلفن ۰۳۱-۳۶۶۹۰۰"
                      value={lhFooterDraft}
                      maxLength={200}
                      disabled={busySetting === 'letterhead'}
                      onChange={(e) => { setLhFooterDraft(e.target.value); if (lhErr) setLhErr(null) }}
                    />
                  </div>
                </div>
                {lhErr ? <p className="text-xs font-medium text-destructive" role="alert">{lhErr}</p> : null}
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    disabled={
                      busySetting === 'letterhead'
                      || (lhSubtitleDraft.trim() === (companyCfg.settings['letterhead.subtitle'] ?? '') && lhFooterDraft.trim() === (companyCfg.settings['letterhead.footer'] ?? ''))
                    }
                    onClick={() => void saveLetterhead()}
                  >
                    {busySetting === 'letterhead' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ذخیره سربرگ'}
                  </Button>
                  {(lhSubtitleDraft.trim() !== (companyCfg.settings['letterhead.subtitle'] ?? '') || lhFooterDraft.trim() !== (companyCfg.settings['letterhead.footer'] ?? '')) ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="بازگردانی سربرگ به مقدار ذخیره‌شده"
                      title="بازگردانی به مقدار ذخیره‌شده"
                      disabled={busySetting === 'letterhead'}
                      onClick={() => { setLhSubtitleDraft(companyCfg.settings['letterhead.subtitle'] ?? ''); setLhFooterDraft(companyCfg.settings['letterhead.footer'] ?? ''); setLhErr(null) }}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <p className="text-[11px] text-muted-foreground">
              هر تغییر در این تب با رکورد حسابرسی COMPANY_SETTING ثبت می‌شود (کلید، مقدار جدید و کاربر تغییردهنده).
            </p>
          </div>
        )
      ) : null}

      {tab === 'security' && isAdmin ? (
        security === null ? <LoadingState rows={4} /> : (
          <div className="space-y-6">
            {/* گذرواژه‌های نمایشی */}
            <div>
              <h3 className="mb-2 text-sm font-bold">گذرواژه‌های نمایشی (هشدار استقرار)</h3>
              {security.weakUsers.length === 0 ? (
                <EmptyState text="گذرواژه نمایشی شناخته‌شده‌ای یافت نشد" />
              ) : (
                <div className="space-y-3">
                  <Card className="border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/30">
                    <CardContent className="p-4 text-xs leading-6 text-red-800 dark:text-red-300">
                      {faNumber(security.weakUsers.length)} کاربر با گذرواژه نمایشیِ شناخته‌شده seed کار می‌کنند.
                      پیش از هر استقرار واقعی (خروج از سندباکس) همه گذرواژه‌ها باید توسط مدیر پلتفرم تغییر کند — سیاست پیچیدگی و انقضای رمز در P1-T7.
                    </CardContent>
                  </Card>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {security.weakUsers.map((u) => (
                      <Card key={u.username} className="border-red-200/70 dark:border-red-900/40">
                        <CardContent className="space-y-1.5 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold">{u.fullName}</p>
                            <Badge variant="secondary" className="border-0 bg-red-100 text-red-700">گذرواژه نمایشی</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{u.jobTitle}</p>
                          <p className="font-mono text-[11px] text-muted-foreground" dir="ltr">{u.username}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* تلاش‌های ورود ناموفق */}
            <div>
              <h3 className="mb-2 text-sm font-bold">تلاش‌های ورود ناموفق (۲۰ مورد اخیر)</h3>
              {security.failedLogins.length === 0 ? (
                <EmptyState text="تلاش ورود ناموفقی ثبت نشده است" />
              ) : (
                <div className="overflow-x-auto rounded-xl border bg-card">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="p-3 text-start">زمان</th>
                        <th className="p-3 text-start">نام کاربری</th>
                        <th className="p-3 text-start">IP</th>
                        <th className="p-3 text-start">علت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {security.failedLogins.map((l) => (
                        <tr key={l.id} className="border-b last:border-b-0">
                          <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">{formatJalali(l.createdAt, true)}</td>
                          <td className="p-3 font-mono text-xs" dir="ltr">{l.username}</td>
                          <td className="p-3 font-mono text-xs text-muted-foreground" dir="ltr">{l.ip}</td>
                          <td className="p-3 text-xs">{REASON_FA[l.reason] ?? l.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* وضعیت کنترل‌ها */}
            <div>
              <h3 className="mb-2 text-sm font-bold">وضعیت کنترل‌های فعال</h3>
              <div className="grid gap-2 sm:grid-cols-3">
                <Card>
                  <CardContent className="p-4 text-xs leading-6">
                    <p className="mb-1 font-bold">محدودسازی نرخ ورود</p>
                    <p className="text-muted-foreground">{security.rateLimitDesc} — تلاش مازاد با پاسخ ۴۲۹ رد می‌شود.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-xs leading-6">
                    <p className="mb-1 font-bold">نشست‌های فعال</p>
                    <p className="text-muted-foreground">{faNumber(security.sessionCount)} نشست معتبر از {faNumber(security.activeUserCount)} کاربر فعال دامنه دید.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-xs leading-6">
                    <p className="mb-1 font-bold">تلاش ناموفق ۲۴ ساعت اخیر</p>
                    <p className="text-muted-foreground">{faNumber(security.failed24h)} مورد — همه در سجل حسابرسی با IP ثبت می‌شوند.</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )
      ) : null}

      {tab === 'audit' ? (
        <div className="space-y-3">
          {/* نوار فیلتر حسابرسی (P1-T15) */}
          <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">اقدام</p>
              <Select value={fAction || undefined} onValueChange={(v) => { setFAction(v ?? ''); setPage(0) }}>
                <SelectTrigger className="w-44"><SelectValue placeholder="همه اقدام‌ها" /></SelectTrigger>
                <SelectContent>
                  {actionOptions.map((a) => (
                    <SelectItem key={a} value={a}>{actionLabelFa(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">شرکت</p>
              <Select value={fCompany || undefined} onValueChange={(v) => { setFCompany(v ?? ''); setPage(0) }}>
                <SelectTrigger className="w-44"><SelectValue placeholder="همه شرکت‌ها" /></SelectTrigger>
                <SelectContent>
                  {me?.companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">از تاریخ</p>
              <JalaliDatePicker value={fFrom || null} onChange={(v) => { setFFrom(v ?? ''); setPage(0) }} placeholder="از تاریخ..." className="w-40" />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">تا تاریخ</p>
              <JalaliDatePicker value={fTo || null} onChange={(v) => { setFTo(v ?? ''); setPage(0) }} placeholder="تا تاریخ..." className="w-40" />
            </div>
            {/* بررسی عمیق فرم‌ها — بازه‌های سریع جلالی؛ بازه فعال با رنگ ثانویه مشخص است */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-muted-foreground">بازه سریع:</span>
              {([1, 7, 30, 90] as const).map((d) => (
                <Button
                  key={d}
                  variant={activePreset === d ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-7 px-2.5 text-[11px]"
                  aria-pressed={activePreset === d}
                  onClick={() => applyRangePreset(d)}
                >
                  {d === 1 ? 'امروز' : `${faNumber(d)} روز`}
                </Button>
              ))}
            </div>
            {hasFilters ? (
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={resetFilters}>
                <FilterX className="h-4 w-4" /> پاک‌سازی فیلترها
              </Button>
            ) : null}
            <div className="ms-auto">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={csvBusy}>
                {csvBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                خروجی CSV (اکسل)
              </Button>
            </div>
          </div>

          {/* بررسی عمیق فرم‌ها — هشدار بازه معکوس + تراشه‌های فیلتر فعال + شمار سجل مطابق */}
          {rangeReversed ? (
            <p className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400" role="alert">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              بازه معکوس است — «از تاریخ» بعد از «تا تاریخ»؛ نتیجه‌ای نمایش داده نمی‌شود. تاریخ‌ها را اصلاح کنید.
            </p>
          ) : null}
          {activeFilterChips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">فیلترهای فعال:</span>
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => { chip.clear(); setPage(0) }}
                  className="inline-flex max-w-64 items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-0.5 text-[11px] transition-colors hover:bg-accent"
                  aria-label={`حذف فیلتر ${chip.label}`}
                >
                  <span className="truncate">{chip.label}</span>
                  <X className="h-3 w-3 shrink-0 text-muted-foreground" />
                </button>
              ))}
              {audit ? (
                <span className="ms-2 text-[11px] text-muted-foreground">
                  {faNumber(audit.logs.total)} سجل مطابق فیلترهای فعال
                </span>
              ) : null}
            </div>
          ) : null}

          <DataGrid<AuditLogItem>
            columns={auditColumns}
            rows={audit?.logs.items ?? []}
            loading={auditQuery.isLoading}
            persistKey="audit"
            emptyText="رکورد حسابرسی یافت نشد"
              emptyHint="فیلتر اقدام/شرکت/بازه جلالی را بازنشانی کنید؛ سوابق حسابرسی حداقل ۹۰ روز نگهداری می‌شوند."
            searchValue={q}
            onSearchChange={(v) => { onQChange(v) }}
            onSearchKeyDown={onQKeyDown}
            serverPagination={{
              pageIndex: page,
              pageSize,
              total: audit?.logs.total ?? 0,
              onPageChange: setPage,
              onPageSizeChange: (s) => { setPageSize(s); setPage(0) },
            }}
            serverSort={sort}
            onServerSortChange={(field, dir) => { setSort({ field, dir }); setPage(0) }}
          />
          <p className="text-xs text-muted-foreground">
            سجل‌ها با فیلترهای فعال (اقدام/شرکت/بازه جلالی/جستجو) و {faDigits('صفحه‌بندی سروری')} بازیابی می‌شوند؛
            خروجی CSV همان فیلترها را با کدگذاری UTF-8 (BOM) برای اکسل فارسی اعمال می‌کند.
          </p>
        </div>
      ) : null}

      {tab === 'events' ? (
        <div className="space-y-4">
          <Card className="border-primary/25 bg-primary/5">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Radio className="h-4 w-4 text-primary" />
                باس رویداد درون‌برنامه‌ای — الگوی Outbox
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs leading-6 text-muted-foreground">
                هر اقدام کسب‌وکار (ثبت نامه، ارجاع، قطعی‌سازی سند، تصمیم درخواست، پیوست فایل) یک رویداد در همان تراکنش ثبت می‌کند.
                پردازشگر دوره‌ای هسته زمان‌بند (سرویس ۱۲ سند منبع) رویدادها را تحویل و نشانه‌گذاری می‌کند؛ مصرف‌کننده‌های آینده
                (پیام‌رسان سازمانی، یکپارچه‌سازی‌ها) از همین قرارداد تغذیه می‌شوند بدون تغییر منطق کسب‌وکار.
              </p>
            </CardContent>
          </Card>
          {auditQuery.isLoading ? <LoadingState rows={5} /> : !audit || audit.events.length === 0 ? (
            <EmptyState text="رویدادی ثبت نشده است" />
          ) : (
            <div className="space-y-2">
              {audit.events.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-xs">
                  <Badge variant="secondary" className="border-0 bg-secondary font-mono" dir="ltr">{e.type}</Badge>
                  <span className="truncate text-muted-foreground" dir="ltr">{e.payload.slice(0, 90)}</span>
                  <span className="ms-auto text-muted-foreground">{formatJalali(e.createdAt, true)}</span>
                  {e.processedAt ? (
                    <Badge variant="secondary" className="border-0 bg-emerald-100 text-emerald-700">تحویل‌شده</Badge>
                  ) : (
                    <Badge variant="secondary" className="border-0 bg-amber-100 text-amber-700">در صف</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            مجموع رویدادهای ثبت‌شده: {faNumber(audit?.events.length ?? 0)} مورد در ۴۰ رویداد اخیر · شماره‌گذاری اسناد: {faDigits('ترتیبی سالانه جلالی')}
          </p>
        </div>
      ) : null}

      {tab === 'flags' ? (
        <div className="space-y-3">
          <p className="text-xs leading-6 text-muted-foreground">
            پرچم‌های ویژگی (سرویس ۱۳ سند منبع) فعال‌سازی تدریجی و خاموشی اضطراری قابلیت‌ها را بدون استقرار مجدد ممکن می‌کنند.
            {isAdmin ? ' تغییرات بلافاصله اعمال می‌شود (کش ۱۵ ثانیه).' : ' تغییر فقط توسط مدیر سامانه ممکن است.'}
          </p>
          {gov === null ? <LoadingState rows={3} /> : gov.flags.map((f) => (
            <Card key={f.key}>
              <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-medium" dir="ltr">{f.key}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{f.description}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">آخرین تغییر: {formatJalali(f.updatedAt, true)}</p>
                </div>
                <Switch
                  checked={f.enabled}
                  disabled={!isAdmin || busyFlag === f.key}
                  onCheckedChange={(v) => toggleFlag(f.key, v)}
                  aria-label={`تغییر ${f.key}`}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === 'integrations' ? (
        gov === null ? <LoadingState rows={6} /> : (
          <div className="space-y-6">
            {/* P2-T13 — گزارش هفتگی کارتابل (خلاصه ورود/اقدام/معطل به‌ازای کاربر — فقط مدیر) */}
            <div data-testid="weekly-report-section">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold"><FileText className="h-4 w-4" /> گزارش هفتگی کارتابل نامه‌ها</h3>
              <Card>
                <CardContent className="space-y-3 p-4">
                  {/* کنترل‌ها: بازه (این هفته/هفته گذشته) + آستانه معطلی + دریافت مجدد */}
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">بازه</Label>
                      <Select value={wrPreset} onValueChange={(v) => setWrPreset(v as 'this' | 'last')}>
                        <SelectTrigger className="w-40" aria-label="بازه گزارش"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="this">این هفته (شنبه تا امروز)</SelectItem>
                          <SelectItem value="last">هفته گذشته (شنبه..جمعه)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">آستانه معطلی</Label>
                      <Select value={wrStale} onValueChange={setWrStale}>
                        <SelectTrigger className="w-32" aria-label="آستانه معطلی"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">بدون تحرک (۰ روز)</SelectItem>
                          <SelectItem value="3">بیش از ۳ روز</SelectItem>
                          <SelectItem value="5">بیش از ۵ روز</SelectItem>
                          <SelectItem value="7">بیش از ۷ روز</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" variant="outline" disabled={wrBusy} onClick={() => void loadWeeklyReport()} className="gap-1.5">
                      {wrBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} به‌روزرسانی
                    </Button>
                  </div>

                  {wrErr ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{wrErr}</p> : null}

                  {wrBusy && !wr ? <LoadingState rows={4} /> : null}

                  {wr ? (
                    <>
                      <p className="text-xs leading-6 text-muted-foreground">
                        بازه {wr.fromJalali} تا {wr.toJalali} · {faNumber(wr.scopeCount)} شرکت در دامنه ·
                        {' '}ورود {faNumber(wr.totals.received)} · اقدام {faNumber(wr.totals.acted)} · معطل {faNumber(wr.totals.stuck)}
                      </p>
                      <div className="overflow-x-auto rounded-xl border bg-card" data-testid="weekly-report-table">
                        <table className="w-full text-sm">
                          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                            <tr>
                              <th className="p-3 text-start">کاربر</th>
                              <th className="p-3 text-start">سمت</th>
                              <th className="p-3 text-center">ورود</th>
                              <th className="p-3 text-center">اقدام</th>
                              <th className="p-3 text-center">معطل</th>
                              <th className="p-3 text-start">تفکیک اقدام</th>
                            </tr>
                          </thead>
                          <tbody>
                            {wr.rows.map((r) => (
                              <tr key={r.userId} className="border-b last:border-b-0">
                                <td className="p-3">
                                  {r.fullName}
                                  {!r.isActive ? <Badge variant="secondary" className="ms-2 border-0 bg-secondary">غیرفعال</Badge> : null}
                                </td>
                                <td className="p-3 text-xs text-muted-foreground">{r.jobTitle ?? '—'}</td>
                                <td className="p-3 text-center">{faNumber(r.received)}</td>
                                <td className="p-3 text-center">{faNumber(r.acted)}</td>
                                <td className={`p-3 text-center font-medium ${r.stuck > 0 ? 'text-destructive' : ''}`}>{faNumber(r.stuck)}</td>
                                <td className="p-3 text-xs text-muted-foreground">
                                  {r.actedByKind.REFER + r.actedByKind.ANSWER + r.actedByKind.APPROVE + r.actedByKind.ARCHIVE === 0
                                    ? '—'
                                    : [
                                      r.actedByKind.REFER ? `ارجاع ${faNumber(r.actedByKind.REFER)}` : null,
                                      r.actedByKind.ANSWER ? `پاسخ ${faNumber(r.actedByKind.ANSWER)}` : null,
                                      r.actedByKind.APPROVE ? `تأیید ${faNumber(r.actedByKind.APPROVE)}` : null,
                                      r.actedByKind.ARCHIVE ? `بایگانی ${faNumber(r.actedByKind.ARCHIVE)}` : null,
                                    ].filter(Boolean).join(' · ')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* خروجی‌ها: رونوشت MD / دانلود / چاپ (معیار پذیرش T13: خروجی MD/چاپ ساده) */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => void copyWeeklyReport()} className="gap-1.5">
                          <ClipboardCopy className="h-3.5 w-3.5" /> رونوشت Markdown
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void downloadWeeklyReport()} className="gap-1.5">
                          <Download className="h-3.5 w-3.5" /> دانلود .md
                        </Button>
                        <Button size="sm" onClick={printWeeklyReport} className="gap-1.5">
                          <Printer className="h-3.5 w-3.5" /> چاپ گزارش
                        </Button>
                      </div>
                      <details className="rounded-xl border bg-muted/30">
                        <summary className="cursor-pointer select-none p-3 text-xs font-medium text-muted-foreground">متن Markdown گزارش</summary>
                        <pre className="thin-scrollbar overflow-x-auto border-t p-3 text-[11px] leading-6" dir="rtl" data-testid="weekly-report-md">{wr.markdown}</pre>
                      </details>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            {/* وضعیت زمان‌بند */}
            <div>
              <h3 className="mb-2 text-sm font-bold">هسته زمان‌بند (Scheduler)</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {gov.jobs.map((j) => (
                  <Card key={j.key}>
                    <CardContent className="space-y-1.5 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold">{j.name}</p>
                        {j.lastStatus === 'OK' ? (
                          <Badge variant="secondary" className="border-0 bg-emerald-100 text-emerald-700">سالم</Badge>
                        ) : j.lastStatus === 'ERROR' ? (
                          <Badge variant="secondary" className="border-0 bg-red-100 text-red-700">خطا</Badge>
                        ) : (
                          <Badge variant="secondary" className="border-0 bg-secondary">در انتظار اولین اجرا</Badge>
                        )}
                      </div>
                      <p className="font-mono text-[10px] text-muted-foreground" dir="ltr">{j.key} · هر {j.intervalSec} ثانیه</p>
                      <p className="text-xs text-muted-foreground">
                        {j.lastRunAt ? `آخرین اجرا: ${formatJalali(j.lastRunAt, true)} — ${j.note ?? ''}` : j.note ?? '—'}
                      </p>
                      {j.lastError ? <p className="text-xs text-destructive" dir="ltr">{j.lastError}</p> : null}
                      {isAdmin ? (
                        <Button size="sm" variant="outline" disabled={busyJob === j.key} onClick={() => void runJob(j.key)} className="mt-1 gap-1.5">
                          {busyJob === j.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} اجرای دستی
                        </Button>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* کانکتورها */}
            <div>
              <h3 className="mb-2 text-sm font-bold">کانکتورهای یکپارچه‌سازی (Integration Bus)</h3>
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3 text-start">کانکتور</th>
                      <th className="p-3 text-start">نوع</th>
                      <th className="p-3 text-start">جهت</th>
                      <th className="p-3 text-start">وضعیت</th>
                      <th className="p-3 text-start hidden md:table-cell">یادداشت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gov.connectors.map((c) => (
                      <tr key={c.code} className="border-b last:border-b-0">
                        <td className="p-3 text-xs font-medium">{c.name}<span className="block font-mono text-[10px] text-muted-foreground" dir="ltr">{c.code}</span></td>
                        <td className="p-3 text-xs text-muted-foreground">{KIND_FA[c.kind] ?? c.kind}</td>
                        <td className="p-3 text-xs text-muted-foreground">{DIRECTION_FA[c.direction] ?? c.direction}</td>
                        <td className="p-3 text-xs">
                          <Badge variant="secondary" className="border-0 bg-amber-100 text-amber-700">{STATUS_FA[c.status] ?? c.status}</Badge>
                        </td>
                        <td className="hidden p-3 text-[11px] text-muted-foreground md:table-cell">{c.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* کاتالوگ گزارش‌ها */}
            <div>
              <h3 className="mb-2 text-sm font-bold">کاتالوگ گزارش‌ها (Reporting Metadata)</h3>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {gov.reports.map((r) => (
                  <div key={r.code} className="flex items-center gap-2 rounded-xl border bg-card p-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground" dir="ltr">{r.code} · {r.moduleCode}</p>
                    </div>
                    <Badge variant="secondary" className="border-0 bg-secondary">{CATEGORY_FA[r.category] ?? r.category}</Badge>
                    {r.engine === 'AI' ? <Badge variant="secondary" className="border-0 bg-primary/10 text-primary">AI</Badge> : null}
                  </div>
                ))}
              </div>
            </div>

            {/* مصرف AI */}
            <div>
              <h3 className="mb-2 text-sm font-bold">مصرف دروازه هوش مصنوعی (AI Gateway)</h3>
              {gov.aiInvocations.length === 0 ? (
                <EmptyState text="هنوز فراخوانی مدل ثبت نشده است" />
              ) : (
                <div className="overflow-x-auto rounded-xl border bg-card">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="p-3 text-start">زمان</th>
                        <th className="p-3 text-start">وظیفه</th>
                        <th className="p-3 text-start">تأمین‌کننده</th>
                        <th className="p-3 text-start">تأخیر</th>
                        <th className="p-3 text-start">نتیجه</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gov.aiInvocations.map((i, idx) => (
                        <tr key={idx} className="border-b last:border-b-0">
                          <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">{formatJalali(i.createdAt, true)}</td>
                          <td className="p-3 font-mono text-[11px]" dir="ltr">{i.task}</td>
                          <td className="p-3 text-xs text-muted-foreground" dir="ltr">{i.provider}</td>
                          <td className="p-3 text-xs text-muted-foreground" dir="ltr">{faNumber(i.latencyMs)} ms</td>
                          <td className="p-3 text-xs">
                            {i.ok ? <Badge variant="secondary" className="border-0 bg-emerald-100 text-emerald-700">موفق</Badge>
                              : <Badge variant="secondary" className="border-0 bg-red-100 text-red-700">{i.error?.slice(0, 40) ?? 'خطا'}</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      ) : null}

      {/* P2-T13 — پورتال چاپ گزارش: فقط حین چاپ در body رندر می‌شود (در نمایش مخفی) */}
      {wrPrinting && wr ? <WeeklyReportPrintPortal wr={wr} meName={me?.user.fullName ?? ''} /> : null}
    </div>
  )
}

// P2-T13 — پورتال چاپ گزارش هفتگی (الگوی U7: فرزند body؛ در نمایش مخفی، در چاپ تنها محتوای صفحه)
// فقط هنگام wrPrinting رندر می‌شود؛ afterprint (یا خروج مسیر چاپ) حالت را برمی‌گرداند.
function WeeklyReportPrintPortal({ wr, meName }: { wr: WeeklyReportData; meName: string }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="report-print-root" aria-label="نسخه چاپی گزارش هفتگی کارتابل">
      <h1 className="mb-2 text-[16pt] font-bold">گزارش هفتگی کارتابل نامه‌ها</h1>
      <p className="mb-1 text-[11pt]">بازه: {wr.fromJalali} تا {wr.toJalali} · آستانه معطلی: {faDigits(wr.staleDays)} روز</p>
      <table>
        <thead>
          <tr>
            <th>کاربر</th><th>سمت</th><th>ورود</th><th>اقدام</th><th>معطل</th><th>تفکیک اقدام</th>
          </tr>
        </thead>
        <tbody>
          {wr.rows.map((r) => (
            <tr key={r.userId}>
              <td>{r.fullName}{r.isActive ? '' : ' (غیرفعال)'}</td>
              <td>{r.jobTitle ?? '—'}</td>
              <td style={{ textAlign: 'center' }}>{faNumber(r.received)}</td>
              <td style={{ textAlign: 'center' }}>{faNumber(r.acted)}</td>
              <td style={{ textAlign: 'center' }}>{faNumber(r.stuck)}</td>
              <td>
                {r.actedByKind.REFER + r.actedByKind.ANSWER + r.actedByKind.APPROVE + r.actedByKind.ARCHIVE === 0
                  ? '—'
                  : [
                    r.actedByKind.REFER ? `ارجاع ${faNumber(r.actedByKind.REFER)}` : null,
                    r.actedByKind.ANSWER ? `پاسخ ${faNumber(r.actedByKind.ANSWER)}` : null,
                    r.actedByKind.APPROVE ? `تأیید ${faNumber(r.actedByKind.APPROVE)}` : null,
                    r.actedByKind.ARCHIVE ? `بایگانی ${faNumber(r.actedByKind.ARCHIVE)}` : null,
                  ].filter(Boolean).join(' · ')}
              </td>
            </tr>
          ))}
          <tr>
            <td className="font-bold">جمع</td><td />
            <td style={{ textAlign: 'center' }} className="font-bold">{faNumber(wr.totals.received)}</td>
            <td style={{ textAlign: 'center' }} className="font-bold">{faNumber(wr.totals.acted)}</td>
            <td style={{ textAlign: 'center' }} className="font-bold">{faNumber(wr.totals.stuck)}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <p className="report-print-footer">
        سامانه ideaONE · تولید توسط {meName} · {formatJalali(new Date(), true)}
      </p>
    </div>,
    document.body,
  )
}
