'use client'

import { useState } from 'react'
import { apiDownload } from '@/core/shared/api-client'
import { toastOk, toastErr } from '@/hooks/use-toast'
import { faNumber } from '@/core/shared/jalali'

/**
 * P2.5-U6 (R2) — خروجی CSV per-view با همان فیلترهای فعال نما.
 * الگوی تثبیت‌شده از تب حسابرسی (P1-T15): apiDownload + توست بازخورد با شمار سطر و پرچم سقف.
 *
 * مصرف: const csv = useCsvExport(); await csv.download('/api/whdocs', () => params)
 * — path کامل مسیر API است (نه نسبی: SPA همیشه روی / است، کوئری‌رشته نسبی به صفحه می‌رود نه API).
 */
export function useCsvExport() {
  const [busy, setBusy] = useState(false)

  const download = async (apiPath: string, buildParams: () => URLSearchParams): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    try {
      const params = buildParams()
      params.set('format', 'csv')
      const meta = await apiDownload(`${apiPath}?${params.toString()}`, 'export.csv')
      toastOk({
        title: 'خروجی CSV آماده شد',
        description: meta.rows !== null
          ? `${faNumber(meta.rows)} ردیف دریافت شد${meta.capped ? ' (سقف ۵٬۰۰۰ سطر — بازه را محدودتر کنید)' : ''} — با کدگذاری UTF-8 قابل باز شدن در اکسل`
          : 'فایل CSV با کدگذاری UTF-8 دریافت شد',
      })
      return true
    } catch (e) {
      toastErr({ title: 'خطا در دریافت CSV', description: e instanceof Error ? e.message : 'دریافت ناموفق بود' })
      return false
    } finally {
      setBusy(false)
    }
  }

  return { busy, download }
}
