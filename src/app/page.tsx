'use client'

import { useEffect } from 'react'
import { useApp } from '@/store/app'
import { AppShell } from '@/components/shell/app-shell'
import { LoginView } from '@/components/shell/login-view'
import { QueryProvider } from '@/core/query/query-provider'

export default function Home() {
  const { booted, me, boot, logout } = useApp()

  useEffect(() => {
    boot()
  }, [boot])

  // انقضای نشست در هر فراخوانی API
  useEffect(() => {
    const onExpired = () => logout()
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [logout])

  if (!booted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" role="status" aria-label="در حال بارگذاری" />
          <p className="text-sm text-muted-foreground">در حال بارگذاری سامانه...</p>
        </div>
      </div>
    )
  }

  // کش سرور فقط بعد از ورود معنا دارد (P1-T2 — TanStack Query)
  return me ? (
    <QueryProvider>
      <AppShell />
    </QueryProvider>
  ) : <LoginView />
}
