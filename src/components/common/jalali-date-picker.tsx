'use client'

/**
 * دیت‌پیکر جلالی مشترک پلتفرم (docs/persian/persian-stack.md)
 * پوشش react-multi-date-picker با تقویم فارسی + RTL + استایل هماهنگ shadcn.
 * value همیشه رشته «YYYY/MM/DD» جلالی با ارقام لاتین است (قابل تجزیه با parseJalaliInput).
 *
 * نکته API: کتابخانه هنگام clone کردنِ render، CustomComponentProps (شامل value
 * و openCalendar و handleValueChange) را تزریق می‌کند؛ PickerShell آن‌ها را جذب
 * و مصرف می‌کند — هم هشدار DOM کنسول رفع شد و هم تقویم با openCalendar واقعاً
 * باز می‌شود (prop نامعتبر open قبلاً نادیده گرفته می‌شد).
 */
import DatePicker, { DateObject } from 'react-multi-date-picker'
import persian_fa from 'react-date-object/calendars/persian'
import persian_fa_locale from 'react-date-object/locales/persian_fa'
import { CalendarDays, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** پوسته ورودی سفارشی — props تزریقی کتابخانه را جذب/مصرف می‌کند */
function PickerShell({
  value,
  placeholder,
  clearable,
  inputClassName,
  onClear,
  openCalendar,
}: {
  placeholder: string
  clearable: boolean
  inputClassName?: string
  onClear: () => void
  // ↓ تزریق کتابخانه (CustomComponentProps) — جذب تا روی DOM نشوند
  value?: string
  openCalendar?: () => void
  onFocus?: () => void
  handleValueChange?: (e: React.ChangeEvent) => void
  onChange?: (e: React.ChangeEvent) => void
  locale?: unknown
  separator?: string
}) {
  const v = value ?? ''
  return (
    <div className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors focus-within:border-primary">
      <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        readOnly
        dir="ltr"
        value={v}
        placeholder={placeholder}
        onClick={() => openCalendar?.()}
        className={cn(
          'w-full bg-transparent text-start text-sm outline-none placeholder:text-muted-foreground',
          inputClassName,
        )}
        aria-label={placeholder}
      />
      {clearable && v ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClear()
          }}
          className="shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
          aria-label="پاک کردن تاریخ"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

export function JalaliDatePicker({
  value,
  onChange,
  placeholder = 'انتخاب تاریخ...',
  className,
  clearable = true,
  inputClassName,
}: {
  value: string | null
  onChange: (jalaliStr: string | null) => void
  placeholder?: string
  className?: string
  clearable?: boolean
  inputClassName?: string
}) {
  const dateValue = value ? new DateObject({ date: value, format: 'YYYY/MM/DD', calendar: persian_fa }) : null

  return (
    <div className={cn('relative', className)} dir="rtl">
      <DatePicker
        calendar={persian_fa}
        locale={persian_fa_locale}
        value={dateValue}
        onOpenPickNewDate={false}
        onChange={(d) => {
          // d در حالت تک‌تاریخ DateObject است (یا null هنگام پاک‌کردن)
          const obj = Array.isArray(d) ? d[0] : d
          onChange(obj ? `${obj.year}/${String(obj.month.number).padStart(2, '0')}/${String(obj.day).padStart(2, '0')}` : null)
        }}
        format="YYYY/MM/DD"
        calendarPosition="bottom-right"
        editable={false}
        containerClassName="w-full"
        render={
          <PickerShell
            placeholder={placeholder}
            clearable={clearable}
            inputClassName={inputClassName}
            onClear={() => onChange(null)}
          />
        }
      />
    </div>
  )
}
