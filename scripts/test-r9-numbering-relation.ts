// باتری تست R9 — P2-T8 (شماره‌گذاری پیکربندی‌پذیر per-type) + P2-T9 (عطف دوسویه نامه‌ها)
// اجرا: bunx tsx scripts/test-r9-numbering-relation.ts  (سرور dev باید روشن باشد)
// اصل طراحی: هر سنجه یک شاهد عینی دارد (پاس API / ردیف DB) — «وضعیت صادقانه» ADR-010.
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
import { faDocNumber } from '../src/core/shared/jalali'
import { serializeLetterNumbering, parseLetterNumbering } from '../src/core/shared/numbering'

// بارگذاری صریح .env — متغیر تزریقی شل (مثلاً file:… SQLite) بر .env اولویت دارد و
// Prisma را می‌شکند (درس لایه سوم ماندگاری AGENTS.md)؛ اینجا منبع حقیقت = .env
if (!process.env.DATABASE_URL?.startsWith('postgres')) {
  const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const m = raw.match(/^DATABASE_URL=(.+)$/m)
  if (m) process.env.DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, '')
}

const db = new PrismaClient()
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'

let failures = 0
let passed = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed += 1 } else { failures += 1 }
  const mark = cond ? 'PASS' : 'FAIL'
  console.log(`[${mark}] ${name}${extra ? ` — ${extra}` : ''}`)
}

type Jar = { cookie: string; token: string }

async function login(username: string, password: string): Promise<Jar | null> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'R9-NumberingRelation' },
    body: JSON.stringify({ username, password }),
  })
  const body = (await res.json().catch(() => ({}))) as { token?: string }
  return body.token ? { cookie: `pos_sid=${body.token}`, token: body.token } : null
}

async function api(jar: Jar, path: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': jar.cookie, 'user-agent': 'R9-NumberingRelation', ...(body !== undefined ? { 'x-pos-session': jar.token } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, data }
}

const SUBJECT = 'R9-تست شماره‌گذاری و عطف'
const createdLetterIds: string[] = []

async function createLetter(jar: Jar, extra: Record<string, unknown> = {}) {
  const r = await api(jar, '/api/letters', 'POST', {
    type: 'INCOMING', subject: `${SUBJECT} ${Date.now() % 100000}`, body: 'متن تست R9', confidentiality: 'NORMAL', urgency: 'NORMAL',
    ...extra,
  })
  return r
}

async function main() {
  const admin = await login('admin', 'admin123')
  const dabir = await login('dabir.arad', '12345678')
  check('ورود admin/dabir', !!admin && !!dabir)
  if (!admin || !dabir) return

  // شرکت فعال dabir از /me
  const me = await api(dabir, '/api/auth/me', 'GET')
  const meData = me.data as { activeCompanyId?: string; companies?: { id: string; type: string }[] }
  const companyId = meData.activeCompanyId ?? ''
  check('شرکت فعال dabir شناسایی شد', !!companyId, companyId)
  // admin را به شرکت فعال dabir سوئیچ می‌کنیم تا تنظیم letters.numbering روی همان شرکت بنشیند
  const sw = await api(admin, '/api/auth/switch-company', 'POST', { companyId })
  check('A0: سوئیچ admin به شرکت فعال dabir', sw.status === 200, `status=${sw.status}`)
  const jalaliYear = Number(faDocNumber(1).split('/')[0].replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))) // سال جلالی جاری از «۱۴۰۵/۱»

  // ---------------- بخش A — P2-T8: شماره‌گذاری per-type ----------------
  console.log('\n--- A) P2-T8 شماره‌گذاری پیکربندی‌پذیر ---')

  // A1. کلید letters.numbering در تنظیمات شرکت (پیش‌فرض خالی)
  const st0 = await api(admin, '/api/platform/company-settings', 'GET')
  const st0data = st0.data as { settings?: Record<string, string> }
  check('A1: کلید letters.numbering در پاس تنظیمات موجود است', st0.status === 200 && 'letters.numbering' in (st0data.settings ?? {}), `status=${st0.status}`)

  // A2. رفتار پیش‌فرض: ثبت وارده → displayNumber = قالب پایه «سال/شماره» بدون affix
  await api(admin, '/api/platform/company-settings', 'PATCH', { key: 'letters.numbering', value: '' })
  const l0 = await createLetter(dabir)
  const l0data = l0.data as { id?: string; number?: number; displayNumber?: string }
  if (l0data.id) createdLetterIds.push(l0data.id)
  const base0 = l0data.number ? faDocNumber(l0data.number) : ''
  check('A2: پیش‌فرض = قالب پایه (۱۴۰۵/N بدون پیشوند/پسوند)', l0.status === 200 && l0data.displayNumber === base0, `display=${l0data.displayNumber ?? '?'} / پایه=${base0}`)

  // A3. تنظیم: سری جدا + affix وارده «و…م» — ذخیره از همان کلید whitelist
  const cfg = parseLetterNumbering(null)
  cfg.separateByType = true
  cfg.types.INCOMING = { prefix: 'و', suffix: 'م' }
  const saveRes = await api(admin, '/api/platform/company-settings', 'PATCH', { key: 'letters.numbering', value: serializeLetterNumbering(cfg) })
  check('A3: ذخیره پیکربندی سری جدا + affix موفق', saveRes.status === 200)

  // A4. وارده جدید → سری مستقل LETTER:INCOMING + نمایش «و ۱۴۰۵/N م»
  const l1 = await createLetter(dabir)
  const l1data = l1.data as { id?: string; number?: number; displayNumber?: string }
  if (l1data.id) createdLetterIds.push(l1data.id)
  const expect1 = l1data.number ? `و ${faDocNumber(l1data.number)} م` : ''
  check('A4: displayNumber با پیشوند/پسوند = «و ۱۴۰۵/N م»', l1.status === 200 && l1data.displayNumber === expect1, `display=${l1data.displayNumber ?? '?'} / انتظار=${expect1}`)
  const counterIn = await db.docCounter.findFirst({ where: { companyId, scope: 'LETTER:INCOMING', year: jalaliYear } })
  check('A4b: ردیف DocCounter مستقل LETTER:INCOMING ساخته شد', !!counterIn && counterIn.value >= (l1data.number ?? 0), counterIn ? `value=${counterIn.value}` : 'missing')

  // A5. صادره → سری خودش (ادامه شمارنده LETTER:OUTGOING) + بدون affix وارده
  const outBefore = await db.docCounter.findFirst({ where: { companyId, scope: 'LETTER:OUTGOING', year: jalaliYear } })
  const outExpect = (outBefore?.value ?? 0) + 1
  const l2 = await createLetter(dabir, { type: 'OUTGOING', receiverTitle: 'شرکت تست' })
  const l2data = l2.data as { id?: string; number?: number; displayNumber?: string }
  if (l2data.id) createdLetterIds.push(l2data.id)
  check('A5: صادره سری مستقل (ادامه LETTER:OUTGOING) و بدون affix وارده', l2.status === 200 && l2data.number === outExpect && l2data.displayNumber === faDocNumber(outExpect), `number=${l2data.number} / انتظار=${outExpect}`)

  // A6. وارده بعدی = ادامه سری وارده (+۱ نسبت به A4)
  const l3 = await createLetter(dabir)
  const l3data = l3.data as { id?: string; number?: number }
  if (l3data.id) createdLetterIds.push(l3data.id)
  check('A6: سری وارده ادامه دارد (شماره +۱)', l3.status === 200 && l3data.number === (l1data.number ?? 0) + 1, `number=${l3data.number}`)

  // A7. اعتبارسنجی: JSON خراب → 400 پیام فارسی
  const bad1 = await api(admin, '/api/platform/company-settings', 'PATCH', { key: 'letters.numbering', value: '{خراب' })
  const bad1data = bad1.data as { error?: string }
  check('A7: JSON خراب رد می‌شود (۴۰۰ + پیام فارسی)', bad1.status === 400 && !!bad1data.error?.includes('JSON'), bad1data.error ?? '')

  // A8. اعتبارسنجی: affix بلندتر از ۱۲ نویسه → 400
  const cfgBad = parseLetterNumbering(null)
  cfgBad.types.INCOMING = { prefix: 'ی'.repeat(13), suffix: '' }
  const bad2 = await api(admin, '/api/platform/company-settings', 'PATCH', { key: 'letters.numbering', value: serializeLetterNumbering(cfgBad) })
  check('A8: پیشوند ۱۳ نویسه رد می‌شود (سقف ۱۲)', bad2.status === 400)

  // A9. اعتبارسنجی: نوع ناشناخته → 400
  const bad3 = await api(admin, '/api/platform/company-settings', 'PATCH', { key: 'letters.numbering', value: JSON.stringify({ types: { BOGUS: { prefix: 'x' } } }) })
  check('A9: نوع نامه ناشناخته رد می‌شود', bad3.status === 400)

  // A10. مقاومت: مقدار خراب مستقیم در DB → شماره‌گذاری شکست نمی‌خورد (پیش‌فرض)
  await db.companySetting.update({ where: { companyId_key: { companyId, key: 'letters.numbering' } }, data: { value: '{{{not-json' } })
  const l4 = await createLetter(dabir)
  const l4data = l4.data as { id?: string; number?: number; displayNumber?: string }
  if (l4data.id) createdLetterIds.push(l4data.id)
  check('A10: تنظیم خراب DB → createLetter با پیش‌فرض موفق (بدون شکست)', l4.status === 200 && l4data.displayNumber === (l4data.number ? faDocNumber(l4data.number) : ''), `display=${l4data.displayNumber ?? '?'}`)

  // A11. بازگشت به پیش‌فرض ('' = حذف) → سری مشترک دوباره
  const reset = await api(admin, '/api/platform/company-settings', 'PATCH', { key: 'letters.numbering', value: '' })
  check('A11: بازنشانی به پیش‌فرض (مقدار خالی) موفق', reset.status === 200)
  const sharedCounter = await db.docCounter.findFirst({ where: { companyId, scope: 'LETTER', year: jalaliYear } })
  const sharedVal = sharedCounter?.value ?? 0
  const l5 = await createLetter(dabir)
  const l5data = l5.data as { id?: string; number?: number; displayNumber?: string }
  if (l5data.id) createdLetterIds.push(l5data.id)
  check('A11b: سری مشترک LETTER ادامه دارد (شماره > آخرین مشترک)', l5.status === 200 && (l5data.number ?? 0) > sharedVal, `number=${l5data.number} / مشترک قبلی=${sharedVal}`)

  // ---------------- بخش B — P2-T9: عطف دوسویه ----------------
  console.log('\n--- B) P2-T9 عطف/ارتباط نامه‌ها ---')

  // B1. نامه مرجع A (پیش‌نویس dabir)
  const letterA = await createLetter(dabir, { subject: `${SUBJECT} مرجع ${Date.now() % 100000}` })
  const A = (letterA.data as { id?: string; number?: number }).id
  if (A) createdLetterIds.push(A)
  check('B1: نامه مرجع A ثبت شد', letterA.status === 200 && !!A)

  // B2. ثبت نامه B با relationLetterId=A
  const letterB = await createLetter(dabir, { relationLetterId: A })
  const B = (letterB.data as { id?: string }).id
  if (B) createdLetterIds.push(B)
  check('B2: ثبت نامه با عطف موفق', letterB.status === 200 && !!B)
  if (!A || !B) { console.log('ABORT: نامه مرجع/عطف ساخته نشد — ادامهٔ سنجه‌های B بی‌معناست'); return }

  // B3. GET B → relation = A + زنجیره شامل A
  const detB = await api(dabir, `/api/letters/${B}`, 'GET')
  const detBdata = detB.data as { letter?: { relation?: { id: string } | null; relationChain?: { id: string }[] } }
  check('B3: جزئیات B → عطف مستقیم = A', detB.status === 200 && detBdata.letter?.relation?.id === A)
  check('B3b: زنجیره اجداد B شامل A است', (detBdata.letter?.relationChain ?? []).some((r) => r.id === A))

  // B4. دوسویه: GET A → relationChildren شامل B
  const detA = await api(dabir, `/api/letters/${A}`, 'GET')
  const detAdata = detA.data as { letter?: { relationChildren?: { id: string }[] } }
  check('B4: دوسویه — فرزندان A شامل B است', detA.status === 200 && (detAdata.letter?.relationChildren ?? []).some((r) => r.id === B))

  // B5. حذف عطف (null) → idempotent + دوسویه پاک می‌شود
  const clearRes = await api(dabir, `/api/letters/${B}`, 'PATCH', { relationLetterId: null })
  check('B5: حذف عطف موفق', clearRes.status === 200)
  const detA2 = await api(dabir, `/api/letters/${A}`, 'GET')
  const detA2data = detA2.data as { letter?: { relationChildren?: { id: string }[]; relation?: unknown } }
  check('B5b: بعد از حذف، فرزندان A خالی است', !(detA2data.letter?.relationChildren ?? []).some((r) => r.id === B))
  const clearAgain = await api(dabir, `/api/letters/${B}`, 'PATCH', { relationLetterId: null })
  check('B5c: حذف عطفِ بدون عطف = idempotent (۲۰۰)', clearAgain.status === 200)

  // B6. خود‌ارجاع ممنوع
  const selfRel = await api(dabir, `/api/letters/${B}`, 'PATCH', { relationLetterId: B })
  const selfRelData = selfRel.data as { error?: string }
  check('B6: خودارجاع رد می‌شود (۴۰۰ + پیام فارسی)', selfRel.status === 400 && !!selfRelData.error?.includes('خودش'), selfRelData.error ?? '')

  // B7. حلقه ممنوع: B→A سپس A→B
  await api(dabir, `/api/letters/${B}`, 'PATCH', { relationLetterId: A })
  const loop = await api(dabir, `/api/letters/${A}`, 'PATCH', { relationLetterId: B })
  const loopData = loop.data as { error?: string }
  check('B7: حلقه رد می‌شود (۴۰۰ + «حلقه»)', loop.status === 400 && !!loopData.error?.includes('حلقه'), loopData.error ?? '')

  // B8. سقف عمق ۵: زنجیره n1←n2←n3←n4←n5←n6 (۵ لبه) سپس n7 عطف به n6 → 400
  const chainIds: string[] = [A] // از A شروع: B→A موجود؛ برای زنجیره مستقل n1..n6 می‌سازیم
  let chainParent = A
  for (let i = 0; i < 4; i++) {
    const r = await createLetter(dabir, { relationLetterId: chainParent })
    const nid = (r.data as { id?: string }).id
    if (!nid) break
    createdLetterIds.push(nid)
    chainIds.push(nid)
    chainParent = nid
  }
  // اکنون زنجیره A + ۴ نامه = عمق ۵ نامه (۴ لبه از A)؛ نامه بعدی باید رد شود؟
  // زنجیره: n5→n4→n3→n2→A (۵ نامه)؛ B عطف A هم هست ولی مستقل.
  // عمق‌سنجی: هدف n5 → اجداد: n4(1) n3(2) n2(3) A(4) — هنوز جا دارد؛ اضافه n6 → اجداد ۵؛ n7 → باید ۴۰۰ بخورد
  const n6 = await createLetter(dabir, { relationLetterId: chainParent })
  const n6id = (n6.data as { id?: string }).id
  if (n6id) createdLetterIds.push(n6id)
  const tooDeep = await createLetter(dabir, { relationLetterId: n6id })
  const tooDeepData = tooDeep.data as { error?: string }
  check('B8: زنجیره عمیق‌تر از ۵ سطح رد می‌شود', tooDeep.status === 400 && !!tooDeepData.error?.includes('سطح'), tooDeepData.error ?? '')

  // B9. دامنه شرکت: نامه شرکت دیگر → 400
  const otherLetter = await db.letter.findFirst({ where: { companyId: { not: companyId } }, select: { id: true, companyId: true } })
  if (otherLetter) {
    const cross = await createLetter(dabir, { relationLetterId: otherLetter.id })
    const crossData = cross.data as { error?: string }
    check('B9: عطف به نامه شرکت دیگر رد می‌شود (ایزولاسیون مستأجر)', cross.status === 400 && !!crossData.error, crossData.error ?? '')
  } else {
    check('B9: نامه شرکت دیگر برای تست موجود بود', false, 'seed ندارد')
  }

  // B10. مالکیت: نامه در کارتابل admin → dabir نمی‌تواند عطفش را تغییر دهد
  const adminLetter = await createLetter(admin, { referTo: undefined })
  // نامه admin بدون ارجاع = DRAFT سازنده admin؛ dabir نه دارنده نه سازنده
  const adminLetterId = (adminLetter.data as { id?: string }).id
  if (adminLetterId) createdLetterIds.push(adminLetterId)
  const foreign = await api(dabir, `/api/letters/${adminLetterId}`, 'PATCH', { relationLetterId: A })
  check('B10: تغییر عطف نامه دیگران رد می‌شود (۴۰۰ «کارتابل شما نیست»)', foreign.status === 400, `status=${foreign.status}`)

  // B11. VIEWER هیچ نوشتنی ندارد (ماتریس نقش‌ها) — cfo.hold در ARAD نقش VIEWER دارد (seed)
  const viewer = await login('cfo.hold', '12345678')
  if (viewer) {
    // شرکت فعال viewer را همان شرکت dabir قرار می‌دهیم تا سنجه واقعاً نقش را بسنجد نه شرکت
    await api(viewer, '/api/auth/switch-company', 'POST', { companyId })
    const vRes = await createLetter(viewer)
    check('B11: VIEWER ثبت نامه رد می‌شود (۴۰۳)', vRes.status === 403, `status=${vRes.status}`)
  } else {
    check('B11: ورود viewer', false)
  }

  // B12. سجل حسابرسی RELATE با relationNumber — آخرین ردیف‌ها ممکن است «حذف عطف» باشند (cleared)؛
  // سنجه: در ۲۰ ردیف اخیر حداقل یک عطفِ ثبت‌شده با شمارهٔ مرجع موجود باشد
  const relateAudits = await db.auditLog.findMany({
    where: { action: 'RELATE', entity: 'letter', companyId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  const withRelationNumber = relateAudits.some((a) => {
    const d = typeof a.details === 'string' ? (JSON.parse(a.details) as Record<string, unknown>) : (a.details ?? {})
    return typeof d.relationNumber === 'number' && !!d.relationLetterId
  })
  check('B12: سجل RELATE در حسابرسی با شماره نامه مرجع', relateAudits.length > 0 && withRelationNumber, `ردیف‌های اخیر=${relateAudits.length}`)

  // ---------------- پاک‌سازی ----------------
  console.log('\n--- Cleanup ---')
  try {
    // حذف نامه‌های تستی (زنجیره فرزندان با onDelete: SetNull — حذف امن)
    if (createdLetterIds.length > 0) await db.letter.deleteMany({ where: { id: { in: createdLetterIds } } })
    await db.companySetting.update({ where: { companyId_key: { companyId, key: 'letters.numbering' } }, data: { value: '' } })
    console.log(`[PASS] پاک‌سازی: ${createdLetterIds.length} نامه تستی حذف + تنظیم شماره‌گذاری بازنشانی شد`)
  } catch (e) {
    console.log(`[WARN] پاک‌سازی ناقص: ${e instanceof Error ? e.message : '?'}`)
  }

  console.log(`\n========== نتیجه: ${passed} PASS / ${failures} FAIL ==========`)
}

main().catch((e) => {
  console.error('باتری R9 با خطا متوقف شد:', e)
  process.exitCode = 1
}).finally(() => { void db.$disconnect() })
