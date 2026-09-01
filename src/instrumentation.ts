// قلاب راه‌اندازی Next.js — instrumentation (یک‌بار در هر فرایند سرور اجرا می‌شود)
// وظیفه: بوت هسته Scheduler (پردازشگر Outbox + پایش سلامت) — ADR-009، بسته P0-T14/T18/T19
// P2-T11: کارهای ماژولی (مثل deadline-reminder) ثبت خودکار در زمان‌بند دارند (scheduler.ts)؛
// این قلاب فقط حلقه دوره‌ای را روشن می‌کند — ثبت runner در بارگذاری ماژول scheduler انجام می‌شود.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // P2-T5 — گرم‌کردن/خودترمیم ایندکس جستجوی تمام‌متن نامه‌ها (letter_fts خارج Prisma)
  try {
    const { ensureLetterFts } = await import('@/modules/office-automation/fts')
    const r = await ensureLetterFts()
    if (r.rebuilt) console.log(`[instrumentation] بازسازی ایندکس FTS نامه‌ها: ${r.indexed} ردیف`)
  } catch (e) {
    console.error('[instrumentation] ایندکس FTS نامه‌ها ناموفق (عقب‌گرد contains فعال است):', e instanceof Error ? e.message : e)
  }

  if (process.env.SCHEDULER_DISABLED === '1') return // کلید خاموشی اضطراری (RB-02)
  try {
    const { startScheduler } = await import('@/core/scheduler/scheduler')
    startScheduler()
  } catch (e) {
    console.error('[instrumentation] راه‌اندازی زمان‌بند ناموفق بود:', e instanceof Error ? e.message : e)
  }
}
