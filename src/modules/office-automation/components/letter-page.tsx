'use client'

/**
 * صفحه رکورد نامه (P1.5-T6/T7) — جایگزین کامل LetterDetailDialog و NewLetterDialog.
 * نمایش و اقدام روی رکورد «صفحه کامل» است نه پاپ‌آپ (بازخورد کاربر):
 *  - هدر: نوع/شماره/وضعیت/فوریت/محرمانگی + نوار وضعیت گردش + شناسنامه
 *  - نوار اقدام: ارجاع (پنل درون‌خطی) / پاسخ / تأیید / بایگانی + دستیار هوشمند (HITL)
 *  - تب‌های داخلی (قالب استاندارد U10): متن و اقدام · گردش نامه · پیوست‌ها
 * فرم ثبت نامه هم صفحه است: پس از ذخیره، تب «جدید» با جامه‌ویژه به تب «نامه شماره …» تبدیل می‌شود.
 */

import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { useApp } from '@/store/app'
import { useWorkspace, type WorkspaceTab } from '@/store/workspace'
import { useCanWrite } from '@/hooks/use-can-write'
import { useRecordInnerTab } from '@/hooks/use-record-inner-tab'
import { useDirtyTracking } from '@/hooks/use-dirty-tracking'
import { apiGet, apiPost, apiUpload } from '@/core/shared/api-client'
import { QK_PREFIX } from '@/core/query/keys'
import { faJalaliDate, faOptional, faRequired } from '@/core/forms/schemas'
import { useLetterQuery, useLetterAttachmentsQuery, useReferUsersQuery } from '@/modules/office-automation/queries'
import { AI_CATEGORIES, AI_SUMMARY_MAX } from '@/modules/office-automation/ai-categories'
import type { AiSuggestion, AttachmentItem, LetterDetail, OcrScanData, UserItem } from '@/types/platform'
import { LETTER_TYPE_LABELS, StatusBadge, EmptyState } from '@/components/common/ui-bits'
import { RecordPageShell } from '@/components/common/record-page-shell'
import { LetterPrintDialog } from '@/modules/office-automation/components/letter-print'
import { CharCount, FieldInput, FieldJalaliDate, FieldSelect, FieldTextarea, KbdHint } from '@/components/common/form-bits'
import { FormSection } from '@/components/common/form-section'
import { SearchSelect } from '@/components/common/search-select'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Archive, ArrowLeftCircle, CheckCircle2, Download, Loader2, MessageSquareReply, Paperclip, Printer, RotateCcw, ScanText, Send, Sparkles, Upload, X,
} from 'lucide-react'
import { formatJalali, formatJalaliLong, faDigits, faNumber, faDocNumber, parseJalaliInput } from '@/core/shared/jalali'
import { JalaliDatePicker } from '@/components/common/jalali-date-picker'
import { toastErr, toastInfo, toastOk } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { clearDraft, draftKey, DraftAutosave, useDraftRestore } from '@/hooks/use-draft'
import { AutosaveIndicator, RestoredDraftBanner } from '@/components/common/draft-banner'
// P2-T10 — کمکی‌های مهلت مشترک ماژول (صفحه رکورد + پیش‌نمایش)
import { deadlineTone, liveStepDeadline } from '../deadline'

const ACTION_LABELS: Record<string, string> = {
  REFER: 'ارجاع', ANSWER: 'پاسخ', APPROVE: 'تأیید', ARCHIVE: 'بایگانی',
}

// چرخه عمر نامه: ثبت ← در جریان ← نتیجه (پاسخ/تأیید) ← بایگانی
const LETTER_STEPS = [
  { key: 'DRAFT', label: 'ثبت' },
  { key: 'IN_PROGRESS', label: 'در جریان' },
  { key: 'DONE', label: 'پاسخ/تأیید' },
  { key: 'ARCHIVED', label: 'بایگانی' },
]
const LETTER_STEP_INDEX: Record<string, number> = { DRAFT: 0, IN_PROGRESS: 1, ANSWERED: 2, APPROVED: 2, ARCHIVED: 3 }

export function LetterPage({ tab }: { tab: WorkspaceTab }) {
  if (tab.recordId === 'new') return <NewLetterPage tabId={tab.id} />
  return <LetterDetailPage recordId={tab.recordId!} tabId={tab.id} />
}

// ---------------- صفحه جزئیات نامه ----------------

function LetterDetailPage({ recordId, tabId }: { recordId: string; tabId: string }) {
  const me = useApp((s) => s.me?.user ?? null)
  const canWrite = useCanWrite() // P1-T18 — آینه UI نقش بازدیدکننده
  const setTabTitle = useWorkspace((s) => s.setTabTitle)
  const { data, isLoading, error, refetch } = useLetterQuery(recordId)
  const letter = data?.letter ?? null
  // U10 — ماندگاری تب داخلی per رکورد + deep-link (?t=)
  const [innerTab, setInnerTab] = useRecordInnerTab('letters', recordId, [{ key: 'content' }, { key: 'workflow' }, { key: 'attachments' }])
  const [referOpen, setReferOpen] = useState(false)
  // P2-T4 — پنل پاسخ درون‌خطی (متن پاسخ الزامی)
  const [answerOpen, setAnswerOpen] = useState(false)
  // P2.5-U7 / P2-T7 — پیش‌نمایش/چاپ با سربرگ (عملیات خواندنی — همه نقش‌ها)
  const [printOpen, setPrintOpen] = useState(false)

  // P1-T36 — مالکیت اقدام: نامه در جریان در کارتابل من، یا پیش‌نویسی که خودم ساخته‌ام
  // (بدون این، دبیرخانه نمی‌توانست پیش‌نویس بدون ارجاع اولیه را ارجاع دهد)
  const isMine = !!letter && (
    (letter.holderId === me?.id && letter.status === 'IN_PROGRESS')
    || (letter.status === 'DRAFT' && letter.creatorId === me?.id)
  )

  // عنوان تب = موضوع نامه (پس از بارگذاری؛ ناوبری از اعلان عنوان دقیق ندارد)
  const subject = letter?.subject
  useEffect(() => {
    if (!subject) return
    const current = useWorkspace.getState().tabs.find((t) => t.id === tabId)
    if (current && current.title !== subject && !current.title.startsWith('نامه')) setTabTitle(tabId, subject)
  }, [subject, tabId, setTabTitle])

  const deadline = letter?.deadlineAt ? new Date(letter.deadlineAt) : null
  const overdue = deadline && deadline.getTime() < Date.now()
  // P2-T10 — مهلت گام جاری (اختصاصی دارنده فعلی) — جدا از مهلت کلی نامه
  const stepDeadline = letter ? liveStepDeadline(letter) : null
  const stepTone = stepDeadline ? deadlineTone(stepDeadline) : null

  return (
    <RecordPageShell
      viewKey="letters"
      icon="Mail"
      title={letter?.subject ?? 'نامه'}
      loading={isLoading}
      error={error instanceof Error ? error.message : error ? 'نامه بارگذاری نشد' : null}
      onRetry={() => void refetch()}
      badges={letter ? (
        <>
          <Badge className="border-0 bg-primary/10 text-primary">{LETTER_TYPE_LABELS[letter.type]} · شماره {faDocNumber(letter.number, letter.createdAt)}</Badge>
          <StatusBadge status={letter.status} />
          {letter.urgency === 'URGENT' ? <Badge className="border-0 bg-red-100 text-red-700">فوری</Badge> : null}
          {letter.confidentiality !== 'NORMAL' ? (
            <Badge className="border-0 bg-amber-100 text-amber-700">{letter.confidentiality === 'SECRET' ? 'سری' : 'محرمانه'}</Badge>
          ) : null}
        </>
      ) : null}
      statusSteps={{ steps: LETTER_STEPS, currentIndex: letter ? (LETTER_STEP_INDEX[letter.status] ?? 0) : 0 }}
      info={letter ? [
        { label: letter.type === 'INCOMING' ? 'فرستنده' : letter.type === 'OUTGOING' ? 'گیرنده' : 'ثبت‌کننده', value: letter.type === 'INCOMING' ? letter.senderTitle : letter.type === 'OUTGOING' ? letter.receiverTitle : letter.creatorName },
        { label: 'تاریخ ثبت', value: formatJalaliLong(letter.createdAt) },
        { label: 'شرکت', value: letter.companyName },
        { label: 'در کارتابل', value: letter.holderName ?? '—' },
        ...(deadline ? [{ label: 'مهلت اقدام', value: <span className={overdue ? 'text-red-600' : undefined}>{formatJalali(letter.deadlineAt!)}{overdue ? ' — گذشته است!' : ''}</span> }] : []),
        // P2-T10 — فقط وقتی گام جاری مهلت اختصاصی متفاوت با مهلت نامه دارد
        ...(stepDeadline && (!deadline || stepDeadline.getTime() !== deadline.getTime()) ? [{
          label: 'مهلت گام جاری',
          value: (
            <span className={stepTone === 'overdue' ? 'text-red-600' : stepTone === 'near' ? 'text-amber-600' : undefined}>
              {formatJalali(stepDeadline)}{stepTone === 'overdue' ? ' — گذشته است!' : stepTone === 'near' ? ' — نزدیک' : ''}
            </span>
          ),
        }] : []),
      ] : undefined}
      actions={letter ? (
        <>
          {/* P2.5-U7 / P2-T7 — چاپ با سربرگ: خواندنی است؛ VIEWER هم می‌بیند (آینه گارد سروری PRINT) */}
          <Button size="sm" variant="outline" onClick={() => setPrintOpen(true)} className="gap-1.5" title="پیش‌نمایش و چاپ A4 با سربرگ شرکت">
            <Printer className="h-3.5 w-3.5" /> چاپ
          </Button>
          {isMine && canWrite ? (
            <>
              <Button size="sm" onClick={() => { setReferOpen((v) => !v); setInnerTab('content') }} className="gap-1.5">
                <Send className="h-3.5 w-3.5" /> ارجاع
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAnswerOpen((v) => !v); setReferOpen(false); setInnerTab('content') }} className="gap-1.5">
                <MessageSquareReply className="h-3.5 w-3.5" /> ثبت پاسخ
              </Button>
              <Button size="sm" variant="outline" onClick={() => void act('APPROVE')} className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> تأیید و بازگشت به دبیرخانه
              </Button>
              <Button size="sm" variant="outline" onClick={() => void act('ARCHIVE')} className="gap-1.5">
                <Archive className="h-3.5 w-3.5" /> بایگانی
              </Button>
            </>
          ) : null}
        </>
      ) : undefined}
      // P2.5-U10 — قالب استاندارد: محتوا → گردش و تاریخ → پیوست‌ها + شمارنده فارسی
      innerTabs={[
        { key: 'content', label: 'متن و اقدام' },
        { key: 'workflow', label: `گردش نامه${letter ? ` (${faNumber(letter.referrals.length)})` : ''}` },
        { key: 'attachments', label: `پیوست‌ها${letter ? ` (${faNumber(letter.attachmentsCount ?? 0)})` : ''}` },
      ]}
      activeInnerTab={innerTab}
      onInnerTabChange={setInnerTab}
    >
      {letter ? (
        <>
          {innerTab === 'content' ? <LetterContentTab letter={letter} onActed={() => void refetch()} referOpen={referOpen} onReferClose={() => setReferOpen(false)} answerOpen={answerOpen} onAnswerClose={() => setAnswerOpen(false)} onAnswer={(text) => void act('ANSWER', undefined, undefined, text)} /> : null}
          {innerTab === 'attachments' ? <LetterAttachmentsTab letterId={letter.id} onChanged={() => void refetch()} /> : null}
          {innerTab === 'workflow' ? <LetterWorkflowTab letter={letter} /> : null}
        </>
      ) : null}
      {/* P2.5-U7 — پورتال چاپ: به body پورت می‌شود؛ در @media print تنها محتوای صفحه است */}
      {letter ? <LetterPrintDialog letter={letter} open={printOpen} onOpenChange={setPrintOpen} /> : null}
    </RecordPageShell>
  )

  async function act(action: string, toUserId?: string, note?: string, answerText?: string) {
    try {
      await apiPost(`/api/letters/${recordId}/actions`, { action, toUserId, note, answerText })
      toastOk({ title: 'انجام شد', description: 'اقدام شما با موفقیت ثبت شد' })
      setReferOpen(false)
      setAnswerOpen(false)
      await refetch()
    } catch (e) {
      toastErr({ title: 'خطا', description: e instanceof Error ? e.message : 'اقدام ثبت نشد' })
    }
  }
}

// ---------------- تب «متن و اقدام» ----------------

function LetterContentTab({ letter, onActed, referOpen, onReferClose, answerOpen, onAnswerClose, onAnswer }: {
  letter: LetterDetail
  onActed: () => void
  referOpen: boolean
  onReferClose: () => void
  answerOpen: boolean
  onAnswerClose: () => void
  onAnswer: (text: string) => void
}) {
  const me = useApp((s) => s.me?.user ?? null)
  const canWrite = useCanWrite()
  // آینه منطق مالکیت لایه بیرونی (خط isMine در LetterPage) — پیش‌نویسِ خودساخته هم قابل ارجاع است
  // (P1-T36: بدون این، دبیرخانه نمی‌توانست نامه تازه‌ثبت‌شده DRAFT را ارجاع دهد — باگ G2)
  const isMine = (letter.holderId === me?.id && letter.status === 'IN_PROGRESS')
    || (letter.status === 'DRAFT' && letter.creatorId === me?.id)
  const [referTo, setReferTo] = useState('')
  const [note, setNote] = useState('')
  // P2-T10 — مهلت اختصاصی گام (رشته جلالی از دیت‌پیکر؛ null = بدون مهلت)
  const [stepDeadline, setStepDeadline] = useState<string | null>(null)
  // هشدار مهلت گذشته (غیرمسدودکننده — ثبت عمدی تاریخ گذشته مجاز؛ آینه الگوی فرم ثبت)
  const stepDeadlinePast = useMemo(() => {
    if (!stepDeadline) return false
    const d = parseJalaliInput(stepDeadline)
    return !!d && d.getTime() < Date.now()
  }, [stepDeadline])
  // P2-T4 — متن پاسخ (الزامی) + خطای اعتبارسنجی آینه سرور
  const [answerText, setAnswerText] = useState('')
  const [answerError, setAnswerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiSuggest, setAiSuggest] = useState<AiSuggestion | null>(null)
  // P2-T14 — پیش‌نویس ویرایش‌پذیر کارت پیشنهاد (طبقه/خلاصه) — نسخه ویرایش‌شده اعمال می‌شود، نه خروجی خام مدل
  const [aiDraft, setAiDraft] = useState<{ category: string; summary: string } | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const { data: usersData } = useReferUsersQuery()
  const users: UserItem[] = usersData?.users ?? []

  // بررسی عمیق فرم‌ها — ۱۴۰۵/۰۶: فوکوس خودکار روی گیرنده هنگام باز شدن پنل ارجاع
  useEffect(() => {
    if (!referOpen) return
    const t = setTimeout(() => {
      const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="گیرنده ارجاع"]')
      trigger?.focus()
    }, 80)
    return () => clearTimeout(t)
  }, [referOpen])

  const refer = async () => {
    if (!referTo) return
    setBusy(true)
    try {
      // P2-T10 — مهلت گام در همان اقدام ارجاع (اختیاری)؛ اعتبارسنجی آینه سرور در سرویس
      await apiPost(`/api/letters/${letter.id}/actions`, { action: 'REFER', toUserId: referTo, note: note || undefined, deadlineAt: stepDeadline ?? undefined })
      toastOk({ title: 'ارجاع شد', description: stepDeadline ? 'نامه در کارتابل گیرنده قرار گرفت' : 'نامه در کارتابل گیرنده قرار گرفت' })
      setReferTo('')
      setNote('')
      setStepDeadline(null)
      onReferClose()
      onActed()
    } catch (e) {
      toastErr({ title: 'خطا', description: e instanceof Error ? e.message : 'ارجاع ثبت نشد' })
    } finally {
      setBusy(false)
    }
  }

  // P2-T4 — ثبت پاسخ با متن الزامی (اعتبارسنجی آینه سرور: غیرخالی + حداکثر ۵٬۰۰۰ نویسه)
  const submitAnswer = () => {
    const t = answerText.trim()
    if (!t) { setAnswerError('متن پاسخ الزامی است'); return }
    if (t.length > 5000) { setAnswerError('متن پاسخ حداکثر ۵٬۰۰۰ نویسه است'); return }
    setAnswerError(null)
    onAnswer(t)
    setAnswerText('')
  }

  const askAi = async () => {
    setAiBusy(true)
    setAiError(null)
    try {
      const d = await apiPost<{ suggestion: AiSuggestion }>('/api/ai/letter-assist', { letterId: letter.id })
      setAiSuggest(d.suggestion)
      setAiDraft({ category: d.suggestion.category, summary: d.suggestion.summary })
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'سرویس در دسترس نیست')
    } finally {
      setAiBusy(false)
    }
  }

  const aiEdited = !!aiSuggest && !!aiDraft && (aiDraft.category !== aiSuggest.category || aiDraft.summary !== aiSuggest.summary)
  const aiApplyDisabled = !aiDraft || !aiDraft.category || !aiDraft.summary.trim() || aiDraft.summary.length > AI_SUMMARY_MAX

  const applyAi = async () => {
    if (!aiDraft) return
    setBusy(true)
    try {
      await apiPost('/api/ai/apply', { letterId: letter.id, category: aiDraft.category, summary: aiDraft.summary })
      toastOk({ title: 'پیشنهاد اعمال شد', description: 'طبقه‌بندی و خلاصه در پرونده نامه ثبت شد' })
      onActed()
    } catch (e) {
      toastErr({ title: 'خطا', description: e instanceof Error ? e.message : 'ثبت نشد' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* متن نامه */}
      <div className="rounded-xl border bg-muted/30 p-4 text-sm leading-7 whitespace-pre-wrap">
        {letter.body}
      </div>

      {/* پنل ارجاع درون‌خطی — به‌جای دیالوگ؛ در جریان کار کاربر می‌ماند */}
      {isMine && canWrite && referOpen ? (
        <div
          className="rounded-xl border border-primary/30 bg-primary/5 p-4"
          onKeyDown={(e) => { if (e.key === 'Escape') onReferClose() }}
        >
          <p className="text-sm font-medium">ارجاع نامه به همکار</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">گیرنده ارجاع</Label>
              <SearchSelect
                value={referTo}
                onChange={(v) => setReferTo(v === referTo ? '' : v)}
                placeholder="انتخاب همکار..."
                aria-label="گیرنده ارجاع"
                options={users
                  .filter((u) => u.id !== me?.id && u.isActive !== false)
                  .map((u) => ({ value: u.id, label: u.fullName, hint: u.jobTitle ?? undefined }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">یادداشت اقدام (اختیاری)</Label>
              <Textarea dir="rtl" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="توضیح برای گیرنده ارجاع..." />
              <CharCount value={note} max={1000} />
            </div>
            {/* P2-T10 — مهلت اختصاصی این گام: تقویم جلالی + هشدار تاریخ گذشته (هم‌الگو با فرم ثبت) */}
            <div className="space-y-1.5">
              <Label className="text-xs">مهلت گام گیرنده (اختیاری)</Label>
              <JalaliDatePicker value={stepDeadline} onChange={setStepDeadline} placeholder="مهلت اقدام گیرنده..." />
              {stepDeadlinePast ? (
                <p className="text-[11px] font-medium leading-4 text-amber-600">این تاریخ در گذشته است — اگر عمدی نیست، مهلت را اصلاح کنید</p>
              ) : null}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy || !referTo} onClick={() => void refer()} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} ثبت ارجاع
            </Button>
            <Button size="sm" variant="ghost" onClick={onReferClose}>انصراف</Button>
            {!referTo ? <span className="text-[11px] text-muted-foreground">برای فعال شدن «ثبت ارجاع»، ابتدا گیرنده را انتخاب کنید</span> : null}
          </div>
        </div>
      ) : null}

      {/* پنل پاسخ درون‌خطی (P2-T4) — متن پاسخ الزامی؛ ثبت مستقیم بدون متن ممنوع */}
      {isMine && canWrite && answerOpen ? (
        <div
          className="rounded-xl border border-primary/30 bg-primary/5 p-4"
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setAnswerText(''); setAnswerError(null); onAnswerClose() }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submitAnswer() }
          }}
        >
          <p className="text-sm font-medium">ثبت پاسخ به نامه</p>
          <div className="mt-3 space-y-1.5">
            <Label className="text-xs">متن پاسخ (الزامی)</Label>
            <Textarea
              dir="rtl" rows={4} value={answerText}
              onChange={(e) => { setAnswerText(e.target.value); if (answerError) setAnswerError(null) }}
              placeholder="متن پاسخ به این نامه — در تاریخچه گردش نمایش داده می‌شود..."
              aria-label="متن پاسخ"
              aria-invalid={!!answerError}
            />
            {answerError ? <p className="text-xs text-destructive" role="alert">{answerError}</p> : null}
            <CharCount value={answerText} max={5000} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!answerText.trim()} onClick={submitAnswer} className="gap-1.5">
              <MessageSquareReply className="h-3.5 w-3.5" /> ثبت پاسخ
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAnswerText(''); setAnswerError(null); onAnswerClose() }}>انصراف</Button>
            <span className="text-[11px] text-muted-foreground">پاسخ ثبت‌شده در «گردش نامه» با متن کامل نمایش داده می‌شود.</span>
            <KbdHint keys={['Ctrl', 'Enter']} action="ثبت پاسخ" />
          </div>
        </div>
      ) : null}

      {/* خروجی تأییدشده AI روی رکورد */}
      {letter.aiCategory || letter.aiSummary ? (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" />
            دستیار هوشمند (تأییدشده)
          </p>
          <div className="mt-2 space-y-1.5 text-sm leading-6">
            {letter.aiCategory ? <p>طبقه‌بندی: <span className="font-medium">{letter.aiCategory}</span></p> : null}
            {letter.aiSummary ? <p className="text-muted-foreground">{letter.aiSummary}</p> : null}
          </div>
        </div>
      ) : null}

      {/* دستیار هوشمند — موج صفر (HITL) */}
      {letter.confidentiality !== 'SECRET' ? (
        <div className="space-y-2 rounded-xl border p-4">
          <Separator className="mb-2" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              دستیار هوشمند (طبقه‌بندی و خلاصه)
            </p>
            <Button size="sm" variant="secondary" disabled={aiBusy} onClick={() => void askAi()} className="gap-1.5">
              {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {aiBusy ? 'در حال تحلیل...' : 'دریافت پیشنهاد'}
            </Button>
          </div>
          {aiError ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{aiError}</p> : null}
          {aiSuggest && aiDraft ? (
            <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 text-sm leading-6">
              {/* P2-T14 — کارت ویرایش‌پذیر: مقادیر پیش از اعمال قابل اصلاح‌اند؛ نسخه ویرایش‌شده ثبت می‌شود */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">طبقه‌بندی (قابل ویرایش)</Label>
                  <Select value={aiDraft.category} onValueChange={(v) => setAiDraft({ ...aiDraft, category: v })}>
                    <SelectTrigger className="w-full" aria-label="طبقه‌بندی پیشنهاد"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AI_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    اولویت پیشنهادی: <span className="font-medium">{aiSuggest.priority}</span>
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">خلاصه (قابل ویرایش)</Label>
                  <Textarea
                    dir="rtl" rows={4} value={aiDraft.summary}
                    onChange={(e) => setAiDraft({ ...aiDraft, summary: e.target.value })}
                    aria-label="خلاصه پیشنهاد"
                    aria-invalid={aiDraft.summary.length > AI_SUMMARY_MAX}
                  />
                  <CharCount value={aiDraft.summary} max={AI_SUMMARY_MAX} />
                </div>
              </div>
              {aiSuggest.keyPoints.length > 0 ? (
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-muted-foreground" aria-label="نکات کلیدی پیشنهاد">
                  {aiSuggest.keyPoints.map((k, i) => <li key={i}>{k}</li>)}
                </ul>
              ) : null}
              {aiEdited ? (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" role="status">
                  پیشنهاد ویرایش شده — نسخه ویرایش‌شده شما (نه خروجی خام مدل) اعمال می‌شود
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={busy || aiApplyDisabled} onClick={() => void applyAi()} className="gap-1.5">
                  <ArrowLeftCircle className="h-3.5 w-3.5" /> تأیید و اعمال {aiEdited ? 'نسخه ویرایش‌شده' : 'پیشنهاد'}
                </Button>
                {aiEdited ? (
                  <Button size="sm" variant="ghost" onClick={() => setAiDraft({ category: aiSuggest.category, summary: aiSuggest.summary })} className="gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" /> بازگردانی پیشنهاد اصلی
                  </Button>
                ) : null}
                <span className="text-[11px] text-muted-foreground">هیچ پیشنهادی بدون تأیید انسانی ذخیره نمی‌شود (HITL)</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl border p-4 text-xs text-muted-foreground">برای نامه‌های «سری»، تحلیل هوش مصنوعی طبق سیاست داده غیرفعال است.</p>
      )}
    </div>
  )
}

// ---------------- تب «پیوست‌ها» ----------------

function LetterAttachmentsTab({ letterId, onChanged }: { letterId: string; onChanged: () => void }) {
  const { data, refetch } = useLetterAttachmentsQuery(letterId)
  const [uploadBusy, setUploadBusy] = useState(false)
  const attachments: AttachmentItem[] = data?.attachments ?? []

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploadBusy(true)
    try {
      await apiUpload(`/api/letters/${letterId}/attachments`, file)
      toastOk({ title: 'پیوست افزوده شد', description: file.name })
      await refetch()
      onChanged()
    } catch (e) {
      toastErr({ title: 'خطا در آپلود', description: e instanceof Error ? e.message : 'آپلود ناموفق بود' })
    } finally {
      setUploadBusy(false)
    }
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          پیوست‌ها ({faNumber(attachments.length)})
        </p>
        <label className="inline-flex">
          <input
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xls,.xlsx"
            onChange={(e) => { void upload(e.target.files?.[0]); e.currentTarget.value = '' }}
          />
          <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-accent">
            {uploadBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            افزودن پیوست
          </span>
        </label>
      </div>
      {attachments.length === 0 ? (
        <EmptyState compact text="پیوستی ثبت نشده است" hint="PDF، تصویر، Word، Excel یا متن تا سقف ۱۰ مگابایت — با «افزودن پیوست» بارگذاری کنید." />
      ) : (
        <ul className="mt-2 space-y-1.5">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate" dir="auto">{a.fileName}</span>
              <span className="shrink-0 text-muted-foreground" dir="ltr">{faNumber(Math.max(1, Math.round(a.sizeBytes / 1024)))} KB</span>
              <a
                href={`/api/attachments/${a.fileObjectId}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 transition-colors hover:bg-accent"
                aria-label={`دانلود ${a.fileName}`}
              >
                <Download className="h-3 w-3" /> دانلود
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------- تب «گردش نامه» ----------------

function LetterWorkflowTab({ letter }: { letter: LetterDetail }) {
  if (letter.referrals.length === 0) return <EmptyState compact text="هنوز ارجاعی ثبت نشده است" hint="با ارجاع نامه به همکاران، گردش آن به‌صورت زمانی همین‌جا ثبت می‌شود." />
  return (
    <div className="rounded-xl border p-4">
      <p className="mb-3 text-sm font-medium">تاریخچه گردش نامه ({faNumber(letter.referrals.length)} اقدام)</p>
      <ol className="relative space-y-4 border-s-2 border-muted ps-4">
        {letter.referrals.map((rf, idx) => {
          // P2-T10 — گام زنده: آخرین ارجاعِ رساننده نامه به دارنده فعلی (فقط برای نامه در جریان)
          const isLive = letter.status === 'IN_PROGRESS' && idx === letter.referrals.length - 1 && rf.toUserId === letter.holderId
          const tone = rf.deadlineAt ? (isLive ? deadlineTone(new Date(rf.deadlineAt)) : 'idle') : null
          return (
            <li key={rf.id} className="relative">
              <span className={cn('absolute -start-[22px] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary', tone === 'overdue' && 'bg-red-500', tone === 'near' && 'bg-amber-500')} />
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="font-medium">{rf.fromName}</span>
                <ArrowLeftCircle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{rf.toName}</span>
                <Badge variant="secondary" className="border-0 bg-secondary text-secondary-foreground">{ACTION_LABELS[rf.action] ?? rf.action}</Badge>
                {/* P2-T10 — مهلت اختصاصی همین گام: قرمز (گذشته) / کهربایی (نزدیک ≤۳ روز) روی گام زنده؛ گام‌های تاریخی خنثی */}
                {rf.deadlineAt ? (
                  <span
                    className={cn(
                      'rounded-md border px-1.5 py-0.5 text-[11px] leading-4',
                      tone === 'overdue' ? 'border-red-200 bg-red-50 text-red-600' : tone === 'near' ? 'border-amber-200 bg-amber-50 text-amber-600' : 'border-border bg-muted/40 text-muted-foreground',
                    )}
                  >
                    مهلت گام: {formatJalali(rf.deadlineAt)}{tone === 'overdue' ? ' — گذشته' : tone === 'near' ? ' — نزدیک' : ''}
                  </span>
                ) : null}
              </div>
              {/* P2-T4 — متن پاسخ: بلوک برجسته (پاسخ = محتوای نامه است، نه یادداشت) */}
              {rf.answerText ? (
                <div className="mt-2 rounded-lg border bg-muted/40 p-3 text-sm leading-6 whitespace-pre-wrap" dir="auto">
                  {rf.answerText}
                </div>
              ) : null}
              {rf.note ? <p className="mt-1 text-xs leading-5 text-muted-foreground">«{rf.note}»</p> : null}
              <p className="mt-0.5 text-[11px] text-muted-foreground">{formatJalali(rf.createdAt, true)}</p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ---------------- فرم ثبت نامه (صفحه، نه دیالوگ) ----------------

const letterFormSchema = z.object({
  type: z.enum(['INCOMING', 'OUTGOING', 'INTERNAL']),
  confidentiality: z.enum(['NORMAL', 'CONFIDENTIAL', 'SECRET']),
  urgency: z.enum(['NORMAL', 'URGENT']),
  subject: faRequired('موضوع نامه', 200),
  body: faRequired('متن نامه', 10000),
  senderTitle: faOptional(200),
  receiverTitle: faOptional(200),
  referTo: z.string(),
  deadline: faJalaliDate('مهلت اقدام'),
})
type LetterFormValues = z.infer<typeof letterFormSchema>

/** مقادیر اولیه فرم نامه — مبنای merge پیش‌نویس (P1-T24) */
function letterDefaults(): LetterFormValues {
  return {
    type: 'INCOMING', confidentiality: 'NORMAL', urgency: 'NORMAL',
    subject: '', body: '', senderTitle: '', receiverTitle: '', referTo: '', deadline: '',
  }
}

function NewLetterPage({ tabId }: { tabId: string }) {
  const me = useApp((s) => s.me)
  const activeCompany = me?.companies.find((c) => c.id === me.activeCompanyId)
  const isGroup = activeCompany?.type === 'GROUP'
  const canWrite = useCanWrite()
  const materializeTab = useWorkspace((s) => s.materializeTab)
  const closeTab = useWorkspace((s) => s.closeTab)
  const queryClient = useQueryClient()
  const usersQuery = useReferUsersQuery()
  const [busy, setBusy] = useState(false)

  // P1-T37 — پیوست‌های در انتظار: در همین فرم انتخاب می‌شوند و بلافاصله پس از ثبت نامه بارگذاری می‌شوند
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [attaching, setAttaching] = useState(false)

  // P1-T24 — ذخیره خودکار پیش‌نویس نامه (متن بلند = بیشترین ریسک از دست‌رفتن)
  const defaults = useMemo(letterDefaults, [])
  const { initial, savedAt: draftSavedAt } = useDraftRestore('letters', me?.activeCompanyId, defaults)
  const storageKey = draftKey('letters', me?.activeCompanyId)
  const [restoredAt, setRestoredAt] = useState<number | null>(draftSavedAt)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)

  const { control, handleSubmit, reset, watch, getValues, setValue, formState: { errors, isDirty } } = useForm<LetterFormValues>({
    resolver: zodResolver(letterFormSchema),
    defaultValues: initial,
  })
  // P2-T16 — OCR اسکن: متن استخراج‌شده فقط پیش‌پرکردن فرم است (HITL) — هرگز ثبت خودکار
  const [ocrFile, setOcrFile] = useState<File | null>(null)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrResult, setOcrResult] = useState<OcrScanData | null>(null)
  // P2.5-U10 — گارد بستن تب کثیف (پیش‌نویس خودکار دارد؛ فایل‌های در انتظار هم سیگنال کثیفی‌اند)
  useDirtyTracking(tabId, isDirty || pendingFiles.length > 0, 'فرم ثبت نامه (پیش‌نویس خودکار دارد)')
  const type = watch('type')
  const urgency = watch('urgency')
  const confidentiality = watch('confidentiality')
  // بررسی عمیق فرم‌ها — ۱۴۰۵/۰۶: شمارنده نویسه زنده + هشدار مهلت گذشته
  const subjectVal = watch('subject')
  const bodyVal = watch('body')
  const deadlineVal = watch('deadline')
  const deadlinePast = useMemo(() => {
    if (!deadlineVal) return false
    const d = parseJalaliInput(deadlineVal)
    if (!d) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return d.getTime() < today.getTime()
  }, [deadlineVal])
  const [confirmClose, setConfirmClose] = useState(false)
  // فیلتر فعال‌بودن با الگوی مقاوم «!== false»: برای کاربر غیرمدیر، listUsers فیلد isActive را
  // برنمی‌گرداند (undefined) — فیلتر سابق (u.isActive) کل فهرست را برای دبیرخانه خالی می‌کرد (باگ G5)
  const users = useMemo(() => (usersQuery.data?.users ?? []).filter((u) => u.isActive !== false), [usersQuery.data])

  // P1-T37 — افزودن فایل به صف پیوست (اعتبارسنجی سمت کاربر: سقف ۱۰MB · ۵ فایل)
  const MAX_PENDING = 5
  const addPendingFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const rejected: string[] = []
    const accepted: File[] = []
    for (const f of Array.from(files)) {
      if (f.size > 10 * 1024 * 1024) { rejected.push(`${f.name} (بیش از ۱۰ مگابایت)`); continue }
      accepted.push(f)
    }
    setPendingFiles((prev) => {
      const room = MAX_PENDING - prev.length
      if (accepted.length > room) accepted.splice(room)
      return [...prev, ...accepted]
    })
    if (rejected.length > 0) {
      toastErr({ title: 'فایل رد شد', description: `${rejected.join('، ')} — سقف هر فایل ۱۰ مگابایت است` })
    }
  }

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  // ---------------- P2-T16 — OCR اسکن نامه ----------------

  const pickOcrFile = (files: FileList | null) => {
    setOcrResult(null)
    if (!files || files.length === 0) return
    const f = files[0]
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) {
      toastErr({ title: 'فایل OCR نامعتبر است', description: 'فقط تصویر PNG، JPEG یا WebP برای استخراج متن پذیرفته می‌شود' })
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      toastErr({ title: 'فایل OCR سنگین است', description: 'حجم تصویر باید حداکثر ۱۰ مگابایت باشد' })
      return
    }
    setOcrFile(f)
  }

  /** درج متن خام در فیلد متن نامه (مسیر جایگزین وقتی ساختاردهی هوشمند در دسترس نیست) */
  const fillRawIntoBody = () => {
    if (!ocrResult) return
    setValue('body', ocrResult.raw.slice(0, 10000), { shouldDirty: true, shouldValidate: true })
  }

  const runOcr = async () => {
    if (!ocrFile || ocrBusy) return
    setOcrBusy(true)
    try {
      const data = await apiUpload<OcrScanData>('/api/letters/ocr', ocrFile)
      setOcrResult(data)

      // HITL — پیش‌پرکردن محافظه‌کارانه: نوع/فوریت طبقه‌بندی ساختاری‌اند (همیشه)؛
      // متن‌ها فقط در فیلدهای خالی — نوشته‌ی کاربر هرگز بازنویسی نمی‌شود (merge، نه replace)
      const filled: string[] = []
      const d = data.draft
      if (d?.type) { setValue('type', d.type, { shouldDirty: true }); filled.push('نوع نامه') }
      if (d?.urgency === 'URGENT') { setValue('urgency', 'URGENT', { shouldDirty: true }); filled.push('فوریت') }
      if (d?.subject && !getValues('subject').trim()) { setValue('subject', d.subject, { shouldDirty: true, shouldValidate: true }); filled.push('موضوع') }
      if (d?.body && !getValues('body').trim()) { setValue('body', d.body, { shouldDirty: true, shouldValidate: true }); filled.push('متن نامه') }
      // فرستنده/گیرنده فقط در نمای مرئیِ خودشان (وارده←فرستنده، صادره←گیرنده)
      const finalType = d?.type ?? getValues('type')
      if (finalType === 'INCOMING' && d?.senderTitle && !getValues('senderTitle').trim()) { setValue('senderTitle', d.senderTitle, { shouldDirty: true }); filled.push('فرستنده') }
      if (finalType === 'OUTGOING' && d?.receiverTitle && !getValues('receiverTitle').trim()) { setValue('receiverTitle', d.receiverTitle, { shouldDirty: true }); filled.push('گیرنده') }

      if (d) {
        toastOk({
          title: 'متن اسکن استخراج شد',
          description: filled.length > 0 ? `${filled.join('، ')} پیش‌پر شد — پیش از ثبت بازبینی کنید` : 'ساختار نامه خوانده شد — فیلدها را کامل کنید',
        })
      } else {
        // متن خام درج خودکار نمی‌شود (شامل سربرگ/شماره است) — دکمه «درج متن خام» مسیر دستی است
        toastOk({ title: 'متن خام استخراج شد', description: 'ساختاردهی هوشمند در دسترس نبود — با دکمه «درج متن خام» یا کپی دستی ادامه دهید' })
      }
      if (data.aiNote) toastInfo({ title: 'ساختاردهی هوشمند', description: data.aiNote })

      // اسکن = مدرک منبع نامه؛ به صف پیوست اضافه می‌شود (در ظرفیت صف)
      setPendingFiles((prev) => {
        if (prev.length >= MAX_PENDING) return prev
        if (prev.some((f) => f.name === ocrFile.name && f.size === ocrFile.size)) return prev
        return [...prev, ocrFile]
      })
    } catch (e) {
      toastErr({ title: 'استخراج متن ناموفق بود', description: e instanceof Error ? e.message : 'خطای نامشخص سرور' })
    } finally {
      setOcrBusy(false)
    }
  }

  const submit = handleSubmit(async (v) => {
    setBusy(true)
    try {
      const d = await apiPost<{ id: string; number: number }>('/api/letters', {
        type: v.type, subject: v.subject, body: v.body,
        senderTitle: v.senderTitle || undefined,
        receiverTitle: v.receiverTitle || undefined,
        confidentiality: v.confidentiality, urgency: v.urgency,
        deadlineAt: v.deadline || undefined,
        referTo: v.referTo || undefined,
      })

      // P1-T37 — بارگذاری پیوست‌ها بلافاصله پس از ثبت، بدون باز کردن جزئیات نامه
      let attached = 0
      const failed: string[] = []
      if (pendingFiles.length > 0) {
        setAttaching(true)
        for (const f of pendingFiles) {
          try {
            await apiUpload(`/api/letters/${d.id}/attachments`, f)
            attached++
          } catch {
            failed.push(f.name)
          }
        }
        setAttaching(false)
      }

      const attachNote = pendingFiles.length > 0
        ? (attached > 0 ? ` · ${faNumber(attached)} پیوست بارگذاری شد` : '')
        : ''
      toastOk({ title: 'نامه ثبت شد', description: `شماره نامه: ${faDocNumber(d.number)}${attachNote}` })
      if (failed.length > 0) {
        toastErr({
          title: 'پیوست بارگذاری نشد',
          description: `${failed.join('، ')} — از تب «پیوست‌ها»ی همین نامه دوباره تلاش کنید`,
        })
      }

      setPendingFiles([])
      setOcrFile(null) // P2-T16 — سکشن OCR هم مثل فرم پس از ثبت موفق ریست می‌شود
      setOcrResult(null)
      clearDraft(storageKey) // P1-T24 — پیش‌نویس پس از ثبت موفق پاک می‌شود
      reset(letterDefaults())
      void queryClient.invalidateQueries({ queryKey: QK_PREFIX.letters })
      // جامه‌ویژه: تب «نامه جدید» → «نامه ۱۲۳ …» (P1.5-T1)
      materializeTab(tabId, d.id, `نامه ${faDocNumber(d.number)} — ${v.subject}`)
    } catch (e) {
      toastErr({ title: 'خطا در ثبت', description: e instanceof Error ? e.message : 'ثبت ناموفق' })
    } finally {
      setBusy(false)
    }
  })

  // P1-T24 — دورریختن پیش‌نویس بازیابی‌شده
  const discardDraft = () => {
    clearDraft(storageKey)
    reset(letterDefaults())
    setRestoredAt(null)
    setLastSavedAt(null)
  }

  // P1-T27 — Ctrl+Enter = ثبت نامه
  const onFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <RecordPageShell
      viewKey="letters"
      icon="Mail"
      title="ثبت نامه جدید"
      badges={(
        <>
          <Badge className="border-0 bg-primary/10 text-primary">{LETTER_TYPE_LABELS[type]}</Badge>
          {urgency === 'URGENT' ? <Badge className="border-0 bg-red-100 text-red-700">فوری</Badge> : null}
          {confidentiality !== 'NORMAL' ? (
            <Badge className="border-0 bg-amber-100 text-amber-700">{confidentiality === 'SECRET' ? 'سری' : 'محرمانه'}</Badge>
          ) : null}
        </>
      )}
      statusSteps={{ steps: LETTER_STEPS, currentIndex: 0 }}
      info={[
        { label: 'شماره نامه', value: 'پس از ثبت، به‌صورت خودکار صادر می‌شود' },
        { label: 'شرکت ثبت‌کننده', value: activeCompany?.name ?? '—' },
        { label: 'تاریخ امروز', value: formatJalali(new Date().toISOString()) },
        { label: 'ارجاع اولیه', value: users.find((u) => u.id === watch('referTo'))?.fullName ?? 'بدون ارجاع (پیش‌نویس دبیرخانه)' },
      ]}
      footer={(
        <>
          <Button type="button" variant="outline" onClick={() => { if (isDirty || pendingFiles.length > 0) setConfirmClose(true); else { clearDraft(storageKey); closeTab(tabId) } }}>انصراف و بستن تب</Button>
          <Button type="submit" form="new-letter-form" disabled={busy || attaching || isGroup || !canWrite} className="gap-1.5">
            {busy || attaching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {attaching ? 'در حال بارگذاری پیوست‌ها...' : busy ? 'در حال ثبت...' : 'ثبت نامه'}
          </Button>
          <span className="flex items-center gap-3"><KbdHint keys={['Ctrl', 'Enter']} action="ثبت نامه" /><AutosaveIndicator lastSavedAt={lastSavedAt} /></span>
          {isGroup ? <p className="text-xs text-amber-600">برای ثبت نامه، ابتدا به یک شرکت عملیاتی سوئیچ کنید.</p> : null}
        </>
      )}
    >
      {/* P1-T24 — بنر بازیابی پیش‌نویس + ذخیره خودکار */}
      {restoredAt !== null ? <RestoredDraftBanner savedAt={restoredAt} onDiscard={discardDraft} /> : null}
      <DraftAutosave control={control} storageKey={storageKey} onSaved={setLastSavedAt} />
      <form id="new-letter-form" noValidate onSubmit={submit} onKeyDown={onFormKeyDown} className="space-y-4">
        {/* P2-T16 — استخراج متن از اسکن: پیش‌پرکردن فرم (HITL) — هرگز ثبت خودکار */}
        <FormSection
          title="استخراج متن از اسکن (OCR)"
          description="تصویر نامه اسکن‌شده فارسی (PNG/JPEG/WebP تا ۱۰ مگابایت) را انتخاب کنید؛ متن استخراج و فیلدهای خالی فرم پیش‌پر می‌شود — پیش از ثبت حتماً بازبینی کنید. تصویر به صف پیوست‌ها هم اضافه می‌شود."
          collapsible
          persistKey="letter-new:ocr"
          cols="free"
        >
          <div data-testid="ocr-section" className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex">
                <input
                  id="ocr-file-input"
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => { pickOcrFile(e.target.files); e.currentTarget.value = '' }}
                />
                <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors hover:bg-accent">
                  <ScanText className="h-3.5 w-3.5" /> انتخاب تصویر اسکن
                </span>
              </label>
              <Button
                type="button"
                size="sm"
                onClick={() => { void runOcr() }}
                disabled={!ocrFile || ocrBusy}
                className="gap-1.5"
                data-testid="ocr-run"
              >
                {ocrBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanText className="h-3.5 w-3.5" />}
                {ocrBusy ? 'در حال استخراج...' : 'استخراج متن'}
              </Button>
              {ocrFile ? (
                <span className="inline-flex max-w-full items-center gap-2 rounded-lg border bg-card px-2.5 py-1 text-xs">
                  <span className="min-w-0 truncate" dir="auto">{ocrFile.name}</span>
                  <span className="shrink-0 text-muted-foreground" dir="ltr">{faNumber(Math.max(1, Math.round(ocrFile.size / 1024)))} KB</span>
                  <button
                    type="button"
                    onClick={() => { setOcrFile(null); setOcrResult(null) }}
                    className="inline-flex shrink-0 items-center rounded-md border p-0.5 transition-colors hover:bg-accent"
                    aria-label="حذف تصویر اسکن"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : null}
            </div>

            {ocrResult ? (
              <div className="space-y-2">
                {/* HITL — متن ماشین‌خوان است؛ تصمیم نهایی همیشه با کاربر (ریسک نقشه راه: «فقط پیش‌پرکردم، هرگز ثبت خودکار») */}
                <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-5 text-amber-700">
                  متن ماشین‌خوان است و ممکن است خطا داشته باشد — فیلدهای پیش‌پرشده را پیش از ثبت بازبینی و اصلاح کنید. سطرهای شماره/تاریخ سربرگ در «متن خام» می‌مانند.
                </p>
                {ocrResult.aiNote ? (
                  <p className="text-[11px] leading-5 text-muted-foreground">{ocrResult.aiNote}</p>
                ) : null}
                <div className="rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
                    <p className="text-xs font-medium">متن خام ({faNumber(ocrResult.raw.length)} نویسه · {faNumber(Math.round(ocrResult.ocrLatencyMs / 100) / 10)} ثانیه)</p>
                    {ocrResult.draft ? null : (
                      <Button type="button" size="sm" variant="outline" onClick={fillRawIntoBody} className="h-7 gap-1 px-2 text-[11px]" data-testid="ocr-fill-raw">
                        <Upload className="h-3 w-3" /> درج متن خام در متن نامه
                      </Button>
                    )}
                  </div>
                  <pre data-testid="ocr-raw" dir="rtl" className="max-h-40 overflow-auto whitespace-pre-wrap px-3 py-2 text-xs leading-6">{ocrResult.raw}</pre>
                </div>
              </div>
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">
                برای ثبت نامه‌های اسکن‌شده، ابتدا تصویر را بدهید تا موضوع/متن/فرستنده پیش‌پر شود؛ سپس بازبینی و ثبت نهایی.
              </p>
            )}
          </div>
        </FormSection>

        {/* P2.5-U1 — سکشن‌بندی ERP: مشخصات / محتوا / پیوست‌ها (الگوی D365 Section) */}
        <FormSection
          title="مشخصات نامه"
          description="طبقه‌بندی و چرخه گردش — نوع و محرمانگی رفتار دستیار هوشمند و کارتابل‌ها را تعیین می‌کند"
          cols={2}
        >
          <FieldSelect
            control={control} name="type" label="نوع نامه"
            options={[
              { value: 'INCOMING', label: 'وارده' },
              { value: 'OUTGOING', label: 'صادره' },
              { value: 'INTERNAL', label: 'داخلی' },
            ]}
          />
          <FieldSelect
            control={control} name="confidentiality" label="سطح محرمانگی"
            hint="نامه «سری»: تحلیل دستیار هوشمند طبق سیاست داده غیرفعال می‌شود"
            options={[
              { value: 'NORMAL', label: 'عادی' },
              { value: 'CONFIDENTIAL', label: 'محرمانه' },
              { value: 'SECRET', label: 'سری' },
            ]}
          />
          <FieldSelect
            control={control} name="urgency" label="اولویت"
            options={[
              { value: 'NORMAL', label: 'عادی' },
              { value: 'URGENT', label: 'فوری' },
            ]}
          />
          {type === 'INCOMING' ? (
            <FieldInput control={control} name="senderTitle" label="فرستنده" placeholder="مثلاً: بازرگانی ابنیه مسکن" />
          ) : null}
          {type === 'OUTGOING' ? (
            <FieldInput control={control} name="receiverTitle" label="گیرنده بیرونی" placeholder="مثلاً: شرکت رنگ و لعاب اصفهان" />
          ) : null}
          <FieldJalaliDate
            control={control} name="deadline" label="مهلت اقدام (اختیاری)" placeholder="انتخاب مهلت..."
            extra={deadlinePast ? (
              <p className="text-[11px] font-medium leading-4 text-amber-600">این تاریخ در گذشته است — اگر عمدی نیست، مهلت را اصلاح کنید</p>
            ) : null}
          />
        </FormSection>

        <FormSection
          title="محتوا و ارجاع اولیه"
          description="موضوع، متن کامل و گیرنده اولیه — پس از ثبت، شماره به‌صورت خودکار صادر می‌شود"
          cols={2}
          bodyClassName="max-w-4xl"
        >
          <FieldInput
            control={control} name="subject" label="موضوع" required className="sm:col-span-2" placeholder="موضوع نامه..."
            extra={<CharCount value={subjectVal} max={200} />}
          />
          <FieldTextarea
            control={control} name="body" label="متن نامه" required className="sm:col-span-2" rows={8} placeholder="متن کامل نامه..."
            extra={<CharCount value={bodyVal} max={10000} />}
          />
          {/* بررسی عمیق فرم‌ها — جستجوی گیرنده ارجاع اولیه (هم‌اکنون با پنل ارجاع؛ کاربران زیاد) */}
          <Controller
            control={control}
            name="referTo"
            render={({ field }) => (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="referTo">ارجاع اولیه به (اختیاری)</Label>
                <SearchSelect
                  value={field.value || ''}
                  onChange={(v) => field.onChange(v)}
                  placeholder="بدون ارجاع — پیش‌نویس ذخیره می‌شود"
                  aria-label="ارجاع اولیه"
                  options={users.map((u) => ({ value: u.id, label: u.fullName, hint: u.jobTitle ?? undefined }))}
                />
              </div>
            )}
          />
        </FormSection>

        {/* P1-T37 — پیوست‌های در انتظار: انتخاب در همین فرم، بارگذاری بلافاصله پس از ثبت */}
        <FormSection
          title={`پیوست‌ها (اختیاری)${pendingFiles.length > 0 ? ` — ${faNumber(pendingFiles.length)} فایل در صف` : ''}`}
          description="هر فایل تا ۱۰ مگابایت، حداکثر ۵ فایل؛ PDF، تصویر، Word، Excel یا متن — بلافاصله پس از ثبت نامه بارگذاری می‌شود"
          collapsible
          persistKey="letter-new:attachments"
          cols="free">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                فایل‌های منتظر ثبت
              </p>
              <label className="inline-flex">
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => { addPendingFiles(e.target.files); e.currentTarget.value = '' }}
                />
                <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-accent">
                  <Upload className="h-3.5 w-3.5" /> انتخاب فایل
                </span>
              </label>
            </div>
            {pendingFiles.length === 0 ? (
              <p className="text-xs leading-5 text-muted-foreground">
                اگر نامه فایل پیوست دارد همین‌جا انتخاب کنید.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {pendingFiles.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate" dir="auto">{f.name}</span>
                    <span className="shrink-0 text-muted-foreground" dir="ltr">{faNumber(Math.max(1, Math.round(f.size / 1024)))} KB</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(i)}
                      className="inline-flex shrink-0 items-center rounded-md border p-1 transition-colors hover:bg-accent"
                      aria-label={`حذف ${f.name} از صف پیوست`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </FormSection>
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
          نامه پس از ثبت در دبیرخانه شرکت فعال شماره‌گذاری می‌شود؛ در صورت انتخاب «ارجاع اولیه»، بلافاصله در کارتابل گیرنده می‌نشیند و اعلان ارسال می‌شود.
        </div>
      </form>

      {/* بررسی عمیق فرم‌ها — جلوگیری از حذف ناخواسته پیش‌نویس هنگام انصراف */}
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        destructive
        title="بستن تب و حذف پیش‌نویس؟"
        description={`متن نامه${pendingFiles.length > 0 ? ` و ${faNumber(pendingFiles.length)} فایل در صف پیوست` : ''} حذف می‌شود و بازگشتی ندارد. اگر می‌خواهید بعداً ادامه دهید، تب را با دکمه × ببندید — پیش‌نویس به‌طور خودکار ذخیره می‌شود.`}
        confirmLabel="بله، حذف و بستن تب"
        onConfirm={() => { clearDraft(storageKey); closeTab(tabId) }}
      />
    </RecordPageShell>
  )
}
