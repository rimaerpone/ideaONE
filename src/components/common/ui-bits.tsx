'use client'

import { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Inbox, Loader2, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function StatCard({
  title, value, sub, icon, tone = 'default', onClick, hint,
}: {
  title: string
  value: string
  sub?: string
  icon: ReactNode
  tone?: 'default' | 'primary' | 'warning' | 'success' | 'danger'
  /** D1 — KPI کارتِ اقدام است: کلیک → نمای مرتبط (الگوی Fiori Tile / D365 KPI) */
  onClick?: () => void
  /** توضیح مقصد کلیک — به‌عنوان title بومی و برچسب دسترس‌پذیری */
  hint?: string
}) {
  const tones: Record<string, string> = {
    default: 'bg-secondary text-secondary-foreground',
    primary: 'bg-primary/10 text-primary',
    warning: 'bg-amber-100 text-amber-700',
    success: 'bg-emerald-100 text-emerald-700',
    danger: 'bg-red-100 text-red-700',
  }
  const body = (
    <CardContent className="flex items-center justify-between gap-3 p-4 sm:p-5">
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground sm:text-sm">{title}</p>
        <p className="mt-1 truncate text-xl font-bold sm:text-2xl">{value}</p>
        {sub ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">{sub}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {onClick ? (
          <ChevronLeft className="hidden h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-primary sm:block" aria-hidden />
        ) : null}
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12', tones[tone])}>
          {icon}
        </div>
      </div>
    </CardContent>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={hint}
        aria-label={hint ? `${title} — ${hint}` : title}
        className="group block w-full rounded-xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md">
          {body}
        </Card>
      </button>
    )
  }
  return <Card>{body}</Card>
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  // وضعیت اسناد
  DRAFT: { label: 'پیش‌نویس', cls: 'bg-secondary text-secondary-foreground' },
  POSTED: { label: 'قطعی', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'ابطال‌شده', cls: 'bg-red-100 text-red-700' },
  // وضعیت نامه
  IN_PROGRESS: { label: 'در جریان', cls: 'bg-amber-100 text-amber-700' },
  ANSWERED: { label: 'پاسخ داده‌شده', cls: 'bg-emerald-100 text-emerald-700' },
  ARCHIVED: { label: 'بایگانی', cls: 'bg-secondary text-secondary-foreground' },
  // درخواست کالا
  PENDING: { label: 'در انتظار', cls: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'تأییدشده', cls: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'ردشده', cls: 'bg-red-100 text-red-700' },
  FULFILLED: { label: 'تأمین‌شده', cls: 'bg-primary/10 text-primary' },
  // ماژول
  ACTIVE: { label: 'فعال', cls: 'bg-emerald-100 text-emerald-700' },
  INACTIVE: { label: 'غیرفعال', cls: 'bg-secondary text-secondary-foreground' },
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, cls: 'bg-secondary text-secondary-foreground' }
  return <Badge variant="secondary" className={cn('border-0 font-medium', s.cls)}>{s.label}</Badge>
}

/**
 * حالت خالی واحد (P1-T33) — آیکون + عنوان + توضیح راهنما + دکمه اقدام.
 * هیچ فهرست/تبی نباید متن لخت یا صفحه سفید نشان دهد؛ کپی فارسی از همین قالب می‌آید.
 *  - text: سازگاری قدیمی (متن واحد) — به عنوان عنوان رندر می‌شود
 *  - title/hint: مسیر استاندارد جدید
 *  - action: دکمه اقدام (مثلاً «ثبت اولین رکورد» یا «پاک‌کردن فیلترها»)
 *  - compact: چیدمان فشرده برای داخل کارت/تب داخلی
 */
export function EmptyState({
  icon, title, text, hint, action, compact,
}: {
  icon?: ReactNode
  title?: string
  text?: string
  hint?: string
  action?: ReactNode
  compact?: boolean
}) {
  const heading = title ?? text
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card/50 text-center',
        compact ? 'px-4 py-8' : 'px-4 py-12',
      )}
      role="status"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        {icon ?? <Inbox className="h-6 w-6 text-muted-foreground" />}
      </div>
      {heading ? <p className="text-sm font-medium text-foreground">{heading}</p> : null}
      {hint ? <p className="max-w-md text-xs leading-5 text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  )
}

/** حالت بارگذاری واحد (P1-T33) — برچسب اختیاری + اسکلتون؛ کپی فارسی از جدول واحد */
export function LoadingState({ rows = 4, label }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-busy="true">
      {label ? (
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {label}
        </p>
      ) : null}
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  )
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  RECEIPT: 'رسید', ISSUE: 'حواله', TRANSFER: 'انتقال', COUNT: 'شمارش',
}
export const LETTER_TYPE_LABELS: Record<string, string> = {
  INCOMING: 'وارده', OUTGOING: 'صادره', INTERNAL: 'داخلی',
}
export const GRADE_LABELS: Record<string, string> = {
  '1': 'درجه ۱', '2': 'درجه ۲', w: 'ضایعات',
}
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'مدیر سیستم', MANAGER: 'مدیر', OPERATOR: 'کارشناس', VIEWER: 'بازدیدکننده',
}
