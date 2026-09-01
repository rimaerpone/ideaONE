import 'server-only'
import { db } from '@/core/shared/db'
import { notify } from '@/core/notifications/notify'
import { formatJalali, faDocNumber, faDigits } from '@/core/shared/jalali'

/**
 * P2-T11 — یادآور خودکار مهلت اقدام نامه (کار زمان‌بند ماژولی «deadline-reminder»)
 *
 * قرارداد: هر ساعت اجرا می‌شود (ردیف ScheduledJob)؛ برای هر نامه «در جریان» با دارنده زنده:
 *  - مهلت مؤثر = مهلت گام جاری (آخرین ارجاعی که نامه را به دارنده فعلی رسانده، اگر مهلت دارد)
 *    وگرنه مهلت خود نامه (fallback سراسری).
 *  - دو نقطه یادآور (طبق نقشه راه): «۳ روز قبل» (۱ تا ۳ روز مانده) و «روز موعد» (امروز).
 *  - عدم اسپم: هر نقطه فقط یک‌بار به‌ازای همان گام/نامه — با dedupKey یکتا روی Notification
 *    (تکرار در سطح DB با P2002 رد می‌شود؛ حتی اگر دو اجرای هم‌زمان سرریز شوند).
 *
 * مرز روز: تقویم سرور (local) — هماهنگ با بقیه اپ که تاریخ‌ها را server-local می‌سازد؛
 * تاریخ دیت‌پیکر جلالی نیمه‌شب server-local است پس «امروز» = همان روز جلالی کاربر در ایران
 * (اختلاف < ۴ ساعت فقط در لحظه نیمه‌شب مرزی).
 */

const DAY_MS = 86_400_000

/** شماره روز تقویمی server-local — مقایسه روز به روز بدون وابستگی به ساعت */
function localDayIndex(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS)
}

type ReminderMilestone = 'T3' | 'DUE'

export async function runDeadlineReminder(now = new Date()): Promise<string> {
  // فقط نامه‌های در جریانِ دارای مهلت (سطح نامه یا سطح گام) — پیش‌فیلتر DB.
  // مرتب‌سازی نامه‌ها بر id است تا هر دور، مجموعه‌ای پایدار و تکرارپذیر ببیند.
  // نکته کوئری: «آخرین ارجاع» عمداً در کوئری دوم جدا خوانده می‌شود — take:1 تو در تو
  // روی رابطه چندمقداری + فیلتر some در موتور Prisma/SQLite به RustPanic می‌انجامد
  // (record.rs: no entry found for key — آزمایش‌شده ۱۴۰۵/۰۶/۰۹). دو کوئری ساده = مقاوم.
  const letters = await db.letter.findMany({
    where: {
      status: 'IN_PROGRESS',
      currentHolderId: { not: null },
      OR: [
        { deadlineAt: { not: null } },
        { referrals: { some: { deadlineAt: { not: null } } } },
      ],
    },
    select: {
      id: true,
      number: true,
      subject: true,
      createdAt: true,
      deadlineAt: true,
      currentHolderId: true,
    },
    orderBy: { id: 'asc' },
  })

  // آخرین ارجاع هر نامه — در JS محاسبه می‌شود (نه orderBy سروری):
  // موتور Prisma/SQLite با «IN بزرگ (≥۱۰۰۰) + orderBy» به RustPanic می‌انجامد
  // (record.rs: no entry found for key — دوبیسه‌شده ۱۴۰۵/۰۶/۰۹: ۵۰۰=سبز، ۱۰۰۰=پنیک،
  // ۳۰۰۰ بدون orderBy=سبز). پیمایش بدون مرتب‌سازی + مقایسه createdAt در حافظه.
  const referrals = letters.length > 0
    ? await db.letterReferral.findMany({
        where: { letterId: { in: letters.map((l) => l.id) } },
        select: { id: true, letterId: true, deadlineAt: true, toUserId: true, createdAt: true },
      })
    : []
  const lastByLetter = new Map<string, (typeof referrals)[number]>()
  for (const rf of referrals) {
    const cur = lastByLetter.get(rf.letterId)
    if (!cur || rf.createdAt >= cur.createdAt) lastByLetter.set(rf.letterId, rf)
  }

  let dueCount = 0
  let soonCount = 0
  for (const l of letters) {
    const last = lastByLetter.get(l.id)
    // گام جاری = آخرین ارجاعی که نامه را به دارنده فعلی رسانده است
    const step = last && last.toUserId === l.currentHolderId ? last : null
    // منبع مهلت: اختصاصی گام، وگرنه خود نامه — dedupKey از همین منبع ساخته می‌شود تا
    // یادآورِ «مهلت نامه» برای همان دارنده با کلید ثابت letter بماند (نه شناسه گامِ بی‌مهلت)
    const stepDeadline = step?.deadlineAt ?? null
    const deadline = stepDeadline ?? l.deadlineAt
    if (!deadline) continue

    const daysLeft = localDayIndex(deadline) - localDayIndex(now)
    let milestone: ReminderMilestone | null = null
    if (daysLeft === 0) milestone = 'DUE' // روز موعد — حتی اگر ساعتِ نیمه‌شب گذشته باشد
    else if (daysLeft >= 1 && daysLeft <= 3) milestone = 'T3' // ۳ روز قبل (پنجره ۱..۳ روز مانده)
    else continue // گذشته از موعد (T12 «معطل‌ها» دامنه جداست) یا دورتر از پنجره

    const label = faDocNumber(l.number, l.createdAt)
    const sent = await notify({
      userId: l.currentHolderId!,
      title: milestone === 'DUE' ? 'مهلت اقدام نامه: امروز' : 'مهلت اقدام نامه نزدیک است',
      body: milestone === 'DUE'
        ? `نامه «${l.subject}» (${label}) امروز آخرین مهلت اقدام شماست.`
        : `نامه «${l.subject}» (${label}) تا ${faDigits(daysLeft)} روز دیگر (${formatJalali(deadline)}) مهلت دارد.`,
      kind: 'LETTER',
      targetView: 'cartable',
      dedupKey: `deadline-reminder:${l.id}:${stepDeadline ? `ref:${step!.id}` : 'letter'}:${milestone}`,
    })
    if (sent) {
      if (milestone === 'DUE') dueCount += 1
      else soonCount += 1
    }
  }

  return `${dueCount + soonCount} یادآور ارسال شد (${dueCount} روز موعد · ${soonCount} سه‌روزه) — از ${letters.length} نامه در جریانِ دارای مهلت`
}
