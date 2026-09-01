// تست عددی سنجه‌های گیت ۱ (P0-T23) — راستی‌آزمایی خروجی /api/dashboard با فرمول‌های مستند SPEC §۳
// اجرا: bunx tsx scripts/test-gate-metrics.ts  (سرور dev باید روشن باشد)
// روش: ورود ادمین → GET داشبورد → بازمحاسبه مستقل هر سنجه از دیتابیس → مقایسه
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL'
  if (!cond) failures += 1
  console.log(`[${mark}] ${name}${extra ? ` — ${extra}` : ''}`)
}

const round1 = (v: number) => Math.round(v * 10) / 10

type GateItem = { id: string; label: string; kind: 'percent' | 'count'; value: number | null; target: number; detail: string }

async function main() {
  // ۱) ورود ادمین (نمای هلدینگ = دامنه دید همه شرکت‌ها)
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })
  if (loginRes.status !== 200) {
    console.error('ورود ادمین ناموفق بود:', loginRes.status)
    process.exit(1)
  }
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''

  const dashRes = await fetch(`${BASE}/api/dashboard`, { headers: { cookie } })
  if (dashRes.status !== 200) {
    console.error('گرفتن داشبورد ناموفق بود:', dashRes.status)
    process.exit(1)
  }
  const dash = (await dashRes.json()) as { gate: GateItem[]; gateMeta: { passCount: number; total: number } }
  const api = new Map(dash.gate.map((g) => [g.id, g]))

  // ۲) بازمحاسبه مستقل از دیتابیس (همان فرمول‌های SPEC §۳ — دامنه هلدینگ)
  const [letters, docs, requests, memberships, weekLogs, jobs] = await Promise.all([
    db.letter.findMany({ select: { status: true, deadlineAt: true, referrals: { select: { createdAt: true } } } }),
    db.warehouseDoc.findMany({ select: { status: true } }),
    db.goodsRequest.findMany({ select: { status: true, createdAt: true, decidedAt: true } }),
    db.membership.findMany({ select: { user: { select: { id: true, isActive: true } } } }),
    db.auditLog.findMany({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) }, userId: { not: null } }, select: { userId: true } }),
    db.scheduledJob.findMany({ select: { lastStatus: true } }),
  ])

  const now = Date.now()
  const exp: Record<string, number | null> = {}
  exp['letters-flow'] = letters.length ? round1((letters.filter((l) => l.referrals.length > 0).length / letters.length) * 100) : null
  const posted = docs.filter((d) => d.status === 'POSTED').length
  const open = posted + docs.filter((d) => d.status === 'DRAFT').length
  exp['docs-posted'] = open ? round1((posted / open) * 100) : null
  const wd = letters.filter((l) => l.deadlineAt)
  const breached = wd.filter((l) => l.deadlineAt!.getTime() < now && l.status !== 'ARCHIVED')
  exp['deadline-compliance'] = wd.length ? round1(((wd.length - breached.length) / wd.length) * 100) : null
  const decided = requests.filter((q) => q.decidedAt)
  const under24 = decided.filter((q) => q.decidedAt!.getTime() - q.createdAt.getTime() < 24 * 3600 * 1000)
  exp['request-decision-24h'] = decided.length ? round1((under24.length / decided.length) * 100) : null
  const scopedIds = new Set(memberships.filter((m) => m.user.isActive).map((m) => m.user.id))
  const activeIds = new Set(weekLogs.filter((l) => l.userId && scopedIds.has(l.userId)).map((l) => l.userId!))
  exp['weekly-active-users'] = scopedIds.size ? round1((activeIds.size / scopedIds.size) * 100) : null
  exp['service-health'] = jobs.filter((j) => j.lastStatus === 'ERROR').length

  // ۳) مقایسه مقدار API با مقدار مورد انتظار + ساختار
  const expectedTargets: Record<string, number> = {
    'letters-flow': 70, 'docs-posted': 80, 'deadline-compliance': 90,
    'request-decision-24h': 85, 'weekly-active-users': 80, 'service-health': 0,
  }
  check('شش سنجه در پاسخ هست', dash.gate.length === 6, `count=${dash.gate.length}`)
  for (const [id, target] of Object.entries(expectedTargets)) {
    const g = api.get(id)
    if (!g) { check(`سنجه ${id} موجود`, false); continue }
    check(`${id}: هدف = ${target}`, g.target === target, `target=${g.target}`)
    check(`${id}: مقدار API = مقدار فرمول`, g.value === exp[id], `api=${g.value} vs expected=${exp[id]}`)
    if (g.kind === 'percent' && g.value !== null) {
      check(`${id}: مقدار در بازه ۰..۱۰۰`, g.value >= 0 && g.value <= 100, `value=${g.value}`)
    }
    const passed = g.value !== null && (g.kind === 'count' ? g.value <= g.target : g.value >= g.target)
    const expectedPass = exp[id] !== null && (g.kind === 'count' ? exp[id]! <= g.target : exp[id]! >= g.target)
    check(`${id}: پرچم پاس/عدم پاس سازگار`, passed === expectedPass, `passed=${passed}`)
  }
  check('gateMeta.passCount سازگار', dash.gateMeta.passCount === dash.gate.filter((g) => g.value !== null && (g.kind === 'count' ? g.value <= g.target : g.value >= g.target)).length, `passCount=${dash.gateMeta.passCount}`)

  // ۴) گزارش وضعیت برای انسان
  console.log('\n— وضعیت سنجه‌ها (API):')
  for (const g of dash.gate) {
    const v = g.value === null ? 'بدون داده' : g.kind === 'percent' ? `${g.value}٪` : String(g.value)
    const ok = g.value !== null && (g.kind === 'count' ? g.value <= g.target : g.value >= g.target)
    console.log(`  ${ok ? '✅' : '❌'} ${g.label}: ${v} (هدف ${g.kind === 'percent' ? '≥' : ''}${g.target}) — ${g.detail}`)
  }

  console.log(failures === 0 ? '\nنتیجه: تست عددی سنجه‌های گیت پاس شد ✅' : `\nنتیجه: ${failures} تست شکست خورد ❌`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
