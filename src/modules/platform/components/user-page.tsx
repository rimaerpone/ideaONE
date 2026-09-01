'use client'

/**
 * صفحه رکورد کاربر (P1.5-T13) — جایگزین دیالوگ‌های users-admin (ایجاد/ویرایش/بازنشانی/غیرفعال).
 * الگوی «صفحه رکورد ERP» با RecordPageShell:
 *   هدر (نام + نشان‌ها) ← شناسنامه ← نوار اقدام ← تب داخلی (مشخصات / امنیت) ← فوتر چسبان.
 * - تب «کاربر جدید»: فرم ایجاد → پس از ثبت، جامه‌ویژه به تب رکورد کاربر تبدیل می‌شود.
 * - تب رکورد: ویرایش مشخصات + ماتریس عضویت چندشرکتی + بازنشانی گذرواژه + فعال/غیرفعال‌سازی.
 * تب‌های داخلی با hidden سوییچ می‌شوند (نه unmount) تا حالت فرم در جابه‌جایی حفظ شود.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '@/store/app'
import { useWorkspace, type WorkspaceTab } from '@/store/workspace'
import { useRecordInnerTab } from '@/hooks/use-record-inner-tab'
import { useDirtyTracking } from '@/hooks/use-dirty-tracking'
import { apiGet, apiPost } from '@/core/shared/api-client'
import type { UserItem } from '@/types/platform'
import { ROLE_LABELS } from '@/components/common/ui-bits'
import { RecordPageShell } from '@/components/common/record-page-shell'
import { FormSection } from '@/components/common/form-section'
import { KbdHint, PasswordInput, PasswordStrength } from '@/components/common/form-bits'
import { RestoredDraftBanner, AutosaveIndicator } from '@/components/common/draft-banner'
import { clearDraft, draftKey, readDraft, writeDraft } from '@/hooks/use-draft'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { RecordTimeline } from '@/components/common/record-timeline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KeyRound, Loader2, Save, ShieldCheck, UserRoundCheck, UserRoundX } from 'lucide-react'
import { faDigits } from '@/core/shared/jalali'
import { toastOk, toastErr } from '@/hooks/use-toast'

type CompanyOption = { id: string; code: string; name: string; type: string }
type MembershipRow = { companyId: string; role: string }
type Errors = Record<string, string>

const ROLE_OPTIONS = ['ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER']

export function UserPage({ tab }: { tab: WorkspaceTab }) {
  const me = useApp((s) => s.me)
  const activeCompany = me?.companies.find((c) => c.id === me.activeCompanyId)
  const canManage = !!me?.user.isAdmin || activeCompany?.role === 'ADMIN'
  const isNew = tab.recordId === 'new'
  // رکوردِ خود کاربر: غیرفعال‌سازی ممنوع (خروج از حساب از «حساب من»)
  const isSelf = !!me && tab.recordId === me.user.id

  const [user, setUser] = useState<UserItem | null>(null)
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // U10 — ماندگاری تب داخلی per رکورد + deep-link (?t=)
  const [innerTab, setInnerTab] = useRecordInnerTab('users', isNew ? null : tab.recordId, [{ key: 'profile' }, { key: 'security' }, { key: 'timeline' }])

  const setTabTitle = useWorkspace((s) => s.setTabTitle)
  const closeTab = useWorkspace((s) => s.closeTab)
  const materializeTab = useWorkspace((s) => s.materializeTab)

  // ---------- فرم ایجاد ----------
  const [f, setF] = useState({ username: '', fullName: '', jobTitle: '', password: '', isAdmin: false })
  const [fMemberships, setFMemberships] = useState<MembershipRow[]>([])
  const [fErrors, setFErrors] = useState<Errors>({})

  // ---------- فرم ویرایش ----------
  const [eF, setEF] = useState({ fullName: '', jobTitle: '', isAdmin: false, isActive: true })
  const [eMemberships, setEMemberships] = useState<MembershipRow[]>([])

  // ---------- امنیت ----------
  const [newPw, setNewPw] = useState('')
  const [pwErr, setPwErr] = useState<string | null>(null)
  const [confirmToggle, setConfirmToggle] = useState(false)

  // بررسی عمیق فرم‌ها — ۱۴۰۵/۰۶: پیش‌نویس فرم ایجاد (ماتریس عضویت بازسازی‌پرهزینه است)
  const createDraftKey = draftKey('users-new', me?.activeCompanyId)
  const [draftRestoredAt, setDraftRestoredAt] = useState<number | null>(null)
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null)
  const draftHydrated = useRef(false)
  // بررسی عمیق فرم‌ها — dirty tracking ویرایش: مقایسه با مقادیر بارگذاری‌شده
  const loadedRef = useRef<{ fullName: string; jobTitle: string; isAdmin: boolean; memberships: MembershipRow[] } | null>(null)
  const [confirmCloseEdit, setConfirmCloseEdit] = useState(false)

  // بازیابی یک‌باره پیش‌نویس فرم ایجاد (فقط تب «کاربر جدید»)
  useEffect(() => {
    if (!isNew) { draftHydrated.current = true; return }
    const d = readDraft<{ f: typeof f; m: MembershipRow[] }>(createDraftKey)
    if (d?.values && (d.values.f?.username || d.values.f?.fullName || d.values.f?.password)) {
      setF(d.values.f)
      if (d.values.m?.length) setFMemberships(d.values.m)
      setDraftRestoredAt(d.savedAt)
    }
    draftHydrated.current = true
  }, [isNew])

  // ذخیره خودکار debounced فرم ایجاد
  useEffect(() => {
    if (!isNew || !draftHydrated.current) return
    const t = setTimeout(() => {
      const at = writeDraft(createDraftKey, { f, m: fMemberships })
      if (at !== null) setDraftSavedAt(at)
    }, 700)
    return () => clearTimeout(t)
  }, [f, fMemberships, isNew, createDraftKey])

  // شرکت‌ها برای فرم ایجاد (ماتریس عضویت) — پیش‌فرض فقط وقتی پیش‌نویسی بازیابی نشده
  useEffect(() => {
    if (isNew && canManage) {
      apiGet<{ companies: CompanyOption[] }>('/api/platform/companies')
        .then((d) => {
          setCompanies(d.companies)
          if (d.companies.length && fMemberships.length === 0) setFMemberships([{ companyId: d.companies[0].id, role: 'OPERATOR' }])
        })
        .catch(() => setCompanies([]))
    }
  }, [isNew, canManage])

  // بارگذاری رکورد + شرکت‌ها (برای ویرایش ماتریس عضویت)
  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [d, c] = await Promise.all([
        apiGet<{ users: UserItem[] }>('/api/users'),
        canManage
          ? apiGet<{ companies: CompanyOption[] }>('/api/platform/companies')
          : Promise.resolve({ companies: [] as CompanyOption[] }),
      ])
      const u = d.users.find((x) => x.id === tab.recordId)
      if (!u) throw new Error('کاربر در دامنه دید شما یافت نشد')
      setUser(u)
      setCompanies(c.companies)
      setTabTitle(tab.id, u.fullName)
      setEF({ fullName: u.fullName, jobTitle: u.jobTitle ?? '', isAdmin: u.isAdmin, isActive: u.isActive })
      const byCode = new Map(c.companies.map((x) => [x.code, x.id]))
      const rows = u.companies
        .map((x) => ({ companyId: byCode.get(x.code) ?? '', role: x.role }))
        .filter((m) => m.companyId)
      setEMemberships(rows)
      loadedRef.current = { fullName: u.fullName, jobTitle: u.jobTitle ?? '', isAdmin: u.isAdmin, memberships: rows }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'خطای بارگذاری')
    } finally {
      setLoading(false)
    }
  }, [tab.recordId, tab.id, canManage, setTabTitle])

  useEffect(() => {
    if (!isNew) void load()
  }, [isNew, load])

  // بررسی عمیق فرم‌ها — dirty tracking ویرایش: آیا فرم از مقادیر بارگذاری‌شده فاصله گرفته؟
  const editDirty = useMemo(() => {
    const snap = loadedRef.current
    if (!snap || !user) return false
    const sameMemberships = snap.memberships.length === eMemberships.length
      && snap.memberships.every((m, i) => m.companyId === eMemberships[i]?.companyId && m.role === eMemberships[i]?.role)
    return snap.fullName !== eF.fullName
      || snap.jobTitle !== eF.jobTitle
      || snap.isAdmin !== eF.isAdmin
      || !sameMemberships
  }, [eF, eMemberships, user])

  // P2.5-U10 — گارد بستن تب کثیف (ادغام با گارد انصراف موجود؛ ایجاد = dirty تا ثبت شود)
  useDirtyTracking(tab.id, isNew ? true : editDirty, isNew ? 'فرم ایجاد کاربر (پیش‌نویس دارد)' : 'فرم ویرایش کاربر')

  // ---------- ایجاد ----------
  const submitCreate = async () => {
    const errors: Errors = {}
    if (!f.username.trim()) errors.username = 'نام کاربری الزامی است'
    else if (!/^[a-zA-Z0-9._-]{3,32}$/.test(f.username.trim())) errors.username = '۳ تا ۳۲ نویسه لاتین/رقم/نقطه/خط تیره'
    if (!f.fullName.trim() || f.fullName.trim().length < 3) errors.fullName = 'نام کامل حداقل ۳ نویسه'
    if (f.password.length < 8) errors.password = 'دست‌کم ۸ نویسه'
    else if (!/[A-Za-zآ-ی]/.test(f.password) || !/[0-9۰-۹]/.test(f.password)) errors.password = 'ترکیب حروف و اعداد الزامی است'
    else if (f.username.trim().length >= 3 && f.password.toLowerCase().includes(f.username.trim().toLowerCase())) errors.password = 'شامل نام کاربری نباشد'
    if (fMemberships.length === 0) errors.memberships = 'حداقل یک عضویت'
    setFErrors(errors)
    if (Object.keys(errors).length) return

    setBusy(true)
    try {
      const d = await apiPost<{ id: string }>('/api/users', {
        username: f.username.trim(),
        fullName: f.fullName.trim(),
        jobTitle: f.jobTitle.trim() || undefined,
        isAdmin: f.isAdmin,
        password: f.password,
        memberships: fMemberships,
      })
      toastOk({ title: 'کاربر ایجاد شد', description: `${f.fullName.trim()} (${f.username.trim()}) با ${faDigits(fMemberships.length)} عضویت` })
      clearDraft(createDraftKey) // پیش‌نویس پس از ایجاد موفق پاک می‌شود
      // جامه‌ویژه: تب «کاربر جدید» → تب رکورد کاربر تازه‌ساخت
      materializeTab(tab.id, d.id, f.fullName.trim())
    } catch (e) {
      toastErr({ title: 'ایجاد کاربر ناموفق بود', description: e instanceof Error ? e.message : 'خطای نامشخص' })
    } finally {
      setBusy(false)
    }
  }

  // ---------- ویرایش ----------
  const submitEdit = async () => {
    if (!user) return
    if (!eF.fullName.trim() || eF.fullName.trim().length < 3) {
      toastErr({ description: 'نام کامل حداقل ۳ نویسه باشد' })
      return
    }
    setBusy(true)
    try {
      await apiPost(`/api/users/${user.id}`, {
        fullName: eF.fullName.trim(),
        jobTitle: eF.jobTitle.trim() || null,
        isAdmin: eF.isAdmin,
        isActive: eF.isActive,
        memberships: eMemberships,
      }, 'PATCH')
      toastOk({ title: 'کاربر به‌روزرسانی شد', description: eF.fullName.trim() })
      await load()
    } catch (e) {
      toastErr({ title: 'به‌روزرسانی ناموفق بود', description: e instanceof Error ? e.message : 'خطای نامشخص' })
    } finally {
      setBusy(false)
    }
  }

  // ---------- بازنشانی گذرواژه ----------
  const submitReset = async () => {
    if (!user) return
    if (newPw.length < 8 || !/[A-Za-zآ-ی]/.test(newPw) || !/[0-9۰-۹]/.test(newPw)) {
      setPwErr('دست‌کم ۸ نویسه با ترکیب حروف و اعداد')
      return
    }
    if (newPw.toLowerCase().includes(user.username.toLowerCase())) {
      setPwErr('گذرواژه نباید شامل نام کاربری باشد')
      return
    }
    setPwErr(null)
    setBusy(true)
    try {
      await apiPost(`/api/users/${user.id}/reset-password`, { password: newPw })
      toastOk({ title: 'گذرواژه بازنشانی شد', description: `همه نشست‌های ${user.fullName} پایان یافت — ورود دوباره با گذرواژه جدید الزامی است` })
      setNewPw('')
    } catch (e) {
      toastErr({ title: 'بازنشانی ناموفق بود', description: e instanceof Error ? e.message : 'خطای نامشخص' })
    } finally {
      setBusy(false)
    }
  }

  // ---------- فعال/غیرفعال ----------
  const submitToggleActive = async () => {
    if (!user) return
    setBusy(true)
    try {
      await apiPost(`/api/users/${user.id}`, { isActive: !user.isActive }, 'PATCH')
      toastOk({
        title: user.isActive ? 'کاربر غیرفعال شد' : 'کاربر فعال شد',
        description: user.isActive
          ? `${user.fullName} دیگر نمی‌تواند وارد شود و نشست‌هایش پایان یافت`
          : `${user.fullName} می‌تواند دوباره وارد شود`,
      })
      setConfirmToggle(false)
      setEF((x) => ({ ...x, isActive: !user.isActive }))
      await load()
    } catch (e) {
      toastErr({ title: 'تغییر وضعیت ناموفق بود', description: e instanceof Error ? e.message : 'خطای نامشخص' })
    } finally {
      setBusy(false)
    }
  }

  // ================= فرم ایجاد =================
  const discardCreateDraft = () => {
    clearDraft(createDraftKey)
    setF({ username: '', fullName: '', jobTitle: '', password: '', isAdmin: false })
    if (companies.length) setFMemberships([{ companyId: companies[0].id, role: 'OPERATOR' }])
    setDraftRestoredAt(null)
    setDraftSavedAt(null)
  }

  // بررسی عمیق فرم‌ها — Ctrl+Enter = ایجاد کاربر
  const onCreateKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void submitCreate()
    }
  }

  if (isNew) {
    return (
      <RecordPageShell
        viewKey="users"
        icon="Users"
        title="ثبت کاربر جدید"
        badges={f.isAdmin ? <Badge className="border-0 bg-primary/10 text-primary">مدیر پلتفرم</Badge> : undefined}
        info={[
          { label: 'نام کامل', value: f.fullName.trim() || '—' },
          { label: 'نام کاربری', value: f.username.trim() ? <span dir="ltr" className="font-mono text-xs">{f.username.trim()}</span> : '—' },
          { label: 'عضویت‌های شرکتی', value: fMemberships.length ? `${faDigits(fMemberships.length)} شرکت` : '—' },
          { label: 'نقش پلتفرم', value: f.isAdmin ? 'مدیر پلتفرم' : 'کاربر عادی' },
        ]}
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => closeTab(tab.id)} disabled={busy}>انصراف و بستن تب</Button>
            <Button type="submit" form="new-user-form" disabled={busy || !canManage} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ایجاد کاربر
            </Button>
            <span className="ms-auto flex items-center gap-3"><KbdHint keys={['Ctrl', 'Enter']} action="ایجاد کاربر" /><AutosaveIndicator lastSavedAt={draftSavedAt} /></span>
          </>
        )}
      >
        {draftRestoredAt !== null ? <RestoredDraftBanner savedAt={draftRestoredAt} onDiscard={discardCreateDraft} /> : null}
        <form
          id="new-user-form"
          noValidate
          onSubmit={(e) => { e.preventDefault(); void submitCreate() }}
          onKeyDown={onCreateKeyDown}
          className="space-y-4"
        >
          {/* P2.5-U1 — سکشن‌بندی ERP: هویت / امنیت / عضویت (الگوی D365 Section) */}
          <FormSection
            title="مشخصات پایه"
            description="هویت ورود و نام نمایشی — نام کاربری پس از ایجاد قابل تغییر نیست"
            cols={2}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="u-username">نام کاربری</Label>
              <Input id="u-username" dir="ltr" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="مثل m.ahmadi" />
              {fErrors.username ? <p className="text-xs text-destructive">{fErrors.username}</p> : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="u-fullname">نام کامل</Label>
              <Input id="u-fullname" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} placeholder="محمد احمدی" />
              {fErrors.fullName ? <p className="text-xs text-destructive">{fErrors.fullName}</p> : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="u-jobtitle">عنوان شغلی (اختیاری)</Label>
              <Input id="u-jobtitle" value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} placeholder="کارشناس انبار" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="u-password">گذرواژه اولیه</Label>
              <PasswordInput
                id="u-password"
                value={f.password}
                onChange={(v) => setF({ ...f, password: v })}
                ariaLabel="گذرواژه اولیه"
              />
              <PasswordStrength pw={f.password} username={f.username} />
              {fErrors.password ? <p className="text-xs text-destructive">{fErrors.password}</p> : null}
              <p className="text-[11px] text-muted-foreground">دست‌کم ۸ نویسه با ترکیب حروف و اعداد؛ کاربر بعد از ورود از «حساب من» آن را تغییر می‌دهد</p>
            </div>
          </FormSection>
          <FormSection
            title="سطح دسترسی سراسری"
            description="مدیر پلتفرم = دسترسی کامل به رجیستری پلاگین‌ها و همه شرکت‌ها"
            cols="free"
          >
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="u-isadmin">مدیر پلتفرم</Label>
                <p className="text-[11px] text-muted-foreground">دسترسی کامل به رجیستری پلاگین‌ها و همه شرکت‌ها</p>
              </div>
              <Switch id="u-isadmin" checked={f.isAdmin} onCheckedChange={(v) => setF({ ...f, isAdmin: v })} />
            </div>
          </FormSection>
          <FormSection
            title="عضویت‌ها و نقش‌ها"
            description="نقش هر کاربر به تفکیک شرکت تعیین می‌شود — یک کاربر می‌تواند در چند شرکت نقش متفاوت داشته باشد"
            cols="free"
          >
            <MembershipEditor companies={companies} rows={fMemberships} onChange={setFMemberships} error={fErrors.memberships} />
          </FormSection>
        </form>
      </RecordPageShell>
    )
  }

  // ================= صفحه رکورد =================
  return (
    <RecordPageShell
      viewKey="users"
      icon="Users"
      title={user?.fullName ?? 'کاربر'}
      loading={loading}
      error={loadError}
      onRetry={() => void load()}
      badges={user ? (
        <>
          <Badge variant="secondary" className="border-0 font-mono text-[10px]" dir="ltr">{user.username}</Badge>
          {user.isAdmin ? <Badge className="border-0 bg-primary/10 text-primary">مدیر پلتفرم</Badge> : null}
          {user.isActive
            ? <Badge variant="secondary" className="border-0 bg-emerald-100 text-emerald-700">فعال</Badge>
            : <Badge variant="secondary" className="border-0 bg-red-100 text-red-700">غیرفعال</Badge>}
        </>
      ) : undefined}
      info={user ? [
        { label: 'نام کاربری', value: <span dir="ltr" className="font-mono text-xs">{user.username}</span> },
        { label: 'عنوان شغلی', value: user.jobTitle ?? '—' },
        { label: 'عضویت‌های شرکتی', value: `${faDigits(user.companies.length)} شرکت` },
        { label: 'وضعیت حساب', value: user.isActive ? 'فعال — امکان ورود' : 'غیرفعال — بدون ورود' },
      ] : undefined}
      actions={canManage && user ? (
        <>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setInnerTab('security')}>
            <KeyRound className="h-3.5 w-3.5" /> بازنشانی گذرواژه
          </Button>
          {!isSelf ? (
            <Button
              variant="outline" size="sm"
              className={`gap-1.5 ${user.isActive ? 'text-destructive hover:text-destructive' : 'text-emerald-600'}`}
              onClick={() => setConfirmToggle(true)}
            >
              {user.isActive ? <UserRoundX className="h-3.5 w-3.5" /> : <UserRoundCheck className="h-3.5 w-3.5" />}
              {user.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
            </Button>
          ) : null}
        </>
      ) : undefined}
      aside={user ? <p className="text-[11px] text-muted-foreground">نقش‌ها per-company تعیین می‌شوند — یک کاربر می‌تواند در چند شرکت نقش متفاوت داشته باشد</p> : undefined}
      innerTabs={canManage ? [
        { key: 'profile', label: 'مشخصات و عضویت‌ها' },
        { key: 'security', label: 'امنیت' },
        { key: 'timeline', label: 'خط زمان' },
      ] : undefined}
      activeInnerTab={innerTab}
      onInnerTabChange={setInnerTab}
      footer={canManage && user ? (
        <>
          <Button
            type="button" variant="outline"
            disabled={busy}
            onClick={() => { if (editDirty) setConfirmCloseEdit(true); else closeTab(tab.id) }}
          >
            انصراف و بستن تب
          </Button>
          <Button type="submit" form="user-edit-form" disabled={busy || !editDirty} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} ذخیره تغییرات
          </Button>
          {!editDirty ? <span className="text-[11px] text-muted-foreground">تغییری ثبت نشده است</span> : <span className="text-[11px] font-medium text-amber-600">تغییرات ذخیره‌نشده دارید</span>}
        </>
      ) : undefined}
    >
      {user ? (
        <>
          {/* تب مشخصات — با hidden نگه داشته می‌شود تا حالت فرم حفظ شود */}
          <div className={innerTab === 'profile' ? '' : 'hidden'}>
            {canManage ? (
              <form
                id="user-edit-form"
                noValidate
                onSubmit={(e) => { e.preventDefault(); void submitEdit() }}
                className="space-y-4"
              >
                <FormSection
                  title="مشخصات کاربر"
                  description={`نام نمایشی و عنوان شغلی — نام کاربری «${user.username}» قابل تغییر نیست (کلید حسابرسی و ارجاع‌ها)`}
                  cols={2}
                >
                  <div className="grid gap-1.5">
                    <Label htmlFor="e-fullname">نام کامل</Label>
                    <Input id="e-fullname" value={eF.fullName} onChange={(e) => setEF({ ...eF, fullName: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="e-jobtitle">عنوان شغلی</Label>
                    <Input id="e-jobtitle" value={eF.jobTitle} onChange={(e) => setEF({ ...eF, jobTitle: e.target.value })} />
                  </div>
                </FormSection>
                <FormSection title="سطح دسترسی سراسری" description="مدیر پلتفرم = دسترسی سراسری به همه شرکت‌ها و رجیستری پلاگین‌ها" cols="free">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <Label htmlFor="e-isadmin">مدیر پلتفرم</Label>
                      <p className="text-[11px] text-muted-foreground">سطح دسترسی سراسری به همه شرکت‌ها و رجیستری پلاگین‌ها</p>
                    </div>
                    <Switch id="e-isadmin" checked={eF.isAdmin} onCheckedChange={(v) => setEF({ ...eF, isAdmin: v })} />
                  </div>
                </FormSection>
                <FormSection title="عضویت‌ها و نقش‌ها" description="نقش به تفکیک شرکت — تغییر نقش، دامنه دید داده همان شرکت را عوض می‌کند" cols="free">
                  <MembershipEditor companies={companies} rows={eMemberships} onChange={setEMemberships} />
                </FormSection>
              </form>
            ) : (
              <div className="rounded-xl border bg-card p-4 sm:p-5">
                <p className="mb-3 text-sm font-bold">عضویت‌های شرکتی</p>
                <div className="flex flex-wrap gap-1.5">
                  {user.companies.map((c) => (
                    <Badge key={c.code} variant="secondary" className="border-0">{c.name} · {ROLE_LABELS[c.role] ?? c.role}</Badge>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">ویرایش کاربران نیازمند نقش مدیر (شرکت فعال یا پلتفرم) است.</p>
              </div>
            )}
          </div>

          {/* تب امنیت */}
          {canManage ? (
            <div className={innerTab === 'security' ? 'space-y-4' : 'hidden space-y-4'}>
              <div className="rounded-xl border bg-card p-4 sm:p-5">
                <p className="mb-1 flex items-center gap-1.5 text-sm font-bold"><KeyRound className="h-4 w-4 text-primary" /> بازنشانی گذرواژه</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  گذرواژه جدید را مستقیم به کاربر اعلام کنید — همه نشست‌های فعال او بلافاصله پایان می‌یابد.
                </p>
                <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-start">
                  <PasswordInput
                    value={newPw}
                    onChange={(v) => { setNewPw(v); if (pwErr) setPwErr(null) }}
                    placeholder="گذرواژه جدید"
                    ariaLabel="گذرواژه جدید"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitReset() } }}
                  />
                  <Button onClick={() => void submitReset()} disabled={busy || newPw.length < 8} className="shrink-0 gap-1.5">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} بازنشانی
                  </Button>
                </div>
                <div className="mt-1.5 max-w-md"><PasswordStrength pw={newPw} username={user.username} /></div>
                {pwErr ? <p className="mt-1.5 text-xs text-destructive">{pwErr}</p> : null}
                <p className="mt-1.5 text-[11px] text-muted-foreground">دست‌کم ۸ نویسه با ترکیب حروف و اعداد؛ شامل نام کاربری نباشد</p>
              </div>

              <div className="rounded-xl border bg-card p-4 sm:p-5">
                <p className="mb-1 flex items-center gap-1.5 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-primary" /> وضعیت حساب</p>
                <p className="text-xs leading-6 text-muted-foreground">
                  {user.isActive
                    ? 'کاربر فعال است و می‌تواند وارد شود. با غیرفعال‌سازی، همه نشست‌های او پایان می‌یابد و سابقه حسابرسی‌اش محفوظ می‌ماند.'
                    : 'کاربر غیرفعال است و نمی‌تواند وارد شود. با فعال‌سازی، همان نام کاربری و گذرواژه دوباره قابل استفاده است.'}
                </p>
                {!isSelf ? (
                  <Button
                    variant={user.isActive ? 'destructive' : 'default'}
                    size="sm"
                    className="mt-3 gap-1.5"
                    onClick={() => setConfirmToggle(true)}
                    disabled={busy}
                  >
                    {user.isActive ? <UserRoundX className="h-4 w-4" /> : <UserRoundCheck className="h-4 w-4" />}
                    {user.isActive ? 'غیرفعال‌سازی کاربر' : 'فعال‌سازی کاربر'}
                  </Button>
                ) : (
                  <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
                    غیرفعال‌سازی حساب خودتان از «حساب من» انجام می‌شود.
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {/* P2.5-U5 — تب خط زمان: سجل حسابرسی همین کاربر (ایجاد/ویرایش/بازنشانی/…) */}
          {innerTab === 'timeline' ? <RecordTimeline entity="user" recordId={user.id} /> : null}
        </>
      ) : null}

      {/* تأیید فعال/غیرفعال — تنها دیالوگ مجاز (تأییدیه) */}
      <ConfirmDialog
        open={confirmToggle}
        onOpenChange={setConfirmToggle}
        title={user?.isActive ? `غیرفعال‌سازی ${user?.fullName}` : `فعال‌سازی ${user?.fullName}`}
        description={user?.isActive
          ? 'کاربر دیگر نمی‌تواند وارد شود و همه نشست‌های فعال او بلافاصله پایان می‌یابد. سابقه حسابرسی او محفوظ می‌ماند.'
          : 'کاربر می‌تواند دوباره با همان نام کاربری و گذرواژه وارد شود.'}
        confirmLabel={user?.isActive ? 'غیرفعال کن' : 'فعال کن'}
        destructive={!!user?.isActive}
        busy={busy}
        onConfirm={() => void submitToggleActive()}
      />

      {/* بررسی عمیق فرم‌ها — بستن تب با تغییرات ذخیره‌نشده ویرایش کاربر */}
      <ConfirmDialog
        open={confirmCloseEdit}
        onOpenChange={setConfirmCloseEdit}
        destructive
        title="بستن تب با تغییرات ذخیره‌نشده؟"
        description="تغییرات مشخصات یا ماتریس عضویت هنوز ذخیره نشده است و با بستن تب از دست می‌رود."
        confirmLabel="بله، بستن بدون ذخیره"
        onConfirm={() => { setConfirmCloseEdit(false); closeTab(tab.id) }}
      />
    </RecordPageShell>
  )
}

/** ویرایشگر ماتریس عضویت: هر ردیف = شرکت + نقش؛ افزودن/حذف ردیف (از users-admin منتقل شد) */
function MembershipEditor({
  companies,
  rows,
  onChange,
  error,
}: {
  companies: CompanyOption[]
  rows: MembershipRow[]
  onChange: (rows: MembershipRow[]) => void
  error?: string
}) {
  const usedCompanyIds = new Set(rows.map((r) => r.companyId))
  const available = companies.filter((c) => !usedCompanyIds.has(c.id))

  const addRow = () => {
    if (!available.length) return
    onChange([...rows, { companyId: available[0].id, role: 'VIEWER' }])
  }

  const nameById = new Map(companies.map((c) => [c.id, c.name]))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>عضویت‌های شرکتی</Label>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addRow} disabled={!available.length}>
          افزودن عضویت
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">هیچ عضویتی انتخاب نشده — حداقل یک شرکت الزامی است</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select
                value={row.companyId}
                onValueChange={(v) => {
                  const next = [...rows]
                  next[i] = { ...row, companyId: v }
                  onChange(next)
                }}
              >
                <SelectTrigger className="flex-1" dir="rtl"><SelectValue placeholder="شرکت" /></SelectTrigger>
                <SelectContent>
                  {companies.filter((c) => c.id === row.companyId || !usedCompanyIds.has(c.id)).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={row.role}
                onValueChange={(v) => {
                  const next = [...rows]
                  next[i] = { ...row, role: v }
                  onChange(next)
                }}
              >
                <SelectTrigger className="w-36" dir="rtl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button" variant="ghost" size="sm"
                className="h-8 w-8 shrink-0 text-destructive"
                aria-label={`حذف عضویت ${nameById.get(row.companyId) ?? ''}`}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
