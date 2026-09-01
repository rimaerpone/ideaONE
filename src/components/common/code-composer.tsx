'use client'

/**
 * کدساز ساختارمند (موتور کدگذاری — «کد به‌عنوان جمله»)
 *
 * خلاقیت: کد = جمله‌ای با اجزای رنگی. کاربر اجزا را انتخاب می‌کند و کد «زنده» ساخته
 * می‌شود؛ براکت «کد مادر» (تبصره سند شرکت) زیر n جزء ابتدایی هایلایت می‌شود و توضیح
 * فارسی جمله‌وار همان لحظه رندر می‌شود. رمزگشا مسیر معکوس است: کد خام → اجزا + معنی.
 * عمومی برای هر خانواده قلم (کاشی/تجهیزات/قطعات/مواد اولیه) — چون طرحواره‌ها داده‌اند.
 *
 * قاعده معماری: کد کلاینت فقط پیش‌نمایش است — اعتبارسنجی نهایی و صدور شمارنده
 * با سرور (POST /api/coding/compose) است (آینه منطق موجودی زنده فرم سند).
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/core/shared/api-client'
import { qkCodingSchemes } from '@/core/query/keys'
import { useApp } from '@/store/app'
import { useCanWrite } from '@/hooks/use-can-write'
import type { CodeSchemeDto, DecodeResult } from '@/types/platform'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Sparkles, Wand2, SearchCode, ArrowLeftRight } from 'lucide-react'
import { toastErr, toastInfo } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

/** پالت رنگ اجزا — چرخه ۱۰ رنگ ملایم؛ هر جزء کد رنگ خودش را دارد */
const SEGMENT_COLORS = [
  'bg-sky-100 text-sky-800 border-sky-300',
  'bg-emerald-100 text-emerald-800 border-emerald-300',
  'bg-amber-100 text-amber-800 border-amber-300',
  'bg-rose-100 text-rose-800 border-rose-300',
  'bg-violet-100 text-violet-800 border-violet-300',
  'bg-cyan-100 text-cyan-800 border-cyan-300',
  'bg-orange-100 text-orange-800 border-orange-300',
  'bg-teal-100 text-teal-800 border-teal-300',
  'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300',
  'bg-lime-100 text-lime-800 border-lime-300',
]

export function useCodeSchemesQuery() {
  const me = useApp((s) => s.me)
  return useQuery({
    queryKey: qkCodingSchemes(me?.activeCompanyId ?? ''),
    queryFn: () => apiGet<{ schemes: CodeSchemeDto[] }>('/api/coding/schemes'),
    enabled: !!me,
    staleTime: 60_000,
  })
}

export type ComposerMapping = Record<string, string>

export function CodeComposer({
  onInsert,
  compact,
  family,
}: {
  /** «درج در فرم» — کد کامل + نگاشت فیلد مستردیتا (فقط اجزای mapsTo) */
  onInsert?: (code: string, mapping: ComposerMapping) => void
  compact?: boolean
  /** خانواده قلم هدف — طرحواره پیش‌فرضِ همین خانواده انتخاب می‌شود (فرم کالا → PRODUCT) */
  family?: string
}) {
  const canWrite = useCanWrite()
  const { data, isLoading } = useCodeSchemesQuery()
  const schemes = data?.schemes ?? []
  const [schemeCode, setSchemeCode] = useState('')
  const [mode, setMode] = useState<'build' | 'decode'>('build')
  const [parts, setParts] = useState<Record<string, string>>({})
  const [counterBusy, setCounterBusy] = useState(false)
  const [decodeInput, setDecodeInput] = useState('')
  const [decoding, setDecoding] = useState(false)
  const [decoded, setDecoded] = useState<DecodeResult | null>( null)

  // طرحواره جاری: انتخاب صریح کاربر؛ وگرنه نخستین طرحوارهِ خانواده هدف (PRODUCT → کاشی)؛ وگرنه اولین
  const scheme: CodeSchemeDto | null = useMemo(
    () => schemes.find((s) => s.code === (schemeCode || (schemes.find((x) => !family || x.itemFamily === family) ?? schemes[0])?.code)) ?? null,
    [schemes, schemeCode, family],
  )

  // ساخت زنده کد سمت کلاینت (پیش‌نمایش — سرور حاکم است)
  const live = useMemo(() => {
    if (!scheme) return { code: '', mother: '', complete: false, desc: [] as string[] }
    const filled = scheme.segments.map((seg) => parts[seg.key] ?? '')
    const code = filled.join(scheme.separator)
    const complete = scheme.segments.every((seg, i) => filled[i] !== '')
    const mother = scheme.motherSegments
      ? filled.slice(0, scheme.motherSegments).filter(Boolean).join(scheme.separator)
      : ''
    const desc = scheme.segments
      .filter((seg) => parts[seg.key])
      .map((seg) => {
        const ev = seg.enumValues.find((v) => v.code === parts[seg.key])
        return ev?.label ?? `${seg.label}: ${parts[seg.key]}`
      })
    return { code, mother, complete, desc }
  }, [scheme, parts])

  /** شماره بعدی شمارنده — سرور صادر می‌کند (مصرف دائمی؛ VIEWER رد می‌شود) */
  const issueCounter = async (segKey: string) => {
    if (!scheme) return
    setCounterBusy(true)
    try {
      const d = await apiPost<{ code: string; parts: { key: string; code: string }[] }>('/api/coding/compose', {
        schemeCode: scheme.code,
        parts: { ...parts, [segKey]: 'next' },
        issueCounters: [segKey],
      })
      // مقدار صادرشده را در فرم بنشان (بقیه اجزا از همان state)
      const issued = d.parts.find((p) => p.key === segKey)?.code ?? ''
      setParts((prev) => ({ ...prev, [segKey]: issued }))
      toastInfo({ title: 'شماره صادر شد', description: `شماره تازه این شرکت: ${issued}` })
    } catch (e) {
      toastErr({ description: e instanceof Error ? e.message : 'صدور شماره ناموفق' })
    } finally {
      setCounterBusy(false)
    }
  }

  const decode = async () => {
    if (!decodeInput.trim()) return
    setDecoding(true)
    try {
      const d = await apiGet<DecodeResult>(`/api/coding/decode?code=${encodeURIComponent(decodeInput.trim())}`)
      setDecoded(d)
    } catch (e) {
      setDecoded(null)
      toastErr({ description: e instanceof Error ? e.message : 'رمزگشایی ناموفق' })
    } finally {
      setDecoding(false)
    }
  }

  /** «درج در فرم» — نگاشت اجزای معنادار به فیلدهای مستردیتا (mapsTo) */
  const insert = () => {
    if (!scheme || !onInsert || !live.complete) return
    const mapping: ComposerMapping = {}
    for (const seg of scheme.segments) {
      if (seg.mapsTo && parts[seg.key]) {
        const ev = seg.enumValues.find((v) => v.code === parts[seg.key])
        mapping[seg.mapsTo] = ev?.label ?? parts[seg.key]
      }
    }
    onInsert(live.code, mapping)
  }

  if (isLoading) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> بارگذاری طرحواره‌های کدگذاری…</div>
  }
  if (schemes.length === 0) {
    return <p className="text-xs text-muted-foreground">طرحواره کدگذاری فعالی تعریف نشده است — کد را دستی وارد کنید.</p>
  }

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      {/* سربرگ: انتخاب طرحواره + تعویض حالت */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold">کدساز ساختارمند</span>
          <select
            aria-label="انتخاب طرحواره کدگذاری"
            dir="rtl"
            value={scheme?.code ?? ''}
            onChange={(e) => { setSchemeCode(e.target.value); setParts({}); setDecoded(null) }}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            {schemes.map((s) => (
              <option key={s.code} value={s.code}>{s.name} ({s.totalLength} کاراکتر)</option>
            ))}
          </select>
        </div>
        <Button type="button" size="sm" variant={mode === 'decode' ? 'default' : 'outline'} onClick={() => setMode(mode === 'build' ? 'decode' : 'build')} className="gap-1.5">
          <ArrowLeftRight className="h-3.5 w-3.5" /> {mode === 'build' ? 'رمزگشایی کد موجود' : 'ساخت کد جدید'}
        </Button>
      </div>

      {mode === 'decode' ? (
        /* ---------------- رمزگشا: مسیر معکوس ---------------- */
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              dir="ltr" value={decodeInput} onChange={(e) => setDecodeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void decode() } }}
              placeholder="کد را بچسبانید — مثلاً TA601012A0551MR1IS یا EQ-KLN-2-007"
              className="text-left font-mono text-xs"
              aria-label="کد برای رمزگشایی"
            />
            <Button type="button" size="sm" onClick={() => void decode()} disabled={decoding} className="gap-1.5 shrink-0">
              {decoding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SearchCode className="h-3.5 w-3.5" />} رمزگشایی
            </Button>
          </div>
          {decoded ? (
            <div className="space-y-2 rounded-lg border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold" dir="ltr">{decoded.code}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px]', decoded.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                  {decoded.ok ? `تطبیق کامل — ${decoded.schemeName}` : decoded.error ?? 'تطبیق ناقص'}
                </span>
                {decoded.motherCode ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary" dir="ltr">مادر: {decoded.motherCode}</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {decoded.parts.map((p, i) => (
                  <span key={p.key} className={cn('rounded-md border px-2 py-0.5 text-[10px]', SEGMENT_COLORS[i % SEGMENT_COLORS.length], p.error && 'opacity-50 line-through')} title={p.error ?? undefined}>
                    {p.label}: <b dir="ltr">{p.code || '—'}</b> {p.labelValue ? `· ${p.labelValue}` : ''}
                  </span>
                ))}
              </div>
              {decoded.description ? <p className="text-xs leading-5 text-muted-foreground">{decoded.description}</p> : null}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">کد را وارد کنید — طرحواره به‌صورت خودکار تشخیص داده می‌شود و اجزای ناشناخته علامت‌گذاری می‌شوند.</p>
          )}
        </div>
      ) : (
        /* ---------------- کدساز: انتخاب اجزا ---------------- */
        <div className="space-y-3">
          {/* کد زنده با اجزای رنگی + براکت کد مادر */}
          <div className="space-y-1.5 rounded-lg border bg-background p-3">
            <div className="flex flex-wrap items-center gap-1" dir="ltr">
              {scheme?.segments.map((seg, i) => {
                const v = parts[seg.key] ?? ''
                const inMother = !!scheme?.motherSegments && i < scheme.motherSegments
                return (
                  <span key={seg.key} className="inline-flex flex-col items-center">
                    <span
                      className={cn(
                        'inline-block min-w-[2ch] rounded-md border px-1.5 py-0.5 text-center font-mono text-xs font-bold',
                        v ? SEGMENT_COLORS[i % SEGMENT_COLORS.length] : 'border-dashed border-muted-foreground/40 text-muted-foreground/50',
                        inMother && v && 'underline decoration-2 underline-offset-4',
                      )}
                      title={`${seg.label}${v ? ` — ${seg.enumValues.find((x) => x.code === v)?.label ?? v}` : ' (خالی)'}`}
                    >
                      {v || '?'.repeat(seg.length)}
                    </span>
                    {/* خط پیوستگی براکت مادر */}
                    {inMother ? <span className="mt-0.5 block h-0.5 w-full bg-primary/40" aria-hidden /> : <span className="mt-0.5 block h-0.5 w-full" aria-hidden />}
                  </span>
                )
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">{live.desc.length > 0 ? live.desc.join(' · ') : 'اجزا را انتخاب کنید — کد همین‌جا ساخته می‌شود'}</p>
              {scheme?.motherSegments ? (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                  کد مادر: {live.mother || '—'} (نخست {scheme.motherSegments} جزء)
                </span>
              ) : null}
            </div>
          </div>

          {/* انتخابگر اجزا — گرید */}
          <div className={cn('grid gap-2', compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4')}>
            {scheme?.segments.map((seg) => (
              <div key={seg.key} className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">{seg.label}</Label>
                {seg.kind === 'ENUM' ? (
                  <select
                    aria-label={seg.label}
                    dir="rtl"
                    value={parts[seg.key] ?? ''}
                    onChange={(e) => setParts((prev) => ({ ...prev, [seg.key]: e.target.value }))}
                    className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  >
                    <option value="">—</option>
                    {seg.enumValues.map((v) => (
                      <option key={v.code} value={v.code}>{v.label} ({v.code})</option>
                    ))}
                  </select>
                ) : (
                  <div className="flex gap-1">
                    <Input
                      dir="ltr" inputMode="numeric" value={parts[seg.key] ?? ''}
                      onChange={(e) => setParts((prev) => ({ ...prev, [seg.key]: e.target.value.replace(/[^0-9]/g, '').slice(0, seg.length) }))}
                      placeholder={'0'.repeat(seg.length)}
                      className="h-8 text-left font-mono text-xs"
                      aria-label={seg.label}
                    />
                    <Button
                      type="button" size="sm" variant="outline" disabled={counterBusy || !canWrite}
                      onClick={() => void issueCounter(seg.key)}
                      title={canWrite ? 'شماره بعدی این شرکت را صادر کن' : 'صدور شماره نیاز به نقش نوشتن دارد'}
                      className="h-8 shrink-0 gap-1 px-2"
                    >
                      {counterBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} بعدی
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* نوار اقدام */}
          {onInsert ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                {live.complete ? 'کد کامل است — آماده درج در فرم' : 'کد هنوز کامل نیست'}
              </p>
              <Button type="button" size="sm" disabled={!live.complete} onClick={insert} className="gap-1.5">
                <Wand2 className="h-3.5 w-3.5" /> درج در فرم
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
