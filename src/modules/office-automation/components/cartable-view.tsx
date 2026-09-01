'use client'

/**
 * کارتابل — مهاجرت‌یافته به P1-T2/T3/T12 + پوسته چندسندی P1.5:
 *  - داده: TanStack Query (هوک دامنه دبیرخانه با تب inbox/sent)
 *  - ناوبری: کلیک نامه = تب رکورد؛ «ثبت نامه جدید» = تب فرم (فرم در letter-page است)
 */
import { useState } from 'react'
import { useLettersQuery } from '@/modules/office-automation/queries'
import type { LetterListItem } from '@/types/platform'
import { PageHeader, LoadingState, EmptyState, LETTER_TYPE_LABELS, StatusBadge } from '@/components/common/ui-bits'
import { useWorkspace } from '@/store/workspace'
import { useCanWrite } from '@/hooks/use-can-write'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Sparkles } from 'lucide-react'
import { formatJalali, faDigits } from '@/core/shared/jalali'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export function CartableView() {
  const openRecord = useWorkspace((s) => s.openRecord)
  const openNew = useWorkspace((s) => s.openNew)
  const canWrite = useCanWrite() // P1-T18 — VIEWER دکمه ثبت نمی‌بیند (گارد سرور هم هست)
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox')
  const [q, setQ] = useState('')

  // P1-T3/T12 — فهرست سروری با پاکت استاندارد (اولین صفحه کارتابل کافی است؛ ناوبری کامل در دبیرخانه)
  const { data, isLoading } = useLettersQuery({ box: tab, q, page: 1, pageSize: 30, sort: { field: 'createdAt', dir: 'desc' } })
  const letters = data?.items ?? []

  const urgentCount = letters.filter(
    // P2-T10 — مهلت مؤثر: گام جاری (اختصاصی دارنده) وگرنه مهلت نامه
    (l) => l.status === 'IN_PROGRESS' && (l.stepDeadlineAt ?? l.deadlineAt) && new Date(l.stepDeadlineAt ?? l.deadlineAt!).getTime() - Date.now() < 3 * 86400000,
  ).length

  return (
    <div className="space-y-5">
      <PageHeader
        title="کارتابل"
        description={`نامه‌های در انتظار اقدام شما${urgentCount > 0 ? ` — ${faDigits(urgentCount)} مورد نزدیک به مهلت` : ''}`}
        actions={canWrite ? (
          <Button size="sm" variant="outline" onClick={() => openNew('letters', 'نامه جدید')} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> ثبت نامه جدید
          </Button>
        ) : undefined}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'inbox' | 'sent')}>
          <TabsList>
            <TabsTrigger value="inbox">در انتظار من</TabsTrigger>
            <TabsTrigger value="sent">ثبت‌شده توسط من</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative sm:ms-auto sm:w-72">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="جستجو در موضوع و متن..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="ps-9"
            aria-label="جستجو در کارتابل"
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingState rows={5} label="در حال بارگذاری نامه‌ها..." />
      ) : letters.length === 0 ? (
        <EmptyState
          text={tab === 'inbox' ? 'کارتابل شما خالی است' : 'نامه‌ای ثبت نکرده‌اید'}
          hint={tab === 'inbox'
            ? 'نامه‌های در انتظار اقدام شما اینجا می‌نشیند؛ با ارجاع یا تأیید همکاران، بلافاصله به‌روز می‌شود.'
            : 'نامه‌های صادره و داخلی ثبت‌شده توسط شما اینجا فهرست می‌شوند؛ برای ثبت اولین نامه، «نامه جدید» را بزنید.'}
        />
      ) : (
        <ul className="space-y-2.5">
          {letters.map((l) => {
            // P2-T10 — مهلت مؤثر (گام جاری ?? نامه) — مبنای قرمز/کهربایی کارتابل
            const effDeadline = l.stepDeadlineAt ?? l.deadlineAt
            const overdue = effDeadline && l.status === 'IN_PROGRESS' && new Date(effDeadline).getTime() < Date.now()
            const near = effDeadline && l.status === 'IN_PROGRESS' && !overdue && new Date(effDeadline).getTime() - Date.now() < 3 * 86400000
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => openRecord('letters', l.id, l.subject)}
                  className={cn(
                    'w-full rounded-xl border bg-card p-4 text-start transition-all hover:border-primary/40 hover:shadow-sm',
                    l.isMine && l.status === 'IN_PROGRESS' && 'border-s-4 border-s-primary',
                    overdue && 'bg-red-50/60',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <BadgeSoft label={LETTER_TYPE_LABELS[l.type]} />
                    <StatusBadge status={l.status} />
                    {l.urgency === 'URGENT' ? <Badge variant="secondary" className="border-0 bg-red-100 text-red-700">فوری</Badge> : null}
                    {l.confidentiality !== 'NORMAL' ? <Badge variant="secondary" className="border-0 bg-amber-100 text-amber-700">محرمانه</Badge> : null}
                    {l.aiCategory ? (
                      <span className="flex items-center gap-1 text-[11px] text-primary">
                        <Sparkles className="h-3 w-3" /> {l.aiCategory}
                      </span>
                    ) : null}
                    <span className="ms-auto text-[11px] text-muted-foreground">{formatJalali(l.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium leading-6">{l.subject}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {l.type === 'INCOMING' ? `از: ${l.senderTitle ?? '—'}` : l.type === 'OUTGOING' ? `به: ${l.receiverTitle ?? '—'}` : `ثبت: ${l.creatorName}`}
                    {tab === 'inbox' ? ' · در کارتابل شما' : ` · دارنده فعلی: ${l.holderName ?? '—'}`}
                    {l.companyCode ? ` · ${l.companyName}` : ''}
                  </p>
                  {near || overdue ? (
                    <p className={cn('mt-1.5 text-[11px]', overdue ? 'text-red-600' : 'text-amber-600')}>
                      مهلت: {formatJalali(effDeadline!)} {overdue ? '(گذشته)' : '(نزدیک)'}
                    </p>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function BadgeSoft({ label }: { label: string }) {
  return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{label}</span>
}
