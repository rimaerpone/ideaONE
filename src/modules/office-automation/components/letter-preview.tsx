'use client'

/**
 * محتوای پنل پیش‌نمایش نامه (P2.5-U4 — Master-Detail) — فقط-خواندنی (تصمیم §۳ P2.5):
 * خلاصه رکورد برای «پیمایش بدون باز/بستن تب»؛ اقدام/ویرایش در صفحه کامل (تب رکورد).
 * داده از همان کوئری صفحه رکورد (useLetterQuery) — کش مشترک، درخواست تکراری نیست.
 */

import { useLetterAttachmentsQuery, useLetterQuery } from '@/modules/office-automation/queries'
import type { LetterDetail } from '@/types/platform'
import { LETTER_TYPE_LABELS, StatusBadge } from '@/components/common/ui-bits'
import { PreviewInfo } from '@/components/common/preview-panel'
import { Badge } from '@/components/ui/badge'
import { Paperclip, Send } from 'lucide-react'
import { formatJalali, faDocNumber, faNumber } from '@/core/shared/jalali'
// P2-T10 — مهلت مؤثر در پیش‌نمایش: گام جاری ?? مهلت نامه
import { liveStepDeadline } from '../deadline'

const ACTION_LABELS: Record<string, string> = { REFER: 'ارجاع', ANSWER: 'پاسخ', APPROVE: 'تأیید', ARCHIVE: 'بایگانی' }

export function LetterPreviewContent({ letterId }: { letterId: string }) {
  const { data, isLoading, error } = useLetterQuery(letterId)
  const { data: attData } = useLetterAttachmentsQuery(letterId)
  const letter = data?.letter ?? null

  if (isLoading) return <PreviewLoading />
  if (error) return <PreviewError message={error instanceof Error ? error.message : 'نامه بارگذاری نشد'} />
  if (!letter) return <PreviewError message="نامه یافت نشد" />

  return <LetterPreviewBody letter={letter} attachmentsCount={attData?.attachments.length ?? null} />
}

function PreviewLoading() {
  return <p className="py-8 text-center text-xs text-muted-foreground">در حال بارگذاری…</p>
}

function PreviewError({ message }: { message: string }) {
  return <p className="rounded-lg bg-destructive/10 p-3 text-xs leading-5 text-destructive" role="alert">{message}</p>
}

function LetterPreviewBody({ letter, attachmentsCount }: { letter: LetterDetail; attachmentsCount: number | null }) {
  // P2-T10 — مهلت مؤثر: گام جاری (اختصاصی دارنده فعلی) وگرنه مهلت خود نامه
  const stepDeadline = liveStepDeadline(letter)
  const effectiveDeadline = stepDeadline ?? (letter.deadlineAt ? new Date(letter.deadlineAt) : null)
  const overdue = effectiveDeadline && effectiveDeadline.getTime() < Date.now() && letter.status === 'IN_PROGRESS'

  return (
    <div className="space-y-4">
      {/* نشان‌ها — نوع/وضعیت/فوریت/محرمانگی (همان زبان بصری صفحه رکورد) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <LetterPreviewBadges letter={letter} />
      </div>

      <PreviewInfo
        rows={[
          // P2-T8 — قالب واحد شماره نمایشی سرورساخته (پیشوند/پسوند per-type)
          { label: 'شماره', value: letter.displayNumber || faDocNumber(letter.number, letter.createdAt) },
          { label: 'تاریخ ثبت', value: formatJalali(letter.createdAt) },
          { label: letter.type === 'INCOMING' ? 'فرستنده' : letter.type === 'OUTGOING' ? 'گیرنده' : 'ثبت‌کننده', value: letter.type === 'INCOMING' ? (letter.senderTitle ?? '—') : letter.type === 'OUTGOING' ? (letter.receiverTitle ?? '—') : letter.creatorName },
          { label: 'در کارتابل', value: letter.holderName ?? '—' },
          { label: 'شرکت', value: letter.companyName },
          ...(effectiveDeadline ? [{ label: 'مهلت اقدام', value: <span className={overdue ? 'text-red-600' : undefined}>{formatJalali(effectiveDeadline)}{overdue ? ' — گذشته' : ''}</span> }] : []),
          ...(letter.aiCategory ? [{ label: 'طبقه‌بندی AI', value: letter.aiCategory }] : []),
        ]}
      />

      {/* متن نامه — بریده در ارتفاع، خواندن کامل در صفحه رکورد */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">متن نامه</p>
        <div className="relative max-h-36 overflow-hidden rounded-lg bg-muted/40 p-3 text-xs leading-6 whitespace-pre-wrap">
          {letter.body}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent" aria-hidden />
        </div>
      </div>

      {/* آخرین گردش — سطر به سطر از نو به قدیم */}
      {letter.referrals.length > 0 ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Send className="h-3 w-3" /> گردش نامه ({faNumber(letter.referrals.length)} مرحله)
          </p>
          <ol className="space-y-1.5">
            {letter.referrals.slice(-3).reverse().map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]">
                <span className="truncate">
                  <span className="text-muted-foreground">{r.fromName}</span>
                  <span className="mx-1 text-primary">←</span>
                  <span className="font-medium">{r.toName}</span>
                </span>
                <span className="shrink-0 text-muted-foreground">{ACTION_LABELS[r.action] ?? r.action} · {formatJalali(r.createdAt)}</span>
              </li>
            ))}
          </ol>
          {letter.referrals.length > 3 ? (
            <p className="mt-1 text-[10px] text-muted-foreground">و {faNumber(letter.referrals.length - 3)} مرحله قدیمی‌تر — در صفحه کامل</p>
          ) : null}
        </div>
      ) : null}

      {attachmentsCount != null && attachmentsCount > 0 ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Paperclip className="h-3 w-3" /> {faNumber(attachmentsCount)} پیوست
        </p>
      ) : null}
    </div>
  )
}

/** نشان‌های سربرگ پنل پیش‌نمایش نامه — مشترک بین هدر پنل و... */
export function LetterPreviewBadges({ letter }: { letter: LetterDetail }) {
  return (
    <>
      <Badge className="border-0 bg-primary/10 text-primary">{LETTER_TYPE_LABELS[letter.type]}</Badge>
      <StatusBadge status={letter.status} />
      {letter.urgency === 'URGENT' ? <Badge className="border-0 bg-red-100 text-red-700">فوری</Badge> : null}
      {letter.confidentiality !== 'NORMAL' ? (
        <Badge className="border-0 bg-amber-100 text-amber-700">{letter.confidentiality === 'SECRET' ? 'سری' : 'محرمانه'}</Badge>
      ) : null}
    </>
  )
}
