import 'server-only'
import { db } from '@/core/shared/db'
import { isFeatureEnabled } from '@/core/featureflags/featureflags'

/**
 * هسته Scheduler — سرویس ۱۲ از ۱۸ سرویس هسته سند منبع (بخش ۵.۱: Scheduler / Background Jobs)
 * بسته P0-T14/T18/T19 نقشه راه: پردازشگر Outbox + پایش دوره‌ای سلامت.
 * راه‌اندازی از src/instrumentation.ts (قلاب register در Next.js — یک‌بار در هر فرایند سرور).
 * تعریف کارها در جدول ScheduledJob (قابلیت فعال/غیرفعال‌سازی و بازه بدون ری‌استارت).
 *
 * P2-T11 — زمان‌بند ماژولار: رجیستری اجراکننده‌ها (runner) روی globalThis نگه داشته می‌شود تا
 * ثبتِ کارهای ماژولی (مثل deadline-reminder) در هر نمونه‌ی کامپایل‌شده (HMR/route) برای همه
 * نمونه‌ها قابل مشاهده باشد؛ registerJobRunner از instrumentation و از خود ماژول‌های job صدا
 * زده می‌شود (idempotent). runJobOnce برای اجرای دستی/تست با همان معناشناسی حلقه استفاده می‌شود.
 */

const TICK_MS = 15_000
const REALTIME_HEALTH_URL = 'http://127.0.0.1:3004/healthz'

export type JobRunner = () => Promise<string> // خروجی = گزارش کوتاه اجرا

// رجیستری سراسری — مقاوم در برابر چند نمونه ماژول در dev (HMR)
const g = globalThis as { __ideaoneSchedulerStarted?: boolean; __ideaoneJobRunners?: Map<string, JobRunner> }
const RUNNERS: Map<string, JobRunner> = (g.__ideaoneJobRunners ??= new Map())

/** ثبت اجراکننده یک کار ماژولی — idempotent (بازنویسی همان کلید بی‌ضرر است) */
export function registerJobRunner(key: string, runner: JobRunner): void {
  RUNNERS.set(key, runner)
}

const builtinRunners: Record<string, JobRunner> = {
  'outbox-processor': async () => {
    // برداشت دسته‌ای رویدادهای پردازش‌نشده و ثبت تحویل.
    // مصرف‌کننده‌های آینده (پیام‌رسان سازمانی، یکپارچه‌سازی‌ها) همین قرارداد را تغذیه می‌کنند (P2+).
    const events = await db.outboxEvent.findMany({
      where: { processedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })
    const now = new Date()
    await db.$transaction(
      events.map((e) => db.outboxEvent.update({ where: { id: e.id }, data: { processedAt: now } })),
    )
    return `${events.length} رویداد تحویل شد`
  },
  'health-monitor': async () => {
    await db.$queryRaw`SELECT 1` // سلامت دیتابیس
    try {
      const res = await fetch(REALTIME_HEALTH_URL, { signal: AbortSignal.timeout(2500) })
      if (!res.ok) throw new Error(`healthz=${res.status}`)
    } catch {
      // سرویس بلادرنگ غیربحرانی است — polling پوشش قطعی دارد؛ فقط گزارش می‌شود
      return 'دیتابیس سالم؛ سرویس بلادرنگ پاسخگو نبود (پوشش polling فعال است)'
    }
    return 'دیتابیس و سرویس بلادرنگ سالم'
  },
  'session-purger': async () => {
    // P1-T9 — پاکسازی فعال نشست‌های منقضی: جدول Session را کوچک و سالم نگه می‌دارد؛
    // نشست منقضی به‌هرحال در getSessionCtx پذیرفته نمی‌شود — اینجا فقط بهداشت داده است.
    const r = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
    return r.count > 0 ? `${r.count} نشست منقضی پاک شد` : 'نشست منقضی‌ای نبود'
  },
}
for (const [key, runner] of Object.entries(builtinRunners)) registerJobRunner(key, runner)

// کارهای ماژولی (P2-T11) — ثبت ایستا در زمان بارگذاری؛ مستقل از اجرای مجدد instrumentation
// (بدون حلقه import: ماژول job فقط از core/shared و core/notifications وارد می‌کند)
import { runDeadlineReminder } from './jobs/deadline-reminder'
registerJobRunner('deadline-reminder', runDeadlineReminder)

export function startScheduler(): void {
  if (g.__ideaoneSchedulerStarted) return // محافظ در برابر اجرای دوباره (HMR/بوت چندباره)
  g.__ideaoneSchedulerStarted = true
  console.log('[scheduler] هسته زمان‌بند راه‌اندازی شد')
  void tickLoop()
}

async function tickLoop(): Promise<void> {
  // حذف guard در ابتدای هر دور: پرچم خاموشی کلی را رعایت کن
  for (;;) {
    await sleep(TICK_MS)
    try {
      if (!(await isFeatureEnabled('scheduler.enabled', true))) continue
      await runDueJobs()
    } catch (e) {
      console.error('[scheduler] خطای دور زمان‌بند:', e instanceof Error ? e.message : e)
    }
  }
}

async function runDueJobs(): Promise<void> {
  const defs = await db.scheduledJob.findMany()
  for (const def of defs) {
    if (!def.enabled) continue
    const due = !def.lastRunAt || Date.now() - def.lastRunAt.getTime() >= def.intervalSec * 1000
    if (!due) continue
    const runner = RUNNERS.get(def.key)
    if (!runner) {
      await db.scheduledJob.update({
        where: { id: def.id },
        data: { lastRunAt: new Date(), lastStatus: 'ERROR', lastError: 'runner تعریف‌شده‌ای برای این کلید وجود ندارد' },
      })
      continue
    }
    try {
      const note = await runner()
      await db.scheduledJob.update({
        where: { id: def.id },
        data: { lastRunAt: new Date(), lastStatus: 'OK', lastError: null, note },
      })
    } catch (e) {
      await db.scheduledJob.update({
        where: { id: def.id },
        data: { lastRunAt: new Date(), lastStatus: 'ERROR', lastError: String(e).slice(0, 300) },
      })
    }
  }
}

/**
 * P2-T11 — اجرای دستی/تستی یک کار مشخص: همان قرارداد حلقه (به‌روزرسانی lastRunAt/lastStatus/note).
 * مصرف‌کننده: اجرای دستی ادمین از حاکمیت (POST /api/platform/jobs/run) و تست‌های E2E.
 */
export async function runJobOnce(key: string): Promise<{ ok: true; note: string } | { ok: false; error: string; status: number }> {
  const def = await db.scheduledJob.findUnique({ where: { key } })
  if (!def) return { ok: false, error: 'کار زمان‌بندی با این کلید یافت نشد', status: 404 }
  if (!def.enabled) return { ok: false, error: 'این کار غیرفعال است — ابتدا از حاکمیت فعالش کنید', status: 409 }
  const runner = RUNNERS.get(key)
  if (!runner) return { ok: false, error: 'runner تعریف‌شده‌ای برای این کلید وجود ندارد', status: 404 }
  try {
    const note = await runner()
    await db.scheduledJob.update({
      where: { id: def.id },
      data: { lastRunAt: new Date(), lastStatus: 'OK', lastError: null, note },
    })
    return { ok: true, note }
  } catch (e) {
    const msg = String(e).slice(0, 300)
    await db.scheduledJob.update({
      where: { id: def.id },
      data: { lastRunAt: new Date(), lastStatus: 'ERROR', lastError: msg },
    })
    return { ok: false, error: msg, status: 500 }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function listScheduledJobs() {
  return db.scheduledJob.findMany({ orderBy: { key: 'asc' } })
}
