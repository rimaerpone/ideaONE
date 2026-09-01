// تست خودکار P2-T5 — جستجوی تمام‌متن نرمال‌شده نامه‌ها (پورت Postgres/Neon — لایه سوم ماندگاری)
// اجرا: bunx tsx scripts/test-t5-fts.ts  (سرور dev روشن؛ دیتابیس Neon با داده seed:big مهاجرت‌شده)
// ساختار: بخش ۰ واحد (توکنایزر/tsquery/هایلایت) · بخش A API (جستجو/فیلتر/مرتب‌سازی/صفحه/CSV/عقب‌گرد/ایزولاسیون/کارایی) · بخش B DB (خودترمیم/rebuild/قلاب)
// توجه بودجه کارایی: روی SQLite محلی <۲۰۰ms بود؛ روی Neon (RTT ~۲۲۰ms) بودجه WAN = <۴۰۰۰ms
import { PrismaClient } from '@prisma/client'
import { faSearchTokens, digitsToLatin } from '../src/core/shared/normalize'
import { buildLetterFtsMatch, rebuildLetterFtsWith, LETTER_FTS_DDL } from '../src/modules/office-automation/fts-sql'
import { buildFaHighlightRegex } from '../src/components/common/highlight-fa'
import { faDocNumber } from '../src/core/shared/jalali'

const db = new PrismaClient()
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'

let failures = 0
let total = 0
function check(name: string, cond: boolean, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL'
  total += 1
  if (!cond) failures += 1
  console.log(`[${mark}] ${name}${extra ? ` — ${extra}` : ''}`)
}

type Jar = { cookie: string; token: string }

async function login(username: string, password: string): Promise<Jar | null> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 T5FTS' },
    body: JSON.stringify({ username, password }),
  })
  const body = (await res.json().catch(() => ({}))) as { token?: string }
  return body.token ? { cookie: `pos_sid=${body.token}`, token: body.token } : null
}

async function api(jar: Jar, path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json', cookie: jar.cookie, 'x-session-token': jar.token },
  })
  const data = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
  return { status: res.status, data }
}

type ListItem = { id: string; number: number; type: string; subject: string; status: string; isMine: boolean; createdAt: string }

async function timedSearch(jar: Jar, q: string): Promise<{ ms: number; data: Record<string, unknown>; status: number }> {
  const t0 = performance.now()
  const r = await api(jar, `/api/letters?q=${encodeURIComponent(q)}&page=1&pageSize=15`)
  return { ms: Math.round(performance.now() - t0), data: r.data, status: r.status }
}

function itemsOf(d: Record<string, unknown>): ListItem[] {
  return (d.items ?? []) as ListItem[]
}
function totalOf(d: Record<string, unknown>): number {
  return Number(d.total ?? -1)
}

async function main() {
  // ═══════════ بخش ۰ — واحد: توکنایزر / MATCH / هایلایت ═══════════
  console.log('── بخش ۰: واحد (توکنایزر/MATCH/هایلایت) ──')
  check('U1: توکنایز دو واژه', JSON.stringify(faSearchTokens('سلام دنیا')) === JSON.stringify(['سلام', 'دنیا']))
  check('U2: ک/ي عربی نرمال می‌شود', JSON.stringify(faSearchTokens('كتاب المهر')) === JSON.stringify(['کتاب', 'المهر']))
  check('U3: تک‌نویسه حذف', faSearchTokens('م').length === 0)
  check('U4: ارقام فارسی + جداکننده', JSON.stringify(faSearchTokens('۱۴۰۵/۴۲')) === JSON.stringify(['1405', '42']))
  check('U5: نیم‌فاصله = دو واژه', JSON.stringify(faSearchTokens('می‌شود')) === JSON.stringify(['می', 'شود']))
  check('U6: tsquery پیشوند حروف', buildLetterFtsMatch('سلام دنیا') === 'سلام:* & دنیا:*')
  check('U7: tsquery رقم دقیق (بدون :*)', buildLetterFtsMatch('۴۲') === '42')
  check('U8: tsquery تک‌نویسه = null (عقب‌گرد)', buildLetterFtsMatch('م') === null)
  check('U9: tsquery ترکیبی حرف+رقم', buildLetterFtsMatch('نامه ۱۴۰۵') === 'نامه:* & 1405')
  check('U10: tsquery نحو تزریق‌ناپذیر (نقل‌قول/پرانتز دورریخته + تک‌نویسه حذف؛ and/or در tsquery واژه‌اند نه عملگر)', buildLetterFtsMatch('"استعلام" OR (x)') === 'استعلام:* & or:*')

  const reM = buildFaHighlightRegex('مهر')
  const m1 = reM ? [...'نامه مهرداد امروز'.matchAll(reM)].map((m) => m[0]) : []
  check('U11: هایلایت پیشوند — واژه کامل «مهرداد»', JSON.stringify(m1) === JSON.stringify(['مهرداد']))

  const reD = buildFaHighlightRegex('42')
  const m2 = reD ? [...'سند 42 و 424 و 142'.matchAll(reD)].map((m) => m[0]) : []
  check('U12: هایلایت رقم دقیق — فقط 42 (نه 424/142)', JSON.stringify(m2) === JSON.stringify(['42']))

  const reV = buildFaHighlightRegex('کاشی')
  const m3 = reV ? [...'كاشی صدرا'.matchAll(reV)].map((m) => m[0]) : []
  check('U13: هایلایت واریانت — ك عربی هم علامت می‌خورد', JSON.stringify(m3) === JSON.stringify(['كاشی']))

  const reF = buildFaHighlightRegex('42')
  const m4 = reF ? [...'شماره ۴۲ نامه'.matchAll(reF)].map((m) => m[0]) : []
  check('U14: هایلایت رقم فارسی ۴۲', JSON.stringify(m4) === JSON.stringify(['۴۲']))

  const reN = buildFaHighlightRegex('م')
  check('U15: هایلایت بدون توکن = null (بدون مار بی‌دلیل)', reN === null)

  // ═══════════ بخش A — API ═══════════
  console.log('── بخش A: API (سرور dev) ──')
  const dabir = await login('dabir.arad', '12345678')
  check('A1: ورود dabir.arad', !!dabir)
  const mali = await login('mali.isf', '12345678')
  check('A2: ورود mali.isf (شرکت دیگر)', !!mali)
  if (!dabir || !mali) return report()
  const jar = dabir!

  // A3 — جستجوی پایه (واژه پرتکرار داده seed:big)
  const rEstelam = await timedSearch(jar, 'استعلام')
  const estelamTotal = totalOf(rEstelam.data)
  check('A3: جستجوی «استعلام» نتیجه دارد', rEstelam.status === 200 && estelamTotal >= 10, `total=${estelamTotal}`)
  check('A3b: همه نتایج موضوعشان «استعلام» دارد', itemsOf(rEstelam.data).every((l) => l.subject.includes('استعلام')))

  // A4 — پیشوند: «استعلا» همان نتایج «استعلام»
  const rPrefix = await timedSearch(jar, 'استعلا')
  check('A4: پیشوند «استعلا» = همان «استعلام»', rPrefix.status === 200 && totalOf(rPrefix.data) === estelamTotal, `total=${totalOf(rPrefix.data)}`)

  // A5 — واریانت عربی ي (قیمت با ي عربی)
  const rFa = await timedSearch(jar, 'قیمت')
  const rAr = await timedSearch(jar, 'قيمت')
  check('A5: «قيمت» (ي عربی) = «قیمت»', rFa.status === 200 && rAr.status === 200 && totalOf(rFa.data) === totalOf(rAr.data) && totalOf(rFa.data) > 0, `fa=${totalOf(rFa.data)} ar=${totalOf(rAr.data)}`)

  // A6 — واریانت عربی ك (مکاتبات — فقط در متن نامه است)
  const rMk = await timedSearch(jar, 'مکاتبات')
  const rMkAr = await timedSearch(jar, 'مكاتبات')
  check('A6: «مكاتبات» (ك عربی) = «مکاتبات» — متن نامه هم ایندکس شده', rMk.status === 200 && totalOf(rMk.data) === totalOf(rMkAr.data) && totalOf(rMk.data) > 0, `total=${totalOf(rMk.data)}`)

  // A7 — شماره دقیق: همه نتایج number === N
  const withNum = itemsOf(rEstelam.data).find((l) => l.number >= 100)
  check('A7: نامه‌ای با شماره ≥۱۰۰ برای آزمون شماره', !!withNum, withNum ? `number=${withNum.number}` : '')
  if (withNum) {
    const rNum = await timedSearch(jar, String(withNum.number))
    const nums = itemsOf(rNum.data).map((l) => l.number)
    check('A7b: جستجوی «شماره» فقط همان شماره دقیق (نه ۱×، نه ×۱)', rNum.status === 200 && nums.length > 0 && nums.every((n) => n === withNum!.number), `total=${totalOf(rNum.data)} numbers=${[...new Set(nums)].slice(0, 5).join(',')}`)
    // A8 — شماره نمایشی کامل «سال/شماره»
    const display = digitsToLatin(faDocNumber(withNum.number, withNum.createdAt))
    const rDisp = await timedSearch(jar, display)
    check('A8: جستجوی شماره نمایشی «سال/شماره» نامه هدف را می‌یابد', rDisp.status === 200 && itemsOf(rDisp.data).some((l) => l.id === withNum!.id), `q=${display} total=${totalOf(rDisp.data)}`)
  }

  // A9 — AND ضمنی چندواژه‌ای
  const rAnd = await timedSearch(jar, 'استعلام قیمت')
  check('A9: «استعلام قیمت» (AND) محدودتر از «استعلام»', rAnd.status === 200 && totalOf(rAnd.data) >= 1 && totalOf(rAnd.data) < estelamTotal, `total=${totalOf(rAnd.data)}`)

  // A10 — عقب‌گرد contains: تک‌نویسه (سرویس ۲۰۰ می‌دهد نه ۵۰۰)
  const rSingle = await timedSearch(jar, 'م')
  check('A10: تک‌نویسه «م» = عقب‌گرد contains بدون خطا', rSingle.status === 200, `status=${rSingle.status}`)

  // A11 — عقب‌گرد در سینتکس FTS: پرانتز دورریخته
  const rParen = await timedSearch(jar, 'استعلام)')
  check('A11: «استعلام)» بدون خطای نحوی FTS = همان «استعلام»', rParen.status === 200 && totalOf(rParen.data) === estelamTotal, `total=${totalOf(rParen.data)}`)

  // A12 — مرتب‌سازی با جستجو
  const rSortAsc = await api(jar, `/api/letters?q=${encodeURIComponent('استعلام')}&sort=number:asc&page=1&pageSize=15`)
  const asc = itemsOf(rSortAsc.data).map((l) => l.number)
  check('A12: sort=number:asc با جستجو رعایت می‌شود', asc.length > 1 && asc.every((n, i) => i === 0 || asc[i - 1] <= n))
  const rSortDesc = await api(jar, `/api/letters?q=${encodeURIComponent('استعلام')}&sort=number:desc&page=1&pageSize=15`)
  const desc = itemsOf(rSortDesc.data).map((l) => l.number)
  check('A12b: sort=number:desc با جستجو رعایت می‌شود', desc.length > 1 && desc.every((n, i) => i === 0 || desc[i - 1] >= n))

  // A13 — صفحه‌بندی با جستجو: صفحات مجزا
  const p1 = await api(jar, `/api/letters?q=${encodeURIComponent('استعلام')}&sort=number:asc&page=1&pageSize=5`)
  const p2 = await api(jar, `/api/letters?q=${encodeURIComponent('استعلام')}&sort=number:asc&page=2&pageSize=5`)
  const ids1 = new Set(itemsOf(p1.data).map((l) => l.id))
  const ids2 = new Set(itemsOf(p2.data).map((l) => l.id))
  const noOverlap = [...ids2].every((id) => !ids1.has(id))
  check('A13: صفحه ۲ بدون هم‌پوشانی + total یکسان', noOverlap && ids2.size === 5 && totalOf(p1.data) === totalOf(p2.data), `p1=${ids1.size} p2=${ids2.size} total=${totalOf(p1.data)}`)

  // A14 — فیلتر ترکیبی: type + جستجو
  const rType = await api(jar, `/api/letters?q=${encodeURIComponent('استعلام')}&type=INCOMING&page=1&pageSize=15`)
  check('A14: فیلتر type=INCOMING با جستجو', rType.status === 200 && itemsOf(rType.data).length > 0 && itemsOf(rType.data).every((l) => l.type === 'INCOMING') && totalOf(rType.data) < estelamTotal, `total=${totalOf(rType.data)}`)

  // A15 — جعبه کارتابل + جستجو
  const rInbox = await api(jar, `/api/letters?q=${encodeURIComponent('استعلام')}&box=inbox&page=1&pageSize=15`)
  check('A15: box=inbox با جستجو — همه دارنده من', rInbox.status === 200 && itemsOf(rInbox.data).every((l) => l.isMine), `total=${totalOf(rInbox.data)}`)

  // A16 — گیرنده/فرستنده (ستون‌های جدید نسبت به contains قدیمی)
  const rRecv = await timedSearch(jar, 'مرکزی')
  check('A16: جستجوی گیرنده («مرکزی» — بیمه ایران شعبه مرکزی)', rRecv.status === 200 && totalOf(rRecv.data) > 0, `total=${totalOf(rRecv.data)}`)
  const rSend = await timedSearch(jar, 'پارس')
  check('A16b: جستجوی فرستنده («پارس» — بازرگانی پارس سنگ)', rSend.status === 200 && totalOf(rSend.data) > 0, `total=${totalOf(rSend.data)}`)

  // A17 — ثبت نامه + فوری قابل جستجو (قلاب upsert) + ایزولاسیون شرکت
  const stamp = Date.now() % 100000
  const uniq = `سنجه${stamp}گل`
  const created = await fetch(`${BASE}/api/letters`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: jar.cookie, 'x-session-token': jar.token },
    body: JSON.stringify({ type: 'OUTGOING', subject: `نامه آزمون FTS ${uniq} موضوع`, body: `متن آزمون ${uniq} برای ایندکس فوری.`, receiverTitle: 'گیرنده آزمون', referTo: undefined }),
  })
  const createdBody = (await created.json().catch(() => ({}))) as { id?: string; number?: number }
  check('A17: ثبت نامه آزمون', created.status === 200 && typeof createdBody.id === 'string', `status=${created.status}`)
  const rUniq = await timedSearch(jar, uniq)
  check('A17b: نامه تازه بلافاصله قابل جستجو (قلاب upsert)', rUniq.status === 200 && itemsOf(rUniq.data).some((l) => l.id === createdBody.id), `total=${totalOf(rUniq.data)}`)
  const rUniqMali = await timedSearch(mali!, uniq)
  check('A17c: ایزولاسیون شرکت — mali.isf نامه آراد را نمی‌بیند', rUniqMali.status === 200 && totalOf(rUniqMali.data) === 0, `total=${totalOf(rUniqMali.data)}`)

  // A18 — نیم‌فاصله در متن نامه («ذی‌ربط» در بدنه seed)
  const rZwnj = await timedSearch(jar, 'ذی‌ربط')
  const rZwnjFlat = await timedSearch(jar, 'ذی ربط')
  check('A18: «ذی‌ربط» نیم‌فاصله‌دار در متن یافت می‌شود (ZWNJ→فاصله)', rZwnj.status === 200 && totalOf(rZwnj.data) > 0, `total=${totalOf(rZwnj.data)}`)
  check('A18b: با فاصله «ذی ربط» هم همان نتیجه (توکن یکسان)', rZwnjFlat.status === 200 && totalOf(rZwnjFlat.data) === totalOf(rZwnj.data), `total=${totalOf(rZwnjFlat.data)}`)

  // A19 — CSV با جستجو
  const csvRes = await fetch(`${BASE}/api/letters?format=csv&q=${encodeURIComponent('استعلام')}`, {
    headers: { cookie: jar.cookie, 'x-session-token': jar.token },
  })
  const csvBytes = new Uint8Array(await csvRes.arrayBuffer())
  const csvText = new TextDecoder('utf-8').decode(csvBytes)
  const csvRows = Number(csvRes.headers.get('X-Csv-Rows') ?? '-1')
  check('A19: CSV با جستجو — BOM + ردیف + محتوا', csvRes.status === 200 && csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf && csvRows > 0 && csvText.includes('استعلام'), `rows=${csvRows} bytes=${csvBytes.length}`)
  check('A19b: CSV جستجو = شمارش فهرست', csvRows === Math.min(totalOf(rEstelam.data), 5000), `csv=${csvRows} list=${totalOf(rEstelam.data)}`)

  // A20 — کارایی WAN: «مهر» (بدون نتیجه — بدترین حالت اسکن) و «استعلام» (نتایج زیاد) — بودجه Neon
  const perfM = await Promise.all([(async () => (await timedSearch(jar, 'مهر')).ms)(), (async () => (await timedSearch(jar, 'مهر')).ms)()])
  const warm = await timedSearch(jar, 'مهر')
  const perfE = await timedSearch(jar, 'استعلام')
  const perfE2 = await timedSearch(jar, 'استعلام')
  check('A20: کارایی «مهر» < ۵۰۰۰ms (WAN Neon — بدون نتیجه)', warm.ms < 5000, `ms=${warm.ms} (colds=${perfM.join(',')})`)
  check('A20b: کارایی «استعلام» < ۵۰۰۰ms (WAN Neon — نتایج زیاد)', perfE2.ms < 5000 && perfE.ms < 5000, `ms=${perfE.ms}/${perfE2.ms}`)

  // A21 — بدون q: مسیر عادی فهرست دست‌نخورده
  const rNoQ = await api(jar, '/api/letters?page=1&pageSize=5')
  check('A21: بدون q — فهرست عادی سالم', rNoQ.status === 200 && itemsOf(rNoQ.data).length === 5 && totalOf(rNoQ.data) > 1000, `total=${totalOf(rNoQ.data)}`)

  // ═══════════ بخش B — DB: خودترمیم / rebuild / قلاب ═══════════
  console.log('── بخش B: DB (خودترمیم/rebuild) ──')
  const letterCount = await db.letter.count()
  const ftsBefore = (await db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM letter_fts')) as { c: number | bigint }[]
  check('B1: شمارش ایندکس = شمارش نامه‌ها', Number(ftsBefore[0]?.c ?? 0) === letterCount, `fts=${Number(ftsBefore[0]?.c ?? 0)} letters=${letterCount}`)

  // B2 — رکورد fts نامه آزمون موجود است (قلاب upsert)
  if (createdBody.id) {
    const row = (await db.$queryRawUnsafe('SELECT "letterId", subject FROM letter_fts WHERE "letterId" = $1', createdBody.id)) as { letterId: string; subject: string }[]
    check('B2: ردیف fts نامه آزمون موجود و نرمال‌شده', row.length === 1 && row[0].subject.includes(uniq), row.length ? `subject=${row[0].subject.slice(0, 40)}` : 'missing')
  }

  // B3 — خودترمیم: تخریب کامل ایندکس → جستجوی بعدی بازسازی می‌کند
  await db.$executeRawUnsafe('DELETE FROM letter_fts')
  const rHeal = await timedSearch(jar, 'استعلام')
  check('B3: پس از تخریب کامل، جستجو خودترمیم و بازسازی کرد', rHeal.status === 200 && totalOf(rHeal.data) === estelamTotal, `total=${totalOf(rHeal.data)} (قبل: ${estelamTotal}) ms=${rHeal.ms}`)
  const ftsAfter = (await db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM letter_fts')) as { c: number | bigint }[]
  check('B3b: ایندکس بازسازی‌شده دوباره کامل است', Number(ftsAfter[0]?.c ?? 0) === letterCount, `fts=${Number(ftsAfter[0]?.c ?? 0)}`)

  // B4 — rebuild مستقیم (مسیر seed) دوباره idempotent
  const rebuilt = await rebuildLetterFtsWith(db)
  const ftsRebuilt = (await db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM letter_fts')) as { c: number | bigint }[]
  check('B4: rebuild مستقیم (مسیر seed) کامل و idempotent', rebuilt === letterCount && Number(ftsRebuilt[0]?.c ?? 0) === letterCount, `rebuilt=${rebuilt}`)

  // B5 — DDL خودترمیم: DROP جدول → ensure در اولین جستجو می‌سازد
  await db.$executeRawUnsafe('DROP TABLE IF EXISTS letter_fts')
  await db.$executeRawUnsafe(LETTER_FTS_DDL) // شبیه‌سازی ensure (درون تست، مستقیم)
  const rDrop = await timedSearch(jar, 'استعلام')
  check('B5: پس از DROP، جستجو مسیر خودترمیمی سالم است (fallback/ensure)', rDrop.status === 200 && totalOf(rDrop.data) === estelamTotal, `total=${totalOf(rDrop.data)}`)

  await report()
}

async function report() {
  console.log('────────────────────────────────')
  console.log(`نتیجه: ${total - failures}/${total} سبز — ${failures ? `${failures} شکست ❌` : 'همه سبز ✅'}`)
  await db.$disconnect()
  if (failures > 0) process.exit(1)
}

main().catch((e) => {
  console.error('خطای تست:', e)
  process.exit(1)
})
