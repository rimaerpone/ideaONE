'use client'

/**
 * اجزای فرم استاندارد (P1-T20) — react-hook-form + zod
 *
 * قاعده مهاجرت فرم‌ها:
 *  ۱) اسکیمای zod با سازنده‌های core/forms/schemas.ts (پیام = متن سرور)
 *  ۲) useForm + zodResolver؛ فیلدها فقط با FieldInput/FieldTextarea/FieldSelect/FieldDatePicker
 *  ۳) خطا «زیر فیلد» با متن واحد — toast فقط برای نتیجه عملیات، نه اعتبارسنجی
 *
 * این اجزا در components/common هستند (نه core) چون به shadcn/ui وابسته‌اند و
 * core باید بی‌طرف بماند (CH-07).
 */
import { ReactNode, useState } from 'react'
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { JalaliDatePicker } from '@/components/common/jalali-date-picker'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { faNumber } from '@/core/shared/jalali'

type BaseProps<F extends FieldValues> = {
  control: Control<F>
  name: Path<F>
  label: string
  required?: boolean
  hint?: string
  className?: string
  /** محتوای همیشگی زیر فیلد (مثلاً شمارنده نویسه) — حتی هنگام خطا هم نمایش داده می‌شود */
  extra?: ReactNode
}

function FieldShell({ label, required, error, hint, extra, children, className, htmlFor }: {
  label: string
  required?: boolean
  error?: string
  hint?: string
  extra?: ReactNode
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="ms-1 text-destructive">*</span> : null}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p role="alert" className="text-[11px] font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
      {extra}
    </div>
  )
}

/** ورودی متن متصل به فرم با خطای زیر فیلد */
export function FieldInput<F extends FieldValues>({
  control, name, label, required, hint, className, placeholder, dir = 'rtl', type = 'text', extra, list,
}: BaseProps<F> & { placeholder?: string; dir?: 'rtl' | 'ltr'; type?: string; list?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} required={required} error={fieldState.error?.message} hint={hint} extra={extra} className={className} htmlFor={name}>
          <Input
            id={name}
            name={name}
            dir={dir}
            type={type}
            className={dir === 'ltr' ? 'text-left' : undefined}
            placeholder={placeholder}
            list={list}
            value={field.value ?? ''}
            onChange={field.onChange}
            onBlur={field.onBlur}
            aria-invalid={!!fieldState.error}
          />
        </FieldShell>
      )}
    />
  )
}

/** متن بلند متصل به فرم */
export function FieldTextarea<F extends FieldValues>({
  control, name, label, required, hint, className, placeholder, rows = 3, extra,
}: BaseProps<F> & { placeholder?: string; rows?: number }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} required={required} error={fieldState.error?.message} hint={hint} extra={extra} className={className} htmlFor={name}>
          <Textarea
            id={name}
            name={name}
            dir="rtl"
            rows={rows}
            placeholder={placeholder}
            value={field.value ?? ''}
            onChange={field.onChange}
            onBlur={field.onBlur}
            aria-invalid={!!fieldState.error}
          />
        </FieldShell>
      )}
    />
  )
}

type SelectOption = { value: string; label: string }

/** انتخاب‌گر متصل به فرم — گزینه‌ها {value, label} */
export function FieldSelect<F extends FieldValues>({
  control, name, label, required, hint, className, options, placeholder, extra,
}: BaseProps<F> & { options: SelectOption[]; placeholder?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} required={required} error={fieldState.error?.message} hint={hint} extra={extra} className={className}>
          <Select dir="rtl" value={field.value || undefined} onValueChange={field.onChange}>
            <SelectTrigger aria-invalid={!!fieldState.error}>
              <SelectValue placeholder={placeholder ?? 'انتخاب...'} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>
      )}
    />
  )
}

/** تاریخ جلالی متصل به فرم — value رشته «YYYY/MM/DD» یا خالی */
export function FieldJalaliDate<F extends FieldValues>({
  control, name, label, required, hint, className, placeholder, extra,
}: BaseProps<F> & { placeholder?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} required={required} error={fieldState.error?.message} hint={hint} extra={extra} className={className}>
          <JalaliDatePicker
            value={field.value || null}
            onChange={(v) => field.onChange(v ?? '')}
            placeholder={placeholder ?? 'انتخاب تاریخ...'}
          />
        </FieldShell>
      )}
    />
  )
}

/** خطای سطح فرم (نه فیلد) — مثلاً «حداقل یک قلم الزامی است» */
export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
      {message}
    </p>
  )
}

/** خطای سطری در فرم‌های چندقلمی (P1-T22 زمینه‌سازی) */
export function RowError({ message }: { message?: string }) {
  if (!message) return null
  return <p role="alert" className="text-[10px] font-medium text-destructive">{message}</p>
}

/** هشدار سطری غیرمسدودکننده (قلم تکراری/بیش از موجودی) — کهربایی، نه خطا */
export function RowWarning({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-[10px] font-medium leading-4 text-amber-600">{message}</p>
}

// ---------------- اجزای مشترک موجد فرم‌ها (بررسی عمیق فرم‌ها — ۱۴۰۵/۰۶) ----------------

/** شمارنده نویسه زنده — n/max با ارقام فارسی؛ قرمز در صورت عبور از سقف */
export function CharCount({ value, max }: { value: string; max: number }) {
  const n = value.length
  const over = n > max
  return (
    <p dir="rtl" className={cn('text-[10px] leading-4 tabular-nums', over ? 'font-medium text-destructive' : 'text-muted-foreground')}>
      {faNumber(n)} از {faNumber(max)} نویسه
    </p>
  )
}

/** ورودی گذرواژه با دکمه نمایش/مخفی — بدون تغییر رفتار اعتبارسنجی */
export function PasswordInput({
  id, value, onChange, placeholder, autoComplete, ariaLabel, onKeyUp, onKeyDown, hint,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
  ariaLabel?: string
  onKeyUp?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  /** متن راهنمای ثابت زیر ورودی */
  hint?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          dir="ltr"
          className="pe-9 text-left"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyUp={onKeyUp}
          onKeyDown={onKeyDown}
          autoComplete={autoComplete}
          aria-label={ariaLabel ?? placeholder}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'مخفی کردن گذرواژه' : 'نمایش گذرواژه'}
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** سنجه قدرت گذرواژه — خروجی عدد ۰..۴ (فقط نمایش؛ اعتبارسنجی الزامی جداگانه است) */
export function passwordScore(pw: string, username?: string): number {
  if (!pw) return 0
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[A-Za-zآ-ی]/.test(pw) && /[0-9۰-۹]/.test(pw)) s++
  if (/[^A-Za-z0-9۰-۹آ-ی]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) s++
  if (username && pw.toLowerCase().includes(username.toLowerCase())) s = Math.max(0, s - 2)
  return Math.min(4, s)
}

const STRENGTH_LABELS = ['بسیار ضعیف', 'ضعیف', 'متوسط', 'خوب', 'قوی'] as const
const STRENGTH_COLORS = ['bg-red-500', 'bg-red-400', 'bg-amber-400', 'bg-emerald-400', 'bg-emerald-500'] as const

/** نوار قدرت گذرواژه — زیر فیلد؛ سیاست حداقلی همان ۸ نویسه + ترکیب حروف و اعداد */
export function PasswordStrength({ pw, username }: { pw: string; username?: string }) {
  const score = passwordScore(pw, username)
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div className="flex h-1.5 flex-1 gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-full flex-1 rounded-full transition-colors', i < score ? STRENGTH_COLORS[score] : 'bg-muted')} />
        ))}
      </div>
      <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
        {pw ? STRENGTH_LABELS[score] : ''}
      </span>
    </div>
  )
}

/** راهنمای میانبر صفحه‌کلید — تراشه‌های kbd با توضیح فارسی */
export function KbdHint({ keys, action }: { keys: string[]; action: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] leading-5 text-muted-foreground">
      {keys.map((k) => (
        <kbd key={k} dir="ltr" className="rounded border bg-muted px-1.5 font-mono text-[10px] text-foreground/70">{k}</kbd>
      ))}
      <span>= {action}</span>
    </span>
  )
}
