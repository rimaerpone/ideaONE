/**
 * P2-T10 — کمکی‌های مشترک «مهلت» در ماژول اتوماسیون اداری
 * (خالص — بدون state؛ مصرف‌کننده: صفحه رکورد نامه و پنل پیش‌نمایش)
 */

/** لحن رنگی مهلت (قرمز/کهربایی طبق معیار پذیرش T10): «گذشته» قرمز · «نزدیک» (≤۳ روز) کهربایی */
export function deadlineTone(d: Date): 'overdue' | 'near' | 'ok' {
  const diff = d.getTime() - Date.now()
  if (diff < 0) return 'overdue'
  if (diff < 3 * 86400000) return 'near'
  return 'ok'
}

/** شکل ساختاری حداقلی برای liveStepDeadline — هم LetterDetail پاس می‌شود هم پاسخ آزمون */
export type ReferralLike = { toUserId: string; deadlineAt: string | Date | null }

/**
 * مهلت گام جاری: آخرین ارجاعِ رساننده نامه به دارنده فعلی — مبنای نشان‌ها (T10)
 * و نامزد یادآور دوره‌ای (T11 همان مهلت را انتخاب می‌کند). null = گام فعلی مهلت ندارد.
 */
export function liveStepDeadline(
  letter: { status: string; holderId: string | null; referrals: ReferralLike[] },
): Date | null {
  if (letter.status !== 'IN_PROGRESS' || !letter.holderId) return null
  for (let i = letter.referrals.length - 1; i >= 0; i--) {
    const rf = letter.referrals[i]
    if (rf.toUserId === letter.holderId) return rf.deadlineAt ? new Date(rf.deadlineAt) : null
  }
  return null
}
