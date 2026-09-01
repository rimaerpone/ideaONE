'use client'

import { useState } from 'react'
import { useApp } from '@/store/app'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/common/form-bits'
import { Building2, KeyRound, Loader2, TriangleAlert, UserRound } from 'lucide-react'

export function LoginView() {
  const login = useApp((s) => s.login)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // بررسی عمیق فرم‌ها — ۱۴۰۵/۰۶: هشدار CapsLock و راهنمای پس از تلاش‌های ناموفق
  const [capsLock, setCapsLock] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('نام کاربری و گذرواژه را وارد کنید')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setFailedAttempts((n) => n + 1)
      setError(err instanceof Error ? err.message : 'ورود ناموفق بود')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-bl from-[#3d2a20] via-[#2a1e18] to-[#1a1310] p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/90 shadow-lg shadow-primary/20">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">پلتفرم عملیاتی سازمانی</h1>
          <p className="mt-2 text-sm text-white/70">هلدینگ کاشی و سرامیک — پایلوت ۹۰ روزه فاز ۱</p>
        </div>

        <Card className="border-white/10 bg-white/95 shadow-xl backdrop-blur">
          <CardHeader>
            <CardTitle className="text-lg">ورود به سامانه</CardTitle>
            <CardDescription>با حساب سازمانی خود وارد شوید</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">نام کاربری</Label>
                <div className="relative">
                  <UserRound className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="username"
                    dir="ltr"
                    autoFocus
                    className="ps-9 text-left"
                    placeholder="admin"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); if (error) setError(null) }}
                    autoComplete="username"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">گذرواژه</Label>
                <div className="relative">
                  <KeyRound className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <div className="ps-9">
                    <PasswordInput
                      id="password"
                      value={password}
                      onChange={(v) => { setPassword(v); if (error) setError(null) }}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      onKeyUp={(e) => setCapsLock(!!e.getModifierState?.('CapsLock'))}
                      onKeyDown={(e) => setCapsLock(!!e.getModifierState?.('CapsLock'))}
                    />
                  </div>
                </div>
                {capsLock ? (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600" role="alert">
                    <TriangleAlert className="h-3.5 w-3.5" /> کلید Caps Lock روشن است — حروف بزرگ تایپ می‌شوند
                  </p>
                ) : null}
              </div>
              {error ? (
                <div className="space-y-1.5" aria-live="polite">
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>
                  {failedAttempts >= 2 ? (
                    <p className="px-1 text-xs leading-5 text-muted-foreground">
                      راهنما: نام کاربری و گذرواژه نمایشی را دقیقاً از فهرست پایین کارت کپی کنید؛
                      پس از چند تلاش ناموفق، ورود به‌طور موقت محدود می‌شود و باید چند لحظه صبر کنید.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <Button type="submit" className="w-full" disabled={busy} aria-busy={busy}>
                {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                {busy ? 'در حال ورود...' : 'ورود'}
              </Button>
            </form>

            <div className="mt-5 rounded-lg bg-muted/60 p-3 text-xs leading-6 text-muted-foreground">
              <p className="font-medium text-foreground">حساب‌های نمایشی:</p>
              <p><span className="font-mono" dir="ltr">admin / admin123</span> — مدیر فناوری اطلاعات هلدینگ (همه شرکت‌ها)</p>
              <p><span className="font-mono" dir="ltr">ceo.arad / 12345678</span> — مدیرعامل آراد سرام پیشرو</p>
              <p><span className="font-mono" dir="ltr">dabir.arad / 12345678</span> — کارشناس دبیرخانه آراد سرام</p>
              <p><span className="font-mono" dir="ltr">anbar.arad / 12345678</span> — مسئول انبار محصول آراد سرام</p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-white/50">
          مونولیت ماژولار | رجیستری ماژول دیتابیس‌محور | تقویم جلالی | حکمرانی HITL برای عوامل هوش مصنوعی
        </p>
      </div>
    </div>
  )
}
