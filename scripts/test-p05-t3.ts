// تست خودکار P0.5-T3 — سخت‌سازی عملیاتی: (الف) گارد CSRF، (ب) ماندگاری محدودساز نرخ، (ج) scrypt غیرمسدودکننده
// اجرا: ( unset DATABASE_URL; bunx tsx scripts/test-p05-t3.ts )  — سرور dev باید روشن باشد
// CI: TEST_BASE_URL قابل تنظیم است (پیش‌فرض http://127.0.0.1:3000)
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'
const REAL_USER = process.env.TEST_REAL_USER ?? 'ceo.arad'
const REAL_PASS = process.env.TEST_REAL_PASS ?? '12345678'

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL'
  if (!cond) failures += 1
  console.log(`[${mark}] ${name}${extra ? ` — ${extra}` : ''}`)
}

async function postLogin(body: object, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  return { status: res.status, error: json.error ?? '', retryAfter: res.headers.get('retry-after') }
}

async function main() {
  console.log(`─ الف) گارد CSRF (پایه: ${BASE}) ─`)

  // ۱) بدون Origin (کلاینت غیرمرورگری: اسکریپت/CI) → گارد نباید ببندد
  const noOrigin = await postLogin({ username: 'x', password: 'y' })
  check('POST بدون Origin → گارد باز (رسیده به route)', noOrigin.status !== 403, `status=${noOrigin.status}`)

  // ۲) Origin منطبق → مجاز
  const okOrigin = await postLogin(
    { username: 'x', password: 'y' },
    { origin: BASE },
  )
  check('POST با Origin منطبق → گارد باز', okOrigin.status !== 403, `status=${okOrigin.status}`)

  // ۳) Origin خارجی → 403
  const evil = await postLogin(
    { username: 'x', password: 'y' },
    { origin: 'https://evil.example.com' },
  )
  check('POST با Origin خارجی → 403', evil.status === 403, evil.error)

  // ۴) Origin: null (بافت مبهم/sandbox) → 403
  const nullOrigin = await postLogin(
    { username: 'x', password: 'y' },
    { origin: 'null' },
  )
  check('POST با Origin: null → 403', nullOrigin.status === 403, nullOrigin.error)

  // ۵) Sec-Fetch-Site: cross-site (بدون Origin) → 403
  const crossSite = await postLogin(
    { username: 'x', password: 'y' },
    { 'sec-fetch-site': 'cross-site' },
  )
  check('POST با Sec-Fetch-Site: cross-site → 403', crossSite.status === 403, crossSite.error)

  // ۶) Sec-Fetch-Site: same-origin → باز
  const sameSite = await postLogin(
    { username: 'x', password: 'y' },
    { 'sec-fetch-site': 'same-origin' },
  )
  check('POST با Sec-Fetch-Site: same-origin → گارد باز', sameSite.status !== 403, `status=${sameSite.status}`)

  // ۷) GET (غیر-mutation) با Origin خارجی → گارد اصلاً اعمال نمی‌شود
  const getEvil = await fetch(`${BASE}/api/auth/me`, {
    headers: { origin: 'https://evil.example.com' },
  })
  check('GET با Origin خارجی → خارج از دامنهٔ گارد', getEvil.status !== 403, `status=${getEvil.status}`)

  // ۸) ناهم‌خوانی پورت: Origin روی 9999 vs میزبان 3000 → 403
  const portMismatch = await postLogin(
    { username: 'x', password: 'y' },
    { origin: 'http://127.0.0.1:9999' },
  )
  check('POST با پورت ناهم‌خوان → 403', portMismatch.status === 403, portMismatch.error)

  // ۹) Mutation واقعی با نشست معتبر + Origin خارجی → 403 (نه فقط login)
  await postLogin({ username: REAL_USER, password: REAL_PASS })
  const logoutEvil = await fetch(`${BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { origin: 'https://evil.example.com' },
  })
  check('POST logout با Origin خارجی → 403', logoutEvil.status === 403)

  console.log('─ ب) ماندگاری محدودساز نرخ (LoginAttempt در DB) ─')

  // IP ساختگی یکتا برای ایزولاسیون کامل (route به x-forwarded-for اعتماد می‌کند)
  const fakeIp = `10.77.${(Date.now() % 900) + 50}.${(Date.now() % 200) + 10}`
  const victim = `p05t3.${Date.now() % 100000}`

  // ۵ تلاش ناموفق → 401
  let all401 = true
  for (let i = 1; i <= 5; i += 1) {
    const r = await postLogin({ username: victim, password: 'wrong' }, { 'x-forwarded-for': fakeIp })
    if (r.status !== 401) all401 = false
  }
  check('۵ تلاش ناموفق با IP جعلی → همه 401', all401)

  // ششم → 429
  const sixth = await postLogin({ username: victim, password: 'any' }, { 'x-forwarded-for': fakeIp })
  check('تلاش ششم → 429', sixth.status === 429, sixth.error)
  check('Retry-After موجود', sixth.retryAfter !== null, `retry-after=${sixth.retryAfter}`)

  // ردیف‌ها در DB ماندگارند — «شبیه‌سازی ری‌استارت»: کلاینت اتصال تازه
  // (تلاش مسدودشده ردیف نمی‌نویسد تا پنجرهٔ قفل تحت حملهٔ ممتد خودتمدید نشود)
  const rowsInDb = await db.loginAttempt.count({
    where: { username: victim, ip: fakeIp },
  })
  check('ردیف‌های ناموفق در DB ماندگارند (شبیه‌سازی نمونهٔ سرویس تازه)', rowsInDb === 5, `rows=${rowsInDb}`)

  // ایزولاسیون: کاربر دیگر از همان IP → مشمول محدودیت نمی‌شود
  const other = await postLogin({ username: REAL_USER, password: REAL_PASS }, { 'x-forwarded-for': fakeIp })
  check('کاربر دیگر از همان IP → 200 (ایزولاسیون کلید)', other.status === 200, `status=${other.status}`)

  // پاک‌سازی دادهٔ تست
  await db.loginAttempt.deleteMany({ where: { username: victim, ip: fakeIp } })
  const afterClean = await db.loginAttempt.count({ where: { username: victim, ip: fakeIp } })
  check('پاک‌سازی دادهٔ تست', afterClean === 0)

  console.log('─ ج) scrypt غیرمسدودکننده (پاسخ‌دهی event-loop تحت بار) ─')

  // گرم‌کردن مسیر سبک (کامپایل dev)
  await fetch(`${BASE}/api/auth/me`)
  // اندازهٔ مبنا: تأخیر endpoint سبک بدون بار
  const t0 = Date.now()
  await fetch(`${BASE}/api/auth/me`)
  const baseline = Date.now() - t0
  check('endpoint سبک بدون بار < 100ms', baseline < 100, `${baseline}ms`)

  // ۶ ورود موفقِ هم‌زمان (هرکدام scrypt verify واقعی ~100ms CPU) + نظارت هم‌زمان
  const pollLatencies: number[] = []
  let burstDone = false
  const burst = (async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => postLogin({ username: REAL_USER, password: REAL_PASS })),
    )
    return results.every((r) => r.status === 200)
  })()
  burst.then(() => { burstDone = true })
  // نظارت: تا پایان بار، پیوسته ping — تأخیر هر پاسخ اندازه‌گیری می‌شود
  const pollStart = Date.now()
  while (!burstDone && Date.now() - pollStart < 8000) {
    const p0 = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    await fetch(`${BASE}/api/auth/me`, { signal: controller.signal }).catch(() => {})
    clearTimeout(timer)
    pollLatencies.push(Date.now() - p0)
  }
  const burstOk = await burst
  const maxPoll = Math.max(...pollLatencies)
  check('همهٔ ۶ ورود هم‌زمان موفق (مسیر async صحیح)', burstOk)
  check(
    `بیشترین تأخیر endpoint سبک تحت بار (${maxPoll}ms) < 350ms — event-loop قفل نشد`,
    maxPoll < 300,
    `max=${maxPoll}ms · polls=${pollLatencies.length} · baseline=${baseline}ms`,
  )
  console.log(`    تأخیرها: ${pollLatencies.slice(0, 12).join('، ')}ms`)

  // پاک‌سازی نشست‌های این تست (نشست‌های ceo ایجادشده پس از شروع بخش ج)
  const sessionCount = await db.session.deleteMany({
    where: { user: { username: REAL_USER }, createdAt: { gte: new Date(pollStart - 60_000) } },
  })
  console.log(`    پاک‌سازی نشست‌های تست: ${sessionCount.count} نشست`)

  console.log(failures === 0 ? '\nنتیجه: همهٔ سنجه‌های P0.5-T3 پاس شدند ✅' : `\nنتیجه: ${failures} سنجه شکست خورد ❌`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
