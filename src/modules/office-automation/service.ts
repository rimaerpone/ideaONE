import 'server-only'
import { db } from '@/core/shared/db'
import type { SessionContext } from '@/core/auth/auth'
import { nextDocNumber, getLetterNumbering, getLetterNumberings } from '@/core/shared/server-helpers'
import { letterCounterScope, formatLetterDisplayNumber, DEFAULT_LETTER_NUMBERING as DEFAULT_NUMBERING } from '@/core/shared/numbering'
import type { LetterNumberingConfig } from '@/types/platform'
import { scopeCompanyIds, requireWriteRole, requireSettingsAdmin } from '@/core/tenancy/tenancy'
import { getLetterhead } from '@/core/tenancy/company-settings'
import { emitEvent } from '@/core/events/outbox'
import { notify } from '@/core/notifications/notify'
import { audit } from '@/core/audit/audit'
import { parseJalaliInput, formatJalali, faDigits, faNumber } from '@/core/shared/jalali'
import { runAiJson } from '@/core/ai/gateway'
import { putObject, attachToEntity, listAttachments, getObject } from '@/core/storage/storage'
import { isFeatureEnabled } from '@/core/featureflags/featureflags'
import { listEnvelope, listSkip, type ParsedListQuery } from '@/core/shared/list-query'
import { AI_CATEGORIES, AI_SUMMARY_MAX } from '@/modules/office-automation/ai-categories'
import { ocrImage } from '@/modules/office-automation/ocr'
import { buildCsvDocument, CSV_ROW_CAP, type CsvDocument } from '@/core/shared/csv'
import { buildLetterFtsMatch, ensureLetterFts, ftsLetterPage, ftsLetterExportIds, upsertLetterFts, type LetterFtsFilter } from '@/modules/office-automation/fts'
import type { ListEnvelope, OcrLetterDraftDto, OcrScanData } from '@/types/platform'
import type { ServiceResult } from '@/core/shared/types'

/**
 * ماژول اتوماسیون اداری (office-automation) — لایه سرویس
 * سناریو: docs/scenarios/SC-001-letter-workflow.md
 *
 * قرارداد: هر تابع نتیجه ServiceResult (core/shared/types) برمی‌گرداند؛ route فقط ترجمه HTTP است.
 * فراخوانی مدل زبانی فقط از طریق core/ai/gateway (گیت فلگ + تلمتری) — ADR-009.
 */

const fail = (error: string, status?: number) => ({ ok: false, error, status }) as ServiceResult<never>

// ---------- فهرست ----------
// P1-T3/T12 — قرارداد فهرست استاندارد: q/filters/sort/page + پاکت ListEnvelope (سقف برداشته شد)

/** include مشترک فهرست نامه‌ها (مسیر FTS و contains یک شکل داده برمی‌گردانند) */
const LETTER_LIST_INCLUDE = {
  creator: { select: { fullName: true } },
  currentHolder: { select: { fullName: true } },
  company: { select: { name: true, code: true } },
  // P2-T10 — آخرین ارجاع برای «مهلت گام جاری» (نشان/فیلتر کارتابل با مهلت مؤثر)
  referrals: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { deadlineAt: true, toUserId: true } },
}

type LetterListRow = {
  id: string
  number: number
  companyId: string
  type: string
  subject: string
  status: string
  confidentiality: string
  urgency: string
  deadlineAt: Date | null
  createdAt: Date
  senderTitle: string | null
  receiverTitle: string | null
  currentHolderId: string | null
  aiCategory: string | null
  creator: { fullName: string }
  currentHolder: { fullName: string } | null
  company: { name: string; code: string }
  referrals: { deadlineAt: Date | null; toUserId: string }[]
}

/** نگاشت مشترک ردیف Letter → قلم فهرست (هر دو مسیر جستجو یکسان) */
function mapLetterItem(l: LetterListRow, ctx: SessionContext, numbering: Map<string, LetterNumberingConfig>) {
  return {
    id: l.id,
    number: l.number,
    // P2-T8 — شماره نمایشی سرورساخته با پیکربندی شرکت خودِ نامه (قالب واحد همه نماها)
    displayNumber: formatLetterDisplayNumber(l.number, l.createdAt, l.type, numbering.get(l.companyId) ?? DEFAULT_NUMBERING),
    type: l.type,
    subject: l.subject,
    status: l.status,
    confidentiality: l.confidentiality,
    urgency: l.urgency,
    deadlineAt: l.deadlineAt,
    createdAt: l.createdAt,
    senderTitle: l.senderTitle,
    receiverTitle: l.receiverTitle,
    creatorName: l.creator.fullName,
    holderName: l.currentHolder?.fullName ?? null,
    isMine: l.currentHolderId === ctx.userId,
    companyName: l.company.name,
    companyCode: l.company.code,
    aiCategory: l.aiCategory,
    // P2-T10 — مهلت گام جاری: اگر آخرین ارجاع، نامه را به دارنده فعلی رسانده و مهلت اختصاصی دارد
    stepDeadlineAt: l.referrals[0] && l.referrals[0].toUserId === l.currentHolderId ? l.referrals[0].deadlineAt : null,
  }
}

/** فیلتر آینه where فهرست — مشترک مسیر FTS (listLetters/exportLettersCsv) */
function lettersFtsFilter(ctx: SessionContext, scopeIds: string[], box: string | undefined): LetterFtsFilter {
  return {
    companyIds: scopeIds,
    currentHolderId: box === 'inbox' ? ctx.userId : undefined,
    creatorId: box === 'sent' ? ctx.userId : undefined,
  }
}

export async function listLetters(
  ctx: SessionContext,
  lq: ParsedListQuery,
): Promise<ServiceResult<ListEnvelope<unknown>>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const q = lq.q
  const box = lq.filters.box // inbox | sent | all
  // P2-T8 — پیکربندی شماره‌گذاری همه شرکت‌های دامنه در یک پرس‌وجو (هر نامه با شرکت خودش)
  const numbering = await getLetterNumberings(scopeIds)

  // P2-T5 — جستجوی تمام‌متن FTS5 نرمال‌شده (subject/body/sender/receiver + شماره نمایشی «سال/شماره»)
  // عقب‌گرد contains: پرس‌وجو توکن معتبر ندارد (تک‌نویسه/نماد)، ensure شکست خورد یا MATCH خطا داد.
  if (q) {
    const match = buildLetterFtsMatch(q)
    if (match) {
      const ensured = await ensureLetterFts()
      if (ensured.ok) {
        try {
          const { ids, total } = await ftsLetterPage(
            match,
            {
              ...lettersFtsFilter(ctx, scopeIds, box),
              type: lq.filters.type || undefined,
              status: lq.filters.status || undefined,
              urgency: lq.filters.urgency || undefined,
            },
            lq.sortField,
            lq.sortDir,
            lq.page,
            lq.pageSize,
          )
          // hydration: IN کوچک (≤pageSize) بدون orderBy — ترتیب از SQL می‌آید
          // (درس ۲۴: IN بزرگ + orderBy = RustPanic موتور Prisma)
          const rows = ids.length
            ? await db.letter.findMany({ where: { id: { in: ids } }, include: LETTER_LIST_INCLUDE })
            : []
          const byId = new Map(rows.map((l) => [l.id, l] as const))
          const items = ids.map((id) => byId.get(id)).filter((l) => l !== undefined).map((l) => mapLetterItem(l, ctx, numbering))
          return { ok: true, data: listEnvelope(items, total, lq.page, lq.pageSize) }
        } catch {
          // عقب‌گرد contains — جستجو هرگز نمی‌شکند
        }
      }
    }
  }

  const where = {
    companyId: { in: scopeIds },
    ...(q ? { OR: [{ subject: { contains: q } }, { body: { contains: q } }, { senderTitle: { contains: q } }] } : {}),
    ...(box === 'inbox' ? { currentHolderId: ctx.userId } : {}),
    ...(box === 'sent' ? { creatorId: ctx.userId } : {}),
    ...(lq.filters.type ? { type: lq.filters.type } : {}),
    ...(lq.filters.status ? { status: lq.filters.status } : {}),
    ...(lq.filters.urgency ? { urgency: lq.filters.urgency } : {}),
  }
  const orderBy = { [lq.sortField ?? 'createdAt']: lq.sortDir }

  const [rows, total] = await Promise.all([
    db.letter.findMany({
      where,
      orderBy,
      skip: listSkip(lq.page, lq.pageSize),
      take: lq.pageSize,
      include: LETTER_LIST_INCLUDE,
    }),
    db.letter.count({ where }),
  ])
  return {
    ok: true,
    data: listEnvelope(rows.map((l) => mapLetterItem(l, ctx, numbering)), total, lq.page, lq.pageSize),
  }
}

// ---------- خروجی CSV فهرست نامه‌ها (P2.5-U7 / P2-T20 — خروجی داده per-view) ----------
// همان where/orderBy فهرست (جعبه/جستجو/نوع/وضعیت/فوریت فعال نمای کاربر) بدون صفحه‌بندی، تا سقف CSV_ROW_CAP.
const LETTER_TYPE_FA: Record<string, string> = { INCOMING: 'وارده', OUTGOING: 'صادره', INTERNAL: 'داخلی' }
const LETTER_STATUS_FA: Record<string, string> = { DRAFT: 'پیش‌نویس', IN_PROGRESS: 'در جریان', ANSWERED: 'پاسخ داده', ARCHIVED: 'بایگانی' }
const LETTER_CONF_FA: Record<string, string> = { NORMAL: 'عادی', CONFIDENTIAL: 'محرمانه', SECRET: 'سری' }

export async function exportLettersCsv(ctx: SessionContext, lq: ParsedListQuery): Promise<ServiceResult<CsvDocument>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const q = lq.q
  const box = lq.filters.box
  // آینه دقیق where فهرست (listLetters) — هر فیلتر UI بدون تغییر معنا به خروجی می‌آید
  const ftsFilter: LetterFtsFilter = {
    ...lettersFtsFilter(ctx, scopeIds, box),
    type: lq.filters.type || undefined,
    status: lq.filters.status || undefined,
    urgency: lq.filters.urgency || undefined,
  }

  const csvInclude = {
    creator: { select: { fullName: true } },
    currentHolder: { select: { fullName: true } },
    company: { select: { name: true } },
  }
  type CsvRow = {
    number: number
    type: string
    companyId: string
    subject: string
    status: string
    senderTitle: string | null
    receiverTitle: string | null
    confidentiality: string
    urgency: string
    deadlineAt: Date | null
    createdAt: Date
    creator: { fullName: string }
    currentHolder: { fullName: string } | null
    company: { name: string }
  }
  // P2-T8 — شماره نمایشی در CSV هم قالب واحد دارد (پیکربندی شرکت خودِ ردیف)
  const csvNumbering = await getLetterNumberings(scopeIds)
  const csvRow = (l: CsvRow) => [
    formatLetterDisplayNumber(l.number, l.createdAt, l.type, csvNumbering.get(l.companyId) ?? DEFAULT_NUMBERING),
    LETTER_TYPE_FA[l.type] ?? l.type,
    l.subject,
    LETTER_STATUS_FA[l.status] ?? l.status,
    l.senderTitle ?? '',
    l.receiverTitle ?? '',
    l.creator.fullName,
    l.currentHolder?.fullName ?? '',
    l.company.name,
    formatJalali(l.createdAt),
    l.deadlineAt ? formatJalali(l.deadlineAt) : '',
    l.urgency === 'URGENT' ? 'فوری' : 'عادی',
    LETTER_CONF_FA[l.confidentiality] ?? l.confidentiality,
  ]
  const header = ['شماره', 'نوع', 'موضوع', 'وضعیت', 'فرستنده', 'گیرنده', 'ثبت‌کننده', 'دارنده فعلی', 'شرکت', 'تاریخ ثبت', 'مهلت اقدام', 'فوریت', 'طبقه‌بندی']

  // P2-T5 — خروجی CSV هم همان جستجوی تمام‌متن فهرست را می‌گیرد (آینه دقیق where)
  if (q) {
    const match = buildLetterFtsMatch(q)
    if (match) {
      const ensured = await ensureLetterFts()
      if (ensured.ok) {
        try {
          // سقف cap+1 → ردیف اضافه = پرچم capped درست در buildCsvDocument
          const ids = await ftsLetterExportIds(match, ftsFilter, lq.sortField, lq.sortDir, CSV_ROW_CAP)
          // hydration قطعه‌ای ۵۰۰تایی بدون orderBy (درس ۲۴) + بازچینش به ترتیب SQL
          const byId = new Map<string, CsvRow>()
          for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500)
            const rows = await db.letter.findMany({ where: { id: { in: chunk } }, include: csvInclude })
            for (const r of rows) byId.set(r.id, r)
          }
          const letters = ids.map((id) => byId.get(id)).filter((l): l is CsvRow => l !== undefined)
          return { ok: true, data: buildCsvDocument('letters', header, letters.map(csvRow)) }
        } catch {
          // عقب‌گرد contains
        }
      }
    }
  }

  const where = {
    companyId: { in: scopeIds },
    ...(q ? { OR: [{ subject: { contains: q } }, { body: { contains: q } }, { senderTitle: { contains: q } }] } : {}),
    ...(box === 'inbox' ? { currentHolderId: ctx.userId } : {}),
    ...(box === 'sent' ? { creatorId: ctx.userId } : {}),
    ...(lq.filters.type ? { type: lq.filters.type } : {}),
    ...(lq.filters.status ? { status: lq.filters.status } : {}),
    ...(lq.filters.urgency ? { urgency: lq.filters.urgency } : {}),
  }
  const orderBy = { [lq.sortField ?? 'createdAt']: lq.sortDir }
  const letters = await db.letter.findMany({
    where,
    orderBy,
    include: csvInclude,
  })
  return { ok: true, data: buildCsvDocument('letters', header, letters.map(csvRow)) }
}

// ---------- P2-T13 — گزارش هفتگی کارتابل (فقط مدیر) ----------
// خلاصه‌ی ورود/اقدام/معطلی به‌ازای کاربر در یک بازه (پیش‌فرض: هفته جاری ایرانی — شنبه تا امروز).
// منبع داده: LetterReferral سجل گردش نامه است (چه/کی/کِی هر گام را دارد)؛ سجل AuditLog برای REFER
// پیوند گیرنده را در details دارد اما تاریخی/ناقص است — برای گزارش مدیریتی، گردش‌نامه منبع درست است.
export type CartableReportRow = {
  userId: string
  fullName: string
  jobTitle: string | null
  isActive: boolean
  received: number // نامه‌هایی که در بازه به کارتابل کاربر وارد شد (ارجاع به او)
  acted: number // اقدام‌های ثبت‌شده توسط کاربر در بازه (ارجاع/پاسخ/تأیید/بایگانی)
  actedByKind: { REFER: number; ANSWER: number; APPROVE: number; ARCHIVE: number }
  stuck: number // نامه‌های بازِ کارتابل بدون تحرک بیش از staleDays روز
}

export type CartableWeeklyReport = {
  from: string
  to: string
  fromJalali: string
  toJalali: string
  staleDays: number
  scopeCount: number
  rows: CartableReportRow[]
  totals: { received: number; acted: number; stuck: number }
  markdown: string
}

// هفته ایرانی از شنبه شروع می‌شود — «شنبهِ جاری» را برمی‌گرداند (۰۰:۰۰ همان روز، وقت محلی سرور)
function lastSaturday(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const daysSinceSat = (d.getDay() + 1) % 7 // شنبه=۶ → ۰؛ یکشنبه=۰ → ۱؛ … جمعه=۵ → ۶
  d.setDate(d.getDate() - daysSinceSat)
  return d
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

export async function buildCartableWeeklyReport(
  ctx: SessionContext,
  opts: { from?: string; to?: string; staleDays?: string; preset?: string },
): Promise<ServiceResult<CartableWeeklyReport>> {
  // فقط مدیر سامانه/ADMIN شرکت (آینه گارد تنظیمات — گزارش مدیریتی است نه نمای عملیاتی)
  const denied = await requireSettingsAdmin(ctx)
  if (denied) return fail(denied, 403)

  const now = new Date()
  // بازه: from/to صریح مقدم؛ وگرنه preset — this (شنبه جاری تا الان) / last (هفته کامل گذشته شنبه..جمعه)
  const preset = opts.preset === 'last' ? 'last' : 'this'
  const sat = lastSaturday(now)
  // this: شنبه جاری تا الان — last: هفته کامل گذشته (شنبه پیشین تا جمعه پیشین = شنبه جاری −۱ روز)
  const defaultFrom = preset === 'last' ? new Date(sat.getTime() - 7 * 86400000) : sat
  const defaultTo = preset === 'last' ? endOfDay(new Date(sat.getTime() - 1 * 86400000)) : now
  let from: Date
  let to: Date
  if (opts.from) {
    const parsed = parseJalaliInput(opts.from)
    if (!parsed) return fail('تاریخ «از» نامعتبر است (نمونه درست: ۱۴۰۵/۰۶/۰۵)')
    from = parsed
  } else {
    from = defaultFrom
  }
  if (opts.to) {
    const parsed = parseJalaliInput(opts.to)
    if (!parsed) return fail('تاریخ «تا» نامعتبر است (نمونه درست: ۱۴۰۵/۰۶/۱۱)')
    to = endOfDay(parsed)
  } else {
    to = defaultTo
  }
  if (from > to) return fail('بازه گزارش معکوس است — «از» باید قبل از «تا» باشد')

  const staleDaysRaw = Number(opts.staleDays ?? 3)
  if (!Number.isFinite(staleDaysRaw) || staleDaysRaw < 0 || staleDaysRaw > 30) {
    return fail('آستانه معطلی باید عددی بین ۰ تا ۳۰ روز باشد')
  }
  const staleDays = Math.floor(staleDaysRaw)

  const scopeIds = await scopeCompanyIds(ctx)

  // کاربران دامنه: عضو حداقل یکی از شرکت‌های در دسترس (کاربر غیرفعال می‌ماند — با پرچم)
  const users = await db.user.findMany({
    where: { memberships: { some: { companyId: { in: scopeIds } } } },
    select: { id: true, fullName: true, jobTitle: true, isActive: true },
  })
  const rows = new Map<string, CartableReportRow>(
    users.map((u) => [u.id, { userId: u.id, fullName: u.fullName, jobTitle: u.jobTitle, isActive: u.isActive, received: 0, acted: 0, actedByKind: { REFER: 0, ANSWER: 0, APPROVE: 0, ARCHIVE: 0 }, stuck: 0 }]),
  )

  // ۱) گردش در بازه — یک کوئری سبک بدون orderBy (درس AGENTS ۲۴: IN بزرگ + orderBy = RustPanic)
  const referrals = await db.letterReferral.findMany({
    where: { createdAt: { gte: from, lte: to }, letter: { companyId: { in: scopeIds } } },
    select: { fromUserId: true, toUserId: true, action: true },
  })
  for (const r of referrals) {
    const inbound = rows.get(r.toUserId)
    if (r.action === 'REFER' && inbound) inbound.received += 1
    const outbound = rows.get(r.fromUserId)
    if (outbound && r.action in outbound.actedByKind) {
      outbound.acted += 1
      outbound.actedByKind[r.action as keyof CartableReportRow['actedByKind']] += 1
    }
  }

  // ۲) معطل‌ها — نامه‌های بازِ در کارتابل (IN_PROGRESS/ANSWERED) که آخرین تحرکشان staleDays روز قبل است
  const staleBefore = new Date(now.getTime() - staleDays * 86400000)
  const openLetters = await db.letter.findMany({
    where: { currentHolderId: { in: rows.size ? [...rows.keys()] : ['_none_'] }, status: { in: ['IN_PROGRESS', 'ANSWERED'] }, companyId: { in: scopeIds } },
    select: { currentHolderId: true, referrals: { select: { createdAt: true } } },
  })
  for (const l of openLetters) {
    const lastMove = l.referrals.length ? Math.max(...l.referrals.map((r) => r.createdAt.getTime())) : 0
    if (lastMove < staleBefore.getTime()) {
      const holder = rows.get(l.currentHolderId ?? '')
      if (holder) holder.stuck += 1
    }
  }

  const sorted = [...rows.values()].sort((a, b) => (b.received + b.acted + b.stuck) - (a.received + a.acted + a.stuck) || a.fullName.localeCompare(b.fullName, 'fa'))
  const totals = sorted.reduce((acc, r) => ({ received: acc.received + r.received, acted: acc.acted + r.acted, stuck: acc.stuck + r.stuck }), { received: 0, acted: 0, stuck: 0 })

  // خروجی Markdown — قابل رونوشت/ذخیره/چاپ (معیار پذیرش T13)
  const fromJ = formatJalali(from)
  const toJ = formatJalali(to)
  const actedDetail = (r: CartableReportRow) =>
    ['ارجاع', 'پاسخ', 'تأیید', 'بایگانی'].map((fa, i) => {
      const n = [r.actedByKind.REFER, r.actedByKind.ANSWER, r.actedByKind.APPROVE, r.actedByKind.ARCHIVE][i]
      return n ? `${fa} ${faNumber(n)}` : null
    }).filter(Boolean).join(' · ') || '—'
  const mdLines = [
    `# گزارش هفتگی کارتابل نامه‌ها`,
    ``,
    `- بازه: ${fromJ} تا ${toJ}`,
    `- آستانه معطلی: ${faDigits(staleDays)} روز (نامه بازِ بدون تحرک)`,
    `- دامنه: ${faNumber(scopeIds.length)} شرکت در دسترس`,
    ``,
    `| کاربر | ورود | اقدام | معطل | تفکیک اقدام |`,
    `| --- | --- | --- | --- | --- |`,
    ...sorted.map((r) => `| ${r.fullName}${r.isActive ? '' : ' (غیرفعال)'} | ${faNumber(r.received)} | ${faNumber(r.acted)} | ${r.stuck ? `**${faNumber(r.stuck)}**` : faNumber(r.stuck)} | ${actedDetail(r)} |`),
    ``,
    `جمع بازه: ورود ${faNumber(totals.received)} · اقدام ${faNumber(totals.acted)} · معطل ${faNumber(totals.stuck)}`,
    ``,
    `> تولید: ${formatJalali(now, true)} توسط ${ctx.fullName} — سامانه ideaONE`,
  ]
  return {
    ok: true,
    data: {
      from: from.toISOString(), to: to.toISOString(), fromJalali: fromJ, toJalali: toJ,
      staleDays, scopeCount: scopeIds.length, rows: sorted, totals,
      markdown: mdLines.join('\n'),
    },
  }
}

// ---------- جزئیات ----------
// P2-T9 — دامنهٔ زنجیره عطف: اجداد تا این حد بالا می‌روند (نمایش «زنجیره ۵ سطحی») و
// اعمال عطفی که زنجیره عمیق‌تر از این بسازد رد می‌شود تا زنجیره همیشه کامل دیده شود.
const RELATION_CHAIN_MAX = 5

/** نگاشت ردیف نامه → عنصر زنجیره (شماره نمایشی با پیکربندی شرکت خودش) */
type RelationRow = { id: string; number: number; type: string; subject: string; status: string; createdAt: Date; relationLetterId: string | null }
function mapRelationItem(l: RelationRow, cfg: LetterNumberingConfig) {
  return {
    id: l.id,
    number: l.number,
    displayNumber: formatLetterDisplayNumber(l.number, l.createdAt, l.type, cfg),
    subject: l.subject,
    type: l.type,
    status: l.status,
    createdAt: l.createdAt,
  }
}

export async function getLetter(ctx: SessionContext, id: string): Promise<ServiceResult<{ letter: unknown }>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const letter = await db.letter.findFirst({
    where: { id, companyId: { in: scopeIds } },
    include: {
      creator: { select: { fullName: true, jobTitle: true, id: true } },
      currentHolder: { select: { fullName: true, jobTitle: true, id: true } },
      company: { select: { name: true, code: true, legalName: true } },
      // P2-T9 — والد مستقیم (سطح اول زنجیره)
      relationLetter: { select: { id: true, number: true, type: true, subject: true, status: true, createdAt: true, relationLetterId: true } },
      referrals: {
        orderBy: { createdAt: 'asc' },
        include: {
          // P2-T10 — id گیرنده برای تشخیص «گام جاری» در کلاینت (مهلت اختصاصی دارنده فعلی)
          fromUser: { select: { id: true, fullName: true, jobTitle: true } },
          toUser: { select: { id: true, fullName: true, jobTitle: true } },
        },
      },
    },
  })
  if (!letter) return fail('نامه یافت نشد', 404)

  // P2.5-U10 — شمارنده پیوست برای برچسب تب داخلی «پیوست‌ها (N)»
  const attachmentsCount = await db.attachment.count({ where: { entityType: 'letter', entityId: letter.id } })
  // P2.5-U7 / P2-T7 — سربرگ چاپ per-company: از شرکت خودِ نامه (نه شرکت فعال ناظر)
  const letterhead = await getLetterhead(letter.companyId)
  // P2-T8 — شماره نمایشی + پیکربندی شرکت خودِ نامه برای کل زنجیره (زنجیره هم‌شرکتی است)
  const numberingCfg = await getLetterNumbering(letter.companyId)

  // P2-T9 — زنجیره اجداد (ریشه اول → والد مستقیم؛ حداکثر ۵ سطح) با پیمایش والد
  const chainRows: RelationRow[] = []
  {
    let cur = letter.relationLetter
    let depth = 0
    while (cur && depth < RELATION_CHAIN_MAX) {
      chainRows.unshift(cur)
      if (!cur.relationLetterId) break
      const parent: RelationRow | null = cur.relationLetterId
        ? await db.letter.findUnique({ where: { id: cur.relationLetterId }, select: { id: true, number: true, type: true, subject: true, status: true, createdAt: true, relationLetterId: true } })
        : null
      if (!parent) break
      cur = parent
      depth += 1
    }
  }
  // نامه‌های عطف‌شده به این نامه (فرزندان — سمت دوم رابطه دوسویه)
  const relationChildren = await db.letter.findMany({
    where: { relationLetterId: letter.id },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: { id: true, number: true, type: true, subject: true, status: true, createdAt: true, relationLetterId: true },
  })

  return {
    ok: true,
    data: {
      letter: {
        id: letter.id,
        number: letter.number,
        // P2-T8 — شماره نمایشی سرورساخته (نشان رکورد/پیش‌نمایش/چاپ/توست — قالب واحد)
        displayNumber: formatLetterDisplayNumber(letter.number, letter.createdAt, letter.type, numberingCfg),
        type: letter.type,
        subject: letter.subject,
        body: letter.body,
        status: letter.status,
        confidentiality: letter.confidentiality,
        urgency: letter.urgency,
        deadlineAt: letter.deadlineAt,
        createdAt: letter.createdAt,
        senderTitle: letter.senderTitle,
        receiverTitle: letter.receiverTitle,
        creatorName: letter.creator.fullName,
        creatorTitle: letter.creator.jobTitle,
        creatorId: letter.creator.id,
        holderName: letter.currentHolder?.fullName ?? null,
        holderId: letter.currentHolder?.id ?? null,
        companyName: letter.company.name,
        companyCode: letter.company.code,
        companyLegalName: letter.company.legalName,
        letterheadSubtitle: letterhead.subtitle,
        letterheadFooter: letterhead.footer,
        aiCategory: letter.aiCategory,
        aiSummary: letter.aiSummary,
        attachmentsCount,
        // P2-T9 — عطف دوسویه: والد مستقیم + زنجیره اجداد (۵ سطح) + نامه‌های عطف‌شده به این نامه
        relation: letter.relationLetter ? mapRelationItem(letter.relationLetter, numberingCfg) : null,
        relationChain: chainRows.map((r) => mapRelationItem(r, numberingCfg)),
        relationChildren: relationChildren.map((r) => mapRelationItem(r, numberingCfg)),
        referrals: letter.referrals.map((rf) => ({
          id: rf.id,
          action: rf.action,
          note: rf.note,
          answerText: rf.answerText,
          deadlineAt: rf.deadlineAt,
          createdAt: rf.createdAt,
          fromName: rf.fromUser.fullName,
          fromId: rf.fromUser.id,
          toName: rf.toUser.fullName,
          toUserId: rf.toUser.id,
        })),
      },
    },
  }
}

// ---------- ثبت ----------
export async function createLetter(
  ctx: SessionContext,
  b: Record<string, unknown>,
): Promise<ServiceResult<{ id: string; number: number; displayNumber: string }>> {
  // P1-T18 — VIEWER هیچ نوشتنی ندارد (ماتریس 04-security §۳)
  const denied = await requireWriteRole(ctx)
  if (denied) return fail(denied, 403)
  if (!ctx.companyId) return fail('شرکت فعال انتخاب نشده است')
  const company = await db.company.findUnique({ where: { id: ctx.companyId } })
  if (company?.type === 'GROUP') return fail('برای ثبت نامه، ابتدا به یک شرکت عملیاتی سوئیچ کنید')

  const { type, subject, body, senderTitle, receiverTitle, confidentiality, urgency, deadlineAt, referTo, relationLetterId } = b as Record<string, string>
  if (!['INCOMING', 'OUTGOING', 'INTERNAL'].includes(type)) return fail('نوع نامه نامعتبر است')
  if (!subject?.trim()) return fail('موضوع نامه الزامی است')
  if (!body?.trim()) return fail('متن نامه الزامی است')

  // P2-T9 — عطف به نامه موجود: باید در همان شرکت فعال باشد (گارد دامنه شرکت)
  const relationId = relationLetterId?.trim() || null
  if (relationId) {
    const target = await db.letter.findFirst({
      where: { id: relationId, companyId: ctx.companyId },
      select: { id: true, relationLetterId: true },
    })
    if (!target) return fail('نامه عطف‌شده یافت نشد (یا متعلق به شرکت فعال شما نیست)')
    // سقف عمق زنجیره در ثبت هم اعمال می‌شود (آینه گارد setLetterRelation) — نامه تازه
    // یک سطح اضافه می‌کند؛ اگر اجداد هدف از پیش ۵ سطح‌اند، زنجیره نمایش‌ناکامل می‌شد.
    let cur: { id: string; relationLetterId: string | null } | null = target
    let ancestors = 1 // خودِ هدف = جد اول نامه تازه
    while (cur) {
      if (!cur.relationLetterId) break
      if (ancestors >= RELATION_CHAIN_MAX) return fail(`زنجیره عطف حداکثر ${faDigits(RELATION_CHAIN_MAX)} سطح است`)
      const parent = await db.letter.findUnique({
        where: { id: cur.relationLetterId },
        select: { id: true, relationLetterId: true },
      })
      if (!parent) break
      cur = parent
      ancestors += 1
    }
  }

  // مهلت اقدام (تاریخ جلالی از دیت‌پیکر) — نامعتبر = خطا
  let deadlineValue: Date | null = null
  if (deadlineAt) {
    deadlineValue = parseJalaliInput(deadlineAt)
    if (!deadlineValue) return fail('مهلت اقدام نامعتبر است (نمونه درست: ۱۴۰۵/۰۶/۰۵)')
  }

  // اعتبارسنجی گیرنده ارجاع
  let toUserId: string | null = null
  if (referTo) {
    const target = await db.membership.findFirst({ where: { userId: referTo, companyId: ctx.companyId } })
    if (!target) return fail('کاربر گیرنده در این شرکت عضو نیست')
    toUserId = referTo
  }

  // P2-T8 — سری شماره: مشترک (رفتار فعلی) یا جدا per-type طبق تنظیم شرکت + شماره نمایشی
  const numberingCfg = await getLetterNumbering(ctx.companyId)
  const number = await nextDocNumber(ctx.companyId, letterCounterScope(type, numberingCfg))
  const letter = await db.letter.create({
    data: {
      companyId: ctx.companyId,
      number,
      type,
      subject: subject.trim(),
      body: body.trim(),
      senderTitle: senderTitle?.trim() || null,
      receiverTitle: receiverTitle?.trim() || null,
      confidentiality: confidentiality || 'NORMAL',
      urgency: urgency || 'NORMAL',
      deadlineAt: deadlineValue,
      status: toUserId ? 'IN_PROGRESS' : 'DRAFT',
      currentHolderId: toUserId,
      creatorId: ctx.userId,
      // P2-T9 — عطف نامه تازه به نامه موجود (اعتبارسنجی بالا)
      relationLetterId: relationId,
      referrals: toUserId
        ? { create: { fromUserId: ctx.userId, toUserId, action: 'REFER', note: 'ثبت و ارجاع اولیه', deadlineAt: deadlineValue } }
        : undefined,
    },
  })

  if (toUserId) {
    await notify({ userId: toUserId, title: 'نامه جدید در کارتابل شما', body: subject.trim(), kind: 'LETTER', targetView: 'cartable' })
  }
  // P2-T5 — سینک ایندکس FTS نامه تازه (شکست بی‌صدا؛ خودترمیم ensure شمارش را جبران می‌کند)
  await upsertLetterFts(letter.id)
  await emitEvent('letter.created', { letterId: letter.id, number, type, companyId: ctx.companyId })
  await audit({
    ctx,
    action: 'CREATE',
    entity: 'letter',
    entityId: letter.id,
    details: { number, type, subject: subject.trim(), ...(relationId ? { relationLetterId: relationId } : {}) },
  })
  return {
    ok: true,
    data: { id: letter.id, number, displayNumber: formatLetterDisplayNumber(number, letter.createdAt, type, numberingCfg) },
  }
}

// ---------- P2-T9 — عطف/ارتباط نامه (دوسویه؛ حلقه و زنجیره > ۵ سطح ممنوع) ----------
export async function setLetterRelation(
  ctx: SessionContext,
  id: string,
  relationLetterId: string | null,
): Promise<ServiceResult<{ ok: true }>> {
  // P1-T18 — VIEWER هیچ نوشتنی ندارد
  const denied = await requireWriteRole(ctx)
  if (denied) return fail(denied, 403)

  const scopeIds = await scopeCompanyIds(ctx)
  const letter = await db.letter.findFirst({
    where: { id, companyId: { in: scopeIds } },
    select: { id: true, companyId: true, number: true, currentHolderId: true, creatorId: true, status: true, relationLetterId: true },
  })
  if (!letter) return fail('نامه یافت نشد', 404)

  // مالکیت عطف = مالکیت اقدام: دارنده فعلی (در جریان) یا سازندهٔ پیش‌نویس — عطف دادهٔ نامه است نه هر ناظری
  if (letter.currentHolderId !== ctx.userId && !(letter.status === 'DRAFT' && letter.creatorId === ctx.userId)) {
    return fail('این نامه در کارتابل شما نیست')
  }

  const targetId = relationLetterId?.trim() || null

  // حذف عطف — idempotent (بدون عطف قبلی = موفق بی‌عمل)
  if (!targetId) {
    if (letter.relationLetterId) {
      await db.letter.update({ where: { id: letter.id }, data: { relationLetterId: null } })
      await audit({ ctx, action: 'RELATE', entity: 'letter', entityId: letter.id, details: { number: letter.number, relationLetterId: null, cleared: true } })
    }
    return { ok: true, data: { ok: true } }
  }

  if (targetId === letter.id) return fail('نامه نمی‌تواند به خودش عطف شود')

  // گارد دامنه: هدف باید در همان شرکتِ خودِ نامه باشد (زنجیره هم‌شرکتی؛ ایزولاسیون مستأجر)
  const target = await db.letter.findFirst({
    where: { id: targetId, companyId: letter.companyId },
    select: { id: true, number: true, relationLetterId: true },
  })
  if (!target) return fail('نامه عطف‌شده یافت نشد (یا متعلق به شرکت این نامه نیست)')

  // حلقه‌ممنوع + سقف عمق: از هدف به بالا می‌پیماییم — رسیدن به خود نامه = حلقه؛
  // بیش از ۵ جد = زنجیره عمیق‌تر از حد نمایش. (هر نامه تک‌والد است؛ تنها لبهٔ تازه
  // letter→target است، پس تنها مسیر ممکنِ حلقه همین زنجیرهٔ اجداد است.)
  let cur: { id: string; relationLetterId: string | null } | null = target
  let ancestors = 1 // خودِ هدف = جد اول نامه
  while (cur) {
    if (cur.id === letter.id) return fail('این عطف حلقه می‌سازد — نامه به نسلِ خودش عطف نمی‌شود')
    if (!cur.relationLetterId) break
    if (ancestors >= RELATION_CHAIN_MAX) return fail(`زنجیره عطف حداکثر ${faDigits(RELATION_CHAIN_MAX)} سطح است`)
    const parent = await db.letter.findUnique({
      where: { id: cur.relationLetterId },
      select: { id: true, relationLetterId: true },
    })
    if (!parent) break
    cur = parent
    ancestors += 1
  }

  await db.letter.update({ where: { id: letter.id }, data: { relationLetterId: targetId } })
  await audit({
    ctx,
    action: 'RELATE',
    entity: 'letter',
    entityId: letter.id,
    details: { number: letter.number, relationLetterId: targetId, relationNumber: target.number },
  })
  return { ok: true, data: { ok: true } }
}

// ---------- اقدام: ارجاع/پاسخ/تأیید/بایگانی ----------
const ACTIONS = ['REFER', 'ANSWER', 'APPROVE', 'ARCHIVE', 'PRINT']

// P0.5-T1 — نشان‌دهندهٔ رقابت اقدام هم‌زمان روی یک نامه (میان خواندن و نوشتن)
class StaleLetterError extends Error {}

export async function actOnLetter(
  ctx: SessionContext,
  id: string,
  payload: { action: string; toUserId?: string; note?: string; answerText?: string; deadlineAt?: string },
): Promise<ServiceResult<{ ok: true }>> {
  const { action, toUserId, note, answerText, deadlineAt } = payload
  if (!ACTIONS.includes(action)) return fail('عملیات نامعتبر است')
  // P2-T4 — متن پاسخ برای اقدام ANSWER الزامی است (پاسخ بدون متن، پاسخ نیست)
  const answerBody = answerText?.trim() ?? ''
  if (action === 'ANSWER' && !answerBody) return fail('متن پاسخ الزامی است')
  if (answerBody.length > 5000) return fail('متن پاسخ حداکثر ۵٬۰۰۰ نویسه است')

  // P2-T10 — مهلت اختصاصی گام: فقط روی REFER معنا دارد (مهلتِ اقدام گیرنده)؛ آینه اعتبارسنجی فرم ثبت
  let deadlineValue: Date | null = null
  if (action === 'REFER' && deadlineAt) {
    deadlineValue = parseJalaliInput(deadlineAt)
    if (!deadlineValue) return fail('مهلت اقدام گیرنده نامعتبر است (نمونه درست: ۱۴۰۵/۰۶/۰۵)')
  }

  const scopeIds = await scopeCompanyIds(ctx)
  const letter = await db.letter.findFirst({ where: { id, companyId: { in: scopeIds } } })
  if (!letter) return fail('نامه یافت نشد', 404)

  // P2.5-U7 / P2-T7 — چاپ: عملیات فقط-خواندنی است؛ گارد دارنده/وضعیت ندارد (بایگانی‌شده هم چاپ می‌شود)،
  // فقط سجل حاکمیتی PRINT برای ردیابی چاپ نامه‌های محرمانه ثبت می‌شود (fire-and-forget از کلاینت).
  if (action === 'PRINT') {
    await audit({ ctx, action: 'PRINT', entity: 'letter', entityId: letter.id, details: { number: letter.number, confidentiality: letter.confidentiality } })
    return { ok: true, data: { ok: true } }
  }

  if (letter.status === 'ARCHIVED' && action !== 'REFER') return fail('نامه بایگانی‌شده قابل اقدام نیست')
  // فقط دارنده فعلی (یا سازنده در پیش‌نویس) اقدام می‌کند
  if (letter.currentHolderId !== ctx.userId && letter.status !== 'DRAFT') {
    return fail('این نامه در کارتابل شما نیست')
  }

  let newHolder: string | null = letter.currentHolderId
  let newStatus = letter.status
  // P0.5-T1 — اعلان‌ها پس از موفقیت تراکنش ارسال می‌شوند (اقدام شکست‌خورده = بی‌اعلان)
  let notifyUserId: string | null = null
  let notifyTitle = ''

  if (action === 'REFER') {
    if (!toUserId) return fail('گیرنده ارجاع را انتخاب کنید')
    const target = await db.user.findUnique({ where: { id: toUserId }, include: { memberships: true } })
    if (!target) return fail('کاربر گیرنده یافت نشد')
    // گیرنده باید در شرکتِ نامه دسترسی داشته باشد
    const allowed = target.memberships.some((m) => scopeIds.includes(m.companyId))
    if (!allowed) return fail('کاربر گیرنده به شرکت این نامه دسترسی ندارد')
    newHolder = toUserId
    newStatus = 'IN_PROGRESS'
    notifyUserId = toUserId
    notifyTitle = 'نامه ارجاع‌شده به شما'
  } else if (action === 'ANSWER') {
    newStatus = 'ANSWERED'
  } else if (action === 'APPROVE') {
    newStatus = 'IN_PROGRESS' // تأیید و بازگرداندن به سازنده/دبیرخانه برای اقدام بعدی
    newHolder = letter.creatorId
    if (letter.creatorId !== ctx.userId) {
      notifyUserId = letter.creatorId
      notifyTitle = 'نامه تأیید شد'
    }
  } else if (action === 'ARCHIVE') {
    newStatus = 'ARCHIVED'
    newHolder = null
  }

  // P0.5-T1 — اقدام اتمیک + گارد هم‌زمانی خوش‌بینانه: ثبت ارجاع و به‌روزرسانی نامه در یک تراکنش.
  // به‌روزرسانی فقط وقتی اعمال می‌شود که دارنده/وضعیت نامه همان خوانده‌شده در همین فراخوانی باشد —
  // دو اقدام هم‌زمان روی یک نامه ⇒ یک برنده، دیگری 409 (ارجاع یتیم هم rollback می‌شود)
  try {
    await db.$transaction(async (tx) => {
      await tx.letterReferral.create({
        data: {
          letterId: letter.id,
          fromUserId: ctx.userId,
          // گارد «گیرنده ارجاع را انتخاب کنید» در شاخه REFER بالا تضمین می‌کند که مقدار تعریف‌شده است
          toUserId: action === 'REFER' ? (toUserId as string) : ctx.userId,
          action,
          note: note || null,
          // P2-T4 — متن پاسخ فقط روی اقدام ANSWER ذخیره می‌شود
          answerText: action === 'ANSWER' ? answerBody : null,
          // P2-T10 — مهلت اختصاصی گام فقط روی REFER ذخیره می‌شود (الگوی answerText)
          deadlineAt: action === 'REFER' ? deadlineValue : null,
        },
      })
      const updated = await tx.letter.updateMany({
        where: { id: letter.id, currentHolderId: letter.currentHolderId, status: letter.status },
        data: { currentHolderId: newHolder, status: newStatus },
      })
      if (updated.count === 0) throw new StaleLetterError('نامه هم‌زمان تغییر کرد')
    })
  } catch (e) {
    if (e instanceof StaleLetterError) return fail('این نامه هم‌زمان توسط اقدام دیگری تغییر کرد؛ وضعیت را نوسازی و دوباره تلاش کنید', 409)
    throw e
  }
  if (notifyUserId) {
    await notify({ userId: notifyUserId, title: notifyTitle, body: letter.subject, kind: 'LETTER', targetView: 'cartable' })
  }
  await emitEvent('letter.referred', { letterId: letter.id, number: letter.number, action })
  await audit({ ctx, action, entity: 'letter', entityId: letter.id, details: { number: letter.number, to: action === 'REFER' ? toUserId : undefined, deadlineAt: action === 'REFER' && deadlineValue ? deadlineValue.toISOString() : undefined } })
  return { ok: true, data: { ok: true } }
}

// ---------- اقدام گروهی: بایگانی چند نامه (P2.5-U2 — شکاف G3) ----------
export type BulkLetterResult = { id: string; number: number | null; ok: boolean; error?: string }

/**
 * بایگانی گروهی نامه‌ها. گارد و اثر دقیقاً همان actOnLetter تک‌نامه است —
 * رکورد به رکورد (تصمیم §۳ نقشه راه P2.5): اقدام گروهی امتیاز دسترسی جدیدی
 * نمی‌دهد؛ هر رد در نتیجه اعلام می‌شود (سکوت ممنوع).
 */
export async function bulkArchiveLetters(
  ctx: SessionContext,
  ids: unknown,
): Promise<ServiceResult<{ affected: number; results: BulkLetterResult[] }>> {
  const denied = await requireWriteRole(ctx)
  if (denied) return fail(denied, 403)
  if (!Array.isArray(ids) || ids.length === 0) return fail('هیچ نامه‌ای انتخاب نشده است')
  const unique = [...new Set(ids.map((v) => String(v)))]
  if (unique.length > 100) return fail('حداکثر ۱۰۰ نامه در هر اقدام گروهی مجاز است')

  // شماره‌ها فقط برای برچسب نتیجه — دامنه دید همین‌جا اعمال می‌شود
  const scopeIds = await scopeCompanyIds(ctx)
  const letters = await db.letter.findMany({
    where: { id: { in: unique }, companyId: { in: scopeIds } },
    select: { id: true, number: true },
  })
  const numberById = new Map(letters.map((l) => [l.id, l.number]))

  const results: BulkLetterResult[] = []
  let affected = 0
  for (const id of unique) {
    const number = numberById.get(id) ?? null
    if (!numberById.has(id)) {
      results.push({ id, number, ok: false, error: 'نامه یافت نشد (یا خارج از دامنه دسترسی شماست)' })
      continue
    }
    const res = await actOnLetter(ctx, id, { action: 'ARCHIVE' })
    if (res.ok) {
      affected += 1
      results.push({ id, number, ok: true })
    } else {
      results.push({ id, number, ok: false, error: res.error })
    }
  }
  return { ok: true, data: { affected, results } }
}

// ---------- دستیار AI (پیشنهاد — HITL) ----------
// فراخوانی از طریق دروازه هسته: گیت Feature Flag «ai.letter-assist» + سجل تلمتری AiInvocation
// P2-T14 — فهرست طبقه‌بندی مجاز در ai-categories.ts (مشترک سرور/کلاینت — Select ویرایش‌پذیر کارت پیشنهاد)

export type AiSuggestion = {
  category: string
  summary: string
  priority: string
  keyPoints: string[]
}

export async function suggestLetterAi(
  ctx: SessionContext,
  letterId: string,
): Promise<ServiceResult<{ suggestion: AiSuggestion }>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const letter = await db.letter.findFirst({ where: { id: letterId, companyId: { in: scopeIds } } })
  if (!letter) return fail('نامه یافت نشد', 404)
  if (letter.confidentiality === 'SECRET') {
    // سیاست داده SC-006: تلاست مستقیم API → ۴۰۳ با همان متن سیاست
    return fail('برای نامه‌های «سری»، فراخوانی سرویس هوش مصنوعی مجاز نیست (سیاست داده)', 403)
  }

  const res = await runAiJson<AiSuggestion>({
    task: 'letter.classify-summarize',
    flagKey: 'ai.letter-assist',
    flagLabel: 'دستیار هوشمند نامه',
    messages: [
      {
        role: 'assistant',
        content:
          'تو دستیار دبیرخانه سازمانی یک هلدینگ تولیدی کاشی و سرامیک ایرانی هستی. وظیفه تو تحلیل نامه‌های اداری فارسی است. پاسخ را فقط و فقط به صورت JSON معتبر با این ساختار بده و هیچ متن دیگری اضافه نکن: {"category": "<یکی از: ' + AI_CATEGORIES.join('، ') + '>", "summary": "<خلاصه سه جمله‌ای رسمی نامه>", "priority": "عادی یا فوری", "keyPoints": ["نکته ۱", "نکته ۲", "نکته ۳"]} — خلاصه باید برای مدیران قابل استفاده باشد و ارقام مهم را حفظ کند.',
      },
      {
        role: 'user',
        content: `موضوع: ${letter.subject}\nنوع نامه: ${letter.type === 'INCOMING' ? 'وارده' : letter.type === 'OUTGOING' ? 'صادره' : 'داخلی'}\nفرستنده: ${letter.senderTitle ?? '—'}\n\nمتن نامه:\n${letter.body}`,
      },
    ],
    parse: (raw) => {
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) return null
      try {
        const parsed = JSON.parse(match[0]) as Partial<AiSuggestion>
        return {
          category: AI_CATEGORIES.includes(parsed.category ?? '') ? parsed.category! : 'اداری و هماهنگی',
          summary: parsed.summary?.slice(0, 600) ?? '',
          priority: parsed.priority === 'فوری' ? 'فوری' : 'عادی',
          keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 5) : [],
        }
      } catch {
        return null
      }
    },
    ctx: { userId: ctx.userId, companyId: ctx.companyId },
  })
  if (!res.ok) return fail(res.error, res.status)

  await audit({ ctx, action: 'AI_SUGGEST', entity: 'letter', entityId: letter.id, details: { category: res.data.category, latencyMs: res.latencyMs } })
  return { ok: true, data: { suggestion: res.data } }
}

// ---------- اعمال پیشنهاد AI (تأیید انسانی الزامی) ----------
// P2-T14 — اعمال مقادیر «ویرایش‌شده» مجاز است (HITL نسخه ۲): کاربر پیش از اعمال، طبقه/خلاصه را در کارت ویرایش می‌کند؛
// سجل AI_APPLY مقادیر نهاییِ اعمال‌شده را ثبت می‌کند (نه پیشنهاد اولیه مدل).
export async function applyLetterAi(
  ctx: SessionContext,
  b: { letterId: string; category: string; summary: string },
): Promise<ServiceResult<{ ok: true }>> {
  // P1-T18 — اعمال AI یک «نوشتن» است: VIEWER رد می‌شود (HITL فقط برای نقش‌های عملیاتی)
  const denied = await requireWriteRole(ctx)
  if (denied) return fail(denied, 403)
  const { letterId } = b
  const category = (b.category ?? '').trim()
  const summary = (b.summary ?? '').trim()
  if (!category || !summary) return fail('طبقه‌بندی و خلاصه الزامی است')
  // طبقه‌بندی باید در فهرست مجاز باشد — کلاینت Select است اما سرویس پذیرش‌نده مطلق نیست
  if (!AI_CATEGORIES.includes(category)) return fail('طبقه‌بندی باید یکی از گزینه‌های فهرست مجاز باشد')
  if (summary.length > AI_SUMMARY_MAX) return fail(`خلاصه حداکثر ${faNumber(AI_SUMMARY_MAX)} نویسه است`)

  const scopeIds = await scopeCompanyIds(ctx)
  const letter = await db.letter.findFirst({ where: { id: letterId, companyId: { in: scopeIds } } })
  if (!letter) return fail('نامه یافت نشد', 404)

  await db.letter.update({
    where: { id: letter.id },
    data: { aiCategory: category.slice(0, 60), aiSummary: summary.slice(0, 800) },
  })
  await emitEvent('ai.applied', { letterId: letter.id, number: letter.number, category })
  // سجل با مقادیر نهایی اعمال‌شده (معیار پذیرش P2-T14) — بازسازی تاریخچه از audit ممکن است
  await audit({ ctx, action: 'AI_APPLY', entity: 'letter', entityId: letter.id, details: { category, summary: summary.slice(0, AI_SUMMARY_MAX) } })
  return { ok: true, data: { ok: true } }
}

// ---------- P2-T16 — OCR نامه اسکن‌شده: پیوست تصویر → متن خام → ساختاردهی LLM → پیش‌پرکردن فرم (HITL) ----------
// دو مرحله: (۱) ocrImage از ocr.ts (tesseract محلی، بی‌حالت)؛ (۲) ساختاردهی مدل زبانی از مسیر runAiJson.
// هرگز ثبت خودکار نیست — خروجی فقط پیش‌نویس برای فرم است و کاربر پیش از ثبت بازبینی می‌کند (ریسک نقشه راه P2).

export type OcrLetterDraft = OcrLetterDraftDto
export type OcrScanResult = OcrScanData

const OCR_LETTER_TYPES = ['INCOMING', 'OUTGOING', 'INTERNAL'] as const

/** سیاست داده (آینه SC-006 برای نامه سری): توکن «سری» در متن خام = ارسال به مدل زبانی ممنوع */
function mentionsSecret(raw: string): boolean {
  return raw.split(/[\s\u200c،.,؛:()\[\]«»"'\-–—]+/).includes('سری')
}

export async function ocrLetterScan(
  ctx: SessionContext,
  file: File,
): Promise<ServiceResult<OcrScanResult>> {
  // OCR پیش‌درآمدِ ثبت (نوشتن) است — VIEWER رد می‌شود (P1-T18)
  const denied = await requireWriteRole(ctx)
  if (denied) return fail(denied, 403)
  if (!(await isFeatureEnabled('letters.ocr', true))) {
    return fail('قابلیت «OCR نامه اسکن‌شده» موقتاً غیرفعال است (پرچم ویژگی letters.ocr)', 503)
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const ocr = await ocrImage(bytes)
  if (!ocr.ok) return fail(ocr.error, ocr.status)
  if (ocr.text.length === 0) {
    return fail('از این تصویر متنی استخراج نشد — تصویر واضح‌تر با متن فارسی انتخاب کنید', 422)
  }

  // مرحله دوم — ساختاردهی: متن کوتاه (<۴۰ نویسه) ارزش فراخوانی مدل را ندارد
  let draft: OcrLetterDraft | null = null
  let aiNote: string | null = null
  if (ocr.text.length >= 40) {
    if (mentionsSecret(ocr.text)) {
      aiNote = 'به موجب سیاست داده، متن حاوی قید «سری» به سرویس هوش مصنوعی ارسال نشد — متن خام را بازبینی کنید'
    } else {
      const res = await runAiJson<OcrLetterDraft>({
        task: 'letter.ocr-structure',
        flagKey: 'ai.letter-ocr',
        flagLabel: 'ساختاردهی هوشمند متن اسکن',
        messages: [
          {
            role: 'assistant',
            content:
              'تو دستیار دبیرخانه یک هلدینگ تولیدی کاشی و سرامیک ایرانی هستی. ورودی، متن خامِ OCR یک نامه اسکن‌شده فارسی است و ممکن است نویز داشته باشد (نویسه اشتباه، فاصله اضافه، نیم‌فاصله از دست رفته). وظیفه تو جداکردن محتوای نامه از سربرگ است. پاسخ را فقط و فقط JSON معتبر بده: {"type": "INCOMING یا OUTGOING یا INTERNAL", "subject": "<موضوع نامه>", "body": "<متن پاک‌شده نامه>", "senderTitle": "<فرستنده بیرونی نامه وارده یا null>", "receiverTitle": "<گیرنده بیرونی نامه صادره یا null>", "urgency": "URGENT فقط اگر قید فوریت در متن هست، وگرنه NORMAL"} — قواعد الزامی: (۱) طبقه‌بندی نوع با قاعده قطعی سطرهای فرستنده/گیرنده: فرستنده شخص یا شرکت بیرونی است = INCOMING (وارده)؛ فرستنده واحدی از سازمان خودمان است و گیرنده بیرونی = OUTGOING (صادره)؛ هر دو طرف واحدهای داخلی سازمان‌اند = INTERNAL. واحد داخلی معمولاً نامش با «واحد»، «مدیریت»، «ریاست» یا نام کارخانه خودمان شروع می‌شود. (۲) body فقط پاراگراف‌های متن اصلی نامه است — سطرهای «به نام خدا»، «شماره:»، «تاریخ:»، «پیوست:» و سطرهای برچسب‌دار «گیرنده:»، «فرستنده:»، «موضوع:» هرگز در body نمی‌آیند. (۳) فیلد ناموجود در متن = null. (۴) متن پاکِ body را با نیم‌فاصله‌های درست بازسازی کن و اشتباه‌های رایج OCR (مثل «ي» به جای «ی» و «ك» به جای «ک») را اصلاح کن.',
          },
          { role: 'user', content: `متن خام OCR:\n${ocr.text}` },
        ],
        parse: (raw) => {
          const match = raw.match(/\{[\s\S]*\}/)
          if (!match) return null
          try {
            const p = JSON.parse(match[0]) as Record<string, unknown>
            const clean = (v: unknown, max: number): string | null => {
              if (typeof v !== 'string') return null
              const s = v.trim().replace(/\u200f/g, '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
              return s.length > 0 ? s.slice(0, max) : null
            }
            // پادزهر ناکاتشی مدل — قاعده ۲ پرامپت (حذف سربرگ از body) در کد تضمین می‌شود:
            // هر سطر برچسب‌دار سربرگ از متن پاک کنده می‌شود؛ مدل فراموش کرد = کد اصلاح می‌کند
            const HEADER_LINE = /^(به\s*نام\s*خدا|شماره\s*:|تاریخ\s*:|پیوست\s*:|گیرنده\s*:|فرستنده\s*:|موضوع\s*:)/
            const cleanBody = (v: unknown): string | null => {
              const s = clean(v, 10000)
              if (!s) return null
              const kept = s.split(/\n+/).map((l) => l.trim()).filter(Boolean).filter((l) => !HEADER_LINE.test(l))
              return kept.length > 0 ? kept.join('\n') : s
            }
            const cleanSubject = (v: unknown): string | null => {
              const s = clean(v, 200)
              if (!s) return null
              return s.replace(/^موضوع\s*[:：]\s*/, '')
            }
            return {
              type: OCR_LETTER_TYPES.includes(p.type as (typeof OCR_LETTER_TYPES)[number]) ? (p.type as OcrLetterDraft['type']) : null,
              subject: cleanSubject(p.subject),
              body: cleanBody(p.body),
              senderTitle: clean(p.senderTitle, 200),
              receiverTitle: clean(p.receiverTitle, 200),
              urgency: p.urgency === 'URGENT' || p.urgency === 'فوری' ? 'URGENT' : p.urgency === 'NORMAL' || p.urgency === 'عادی' ? 'NORMAL' : null,
            }
          } catch {
            return null
          }
        },
        ctx: { userId: ctx.userId, companyId: ctx.companyId },
      })
      if (res.ok) {
        draft = res.data
      } else {
        // خاموشی/خطای مدل = تحلیل لطیف: متن خام به‌تنهایی برگشت می‌خورد (کلاینت متن خام را درج می‌کند)
        aiNote = res.error
      }
    }
  } else {
    aiNote = 'متن استخراج‌شده برای ساختاردهی هوشمند کوتاه بود — متن خام را بازبینی کنید'
  }

  // سجل حاکمیتی: OCR حادثه خواندن/پیش‌پرکردن است نه نوشتن؛ ثبت برای ردیابی و آمار
  await audit({
    ctx,
    action: 'OCR',
    entity: 'letter',
    details: { fileName: file.name.slice(0, 180), sizeBytes: bytes.byteLength, rawChars: ocr.text.length, ocrLatencyMs: ocr.latencyMs, structured: draft !== null },
  })

  return {
    ok: true,
    data: {
      fileName: (file.name || 'اسکن').slice(0, 180),
      raw: ocr.text.slice(0, 20000),
      ocrLatencyMs: ocr.latencyMs,
      draft,
      aiNote,
    },
  }
}

// ---------- پیوست‌ها (هسته Storage — سرویس ۱۱ سند منبع) ----------
// پیوست چندریختی: entityType='letter'؛ قرارداد برای بایگانی دیجیتال و قراردادها در فازهای بعد ثابت می‌ماند

export async function listLetterAttachments(
  ctx: SessionContext,
  letterId: string,
): Promise<ServiceResult<{ attachments: unknown[] }>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const letter = await db.letter.findFirst({ where: { id: letterId, companyId: { in: scopeIds } } })
  if (!letter) return fail('نامه یافت نشد', 404)
  return { ok: true, data: { attachments: await listAttachments('letter', letter.id) } }
}

export async function addLetterAttachment(
  ctx: SessionContext,
  letterId: string,
  file: File,
): Promise<ServiceResult<{ fileName: string; sizeBytes: number }>> {
  if (!(await isFeatureEnabled('storage.letter-attachments', true))) {
    return fail('قابلیت «پیوست فایل به نامه» موقتاً غیرفعال است (پرچم ویژگی storage.letter-attachments)', 503)
  }
  const scopeIds = await scopeCompanyIds(ctx)
  const letter = await db.letter.findFirst({ where: { id: letterId, companyId: { in: scopeIds } } })
  if (!letter) return fail('نامه یافت نشد', 404)

  let stored
  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    stored = await putObject({ namespace: 'letters', fileName: file.name, bytes, uploadedById: ctx.userId })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'ذخیره فایل ناموفق بود', 400)
  }
  await attachToEntity({ entityType: 'letter', entityId: letter.id, fileObjectId: stored.id, uploadedById: ctx.userId })
  await emitEvent('letter.attachment.added', { letterId: letter.id, number: letter.number, fileName: stored.fileName })
  await audit({ ctx, action: 'ATTACH', entity: 'letter', entityId: letter.id, details: { fileName: stored.fileName, sizeBytes: stored.sizeBytes } })
  return { ok: true, data: { fileName: stored.fileName, sizeBytes: stored.sizeBytes } }
}

export async function getLetterFile(
  ctx: SessionContext,
  fileObjectId: string,
): Promise<ServiceResult<{ bytes: Buffer; fileName: string; mimeType: string }>> {
  // کنترل دسترسی: فایل باید به نامه‌ای در دامنه دید کاربر پیوست شده باشد
  const scopeIds = await scopeCompanyIds(ctx)
  const att = await db.attachment.findFirst({ where: { fileObjectId, entityType: 'letter' } })
  if (!att) return fail('فایل یافت نشد', 404)
  const letter = await db.letter.findFirst({ where: { id: att.entityId, companyId: { in: scopeIds } } })
  if (!letter) return fail('دسترسی به این فایل مجاز نیست', 403)
  const obj = await getObject(fileObjectId)
  if (!obj) return fail('محتوای فایل در دسترس نیست', 404)
  return { ok: true, data: { bytes: obj.bytes, fileName: obj.fileName, mimeType: obj.mimeType } }
}
