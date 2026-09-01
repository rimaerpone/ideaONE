// گزارش ماهانه گیت ۱ (P0-T24) — سند یک‌صفحه‌ای با ۶ سنجه + روند برای جلسه گیت
// اجرا: bunx tsx scripts/gate-report.ts   → خروجی: download/گزارش-گیت-۱-<تاریخ جلالی>.md
// منبع داده: همان API زنده داشبورد (تک‌منبع حقیقت — بدون تکرار فرمول‌ها)
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'
const ADMIN_USER = process.env.IDEAONE_ADMIN_USER ?? 'admin'
const ADMIN_PASS = process.env.IDEAONE_ADMIN_PASS ?? 'admin123'

type GateItem = { id: string; label: string; kind: 'percent' | 'count'; value: number | null; target: number; detail: string }
type DashboardPayload = {
  kpis: {
    cartableCount: number; openLetters: number; urgentLetters: number; pendingRequests: number
    stockTotalM2: number; postedDocs: number; draftDocs: number; activeModules: number
    pluginCatalog: { total: number; active: number }
    aiAssistedLetters: number
  }
  docTrend: { name: string; رسید: number; حواله: number }[]
  gate: GateItem[]
  gateMeta: { passCount: number; total: number }
}

const fa = (n: number) => n.toLocaleString('fa-IR')

function jalaliToday(): string {
  const parts = new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}/${get('month')}/${get('day')}`
}

async function main() {
  // ۱) داده زنده از API داشبورد (دامنه هلدینگ)
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  })
  if (login.status !== 200) throw new Error(`ورود ناموفق: ${login.status}`)
  const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
  const res = await fetch(`${BASE}/api/dashboard`, { headers: { cookie } })
  if (res.status !== 200) throw new Error(`داشبورد ناموفق: ${res.status}`)
  const data = (await res.json()) as DashboardPayload

  const companyCount = await db.company.count()
  const userCount = await db.user.count({ where: { isActive: true } })

  // ۲) رندر سند یک‌صفحه‌ای
  const today = jalaliToday()
  const rows = data.gate
    .map((g) => {
      const v = g.value === null ? '—' : g.kind === 'percent' ? `${fa(g.value)}٪` : fa(g.value)
      const ok = g.value !== null && (g.kind === 'count' ? g.value <= g.target : g.value >= g.target)
      const status = g.value === null ? 'بدون داده' : ok ? 'پاس ✅' : 'عدم پاس ❌'
      const target = g.kind === 'percent' ? `≥ ${fa(g.target)}٪` : fa(g.target)
      return `| ${g.label} | ${v} | ${target} | ${status} | ${g.detail} |`
    })
    .join('\n')

  const trend = data.docTrend
    .map((t) => `| ${t.name} | ${fa(t.رسید)} | ${fa(t.حواله)} |`)
    .join('\n')

  const allPass = data.gateMeta.passCount === data.gateMeta.total
  const redItems = data.gate.filter((g) => g.value !== null && (g.kind === 'count' ? g.value > g.target : g.value < g.target))
  const suggestion = allPass
    ? '**تصمیم پیشنهادی: عبور از گیت ۱** — همه سنجه‌ها پاس شده‌اند؛ ورود به فاز ۲ (اتوماسیون اداری پیشرفته و گردشکار) توصیه می‌شود.'
    : `**تصمیم پیشنهادی: ادامه پایلوت با برنامه اصلاح** — ${fa(redItems.length)} سنجه از ${fa(data.gateMeta.total)} هنوز پاس نشده است (${redItems.map((g) => g.label).join('، ')}). برای هر مورد، مسئول و مهلت اصلاح در جلسه گیت تعیین شود.`

  const md = `# گزارش گیت ۱ پایلوت — ${today}

> سند یک‌صفحه‌ای برای جلسه کمیته راهبری (P0-T24) — تولید خودکار از داده زنده سامانه (scripts/gate-report.ts)
> دامنه: هلدینگ (تجمعی همه شرکت‌ها) · فرمول سنجه‌ها: docs/modules/dashboard/SPEC.md §۳

## ۱. سنجه‌های گیت (جدول C.2 / چارت محصول §۳)

| سنجه | مقدار فعلی | هدف | وضعیت | مبنا |
|---|---|---|---|---|
${rows}

**جمع‌بندی: ${fa(data.gateMeta.passCount)} سنجه از ${fa(data.gateMeta.total)} پاس شده است.**

## ۲. تصویر عملیاتی لحظه گزارش

- نامه در جریان: ${fa(data.kpis.openLetters)} · نزدیک به مهلت: ${fa(data.kpis.urgentLetters)} · کارتابل مجموع: ${fa(data.kpis.cartableCount)}
- اسناد قطعی‌شده: ${fa(data.kpis.postedDocs)} · پیش‌نویس باز: ${fa(data.kpis.draftDocs)} · درخواست کالای باز: ${fa(data.kpis.pendingRequests)}
- موجودی کل دامنه: ${fa(Math.round(data.kpis.stockTotalM2))} م² · پلاگین فعال: ${fa(data.kpis.activeModules)} از ${fa(data.kpis.pluginCatalog.total)}
- پوشش سازمان: ${fa(companyCount)} شرکت · ${fa(userCount)} کاربر فعال · نامه‌های غنی‌شده با AI: ${fa(data.kpis.aiAssistedLetters)}

## ۳. روند شش‌هفته‌ای اسناد انبار (قطعی‌شده)

| هفته از | رسید | حواله |
|---|---|---|
${trend}

## ۴. تصمیم پیشنهادی

${suggestion}

> یادآوری: در محیط استقرار واقعی، مخرج سنجه «نرخ ثبت نامه» دفتر کاغذی شرکت‌ها نیز هست (مقایسه ثبت دیجیتال با کل نامه‌های دریافتی)؛ در سندباکس همه نامه‌ها دیجیتال‌اند و معادل پایش‌پذیر (نرخ گردش دیجیتال) گزارش می‌شود.
`

  const outPath = `download/گزارش-گیت-۱-${today.replace(/\//g, '-')}.md`
  const { writeFileSync, mkdirSync } = await import('node:fs')
  mkdirSync('download', { recursive: true })
  writeFileSync(outPath, md, 'utf8')
  console.log(`گزارش گیت تولید شد: ${outPath}`)
  console.log(`(${fa(data.gateMeta.passCount)} از ${fa(data.gateMeta.total)} سنجه پاس)`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
