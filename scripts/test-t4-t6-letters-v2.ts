// تست خودکار P2-T4 (متن پاسخ الزامی روی اقدام ANSWER) + P2-T6 (قالب واحد شماره نامه «۱۴۰۵/۴۲»)
// اجرا: bunx tsx scripts/test-t4-t6-letters-v2.ts  (سرور dev باید روشن باشد)
import { PrismaClient } from '@prisma/client'

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
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 T4T6' },
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
  // ---------- ورود دبیرخانه آراد (کاربر seed با کارتابل) ----------
  const dabir = await login('dabir.arad', '12345678')
  check('ورود dabir.arad', !!dabir)
  const jar = dabir!

  const stamp = Date.now() % 100000
  const subject = `نامه آزمون T4/T6 ${stamp}`

  // ---------- ثبت نامه بدون ارجاع (DRAFT دبیرخانه) ----------
  const created = await api(jar, '/api/letters', 'POST', { type: 'INCOMING', subject, body: 'متن آزمون برای پاسخ و قالب شماره.' })
  check('ثبت نامه آزمونی', (created.status === 200 || created.status === 201) && typeof created.data.id === 'string', JSON.stringify(created.data).slice(0, 80))
  const letterId = created.data.id as string
  const number = created.data.number as number

  // ---------- P2-T6: قالب واحد شماره «۱۴۰۵/۴۲» ----------
  // سال جلالی امروز از DocCounter همان سال شماره است — ۱۴۰۵ در محیط فعلی (سال جاری seed)
  const counter = await db.docCounter.findFirst({ where: { scope: 'LETTER' }, orderBy: { year: 'desc' } })
  const expectedYear = counter?.year ?? 1405
  const fa = (s: string | number) => String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
  const expectedNum = `${fa(expectedYear)}/${fa(number)}`
  const detail = await api(jar, `/api/letters/${letterId}`, 'GET')
  const letterDetail = detail.data.letter as { number: number; createdAt: string; referrals: { action: string; answerText: string | null; note: string | null }[]; status: string }
  check('جزئیات نامه شامل شماره و تاریخ', detail.status === 200 && !!letterDetail)
  // قالب نمایش در کلاینت از faDocNumber(number, createdAt) می‌آید؛ اینجا قرارداد داده را راستی‌آزمایی می‌کنیم:
  // number + createdAt همان دو ورودی تابع‌اند و سال جلالیِ createdAt باید سال شمارنده باشد
  const createdAt = new Date(letterDetail.createdAt)
  const jy = jalaliYearLocal(createdAt)
  check(`سال جلالی تاریخ ثبت (${jy}) = سال DocCounter (${expectedYear})`, jy === expectedYear)
  console.log(`[INFO] قالب واحد نمایشی این نامه: «نامه ${expectedNum} — ${subject}»`)

  // ---------- P2-T4: پاسخ بدون متن → رد ----------
  const empty = await api(jar, `/api/letters/${letterId}/actions`, 'POST', { action: 'ANSWER' })
  check('ANSWER بدون متن → ۴۰۰', empty.status === 400, `status=${empty.status}`)
  check('پیام فارسی «متن پاسخ الزامی است»', (empty.data.error as string ?? '').includes('متن پاسخ الزامی است'), JSON.stringify(empty.data))

  const spaces = await api(jar, `/api/letters/${letterId}/actions`, 'POST', { action: 'ANSWER', answerText: '   ' })
  check('ANSWER با فاصله‌های خالی → ۴۰۰', spaces.status === 400)

  // ---------- P2-T4: سقف طول ----------
  const tooLong = await api(jar, `/api/letters/${letterId}/actions`, 'POST', { action: 'ANSWER', answerText: 'x'.repeat(5001) })
  check('ANSWER بیش از ۵۰۰۰ نویسه → ۴۰۰', tooLong.status === 400, `status=${tooLong.status}`)

  // ---------- P2-T4: پاسخ معتبر ----------
  const answerBody = `پاسخ آزمون ${stamp}: این متن به‌عنوان محتوای پاسخ ثبت و در گردش نامه نمایش داده می‌شود.`
  const answered = await api(jar, `/api/letters/${letterId}/actions`, 'POST', { action: 'ANSWER', answerText: answerBody })
  check('ANSWER با متن → ۲۰۰', answered.status === 200, `status=${answered.status} ${JSON.stringify(answered.data).slice(0, 60)}`)

  // وضعیت نامه ANSWERED + متن پاسخ در گردش
  const after = await api(jar, `/api/letters/${letterId}`, 'GET')
  const afterLetter = after.data.letter as { status: string; referrals: { action: string; answerText: string | null; note: string | null }[] }
  const referrals = afterLetter.referrals
  check('وضعیت نامه = ANSWERED', afterLetter.status === 'ANSWERED')
  const answerRef = referrals.find((r) => r.action === 'ANSWER')
  check('متن پاسخ در گردش نامه ذخیره شد', !!answerRef && answerRef.answerText === answerBody, JSON.stringify(answerRef ?? {}).slice(0, 80))
  check('آخرین پاسخ فقط یک رکورد ANSWER دارد', referrals.filter((r) => r.action === 'ANSWER').length === 1)

  // ---------- P2-T4: اقدام‌های غیر ANSWER متن پاسخ ذخیره نمی‌کنند ----------
  // دوباره ثبت نامه و بایگانی با answerText — نباید ذخیره شود
  const c2 = await api(jar, '/api/letters', 'POST', { type: 'INTERNAL', subject: `${subject} (۲)`, body: 'آزمون عدم ذخیره answerText روی ARCHIVE.' })
  const lid2 = c2.data.id as string
  await api(jar, `/api/letters/${lid2}/actions`, 'POST', { action: 'ARCHIVE', answerText: 'نباید ذخیره شود' })
  const d2 = await api(jar, `/api/letters/${lid2}`, 'GET')
  const refs2 = (d2.data.letter as { referrals: { action: string; answerText: string | null }[] }).referrals
  const arch = refs2.find((r) => r.action === 'ARCHIVE')
  check('ARCHIVE با answerText → answerText ذخیره نشد (null)', !!arch && arch.answerText === null, JSON.stringify(arch ?? {}).slice(0, 60))

  // ---------- VIEWER نمی‌تواند پاسخ دهد (آینه RBAC) ----------
  // (کاربر viewer در seed نیست — این شاخه از test-rbac پوشش داده شده؛ اینجا فقط سنجه مثبت کافی است)

  await db.$disconnect()
  console.log('─'.repeat(60))
  if (failures > 0) { console.log(`✗ ${failures} خطا`); process.exit(1) }
  console.log('✅ همه سنجه‌های P2-T4/T6 سبز است')
}

/** سال جلالی محلی (بدون وابستگی به bundle کلاینت — الگوریتم تبدیل جلالی استاندارد) */
function jalaliYearLocal(date: Date): number {
  const gy = date.getFullYear(), gm = date.getMonth() + 1, gd = date.getDate()
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  const gy2 = gm > 2 ? gy + 1 : gy
  let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1]
  let jy = -1595 + 33 * Math.floor(days / 12053)
  days %= 12053
  jy += 4 * Math.floor(days / 1461)
  days %= 1461
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365 }
  return jy
}

void main()
