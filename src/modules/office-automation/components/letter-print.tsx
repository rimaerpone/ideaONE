'use client'

/**
 * P2.5-U7 / P2-T7 — چاپ نامه با سربرگ شرکت
 *
 * الگو: «پورتال چاپ» — کامپوننت به body پورت می‌شود (خارج از AppShell)، در حالت نمایش
 * یک پیش‌نمایش A4 روی پس‌زمینه تیره با نوار ابزار است؛ در @media print همه‌چیز جز
 * این پورتال مخفی می‌شود و کاغذ A4 بدون سایه/حاشیه دقیقاً یک صفحه چاپ می‌شود.
 *   - CSS حاکم در globals.css (letter-print-root + @page A4)
 *   - سجل حاکمیتی PRINT از طریق actions route (fire-and-forget — شکست آن چاپ را نمی‌شکند)
 *   - سربرگ: نام شرکت + (تنظیم اختیاری per-company letterhead.subtitle) + خط دوتایی
 *   - سرنامه استاندارد ایرانی: به نام خدا · شماره/تاریخ/پیوست · گیرنده · موضوع · متن · امضا
 */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Printer, X } from 'lucide-react'
import { apiPost } from '@/core/shared/api-client'
import type { LetterDetail } from '@/types/platform'
import { faDigits, faDocNumber, formatJalaliLong } from '@/core/shared/jalali'

const CONF_FA: Record<string, string> = { NORMAL: 'عادی', CONFIDENTIAL: 'محرمانه', SECRET: 'سری' }

/** برچسب سطر «به:» بسته به نوع نامه — وارده از کی آمده، صادره به کی می‌رود */
function partyLabel(letter: LetterDetail): { label: string; value: string } {
  if (letter.type === 'INCOMING') return { label: 'فرستنده', value: letter.senderTitle ?? '—' }
  if (letter.type === 'OUTGOING') return { label: 'گیرنده', value: letter.receiverTitle ?? '—' }
  // داخلی: گیرنده بیرونی ندارد؛ اگر ثبت شده باشد نمایش می‌دهیم وگرنه واحد سازمانی
  return { label: 'گیرنده', value: letter.receiverTitle ?? 'کارکنان واحد مربوطه' }
}

export function LetterPrintDialog({ letter, open, onOpenChange }: { letter: LetterDetail; open: boolean; onOpenChange: (v: boolean) => void }) {
  // Esc = بستن پیش‌نمایش (لایه‌بندی Esc: این دیالوگ آخرین لایه باز است — پاسخ‌دهنده ثبت می‌شود تا به شل نرسد)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  if (!open || typeof document === 'undefined') return null

  const party = partyLabel(letter)
  const subtitle = letter.letterheadSubtitle ?? letter.companyLegalName ?? null

  const doPrint = () => {
    // سجل حاکمیتی چاپ (P2.5-U7) — fire-and-forget: خطای شبکه چاپ را متوقف نمی‌کند
    void apiPost(`/api/letters/${letter.id}/actions`, { action: 'PRINT' }).catch(() => undefined)
    window.print()
  }

  return createPortal(
    // data-state="open" — هم‌زبان با پنجره‌های Radix: گارد Esc سراسری (anyOverlayOpen)
    // این صفت را می‌سنجد؛ بدون آن Esc پورتال را می‌بست و هم‌زمان تب فعال را هم می‌بست.
    <div className="letter-print-root" role="dialog" aria-modal="true" aria-label="پیش‌نمایش چاپ نامه" data-state="open">
      {/* نوار ابزار — فقط در نمایش؛ در چاپ مخفی (no-print) */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-4 py-2.5 backdrop-blur">
        <p className="text-xs leading-5 text-muted-foreground">
          پیش‌نمایش چاپ — کاغذ A4 · سربرگ شرکت «{letter.companyName}»
          {subtitle ? ` · ${subtitle}` : ''}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={doPrint} className="gap-1.5">
            <Printer className="h-3.5 w-3.5" /> چاپ
          </Button>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} className="gap-1.5">
            <X className="h-3.5 w-3.5" /> بستن
          </Button>
        </div>
      </div>

      {/* اسکرول‌پذیر در نمایش؛ در چاپ استاتیک */}
      <div className="letter-print-scroll flex justify-center overflow-y-auto p-4 sm:p-8" data-testid="letter-print-scroll">
        {/* کاغذ A4 */}
        <article
          className="letter-print-sheet bg-white text-black shadow-2xl"
          data-testid="letter-print-sheet"
          aria-label={`نسخه چاپی نامه ${letter.subject}`}
        >
          <header className="letter-print-header">
            <p className="text-center text-[13px] leading-6">به نام خدا</p>
            <h1 className="mt-1 text-center text-[22px] font-bold leading-9">{letter.companyName}</h1>
            {subtitle ? <p className="text-center text-[13px] leading-6">{subtitle}</p> : null}
            <div className="letter-print-rule" aria-hidden="true" />
          </header>

          {/* سرنامه: شماره / تاریخ / پیوست (راست) — طبقه‌بندی (چپ) */}
          <div className="mt-4 flex items-start justify-between gap-4 text-[13px] leading-7">
            <dl className="space-y-0.5">
              {/* P2-T8 — قالب واحد شماره نمایشی سرورساخته (پیشوند/پسوند per-type) */}
              <div className="flex gap-1.5"><dt className="font-bold">شماره:</dt><dd>{letter.displayNumber || faDocNumber(letter.number, letter.createdAt)}</dd></div>
              <div className="flex gap-1.5"><dt className="font-bold">تاریخ:</dt><dd>{formatJalaliLong(letter.createdAt)}</dd></div>
              <div className="flex gap-1.5"><dt className="font-bold">پیوست:</dt><dd>{letter.attachmentsCount > 0 ? `${faDigits(letter.attachmentsCount)} فایل` : 'ندارد'}</dd></div>
            </dl>
            <dl className="space-y-0.5">
              <div className="flex gap-1.5"><dt className="font-bold">شماره ثبت:</dt><dd>{faDigits(`${letter.companyCode}-${letter.number}`)}</dd></div>
              <div className="flex gap-1.5"><dt className="font-bold">طبقه‌بندی:</dt><dd>{CONF_FA[letter.confidentiality] ?? letter.confidentiality}</dd></div>
            </dl>
          </div>

          {/* گیرنده/فرستنده + موضوع */}
          <div className="mt-5 space-y-2.5 text-[14px] leading-8">
            <p><span className="font-bold">{party.label}: </span>{party.value}</p>
            <p><span className="font-bold">موضوع: </span>{letter.subject}</p>
          </div>

          {/* متن نامه — سرریز طبیعی به صفحه بعد (A4 height auto) */}
          <div className="letter-print-body mt-5 whitespace-pre-line text-justify text-[14px] leading-9">
            {letter.body}
          </div>

          {/* امضا — سمت چپ (پایان‌نامه ایرانی) */}
          <div className="mt-12 flex justify-end">
            <div className="text-[13px] leading-7 text-start">
              <p>با احترام</p>
              <p className="font-bold">{letter.creatorName}</p>
              {letter.creatorTitle ? <p>{letter.creatorTitle}</p> : null}
            </div>
          </div>

          {letter.letterheadFooter ? (
            <footer className="letter-print-footer">
              <div className="letter-print-rule" aria-hidden="true" />
              <p className="text-center text-[11px] leading-5">{letter.letterheadFooter}</p>
            </footer>
          ) : null}
        </article>
      </div>
    </div>,
    document.body,
  )
}
