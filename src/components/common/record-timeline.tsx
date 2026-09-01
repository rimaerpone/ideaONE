'use client'

/**
 * خط زمان اقدامات رکورد (P2.5-U5 / R1) — «Chatter سبک» از AuditLog.
 * کامپوننت مشترک همه صفحات رکورد (سند انبار، درخواست کالا، محصول، شرکا)؛
 * نامه عمداً مصرف نمی‌کند (گردش اختصاصی خودش دارد).
 * الگوی بصری هم‌خانواده تب «گردش نامه»: خط عمودی + نقطه + نشان اقدام + کاربر + تاریخ جلالی.
 */

import { Clock, History } from 'lucide-react'
import { useRecordTimelineQuery } from '@/hooks/use-record-timeline'
import { formatJalaliLong, faNumber } from '@/core/shared/jalali'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/ui-bits'
import { cn } from '@/lib/utils'
import type { TimelineEntry } from '@/types/platform'

/** خلاصه فارسی جزئیات سجل — فقط کلیدهای شناخته‌شده را ترجمه می‌کند، بقیه خام می‌مانند */
const DETAIL_KEYS_FA: Record<string, string> = {
  docNumber: 'شماره سند', number: 'شماره', type: 'نوع', count: 'تعداد اقلام',
  reqNumber: 'شماره درخواست', status: 'وضعیت', code: 'کد', name: 'نام', to: 'به', sizeBytes: 'حجم',
}

function DetailChips({ details }: { details: string }) {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(details) as Record<string, unknown>
  } catch {
    return <p className="mt-1 text-xs leading-5 text-muted-foreground" dir="auto">{details}</p>
  }
  const entries = Object.entries(parsed).filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (entries.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" dir="auto">
          {DETAIL_KEYS_FA[k] ?? k}: {String(v)}
        </span>
      ))}
    </div>
  )
}

function EntryRow({ entry, last }: { entry: TimelineEntry; last: boolean }) {
  return (
    <li className="relative">
      <span
        className={cn('absolute -start-[22px] top-1.5 h-3 w-3 rounded-full border-2 border-background', last ? 'bg-primary/50' : 'bg-primary')}
        aria-hidden
      />
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="font-medium">{entry.actionFa}</span>
        <Badge variant="secondary" className="border-0 bg-secondary text-secondary-foreground">{entry.userName}</Badge>
        {entry.companyName !== '—' ? (
          <span className="text-[11px] text-muted-foreground">({entry.companyName})</span>
        ) : null}
      </div>
      {entry.details ? <DetailChips details={entry.details} /> : null}
      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Clock className="h-3 w-3" aria-hidden />
        {formatJalaliLong(entry.createdAt)}
      </p>
    </li>
  )
}

export function RecordTimeline({ entity, recordId }: { entity: string; recordId: string | null | undefined }) {
  const { data, isLoading, error } = useRecordTimelineQuery(entity, recordId)

  if (isLoading) {
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-3/4" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        خط زمان بارگذاری نشد: {error instanceof Error ? error.message : String(error)}
      </div>
    )
  }

  const entries = data?.entries ?? []
  if (entries.length === 0) {
    return (
      <EmptyState
        compact
        icon={<History className="h-5 w-5" />}
        text="هنوز اقدامی برای این رکورد ثبت نشده است"
        hint="هر عملیات نوشتاری (ثبت، قطعی‌سازی، ویرایش) به‌محض انجام، این‌جا ثبت می‌شود."
      />
    )
  }

  return (
    <div className="rounded-xl border p-4">
      <p className="mb-3 text-sm font-medium">تاریخچه اقدامات ({faNumber(entries.length)} رخداد)</p>
      <ol className="relative space-y-4 border-s-2 border-muted ps-4">
        {entries.map((e, i) => (
          <EntryRow key={e.id} entry={e} last={i === entries.length - 1} />
        ))}
      </ol>
    </div>
  )
}
