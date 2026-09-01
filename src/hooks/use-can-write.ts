'use client'

import { useApp } from '@/store/app'

/**
 * P1-T18 — آینه کلاینتِ گارد نوشتنِ سرور (core/tenancy requireWriteRole):
 * VIEWER دکمه‌های «ثبت/ایجاد» را اصلاً نمی‌بیند؛ سرور همان گارد را با 403 فارسی
 * اعمال می‌کند (دفاع در عمق — پنهان‌سازی UI به‌تنهایی مجاز نیست).
 */
export function useCanWrite(): boolean {
  const me = useApp((s) => s.me)
  if (!me) return false
  if (me.user.isAdmin) return true
  const role = me.companies.find((c) => c.id === me.activeCompanyId)?.role
  return role === 'ADMIN' || role === 'MANAGER' || role === 'OPERATOR'
}
