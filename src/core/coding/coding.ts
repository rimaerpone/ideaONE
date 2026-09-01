import 'server-only'
import { db } from '@/core/shared/db'
import type { SessionContext } from '@/core/auth/auth'
import { scopeCompanyIds, requireWriteRole } from '@/core/tenancy/tenancy'
import { audit } from '@/core/audit/audit'
import { nextDocNumber } from '@/core/shared/server-helpers'
import { digitsToLatin } from '@/core/shared/normalize'
import { faDigits } from '@/core/shared/jalali'
import type { CodeSchemeDto, DecodedPart } from '@/types/platform'
import type { ServiceResult } from '@/core/shared/types'

/**
 * موتور کدگذاری ساختارمحور — «کد به‌عنوان جمله» (P4 پیش‌دزش)
 *
 * ایده: هر خانواده قلم (کاشی/تجهیزات/قطعات یدکی/مواد اولیه) «دستور زبانِ» خود را
 * به‌صورت داده دارد (CodeScheme → CodeSegment → CodeEnumValue). موتور یکسان:
 *   - می‌سازد (compose): انتخاب اجزا → رشته کد + توضیح فارسی + کد مادر
 *   - می‌خواند (decode): رشته کد → اجزا + معنی فارسی هر جزء + خطای نقطه‌ای
 *   - شماره می‌دهد (counter): شمارنده سالانه جلالی per-company از DocCounter موجود
 * مبنای محصول: «دستورالعمل کدگذاری محصولات» شرکت (۱۶ جزء / ۲۰ کاراکتر / مادر = ۹ جزء ابتدایی).
 * افزودن خانواده جدید = ثبت داده، نه کد — چرخ را دوباره اختراع نکنید.
 */
const fail = (error: string, status?: number) => ({ ok: false, error, status }) as ServiceResult<never>

type SegmentRow = {
  id: string
  key: string
  label: string
  position: number
  length: number
  kind: string
  required: boolean
  mapsTo: string | null
  enumValues: { code: string; label: string }[]
}

type SchemeRow = {
  id: string
  code: string
  name: string
  description: string | null
  itemFamily: string
  separator: string
  motherSegments: number | null
  companyId: string | null
  segments: SegmentRow[]
}

/** بارگذاری طرحواره‌های فعال دامنه دید — سراسری (companyId=null) + اختصاصی شرکت (اولویت بالاتر) */
async function loadSchemes(scopeIds: string[], companyId: string | null): Promise<SchemeRow[]> {
  const rows = await db.codeScheme.findMany({
    where: { isActive: true, OR: [{ companyId: null }, ...(companyId ? [{ companyId }] : [])] },
    orderBy: { code: 'asc' },
    include: {
      segments: {
        orderBy: { position: 'asc' },
        include: { enumValues: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  })
  // دامنه دید هلدینگ: طرحواره‌های سراسری + اختصاصیِ هر شرکتِ دامنه (برای نمایش)؛
  // «اولویت» فقط برای شرکت فعال اعمال می‌شود (override همان code)
  const scopeSet = new Set(scopeIds)
  const visible = rows.filter((r) => r.companyId === null || scopeSet.has(r.companyId))
  const byCode = new Map<string, SchemeRow>()
  for (const r of visible) {
    const prev = byCode.get(r.code)
    if (!prev || (r.companyId !== null && r.companyId === companyId)) byCode.set(r.code, r)
  }
  return [...byCode.values()]
}

function toDto(s: SchemeRow): CodeSchemeDto {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    description: s.description,
    itemFamily: s.itemFamily,
    separator: s.separator,
    motherSegments: s.motherSegments,
    totalLength: s.segments.reduce((n, seg) => n + seg.length, 0) + s.separator.length * Math.max(0, s.segments.length - 1),
    segments: s.segments.map((seg) => ({
      key: seg.key,
      label: seg.label,
      position: seg.position,
      length: seg.length,
      kind: seg.kind === 'COUNTER' ? 'COUNTER' : 'ENUM',
      required: seg.required,
      mapsTo: seg.mapsTo,
      enumValues: seg.enumValues.map((v) => ({ code: v.code, label: v.label })),
    })),
  }
}

/** GET /api/coding/schemes — فهرست طرحواره‌های فعال دامنه دید (برای کدساز فرم‌ها) */
export async function listCodeSchemes(ctx: SessionContext): Promise<ServiceResult<{ schemes: CodeSchemeDto[] }>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const schemes = await loadSchemes(scopeIds, ctx.companyId)
  return { ok: true, data: { schemes: schemes.map(toDto) } }
}

function padCounter(n: number, len: number): string {
  return String(n).padStart(len, '0')
}

/** توصیف فارسی کد — جمله‌ای از لیبل اجزا (براق · ۹.۵ · ۶۰×۶۰ · …) */
function describeParts(segments: SegmentRow[], values: Record<string, string>): string {
  return segments
    .filter((seg) => values[seg.key])
    .map((seg) => {
      const v = values[seg.key]
      const ev = seg.enumValues.find((x) => x.code === v)
      return ev ? ev.label : `${seg.label} ${v}`
    })
    .join(' · ')
}

/** کد مادر = n جزء ابتدایی (تبصره ۱-۲ سند شرکت — کاشی: ۹ جزء = ۱۲ کاراکتر) */
function motherCodeOf(s: SchemeRow, values: Record<string, string>): string {
  if (!s.motherSegments || s.motherSegments <= 0) return ''
  const head = s.segments.slice(0, s.motherSegments)
  return head.map((seg) => values[seg.key] ?? '').filter(Boolean).join(s.separator)
}

export type ComposeInput = {
  schemeCode: string
  /** مقدار هر جزء به کلید — جزء COUNTER می‌تواند مقدار صریح داشته باشد */
  parts: Record<string, string>
  /** کلید اجزای شمارنده‌ای که باید شماره تازه صادر شود (مصرف شمارنده = نوشتن) */
  issueCounters?: string[]
}

/** POST /api/coding/compose — اعتبارسنجی + ترکیب کد؛ صدور شمارنده فقط نقش نوشتن */
export async function composeCode(
  ctx: SessionContext,
  input: ComposeInput,
): Promise<ServiceResult<{ code: string; motherCode: string; description: string; parts: { key: string; label: string; code: string; labelValue: string }[] }>> {
  if (!input?.schemeCode) return fail('شناسه طرحواره الزامی است')
  if (!ctx.companyId) return fail('شرکت فعال انتخاب نشده است')
  const scopeIds = await scopeCompanyIds(ctx)
  const schemes = await loadSchemes(scopeIds, ctx.companyId)
  const scheme = schemes.find((s) => s.code === input.schemeCode)
  if (!scheme) return fail('طرحواره کدگذاری یافت نشد', 404)

  // مجموعه اجزای شمارنده‌ای که باید شماره تازه بگیرند: issueCounters صریح + مقدار «next»
  const issueSet = new Set<string>(
    (input.issueCounters ?? []).filter((k) => scheme.segments.some((seg) => seg.key === k && seg.kind === 'COUNTER')),
  )

  const values: Record<string, string> = {}
  for (const seg of scheme.segments) {
    let v = (input.parts?.[seg.key] ?? '').toString().trim()
    // ارقام فارسی/عربی → لاتین (کد همیشه لاتین ذخیره می‌شود)
    v = digitsToLatin(v)
    if (v === 'next') {
      if (seg.kind !== 'COUNTER') return fail(`مقدار جزء «${seg.label}» نامعتبر است (next)`)
      issueSet.add(seg.key)
      continue
    }
    if (!v) {
      // جزءِ در انتظار صدور شماره بعداً پر می‌شود — الزامی‌اش منتفی نیست
      if (issueSet.has(seg.key)) continue
      if (seg.required) return fail(`جزء «${seg.label}» الزامی است`)
      continue
    }
    if (seg.kind === 'ENUM') {
      const ok = seg.enumValues.some((x) => x.code === v)
      if (!ok) {
        const allowed = seg.enumValues.map((x) => x.code).join('، ')
        return fail(`مقدار جزء «${seg.label}» نامعتبر است (${v}) — مقادیر مجاز: ${allowed}`)
      }
    } else {
      // COUNTER — مقدار صریح باید عددی در محدوده طول باشد
      if (!/^\d+$/.test(v) || v.length > seg.length) {
        return fail(`جزء «${seg.label}» باید عددی حداکثر ${faDigits(seg.length)} رقمی باشد`)
      }
    }
    if (v.length !== seg.length) return fail(`جزء «${seg.label}» باید دقیقاً ${faDigits(seg.length)} کاراکتر باشد`)
    values[seg.key] = v
  }

  // صدور شمارنده — مصرف دائمی ⇒ فقط نقش نوشتن (VIEWER 403)
  if (issueSet.size > 0) {
    const denied = await requireWriteRole(ctx)
    if (denied) return fail(denied, 403)
    for (const key of issueSet) {
      const seg = scheme.segments.find((s) => s.key === key)!
      const n = await nextDocNumber(ctx.companyId, `CODE:${scheme.code}:${key}`)
      values[key] = padCounter(n, seg.length)
    }
  }

  // راستی‌آزمایی نهایی الزامی‌ها (جزء «next» بدون صدور مجاز نمی‌ماند)
  for (const seg of scheme.segments) {
    if (seg.required && !values[seg.key]) return fail(`جزء «${seg.label}» الزامی است`)
  }

  const code = scheme.segments.map((seg) => values[seg.key] ?? '').join(scheme.separator)
  if (!code.replace(scheme.separator, '').trim()) return fail('هیچ جزءی برای ساخت کد انتخاب نشده است')
  const parts = scheme.segments
    .filter((seg) => values[seg.key])
    .map((seg) => {
      const ev = seg.enumValues.find((x) => x.code === values[seg.key])
      return { key: seg.key, label: seg.label, code: values[seg.key], labelValue: ev?.label ?? values[seg.key] }
    })
  if (issueSet.size > 0) {
    await audit({ ctx, action: 'CODE_COMPOSE', entity: 'codeScheme', entityId: scheme.id, details: { scheme: scheme.code, code } })
  }
  return {
    ok: true,
    data: {
      code,
      motherCode: motherCodeOf(scheme, values),
      description: describeParts(scheme.segments, values),
      parts,
    },
  }
}

// ---------- شناسنامهٔ پالت (P0.5-T2 — سند کدگذاری شرکت) ----------

/** طول سرِ طرحواره (اجزای مادر + جداکننده‌ها) — tile: ۹ جزء = ۱۲ کاراکتر */
function motherLengthOf(s: SchemeRow): number | null {
  if (!s.motherSegments || s.motherSegments <= 0) return null
  const head = s.segments.slice(0, s.motherSegments)
  if (head.length < s.motherSegments) return null
  return head.reduce((n, seg) => n + seg.length, 0) + s.separator.length * (s.motherSegments - 1)
}

/** تجزیهٔ کد مادر + اعتبارسنجی مقادیر (ENUM معتبر / COUNTER عددی) — null یعنی سالم */
function parseMother(s: SchemeRow, code: string): string | null {
  let cursor = 0
  for (const seg of s.segments.slice(0, s.motherSegments!)) {
    const v = code.slice(cursor, cursor + seg.length)
    cursor += seg.length + s.separator.length
    if (!v) return `جزء «${seg.label}» در کد مادر ناقص است`
    if (seg.kind === 'ENUM' && !seg.enumValues.some((x) => x.code === v)) return `مقدار جزء «${seg.label}» در کد مادر نامعتبر است (${v})`
    if (seg.kind === 'COUNTER' && !/^\d+$/.test(v)) return `جزء «${seg.label}» در کد مادر باید عددی باشد (${v})`
  }
  return null
}

export type PalletInput = {
  schemeCode: string
  /** کد مادر (برای کاشی: ۱۲ کاراکتر) — یا به‌جای آن parts برای ساخت مادر */
  motherCode?: string
  parts?: Record<string, string>
}

/**
 * POST /api/coding/pallet — صدور شناسنامهٔ پالت ۱۴کاراکتری = کد مادر (۱۲ موجود) + ۲ رقم سری
 * طبق سند «دستورالعمل کدگذاری محصولات» شرکت: هر کد مادر تا ۹۹ پالت سری‌شماره می‌گیرد.
 * مصرف شمارنده دائمی است ⇒ فقط نقش نوشتن (VIEWER 403). شمارنده per (طرحواره × کد مادر) است.
 */
export async function issuePalletId(
  ctx: SessionContext,
  input: PalletInput,
): Promise<ServiceResult<{ palletId: string; motherCode: string; serial: number }>> {
  if (!input?.schemeCode) return fail('شناسه طرحواره الزامی است')
  if (!ctx.companyId) return fail('شرکت فعال انتخاب نشده است')
  const scopeIds = await scopeCompanyIds(ctx)
  const schemes = await loadSchemes(scopeIds, ctx.companyId)
  const scheme = schemes.find((s) => s.code === input.schemeCode)
  if (!scheme) return fail('طرحواره کدگذاری یافت نشد', 404)

  const motherLen = motherLengthOf(scheme)
  if (motherLen == null) return fail('این طرحواره کد مادر تعریف‌شده ندارد — شناسنامه پالت فقط برای طرحواره‌های ماداردار صادر می‌شود')

  // مادر: یا مستقیم (اعتبارسنجی کامل ساختاری و مقادیر) یا از اجزا
  let motherCode = ''
  if (typeof input.motherCode === 'string' && input.motherCode.trim()) {
    motherCode = digitsToLatin(input.motherCode.trim()).toUpperCase()
    if (motherCode.length !== motherLen) return fail(`کد مادر باید دقیقاً ${faDigits(motherLen)} کاراکتر باشد (سند کدگذاری شرکت)`)
    const perr = parseMother(scheme, motherCode)
    if (perr) return fail(perr)
  } else if (input.parts && typeof input.parts === 'object') {
    const values: Record<string, string> = {}
    const head = scheme.segments.slice(0, scheme.motherSegments!)
    for (const seg of head) {
      let v = (input.parts[seg.key] ?? '').toString().trim()
      v = digitsToLatin(v)
      if (!v) return fail(`جزء مادرِ «${seg.label}» الزامی است`)
      if (seg.kind === 'ENUM' && !seg.enumValues.some((x) => x.code === v)) return fail(`مقدار جزء «${seg.label}» نامعتبر است (${v})`)
      if (v.length !== seg.length) return fail(`جزء «${seg.label}» باید دقیقاً ${faDigits(seg.length)} کاراکتر باشد`)
      values[seg.key] = v
    }
    motherCode = head.map((seg) => values[seg.key] ?? '').join(scheme.separator)
  } else {
    return fail('کد مادر یا اجزای مادر (parts) ارسال نشده است')
  }

  // صدور شمارهٔ سری پالت — گارد نقش «قبل» از مصرف شمارنده (مصرف = نوشتن دائمی)
  const denied = await requireWriteRole(ctx)
  if (denied) return fail(denied, 403)
  const n = await nextDocNumber(ctx.companyId, `CODE:${scheme.code}:PALLET:${motherCode}`)
  if (n > 99) return fail('ظرفیت سری پالت این کد مادر (۹۹ پالت) تکمیل شده است — کد محصول جدید تعریف کنید', 409)
  const palletId = motherCode + padCounter(n, 2)

  await audit({ ctx, action: 'CODE_PALLET_ISSUE', entity: 'codeScheme', entityId: scheme.id, details: { scheme: scheme.code, motherCode, palletId, serial: n } })
  return { ok: true, data: { palletId, motherCode, serial: n } }
}

/** GET /api/coding/decode — رمزگشایی کد (طرحواره مشخص یا تشخیص خودکار از بین فعال‌ها) */
export async function decodeCode(
  ctx: SessionContext,
  rawCode: string,
  schemeCode?: string,
): Promise<ServiceResult<{ schemeCode: string; schemeName: string; code: string; motherCode: string; description: string; parts: DecodedPart[]; ok: boolean; error: string | null }>> {
  if (!rawCode?.trim()) return fail('کد برای رمزگشایی الزامی است')
  const code = digitsToLatin(rawCode.trim()).toUpperCase()
  const scopeIds = await scopeCompanyIds(ctx)
  const schemes = await loadSchemes(scopeIds, ctx.companyId)
  if (schemes.length === 0) return fail('طرحواره کدگذاری فعالی برای شرکت شما تعریف نشده است')

  const candidates = schemeCode ? schemes.filter((s) => s.code === schemeCode) : schemes
  if (schemeCode && candidates.length === 0) return fail('طرحواره کدگذاری یافت نشد', 404)

  let best: { scheme: SchemeRow; parts: DecodedPart[]; ok: boolean; error: string | null } | null = null
  for (const scheme of candidates) {
    const parts: DecodedPart[] = []
    let structurally = true
    if (!scheme.separator) {
      const total = scheme.segments.reduce((n, s) => n + s.length, 0)
      if (code.length !== total) structurally = false
    } else {
      const split = code.split(scheme.separator)
      if (split.length !== scheme.segments.length) structurally = false
    }
    if (structurally) {
      let cursor = 0
      for (const seg of scheme.segments) {
        const v = scheme.separator
          ? code.split(scheme.separator)[seg.position - 1] ?? ''
          : code.slice(cursor, cursor + seg.length)
        cursor += seg.length
        if (!v) {
          parts.push({ key: seg.key, label: seg.label, code: '', labelValue: null, error: 'اجزای کد کم است' })
          structurally = false
          continue
        }
        const ev = seg.enumValues.find((x) => x.code === v)
        const validCounter = seg.kind === 'COUNTER' && /^\d+$/.test(v)
        parts.push({
          key: seg.key,
          label: seg.label,
          code: v,
          labelValue: ev?.label ?? null,
          error: ev || validCounter ? null : `مقدار ناشناخته (${v})`,
        })
        if (!ev && seg.kind === 'ENUM') structurally = false
      }
    }
    const res = { scheme, parts, ok: structurally, error: structurally ? null : 'کد با این طرحواره تطبیق کامل ندارد' }
    if (res.ok) { best = res; break } // اولین تطبیق کامل — برنده
    if (!best || res.parts.filter((p) => !p.error).length > best.parts.filter((p) => !p.error).length) best = res
  }
  if (!best) return fail('رمزگشایی ناموفق بود')

  const values: Record<string, string> = {}
  for (const p of best.parts) if (p.code) values[p.key] = p.code
  return {
    ok: true,
    data: {
      schemeCode: best.scheme.code,
      schemeName: best.scheme.name,
      code,
      motherCode: motherCodeOf(best.scheme, values),
      description: best.parts.filter((p) => p.code && !p.error).map((p) => p.labelValue ?? `${p.label}: ${p.code}`).join(' · '),
      parts: best.parts,
      ok: best.ok,
      error: best.error,
    },
  }
}
