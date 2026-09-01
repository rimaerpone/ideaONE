import 'server-only'
import { after } from 'next/server'
import { db } from '@/core/shared/db'
import { pushRealtime } from '@/core/notifications/realtime'

// ---------- اعلان (ADR-004) ----------
// قیف واحد اعلان: ثبت در دیتابیس (منبع حقیقت) + تحویل بلادرنگ به کاربران متصل (غیرمسدودکننده).
// اگر سرویس بلادرنگ پایین باشد، pushRealtime بی‌صدا شکست می‌خورد و polling
// صفحه (۳۰ ثانیه) اعلان را به هر حال می‌رساند — تحویل at-least-once.
//
// P2-T11 — dedupKey: کلید یکتای «عدم اسپم» برای یادآورهای دوره‌ای (زمان‌بند). اگر اعلانی با
// همین کلید قبلاً ثبت شده باشد، create با خطای یکتایی (P2002) رد می‌شود و notify بی‌صدا
// null برمی‌گرداند — نه رکورد تکراری، نه push تکراری. اعلان‌های عادی بدون dedupKey می‌مانند.
export async function notify(opts: {
  userId: string
  title: string
  body?: string
  kind?: string
  targetView?: string
  dedupKey?: string
}): Promise<NotificationRow | null> {
  let created: NotificationRow
  try {
    created = await db.notification.create({
      data: {
        userId: opts.userId,
        title: opts.title,
        body: opts.body,
        kind: opts.kind ?? 'INFO',
        targetView: opts.targetView,
        dedupKey: opts.dedupKey ?? null,
      },
    })
  } catch (e) {
    if (opts.dedupKey && (e as { code?: string }).code === 'P2002') return null // یادآور تکراری — قبلاً ارسال شده
    throw e
  }
  // تحویل بلادرنگ — نکته حیاتی (درس G5): پرامیس fire-and-forget مستقیم، با پایان پاسخ route
  // توسط رانتایم Next لغو می‌شد (event هرگز به سرویس سوکت نمی‌رسید). after() کار را پس از
  // پاسخ تضمین‌شده اجرا می‌کند؛ خارج از scope درخواست (زمان‌بند آینده) fallback مستقیم است.
  const push = () => pushRealtime([opts.userId], {
    id: created.id,
    title: created.title,
    body: created.body,
    kind: created.kind,
    targetView: created.targetView,
    createdAt: created.createdAt,
  })
  try {
    after(push)
  } catch {
    /* خارج از درخواست (background job) — بهترین تلاش */
    void push()
  }
  return created
}

// نوع سبک برای خروجی notify (بدون import دوباره Prisma در تایپ‌ها)
type NotificationRow = {
  id: string
  userId: string
  title: string
  body: string | null
  kind: string
  targetView: string | null
  isRead: boolean
  dedupKey: string | null
  createdAt: Date
}
