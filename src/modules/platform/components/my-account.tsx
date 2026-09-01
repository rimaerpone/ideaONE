'use client'

// P1-T6/T7/T8: حساب من — پروفایل (نام/عنوان شغلی)، تغییر گذرواژه (سیاست ۸ نویسه +
// ابطال نشست‌های دیگر) و مدیریت دستگاه‌های فعال (خروج از همه)

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '@/store/app'
import { apiGet, apiPost } from '@/core/shared/api-client'
import { PageHeader, LoadingState } from '@/components/common/ui-bits'
import { PasswordInput, PasswordStrength } from '@/components/common/form-bits'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Check, UserRound, KeyRound, MonitorSmartphone, Loader2, LogOut, LogOutIcon } from 'lucide-react'
import { formatJalali, faNumber } from '@/core/shared/jalali'
import { toastOk, toastErr } from '@/hooks/use-toast'

type SessionRow = {
  id: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  ip: string | null
  userAgent: string | null
  device: string
  isCurrent: boolean
  companyCode: string | null
}

export function MyAccountView() {
  const me = useApp((s) => s.me)
  const refreshMe = useApp((s) => s.refreshMe)
  const logout = useApp((s) => s.logout)

  const [fullName, setFullName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})
  const [savingPw, setSavingPw] = useState(false)

  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false)
  const [busyRevoke, setBusyRevoke] = useState(false)
  const [busyRevokeOthers, setBusyRevokeOthers] = useState(false)

  useEffect(() => {
    if (me) {
      setFullName(me.user.fullName)
      setJobTitle(me.user.jobTitle ?? '')
    }
  }, [me])

  // بررسی عمیق فرم‌ها — ۱۴۰۵/۰۶: dirty tracking پروفایل + شاخص زنده مطابقت تکرار گذرواژه
  const profileDirty = useMemo(
    () => !!me && (fullName.trim() !== me.user.fullName || jobTitle.trim() !== (me.user.jobTitle ?? '')),
    [me, fullName, jobTitle],
  )
  const confirmMatch = pw.confirm.length > 0 && pw.confirm === pw.next
  const confirmMismatch = pw.confirm.length > 0 && pw.confirm !== pw.next

  const loadSessions = useCallback(() => {
    apiGet<{ sessions: SessionRow[] }>('/api/auth/sessions').then((d) => setSessions(d.sessions)).catch(() => setSessions([]))
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])

  // ---------- پروفایل ----------
  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      await apiPost('/api/auth/profile', { fullName: fullName.trim(), jobTitle: jobTitle.trim() || null }, 'PATCH')
      toastOk({ title: 'پروفایل به‌روزرسانی شد', description: 'نام و عنوان شغلی شما ذخیره شد' })
      refreshMe?.()
    } catch (e) {
      toastErr({ title: 'ذخیره ناموفق بود', description: e instanceof Error ? e.message : 'خطای نامشخص' })
    } finally {
      setSavingProfile(false)
    }
  }

  // ---------- تغییر گذرواژه ----------
  const submitPassword = async () => {
    const errors: Record<string, string> = {}
    if (!pw.current) errors.current = 'گذرواژه فعلی الزامی است'
    if (pw.next.length < 8) errors.next = 'دست‌کم ۸ نویسه'
    else if (!/[A-Za-zآ-ی]/.test(pw.next) || !/[0-9۰-۹]/.test(pw.next)) errors.next = 'ترکیب حروف و اعداد الزامی است'
    else if (pw.next === pw.current) errors.next = 'باید با گذرواژه فعلی متفاوت باشد'
    else if (me && pw.next.toLowerCase().includes(me.user.username.toLowerCase())) errors.next = 'شامل نام کاربری نباشد'
    if (pw.confirm !== pw.next) errors.confirm = 'تکرار گذرواژه مطابقت ندارد'
    setPwErrors(errors)
    if (Object.keys(errors).length) return

    setSavingPw(true)
    try {
      await apiPost('/api/auth/change-password', { currentPassword: pw.current, newPassword: pw.next })
      toastOk({
        title: 'گذرواژه تغییر کرد',
        description: 'همه دستگاه‌های دیگر از حساب شما خارج شدند — این دستگاه دسترسی خود را نگه می‌دارد',
      })
      setPw({ current: '', next: '', confirm: '' })
      loadSessions()
    } catch (e) {
      toastErr({ title: 'تغییر گذرواژه ناموفق بود', description: e instanceof Error ? e.message : 'خطای نامشخص' })
    } finally {
      setSavingPw(false)
    }
  }

  // ---------- خروج از همه دستگاه‌ها ----------
  const revokeAll = async () => {
    setBusyRevoke(true)
    try {
      const res = await apiPost<{ revoked: number }>('/api/auth/sessions', { exceptCurrent: false }, 'DELETE')
      setConfirmRevokeAll(false)
      toastOk({
        title: 'از همه دستگاه‌ها خارج شدید',
        description: `${faNumber(res.revoked)} نشست پایان یافت — به‌زودی به صفحه ورود بازمی‌گردید`,
      })
      // نشست جاری هم باطل شده — خروج کلاینت و بازگشت به صفحه ورود
      setTimeout(() => logout(), 900)
    } catch (e) {
      toastErr({ title: 'پایان نشست‌ها ناموفق بود', description: e instanceof Error ? e.message : 'خطای نامشخص' })
      setBusyRevoke(false)
    }
  }

  // ---------- خروج از سایر دستگاه‌ها (جز همین دستگاه) ----------
  const revokeOthers = async () => {
    setBusyRevokeOthers(true)
    try {
      const res = await apiPost<{ revoked: number }>('/api/auth/sessions', { exceptCurrent: true }, 'DELETE')
      toastOk({
        title: 'سایر دستگاه‌ها خارج شدند',
        description: `${faNumber(res.revoked)} نشست پایان یافت — این دستگاه دسترسی خود را نگه می‌دارد`,
      })
      loadSessions()
    } catch (e) {
      toastErr({ title: 'پایان نشست‌ها ناموفق بود', description: e instanceof Error ? e.message : 'خطای نامشخص' })
    } finally {
      setBusyRevokeOthers(false)
    }
  }

  if (!me) return <LoadingState rows={4} />

  return (
    <div className="space-y-5">
      <PageHeader
        title="حساب من"
        description="پروفایل، تغییر گذرواژه و دستگاه‌های فعال — اعلان‌های امنیتی ورود از دستگاه جدید هم اینجا قابل پیگیری است"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* پروفایل */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><UserRound className="h-4 w-4 text-primary" /> پروفایل</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="p-fullname">نام کامل</Label>
              <Input id="p-fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-jobtitle">عنوان شغلی</Label>
              <Input id="p-jobtitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="مثلاً کارشناس انبار" />
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              نام کاربری: <span className="font-mono" dir="ltr">{me.user.username}</span>
              {me.user.isAdmin ? ' · مدیر پلتفرم' : ''}
            </div>
            <Button onClick={saveProfile} disabled={savingProfile || !profileDirty || fullName.trim().length < 3} className="gap-1.5">
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ذخیره پروفایل
            </Button>
            {!profileDirty ? <p className="text-[11px] text-muted-foreground">تغییری ثبت نشده است</p> : null}
          </CardContent>
        </Card>

        {/* تغییر گذرواژه */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><KeyRound className="h-4 w-4 text-primary" /> تغییر گذرواژه</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pw-current">گذرواژه فعلی</Label>
              <PasswordInput
                id="pw-current"
                value={pw.current}
                onChange={(v) => setPw({ ...pw, current: v })}
                placeholder="گذرواژه فعلی"
                autoComplete="current-password"
              />
              {pwErrors.current ? <p className="text-xs text-destructive">{pwErrors.current}</p> : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pw-next">گذرواژه جدید</Label>
              <PasswordInput
                id="pw-next"
                value={pw.next}
                onChange={(v) => setPw({ ...pw, next: v })}
                placeholder="گذرواژه جدید"
                autoComplete="new-password"
              />
              <PasswordStrength pw={pw.next} username={me.user.username} />
              <p className="text-[11px] text-muted-foreground">دست‌کم ۸ نویسه با ترکیب حروف و اعداد — پس از تغییر، همه دستگاه‌های دیگر خارج می‌شوند</p>
              {pwErrors.next ? <p className="text-xs text-destructive">{pwErrors.next}</p> : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pw-confirm">تکرار گذرواژه جدید</Label>
              <PasswordInput
                id="pw-confirm"
                value={pw.confirm}
                onChange={(v) => setPw({ ...pw, confirm: v })}
                placeholder="تکرار گذرواژه جدید"
                autoComplete="new-password"
              />
              {confirmMatch ? (
                <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-600"><Check className="h-3.5 w-3.5" /> تکرار مطابقت دارد</p>
              ) : confirmMismatch ? (
                <p className="text-[11px] font-medium text-destructive">تکرار با گذرواژه جدید مطابقت ندارد</p>
              ) : null}
              {pwErrors.confirm ? <p className="text-xs text-destructive">{pwErrors.confirm}</p> : null}
            </div>
            <Button onClick={submitPassword} disabled={savingPw || !pw.current || !pw.next || !confirmMatch}>
              {savingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : null} تغییر گذرواژه
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* دستگاه‌های فعال */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2"><MonitorSmartphone className="h-4 w-4 text-primary" /> دستگاه‌های فعال</span>
            <span className="flex flex-wrap items-center gap-2">
              {sessions && sessions.length > 1 ? (
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => void revokeOthers()} disabled={busyRevokeOthers || busyRevoke}>
                  {busyRevokeOthers ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOutIcon className="h-3 w-3" />} خروج از سایر دستگاه‌ها
                </Button>
              ) : null}
              {sessions && sessions.length > 1 ? (
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs text-destructive" onClick={() => setConfirmRevokeAll(true)}>
                  <LogOut className="h-3 w-3" /> خروج از همه دستگاه‌ها
                </Button>
              ) : null}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessions === null ? <LoadingState rows={2} /> : sessions.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">نشست فعالی یافت نشد</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start">دستگاه</th>
                    <th className="p-3 text-start">نشانی IP</th>
                    <th className="p-3 text-start">شروع نشست</th>
                    <th className="p-3 text-start">آخرین فعالیت</th>
                    <th className="p-3 text-start">انقضا</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-b last:border-b-0">
                      <td className="p-3">
                        <span className="text-xs font-medium">{s.device}</span>
                        {s.isCurrent ? <Badge variant="secondary" className="ms-2 border-0 bg-emerald-100 text-emerald-700">این دستگاه</Badge> : null}
                        {s.companyCode ? <span className="block text-[10px] text-muted-foreground">شرکت فعال: {s.companyCode}</span> : null}
                      </td>
                      <td className="p-3 font-mono text-xs text-muted-foreground" dir="ltr">{s.ip ?? '—'}</td>
                      <td className="p-3 text-xs text-muted-foreground">{formatJalali(s.createdAt, true)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{formatJalali(s.lastSeenAt, true)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{formatJalali(s.expiresAt, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
            ورود از هر دستگاه جدید به‌طور خودکار اعلان امنیتی می‌سازد و در سجل حسابرسی ثبت می‌شود.
            اگر دستگاه ناشناخته‌ای می‌بینید، گذرواژه خود را تغییر دهید و از همه دستگاه‌ها خارج شوید.
          </p>
        </CardContent>
      </Card>

      {/* تأیید خروج از همه */}
      <Dialog open={confirmRevokeAll} onOpenChange={setConfirmRevokeAll}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>خروج از همه دستگاه‌ها؟</DialogTitle>
            <DialogDescription>
              همه {faNumber(sessions?.length ?? 0)} نشست فعال — از جمله همین دستگاه — پایان می‌یابد و باید دوباره وارد شوید.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevokeAll(false)} disabled={busyRevoke}>انصراف</Button>
            <Button variant="destructive" onClick={revokeAll} disabled={busyRevoke}>
              {busyRevoke ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} خروج از همه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
