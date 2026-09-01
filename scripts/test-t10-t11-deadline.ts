// تست خودکار P2-T10 (مهلت اختصاصی هر ارجاع) + P2-T11 (یادآور خودکار مهلت — بدون اسپم)
// اجرا: bunx tsx scripts/test-t10-t11-deadline.ts  (سرور dev باید روشن باشد)
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
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 T10T11' },
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
  const data = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
  return { status: res.status, data }
}

async function main() {
  // ---------- ورود ----------
  const dabir = await login('dabir.arad', '12345678')
  check('ورود dabir.arad', !!dabir)
  const admin = await login('admin', 'admin123')
  check('ورود admin', !!admin)
  if (!dabir || !admin) return report()
  const jar = dabir!
  const ajar = admin!

  const dabirUser = await db.user.findUnique({ where: { username: 'dabir.arad' } })
  if (!dabirUser) { check('کاربر dabir در DB', false); return report() }
  const ceo = await db.user.findUnique({ where: { username: 'ceo.arad' } })
  if (!ceo) { check('کاربر ceo در DB', false); return report() }

  const stamp = Date.now() % 100000
  const jalali = (d: Date) => toJalaliInputString(d)
  const now = new Date()
  const plusDays = (n: number) => new Date(now.getTime() + n * 86400000)

  // ═══════════ بخش A — P2-T10: مهلت اختصاصی گام ═══════════

  // A1 — ثبت نامه با ارجاع اولیه به خود + مهلت نامه → ارجاع اولیه باید مهلت را به ارث ببرد
  const c1 = await api(jar, '/api/letters', 'POST', {
    type: 'INCOMING', subject: `نامه آزمون T10/T11 مهلت-موعد ${stamp}`, body: 'آزمون یادآور روز موعد.',
    referTo: dabirUser.id, deadlineAt: jalali(plusDays(0)),
  })
  check('A1: ثبت نامه DUE', (c1.status === 200 || c1.status === 201) && typeof c1.data.id === 'string', JSON.stringify(c1.data).slice(0, 90))
  const lDue = c1.data.id as string

  const c2 = await api(jar, '/api/letters', 'POST', {
    type: 'INCOMING', subject: `نامه آزمون T10/T11 سه‌روزه ${stamp}`, body: 'آزمون یادآور سه‌روزه.',
    referTo: dabirUser.id, deadlineAt: jalali(plusDays(2)),
  })
  const lSoon = c2.data.id as string
  check('A2: ثبت نامه T3', typeof lSoon === 'string')

  const c3 = await api(jar, '/api/letters', 'POST', {
    type: 'INCOMING', subject: `نامه آزمون T10/T11 دور ${stamp}`, body: 'آزمون بدون یادآور (مهلت دور).',
    referTo: dabirUser.id, deadlineAt: jalali(plusDays(10)),
  })
  const lFar = c3.data.id as string
  check('A3: ثبت نامه دور', typeof lFar === 'string')

  const c4 = await api(jar, '/api/letters', 'POST', {
    type: 'INCOMING', subject: `نامه آزمون T10/T11 گذشته ${stamp}`, body: 'آزمون بدون یادآور (مهلت گذشته).',
    referTo: dabirUser.id, deadlineAt: jalali(plusDays(-1)),
  })
  const lPast = c4.data.id as string
  check('A4: ثبت نامه مهلت‌گذشته', typeof lPast === 'string')

  // A5 — جزئیات: ارجاع اولیه مهلت دارد + توUserId برای «گام جاری»
  const d1 = await api(jar, `/api/letters/${lDue}`, 'GET')
  const det = (d1.data.letter ?? {}) as { referrals: { action: string; deadlineAt: string | null; toUserId: string; fromId: string }[]; status: string }
  check('A5: ارجاع اولیه مهلت را به ارث برد', det.referrals?.length === 1 && det.referrals[0].deadlineAt !== null, JSON.stringify(det.referrals ?? []).slice(0, 90))
  check('A6: ارجاع شامل toUserId (گام جاری)', det.referrals?.[0]?.toUserId === dabirUser.id)
  check('A7: وضعیت در جریان', det.status === 'IN_PROGRESS')

  // A8 — ارجاع دستی با مهلت معتبر (روی نامه DUE) — دبیرخانه نامه را به مدیرعامل ارجاع می‌دهد با مهلت اختصاصی
  const ref1 = await api(jar, `/api/letters/${lDue}/actions`, 'POST', { action: 'REFER', toUserId: ceo.id, deadlineAt: jalali(plusDays(2)), note: 'ارجاع با مهلت آزمون' })
  check('A8: REFER با مهلت معتبر → ۲۰۰', ref1.status === 200, `status=${ref1.status}`)
  const d1b = await api(jar, `/api/letters/${lDue}`, 'GET')
  const detB = (d1b.data.letter ?? {}) as { holderId: string | null; referrals: { action: string; deadlineAt: string | null; toUserId: string }[] }
  const lastRef = detB.referrals[detB.referrals.length - 1]
  check('A9: مهلت روی رکورد ارجاع ذخیره شد', lastRef?.deadlineAt !== null && lastRef?.toUserId === ceo.id, JSON.stringify(lastRef ?? {}).slice(0, 90))
  check('A10: دارنده جاری = گیرنده ارجاع', detB.holderId === ceo.id)

  // A11 — مهلت نامعتبر → ۴۰۰ + پیام فارسی
  const bad = await api(jar, `/api/letters/${lDue}/actions`, 'POST', { action: 'REFER', toUserId: ceo.id, deadlineAt: '۱۴۰۵/۱۳/۴۵' })
  check('A11: REFER با مهلت نامعتبر → ۴۰۰', bad.status === 400, `status=${bad.status}`)
  check('A12: پیام فارسی «مهلت اقدام گیرنده نامعتبر»', String(bad.data.error ?? '').includes('مهلت اقدام گیرنده نامعتبر'))

  // A13 — مهلت روی اقدام غیر REFER ذخیره نمی‌شود (الگوی answerText)
  const c5 = await api(jar, '/api/letters', 'POST', { type: 'INTERNAL', subject: `نامه آزمون T10 پاسخ-مهلت ${stamp}`, body: 'مهلت روی ANSWER ذخیره نشود.', referTo: dabirUser.id })
  const lAns = c5.data.id as string
  await api(jar, `/api/letters/${lAns}/actions`, 'POST', { action: 'ANSWER', answerText: 'پاسخ آزمون', deadlineAt: jalali(plusDays(2)) })
  const dAns = await api(jar, `/api/letters/${lAns}`, 'GET')
  const ansRefs = (dAns.data.letter as { referrals: { action: string; deadlineAt: string | null }[] }).referrals
  const ansRef = ansRefs.find((r) => r.action === 'ANSWER')
  check('A13: ANSWER مهلت ذخیره نمی‌کند', !!ansRef && ansRef.deadlineAt === null, JSON.stringify(ansRef ?? {}).slice(0, 80))

  // A14 — فهرست: stepDeadlineAt در پاکت (نمای فهرست با جعبه من)
  const list = await api(jar, '/api/letters?box=inbox&page=1&pageSize=30', 'GET')
  const items = ((list.data as { items?: { id: string; stepDeadlineAt: string | null; deadlineAt: string | null }[] }).items) ?? []
  const soonItem = items.find((i) => i.id === lSoon)
  check('A14: stepDeadlineAt در فهرست (گام جاری)', !!soonItem && soonItem.stepDeadlineAt !== null, JSON.stringify(soonItem ?? {}).slice(0, 80))

  // ═══════════ بخش B — P2-T11: یادآور خودکار (تاریخ ساختگی + عدم اسپم) ═══════════

  // B1 — پیکربندی سناریو با تاریخ‌های ساختگی (روز موعد / سه‌روزه / دور / گذشته / بایگانی / مهلت-نامه‌ای)
  // lDue: دارنده = ceo با مهلت +۲ روز (از A8) → انتظار T3 برای ceo
  // lSoon: دارنده = dabir با مهلت +۲ روز → T3 برای dabir
  // lFar: +۱۰ روز → هیچ
  // lPast: -۱ روز → هیچ (T12 معطل‌ها دامنه جداست)
  // lArch: بایگانی‌شده با مهلت نزدیک → هیچ
  // lLetterOnly: گام بدون مهلت + مهلت نامه امروز → DUE برای dabir (fallback)
  const c6 = await api(jar, '/api/letters', 'POST', { type: 'INCOMING', subject: `نامه آزمون T11 بایگانی ${stamp}`, body: 'بایگانی با مهلت نزدیک.', referTo: dabirUser.id, deadlineAt: jalali(plusDays(1)) })
  const lArch = c6.data.id as string
  await api(jar, `/api/letters/${lArch}/actions`, 'POST', { action: 'ARCHIVE' })

  const c7 = await api(jar, '/api/letters', 'POST', { type: 'INCOMING', subject: `نامه آزمون T11 مهلت-نامه ${stamp}`, body: 'فقط مهلت نامه امروز.', referTo: dabirUser.id, deadlineAt: jalali(plusDays(0)) })
  const lLetterOnly = c7.data.id as string
  // گام بدون مهلت: ارجاع اولیه مهلت‌دار را خالی می‌کنیم تا فقط مهلت نامه بماند
  await db.letterReferral.updateMany({ where: { letterId: lLetterOnly }, data: { deadlineAt: null } })
  // lSoon را دقیقاً +۲ روز تنظیم می‌کنیم (از A2 خودش هست) — lDue هم دارنده ceo با مهلت +۲ روز

  // پاک‌سازی idempotent: یادآورهای آزمون قبلی همین دو کاربر (اجرای مجدد تست نباید قرمز شود)
  const del = await db.notification.deleteMany({
    where: { dedupKey: { startsWith: 'deadline-reminder:' }, userId: { in: [dabirUser.id, ceo.id] } },
  })
  if (del.count > 0) console.log(`[INFO] پاک‌سازی یادآورهای آزمون قبلی: ${del.count} ردیف`)

  // B2 — نقش غیرمدیر نمی‌تواند job را اجرا کند
  const forbid = await api(jar, '/api/platform/jobs/run', 'POST', { key: 'deadline-reminder' })
  check('B2: اجرای job توسط غیرمدیر → ۴۰۳', forbid.status === 403, `status=${forbid.status}`)

  // B3 — کلید نامعتبر
  const unknown = await api(ajar, '/api/platform/jobs/run', 'POST', { key: 'no-such-job' })
  check('B3: کلید ناموجود → ۴۰۴', unknown.status === 404, `status=${unknown.status}`)

  // B4 — اجرای دستی توسط ادمین
  const run1 = await api(ajar, '/api/platform/jobs/run', 'POST', { key: 'deadline-reminder' })
  check('B4: اجرای deadline-reminder → ۲۰۰', run1.status === 200, `status=${run1.status} ${JSON.stringify(run1.data).slice(0, 90)}`)
  const note1 = String(run1.data.note ?? '')
  console.log(`[INFO] گزارش اجرا: ${note1}`)

  // B5 — اعلان‌های ارسال‌شده به دارنده‌ها (فقط برای نامه‌های این آزمون — داده seed نویز است)
  const MY = [lDue, lSoon, lFar, lPast, lArch, lLetterOnly]
  const allDabirRems = await db.notification.findMany({ where: { userId: dabirUser.id, dedupKey: { startsWith: 'deadline-reminder:' } } })
  const allCeoRems = await db.notification.findMany({ where: { userId: ceo.id, dedupKey: { startsWith: 'deadline-reminder:' } } })
  const myRems = (ns: typeof allDabirRems) => ns.filter((n) => MY.some((lid) => n.dedupKey?.startsWith(`deadline-reminder:${lid}:`)))
  const dabirRems = myRems(allDabirRems)
  const ceoRems = myRems(allCeoRems)
  const remsFor = (lid: string) => dabirRems.filter((n) => n.dedupKey?.startsWith(`deadline-reminder:${lid}:`) ?? false)
  check('B5: dabir فقط دو یادآور آزمون (lSoon=T3 + lLetterOnly=DUE)', dabirRems.length === 2, `${dabirRems.length} یادآور: ${dabirRems.map((n) => n.dedupKey).join(' | ')}`)
  check('B6: lSoon → T3 (سه‌روزه)', remsFor(lSoon).some((n) => n.dedupKey?.endsWith(':T3')), remsFor(lSoon).map((n) => n.dedupKey).join(','))
  check('B7: lLetterOnly → DUE (منبع letter — مهلت نامه، بدون مهلت گام)', remsFor(lLetterOnly).some((n) => n.dedupKey?.endsWith(':letter:DUE')), remsFor(lLetterOnly).map((n) => n.dedupKey).join(','))
  check('B8: lFar بدون یادآور (مهلت دور)', remsFor(lFar).length === 0)
  check('B9: lPast بدون یادآور (گذشته از موعد)', remsFor(lPast).length === 0)
  check('B10: lArch بدون یادآور (بایگانی)', remsFor(lArch).length === 0)
  check('B11: ceo یک یادآور T3 برای lDue (گام اختصاصی +۲روز)', ceoRems.filter((n) => n.dedupKey?.startsWith(`deadline-reminder:${lDue}:`)).length === 1, ceoRems.map((n) => n.dedupKey).join(' | '))
  const t3 = remsFor(lSoon).find((n) => n.dedupKey?.endsWith(':T3'))
  check('B12: عنوان/بدنه فارسی یادآور T3', !!t3 && t3.title === 'مهلت اقدام نامه نزدیک است' && !!t3.body?.includes('۲ روز'), t3?.title ?? '—')
  check('B13: kind=LETTER + targetView=cartable', !!t3 && t3.kind === 'LETTER' && t3.targetView === 'cartable')
  const dueNotif = remsFor(lLetterOnly).find((n) => n.dedupKey?.endsWith(':DUE'))
  check('B14: عنوان DUE «مهلت اقدام نامه: امروز»', !!dueNotif && dueNotif.title === 'مهلت اقدام نامه: امروز')

  // B15 — عدم اسپم: اجرای دوباره → هیچ یادآور جدیدی (برای نامه‌های آزمون؛ بقیه با dedup محافظت‌اند)
  const run2 = await api(ajar, '/api/platform/jobs/run', 'POST', { key: 'deadline-reminder' })
  check('B15: اجرای دوم → ۲۰۰', run2.status === 200)
  const dabirRems2 = myRems(await db.notification.findMany({ where: { userId: dabirUser.id, dedupKey: { startsWith: 'deadline-reminder:' } } }))
  const ceoRems2 = myRems(await db.notification.findMany({ where: { userId: ceo.id, dedupKey: { startsWith: 'deadline-reminder:' } } }))
  check('B16: عدم اسپم — شمار یادآور dabir بدون تغییر', dabirRems2.length === dabirRems.length, `${dabirRems2.length} ≠ ${dabirRems.length}`)
  check('B17: عدم اسپم — شمار یادآور ceo بدون تغییر', ceoRems2.length === ceoRems.length, `${ceoRems2.length} ≠ ${ceoRems.length}`)
  // B18 — یکتایی dedupKey در سطح DB (عدم اسپم ساختاری، حتی با اجرای هم‌زمان) — PG: alias در HAVING مجاز نیست
  const dups = await db.$queryRawUnsafe('SELECT "dedupKey", COUNT(*) AS c FROM "Notification" WHERE "dedupKey" IS NOT NULL GROUP BY "dedupKey" HAVING COUNT(*) > 1') as { dedupKey: string; c: number }[]
  check('B18: هیچ dedupKey تکراری در کل جدول اعلان', dups.length === 0, JSON.stringify(dups.slice(0, 3)))

  // B19 — ردیف ScheduledJob به‌روز شد (حاکمیت)
  const job = await db.scheduledJob.findUnique({ where: { key: 'deadline-reminder' } })
  check('B19: ردیف ScheduledJob → lastStatus=OK + note', !!job && job.lastStatus === 'OK' && !!job.note, `${job?.lastStatus ?? '—'} · ${job?.note ?? '—'}`)

  // B20 — سجل حاکمیتی JOB_RUN در حسابرسی
  const aud = await db.auditLog.findFirst({ where: { action: 'JOB_RUN', entityId: 'deadline-reminder' }, orderBy: { createdAt: 'desc' } })
  check('B20: سجل JOB_RUN ثبت شد', !!aud)

  // B21 — ارجاع دوباره با مهلت جدید → یادآور تازه برای گام تازه (شناسنامه گام جدید در dedupKey)
  const reRef = await api(jar, `/api/letters/${lLetterOnly}/actions`, 'POST', { action: 'REFER', toUserId: ceo.id, deadlineAt: jalali(plusDays(1)) })
  check('B21: ارجاع مجدد گام تازه با مهلت → ۲۰۰', reRef.status === 200, `status=${reRef.status}`)
  const run3 = await api(ajar, '/api/platform/jobs/run', 'POST', { key: 'deadline-reminder' })
  check('B22: اجرای سوم → ۲۰۰', run3.status === 200)
  const ceoRems3 = myRems(await db.notification.findMany({ where: { userId: ceo.id, dedupKey: { startsWith: `deadline-reminder:${lLetterOnly}:` } } }))
  check('B23: یادآور T3 برای گام تازه ceo', ceoRems3.length === 1 && (ceoRems3[0].dedupKey?.endsWith(':T3') ?? false), ceoRems3.map((n) => n.dedupKey).join(','))

  report()
}

function report() {
  console.log('─'.repeat(60))
  console.log(failures === 0 ? '✔ همه سنجه‌ها سبز است' : `✗ ${failures} سنجه قرمز`)
  process.exitCode = failures === 0 ? 0 : 1
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
