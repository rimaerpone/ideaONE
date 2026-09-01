import { NextResponse } from 'next/server'
import { requireCtx } from '@/core/shared/server-helpers'
import { signTicket } from '@/core/notifications/realtime'

export const dynamic = 'force-dynamic'

/**
 * GET — بلیت کوتاه‌عمر برای ثبت‌نام در سرویس بلادرنگ.
 * فقط با نشست معتبر صادر می‌شود؛ بلیت ظرف ۶۰ ثانیه منقضی می‌شود و
 * صرفاً هویت کاربر را برای «اتاق اعلان خودش» امضا می‌کند (نه چیزی بیشتر).
 */
export async function GET() {
  const r = await requireCtx()
  if (!r.ok) return r.res
  return NextResponse.json({ ticket: signTicket(r.ctx.userId) })
}
