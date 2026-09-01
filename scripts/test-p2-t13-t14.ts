// تست خودکار P2-T13 (گزارش هفتگی کارتابل) + P2-T14 (ویرایش پیشنهاد AI قبل از اعمال)
// اجرا: bunx tsx scripts/test-p2-t13-t14.ts  (سرور dev باید روشن باشد)
import { PrismaClient } from '@prisma/client'
import { toJalaliInputString } from '../src/core/shared/jalali'

const db = new PrismaClient()
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL'
  if (!cond) failures += 1
  console.log(`[${mark}] ${name}${extra ? ` — ${extra}` : ''}`)
}

type Jar = { cookie: string; token: string }

async function login(username: string, password: string): Promise<Jar | null> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 T13T14' },
    body: JSON.stringify({ username, password }),
  })
  const body = (await res.json().catch(() => ({}))) as { token?: string }
  return body.token ? { cookie: `pos_sid=${body.token}`, token: body.token } : null
}

async function api(jar: Jar, path: string, method: 'GET' | 'POST', body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: jar.cookie, 'x-session-token': jar.token },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try { data = JSON.parse(text) as Record<string, unknown> } catch { data = { raw: text } }
  return { status: res.status, data, headers: res.headers, text }
}

type Row = { userId: string; fullName: string; received: number; acted: number; stuck: number; actedByKind: { REFER: number; ANSWER: number; APPROVE: number; ARCHIVE: number } }
type Report = { rows: Row[]; totals: { received: number; acted: number; stuck: number }; from: string; to: string; fromJalali: string; toJalali: string; markdown: string; scopeCount: number; staleDays: number }

async function report(jar: Jar, qs: string): Promise<{ status: number; data: Report | { error: string } }> {
  const r = await api(jar, `/api/letters/weekly-report${qs}`, 'GET')
  return { status: r.status, data: r.data as unknown as Report | { error: string } }
}

function rowOf(rep: Report, userId: string): Row | undefined {
  return rep.rows.find((r) => r.userId === userId)
}

async function main() {
  // ---------- ورود ----------
  const admin = await login('admin', 'admin123')
  check('ورود admin', !!admin)
  const dabir = await login('dabir.arad', '12345678')
  check('ورود dabir.arad', !!dabir)
  const viewer = await login('u7.viewer', 'U7viewer!1405')
  check('ورود u7.viewer (VIEWER)', !!viewer)
  const ceo = await login('ceo.arad', '12345678')
  check('ورود ceo.arad', !!ceo)
  if (!admin || !dabir || !viewer || !ceo) return summary()

  const dabirUser = await db.user.findUnique({ where: { username: 'dabir.arad' } })
  const ceoUser = await db.user.findUnique({ where: { username: 'ceo.arad' } })
  if (!dabirUser || !ceoUser) { check('کاربران دبیر/مدیر در DB', false); return summary() }

  const stamp = Date.now() % 100000
  // بازه پهناور (دیشب تا فردا شب) تا همه رویدادهای تازه قطعاً داخل بازه باشند
  const now = new Date()
  const from = toJalaliInputString(new Date(now.getTime() - 1 * 86400000))
  const to = toJalaliInputString(new Date(now.getTime() + 2 * 86400000))
  const wide = `?from=${from}&to=${to}`

  // ═══════════ بخش A — P2-T13: گزارش هفتگی کارتابل ═══════════

  // A1 — گزارش برای ادمین: ساختار کامل + جمع‌ها = جمع سطرها + تفکیک = اقدام
  const r1 = await report(admin, `${wide}&staleDays=0`)
  const rep1 = r1.data as Report
  check('A1: گزارش ادمین ۲۰۰', r1.status === 200, `status=${r1.status}`)
  check('A1: سطر کاربر دارد', rep1.rows.length > 0, `rows=${rep1.rows.length}`)
  check('A1: بازه جلالی برمی‌گردد', !!rep1.fromJalali && !!rep1.toJalali, `${rep1.fromJalali}..${rep1.toJalali}`)
  const sumRows = rep1.rows.reduce((a, r) => ({ received: a.received + r.received, acted: a.acted + r.acted, stuck: a.stuck + r.stuck }), { received: 0, acted: 0, stuck: 0 })
  check('A1: جمع سطرها = totals', sumRows.received === rep1.totals.received && sumRows.acted === rep1.totals.acted && sumRows.stuck === rep1.totals.stuck)
  const kindsOk = rep1.rows.every((r) => r.actedByKind.REFER + r.actedByKind.ANSWER + r.actedByKind.APPROVE + r.actedByKind.ARCHIVE === r.acted)
  check('A1: تفکیک اقدام = اقدام هر سطر', kindsOk)
  check('A1: دامنه شرکت > ۰', rep1.scopeCount > 0, `scope=${rep1.scopeCount}`)

  // A2/A3 — گارد: غیرمدیر (نویسنده و VIEWER) هرگز گزارش نمی‌بینند
  const r2 = await report(dabir, wide)
  check('A2: dabir (نویسنده غیرمدیر) ۴۰۳', r2.status === 403 && (r2.data as { error: string }).error.includes('مدیران سامانه'))
  const r3 = await report(viewer, wide)
  check('A3: viewer ۴۰۳', r3.status === 403, `status=${r3.status}`)

  // سناریوی کنترل‌شده — دلتا روی گزارش: ثبت → ارجاع → پاسخ
  // (دو خط پایه: staleDays=0 برای معطل‌شماریِ همه‌باز و staleDays=3 + preset=last برای مقایسه مثل‌با‌مثل)
  const base0 = (await report(admin, `${wide}&staleDays=0`)).data as Report
  const baseRowD = rowOf(base0, dabirUser.id)
  const baseRowC = rowOf(base0, ceoUser.id)
  const base0d3 = (await report(admin, `${wide}&staleDays=3`)).data as Report
  const baseRowC3 = rowOf(base0d3, ceoUser.id)
  const lastBase0 = (await report(admin, `?preset=last&staleDays=0`)).data as Report
  const lastRowC0 = rowOf(lastBase0, ceoUser.id)
  const c1 = await api(dabir, '/api/letters', 'POST', {
    type: 'INCOMING', subject: `نامه آزمون T13/T14 ${stamp}`, body: 'گزارش هفتگی کارتابل — آزمون سناریو.',
    referTo: dabirUser.id,
  })
  const letterId = c1.data.id as string
  check('A4: ثبت نامه سناریو', (c1.status === 200 || c1.status === 201) && typeof letterId === 'string', JSON.stringify(c1.data).slice(0, 80))
  // ارجاع دبیر → مدیر (با مهلت)؛ سپس پاسخ مدیر
  const ref1 = await api(dabir, `/api/letters/${letterId}/actions`, 'POST', { action: 'REFER', toUserId: ceoUser.id, note: 'بررسی فرمایید' })
  check('A5: ارجاع به مدیر', ref1.status === 200, `status=${ref1.status}`)
  const ans1 = await api(ceo, `/api/letters/${letterId}/actions`, 'POST', { action: 'ANSWER', answerText: 'پاسخ آزمون گزارش هفتگی' })
  check('A6: پاسخ مدیر', ans1.status === 200, `status=${ans1.status}`)

  const rep2 = (await report(admin, `${wide}&staleDays=0`)).data as Report
  const rowD2 = rowOf(rep2, dabirUser.id)
  const rowC2 = rowOf(rep2, ceoUser.id)
  check('A7: ورود دبیر +۱ (ارجاع اولیه)', (rowD2?.received ?? 0) === (baseRowD?.received ?? 0) + 1, `${baseRowD?.received ?? 0} → ${rowD2?.received ?? 0}`)
  check('A7: اقدام دبیر +۲ (ارجاع اولیه + ارجاع)', (rowD2?.acted ?? 0) === (baseRowD?.acted ?? 0) + 2, `${baseRowD?.acted ?? 0} → ${rowD2?.acted ?? 0}`)
  check('A7: ورود مدیر +۱', (rowC2?.received ?? 0) === (baseRowC?.received ?? 0) + 1, `${baseRowC?.received ?? 0} → ${rowC2?.received ?? 0}`)
  check('A7: اقدام مدیر +۱ (پاسخ)', (rowC2?.acted ?? 0) === (baseRowC?.acted ?? 0) + 1)
  check('A7: تفکیک اقدام دبیر: REFER +۲', (rowD2?.actedByKind.REFER ?? 0) === (baseRowD?.actedByKind.REFER ?? 0) + 2)
  check('A7: تفکیک اقدام مدیر: ANSWER +۱', (rowC2?.actedByKind.ANSWER ?? 0) === (baseRowC?.actedByKind.ANSWER ?? 0) + 1)
  // نامه باز (ANSWERED) در دست مدیر — با آستانه ۰ معطل شمرده می‌شود؛ با آستانه ۳ نه (تحرک همین الان)
  check('A8: معطل مدیر +۱ با staleDays=۰', (rowC2?.stuck ?? 0) === (baseRowC?.stuck ?? 0) + 1, `${baseRowC?.stuck ?? 0} → ${rowC2?.stuck ?? 0}`)
  const rep3 = (await report(admin, `${wide}&staleDays=3`)).data as Report
  const rowC3 = rowOf(rep3, ceoUser.id)
  check('A9: نامه تازه با staleDays=۳ معطل نیست', (rowC3?.stuck ?? 0) === (baseRowC3?.stuck ?? 0), `${baseRowC3?.stuck ?? 0} → ${rowC3?.stuck ?? 0}`)

  // A10 — خروجی Markdown (معیار پذیرش: خروجی MD) — توجه: مسیر کامل + کوئری
  const md = await api(admin, `/api/letters/weekly-report${wide}&staleDays=3&format=md`, 'GET')
  check('A10: format=md → ۲۰۰', md.status === 200, `status=${md.status}`)
  check('A10: content-type markdown', String(md.headers.get('content-type') ?? '').includes('text/markdown'))
  check('A10: پیوست .md', String(md.headers.get('content-disposition') ?? '').includes('.md'))
  check('A10: عنوان گزارش', md.text.includes('# گزارش هفتگی کارتابل نامه‌ها'))
  check('A10: جدول کاربر', md.text.includes('| کاربر | ورود | اقدام | معطل | تفکیک اقدام |'))
  check('A10: جمع بازه', md.text.includes('جمع بازه:'))
  check('A10: نام سازنده گزارش', md.text.includes('سعید محمودی'))

  // A11 — خطاها: بازه معکوس / تاریخ خراب / آستانه خارج محدوده
  const rev = await report(admin, `?from=${to}&to=${from}`)
  check('A11: بازه معکوس ۴۰۰ فارسی', rev.status === 400 && (rev.data as { error: string }).error.includes('معکوس'))
  const bad = await report(admin, `?from=1405/13/01`)
  check('A11: تاریخ نامعتبر ۴۰۰', bad.status === 400 && (bad.data as { error: string }).error.includes('نامعتبر'))
  const stale = await report(admin, `${wide}&staleDays=99`)
  check('A11: آستانه ۹۹ ۴۰۰', stale.status === 400, `status=${stale.status}`)

  // A12 — preset=last: هفته گذشته کامل (شنبه..جمعه، ~۷ روز) — رویداد امروزِ سناریو نباید در آن بیفتد
  const lastBase = (await report(admin, `?preset=last&staleDays=0`)).data as Report
  const lastRowC = rowOf(lastBase, ceoUser.id)
  const spanDays = (new Date(lastBase.to).getTime() - new Date(lastBase.from).getTime()) / 86400000
  check('A12: preset=last هفت‌روزه است', spanDays > 6.9 && spanDays < 7.2, `span=${spanDays.toFixed(1)} روز`)
  check('A12: preset=last از this فرق دارد', lastBase.fromJalali !== rep2.fromJalali)
  check('A12: رویداد امروز در هفته گذشته نیامد', (lastRowC?.acted ?? 0) === (lastRowC0?.acted ?? 0), `${lastRowC0?.acted ?? 0} → ${lastRowC?.acted ?? 0}`)

  // ═══════════ بخش B — P2-T14: اعمال مقادیر ویرایش‌شده ═══════════

  // B1 — اعمال مقادیر ویرایش‌شده (بدون فراخوانی مدل — مقدار انسانی)
  const edited = { category: 'حقوقی و قراردادها', summary: `خلاصه ویرایش‌شده دبیر — آزمون T14 (${stamp})` }
  const b1 = await api(dabir, '/api/ai/apply', 'POST', { letterId, ...edited })
  check('B1: اعمال ویرایش‌شده ۲۰۰', b1.status === 200, `status=${b1.status} ${JSON.stringify(b1.data).slice(0, 80)}`)
  const letter1 = await db.letter.findUnique({ where: { id: letterId }, select: { aiCategory: true, aiSummary: true } })
  check('B2: رکورد مقادیر ویرایش‌شده دارد', letter1?.aiCategory === edited.category && letter1?.aiSummary === edited.summary, `${letter1?.aiCategory}`)

  // B3 — سجل AI_APPLY با مقادیر نهایی (معیار پذیرش T14)
  const audit1 = await db.auditLog.findFirst({ where: { action: 'AI_APPLY', entityId: letterId }, orderBy: { createdAt: 'desc' } })
  const det = audit1?.details ? (JSON.parse(audit1.details) as { category?: string; summary?: string }) : {}
  check('B3: سجل طبقه نهایی', det.category === edited.category, JSON.stringify(det).slice(0, 80))
  check('B3: سجل خلاصه نهایی', det.summary === edited.summary)

  // B4 — طبقه خارج فهرست مجاز ۴۰۰
  const b4 = await api(dabir, '/api/ai/apply', 'POST', { letterId, category: 'طبقهٔ ساختگی', summary: 'خلاصه' })
  check('B4: طبقه غیرمجاز ۴۰۰', b4.status === 400 && String(b4.data.error).includes('مجاز'), `status=${b4.status}`)

  // B5 — خلاصه خالی ۴۰۰
  const b5 = await api(dabir, '/api/ai/apply', 'POST', { letterId, category: 'فنی و تولیدی', summary: '   ' })
  check('B5: خلاصه خالی ۴۰۰', b5.status === 400 && String(b5.data.error).includes('الزامی'))

  // B6 — خلاصه بلند (> ۶۰۰) ۴۰۰
  const b6 = await api(dabir, '/api/ai/apply', 'POST', { letterId, category: 'فنی و تولیدی', summary: 'ا'.repeat(601) })
  check('B6: خلاصه ۶۰۱ نویسه ۴۰۰', b6.status === 400 && String(b6.data.error).includes('۶۰۰'))

  // B7 — VIEWER اجازه اعمال ندارد (HITL فقط نقش عملیاتی)
  const b7 = await api(viewer, '/api/ai/apply', 'POST', { letterId, ...edited })
  check('B7: VIEWER ۴۰۳', b7.status === 403, `status=${b7.status}`)

  // B8 — نامه ناموجود
  const b8 = await api(dabir, '/api/ai/apply', 'POST', { letterId: 'nonexistent-id', category: 'فنی و تولیدی', summary: 'خلاصه' })
  check('B8: نامه ناموجود ۴۰۴', b8.status === 404, `status=${b8.status}`)

  // B9 — نامه SECRET: تحلیل به مدل نمی‌رود (سیاست داده)
  const c2 = await api(dabir, '/api/letters', 'POST', {
    type: 'INCOMING', subject: `نامه سری T14 ${stamp}`, body: 'محتوای محرمانه', confidentiality: 'SECRET', referTo: dabirUser.id,
  })
  const secretId = c2.data.id as string
  check('B9: ثبت نامه سری', typeof secretId === 'string')
  const b9 = await api(dabir, '/api/ai/letter-assist', 'POST', { letterId: secretId })
  check('B9: تحلیل نامه سری ۴۰۳ سیاست', b9.status === 403 && String(b9.data.error).includes('سری'), `status=${b9.status}`)

  // B10 — پیشنهاد زنده مدل: ساختار + طبقه در فهرست (اگر سرویس LLM در دسترس بود)
  const b10 = await api(dabir, '/api/ai/letter-assist', 'POST', { letterId })
  if (b10.status === 200) {
    const sug = (b10.data as { suggestion?: { category?: string; summary?: string; priority?: string } }).suggestion
    const AI_CATS = ['اداری و هماهنگی', 'مالی و بازرگانی', 'فنی و تولیدی', 'انبار و لجستیک', 'منابع انسانی', 'حقوقی و قراردادها', 'کیفیت و ایمنی']
    check('B10: پیشنهاد زنده — طبقه در فهرست', !!sug && AI_CATS.includes(String(sug?.category)), String(sug?.category))
    check('B10: پیشنهاد زنده — خلاصه دارد', !!sug?.summary && sug.summary.length > 0)
  } else {
    console.log(`[SKIP] B10: سرویس LLM در دسترس نیست (${b10.status}) — گزینه ۵۰۳ محصول پابرجا`)
  }

  return summary()
}

function summary(): number {
  console.log(failures === 0 ? '\nهمه سنجه‌ها سبز ✅' : `\n${failures} سنجه قرمز ❌`)
  return failures
}

main().then((f) => {
  void db.$disconnect()
  process.exit(f === 0 ? 0 : 1)
}).catch(async (e) => {
  console.error('خطای تست:', e)
  await db.$disconnect()
  process.exit(1)
})
