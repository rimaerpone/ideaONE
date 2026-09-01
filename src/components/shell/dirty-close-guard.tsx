'use client'

/**
 * دیالوگ گارد بستن تب کثیف (P2.5-U10) — یک نمونه در AppShell.
 * همه مسیرهای بستن (× تب، کلیک‌وسط، Esc سراسری) از useDirty.requestClose
 * می‌گذرند؛ این دیالوگ تأیید نهایی «دور انداختن تغییرات» را می‌گیرد.
 */

import { useDirty } from '@/store/dirty'
import { useWorkspace } from '@/store/workspace'
import { ConfirmDialog } from '@/components/common/confirm-dialog'

export function DirtyCloseGuard() {
  const pendingClose = useDirty((s) => s.pendingClose)
  const label = useDirty((s) => (s.pendingClose ? s.dirty[s.pendingClose] : undefined))
  const confirmClose = useDirty((s) => s.confirmClose)
  const cancelClose = useDirty((s) => s.cancelClose)
  const tabTitle = useWorkspace((s) => (pendingClose ? s.tabs.find((t) => t.id === pendingClose)?.title : undefined))

  return (
    <ConfirmDialog
      open={!!pendingClose}
      onOpenChange={(o) => { if (!o) cancelClose() }}
      destructive
      title={`بستن «${tabTitle ?? 'تب'}» با تغییرات ذخیره‌نشده؟`}
      description={`${
        label ?? 'این فرم'
      } تغییراتی دارد که هنوز ذخیره نشده است. اگر تب را ببندید، این تغییرات از بین می‌رود${
        label?.includes('پیش‌نویس')
          ? '؛ پیش‌نویس خودکار فرم ذخیره می‌شود و در بازگشت بازیابی خواهد شد'
          : ''
      }.`}
      confirmLabel="بستن و دور انداختن تغییرات"
      cancelLabel="بازگشت به فرم"
      onConfirm={confirmClose}
    />
  )
}
