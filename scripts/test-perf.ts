// ============================================================
// P1-T10/T11 — تست کارایی صفحات کلیدی با داده حجمی seed:big
// اجرا: bunx tsx scripts/test-perf.ts  (سرور dev روشن + seed:big اجرا شده)
//
// سنجه‌ها (میانه ۳ اجرا پس از گرم‌کردن):
//   - داشبورد < 500ms (معیار P1-T13)
//   - همه فهرست‌های کلیدی < 1000ms (معیار P1-T10) شامل صفحه عمیق (OFFSET ~۱۰هزار)
// خروجی: جدول زمان‌ها + PASS/FAIL + خروج غیرصفر در شکست
// ============================================================
export {} // ماژول‌سازی — جلوگیری از برخورد حوزه سراسری با سایر اسکریپت‌های تست

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL'
  if (!cond) failures += 1
  console.log(`[${mark}] ${name}${extra ? ` — ${extra}` : ''}`)
}

type Case = {
  name: string
  path: string
  /** آستانه میل‌ثانیه */
  budget: number
}

const CASES: Case[] = [
  { name: 'داشبورد مدیریتی (جمع‌های DB)', path: '/api/dashboard', budget: 500 },
  { name: 'نامه‌ها — صفحه ۱', path: '/api/letters?page=1&pageSize=15', budget: 1000 },
  { name: 'نامه‌ها — صفحه عمیق (~۱۰هزارم)', path: '/api/letters?page=650&pageSize=15', budget: 1000 },
  { name: 'نامه‌ها — فیلتر نوع+وضعیت', path: '/api/letters?type=INCOMING&status=IN_PROGRESS&pageSize=15', budget: 1000 },
  { name: 'نامه‌ها — جستجوی متنی', path: '/api/letters?q=%D8%A7%D8%B3%D8%AA%D8%B9%D9%84%D8%A7%D9%85&pageSize=15', budget: 1000 },
  { name: 'نامه‌ها — کارتابل من (inbox)', path: '/api/letters?box=inbox&pageSize=15', budget: 1000 },
  { name: 'اسناد انبار — صفحه ۱', path: '/api/whdocs?page=1&pageSize=15', budget: 1000 },
  { name: 'اسناد انبار — فیلتر نوع+وضعیت', path: '/api/whdocs?type=ISSUE&status=POSTED&pageSize=15', budget: 1000 },
  { name: 'اسناد انبار — صفحه عمیق', path: '/api/whdocs?page=300&pageSize=15', budget: 1000 },
  { name: 'موجودی انبار', path: '/api/stock?page=1&pageSize=15', budget: 1000 },
  { name: 'درخواست‌های کالا', path: '/api/requests?page=1&pageSize=30', budget: 1000 },
  { name: 'اعلان‌های کاربر', path: '/api/notifications', budget: 1000 },
  { name: 'سجل حسابرسی (۶۰ سطر)', path: '/api/audit?page=1&pageSize=60', budget: 1000 },
  { name: 'فهرست انبارها', path: '/api/warehouses', budget: 1000 },
]

async function timedFetch(path: string, H: Record<string, string>): Promise<{ status: number; ms: number }> {
  const t0 = performance.now()
  const res = await fetch(`${BASE}${path}`, { headers: H })
  await res.json()
  return { status: res.status, ms: Math.round(performance.now() - t0) }
}

const fmt = (ms: number) => `${ms.toLocaleString('fa-IR')}ms`

async function main() {
  console.log('── تست کارایی صفحات کلیدی (P1-T10/T11) ──')
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'perf/1.0' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })
  const lb = (await login.json()) as { token?: string }
  if (login.status !== 200 || !lb.token) {
    console.error('ورود ناموفق — سرور روشن است؟ seed اجرا شده؟')
    process.exit(1)
  }
  const H = { cookie: `pos_sid=${lb.token}`, 'x-session-token': lb.token! }

  // گرم‌کردن (کامپایل مسیر dev) — خارج از اندازه‌گیری
  for (const c of CASES) await timedFetch(c.path, H)
  console.log('(گرم‌شدن انجام شد — اندازه‌گیری میانه ۳ اجرا)\n')

  const rows: { name: string; min: number; med: number; max: number; status: number; budget: number; ok: boolean }[] = []
  for (const c of CASES) {
    const runs: number[] = []
    let status = 0
    for (let i = 0; i < 3; i++) {
      const r = await timedFetch(c.path, H)
      status = r.status
      runs.push(r.ms)
    }
    runs.sort((a, b) => a - b)
    const med = runs[1]
    rows.push({ name: c.name, min: runs[0], med, max: runs[2], status, budget: c.budget, ok: status === 200 && med < c.budget })
  }

  // جدول گزارش
  const wName = Math.max(...rows.map((r) => r.name.length)) + 2
  console.log(' '.padStart(2) + 'سنجه'.padEnd(wName) + 'حداقل     میانه     حداکثر    بودجه    نتیجه')
  for (const r of rows) {
    console.log(
      (r.ok ? '✓' : '✗') + ' ' +
      r.name.padEnd(wName) +
      fmt(r.min).padEnd(10) +
      fmt(r.med).padEnd(10) +
      fmt(r.max).padEnd(10) +
      fmt(r.budget).padEnd(9) +
      (r.ok ? 'قبول' : `رد${r.status !== 200 ? ` (HTTP ${r.status})` : ''}`),
    )
  }

  console.log('')
  const dash = rows.find((r) => r.name.startsWith('داشبورد'))!
  check(`داشبورد با داده حجمی < 500ms (معیار T13)`, dash.ok, `میانه=${fmt(dash.med)}`)
  for (const r of rows.filter((x) => x.budget === 1000)) {
    check(`${r.name} < 1s`, r.ok, `میانه=${fmt(r.med)}`)
  }
  const worst = [...rows].sort((a, b) => b.med - a.med).slice(0, 3)
  console.log(`\nکندترین‌ها: ${worst.map((w) => `${w.name} ${fmt(w.med)}`).join(' · ')}`)

  if (failures > 0) {
    console.error(`\n${failures} سنجه رد شد`)
    process.exit(1)
  }
  console.log('\nهمه سنجه‌های کارایی سبز است ✔')
}

main().catch((e) => { console.error('خطای تست:', e); process.exit(1) })
