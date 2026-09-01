'use client'

import { useApp } from '@/store/app'
import { useRealtime } from '@/hooks/use-realtime'
import { useRtInvalidation } from '@/core/query/use-rt-invalidation'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { WorkspaceTabs } from './workspace-tabs'
import { WorkspaceContent } from './view-registry'
import { DemoBanner } from './demo-banner'
import { CommandPalette } from './command-palette'
import { KeyboardShortcuts } from './keyboard-shortcuts'
import { DirtyCloseGuard } from './dirty-close-guard'

/**
 * پوسته چندسندی (P1.5) — سایدبار ریل/کامل + هدر + نوار تب + محتوای تب فعال.
 * ناوبری و رندر نما از رجیستری (view-registry) می‌آید؛ این کامپوننت فقط چیدمان است.
 * پالت فرمان (P1-T25) و میان‌برهای سراسری (P1-T27) در سطح پوسته سوارند.
 */
export function AppShell() {
  const me = useApp((s) => s.me)

  // اتصال بلادرنگ — در سطح پوسته تا در تمام نماها زنده بماند
  useRealtime()
  // رویداد بلادرنگ → ابطال هدفمند کش سرور (P1-T2)
  useRtInvalidation()

  if (!me) return null

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <DemoBanner />
        <Header />
        <WorkspaceTabs />
        <main className="flex-1 p-4 sm:p-6">
          {/* P2.5-U1 — عرض کامل ERP: سقف max-w-7xl حذف شد؛ مانیتورهای دفتری (۱۵۶۰+) دیگر نیم‌خالی نمی‌مانند.
              خوانایی متن بلند توسط بدنه‌های متنی فرم (max-w داخلی) و InfoGrid (ستون‌بندی) کنترل می‌شود. */}
          <div className="w-full"><WorkspaceContent /></div>
        </main>
        <footer className="mt-auto border-t bg-background px-4 py-3 sm:px-6">
          <p className="mx-auto max-w-3xl text-center text-[11px] text-muted-foreground">
            پلتفرم عملیاتی سازمانی هلدینگ کاشی و سرامیک — پایلوت فاز ۱ (کارتابل، اتوماسیون اداری، انبار و مستر دیتا)
          </p>
        </footer>
      </div>
      {/* P1-T25/T27 — پالت فرمان + میان‌برهای سراسری + راهنمای «؟» */}
      <CommandPalette />
      <KeyboardShortcuts />
      {/* P2.5-U10 — گارد بستن تب کثیف (× تب / Esc سراسری → ConfirmDialog) */}
      <DirtyCloseGuard />
    </div>
  )
}
