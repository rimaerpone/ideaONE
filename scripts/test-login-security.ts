// تست خودکار امنیت ورود (P0-T20/T21) — نرخ تلاش + لاگ LOGIN_FAILED
// اجرا: bunx tsx scripts/test-login-security.ts  (سرور dev باید روشن باشد)
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL'
  if (!cond) failures += 1
  console.log(`[${mark}] ${name}${extra ? ` — ${extra}` : ''}`)
}

async function postLogin(username: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return { status: res.status, error: body.error ?? '', retryAfter: res.headers.get('retry-after') }
}

async function main() {
  const victim = `rltest.${Date.now() % 100000}` // کاربر ساختگی مخصوص تست نرخ
  const before = await db.auditLog.count({ where: { action: 'LOGIN_FAILED' } })

  // ۱) پنج تلاش ناموفق متوالی → همه ۴۰۱ با پیام فارسی
  for (let i = 1; i <= 5; i += 1) {
    const r = await postLogin(victim, 'wrong-password')
    check(`تلاش ${i}/۵ ناموفق → 401`, r.status === 401, r.error)
    check(`تلاش ${i}/۵ پیام فارسی`, /نام کاربری یا گذرواژه نادرست است/.test(r.error))
  }

  // ۲) تلاش ششم → ۴۲۹ با پیام فارسی محدودیت (حتی با گذرواژه درست فرضی)
  const sixth = await postLogin(victim, 'any-password')
  check('تلاش ششم → 429', sixth.status === 429, sixth.error)
  check('پیام ۴۲۹ فارسی و دارای مهلت', /بیش از حد مجاز/.test(sixth.error) && /ثانیه/.test(sixth.error))
  check('هدر Retry-After موجود', sixth.retryAfter === '60', `retry-after=${sixth.retryAfter}`)

  // ۳) ایزولاسیون: کاربر دیگر از همان IP باید بتواند وارد شود (کلید نرخ = username+IP)
  const other = await postLogin('ceo.arad', '12345678')
  check('کاربر دیگر از همان IP مشمول محدودیت نمی‌شود → 200', other.status === 200, `status=${other.status}`)
  if (other.status === 200) {
    // خروج تمیز برای عدم شلوغی نشست‌ها
    await fetch(`${BASE}/api/auth/logout`, { method: 'POST' })
  }

  // ۴) P0-T21: رکوردهای LOGIN_FAILED با IP و username در سجل حسابرسی
  const after = await db.auditLog.count({ where: { action: 'LOGIN_FAILED' } })
  check('۶ رکورد LOGIN_FAILED جدید ثبت شد', after - before === 6, `${before} → ${after}`)
  const recent = await db.auditLog.findMany({
    where: { action: 'LOGIN_FAILED' },
    orderBy: { createdAt: 'desc' },
    take: 2,
  })
  const latest = recent[0]
  const prev = recent[1]
  if (latest?.details && prev?.details) {
    const dl = JSON.parse(latest.details) as { username?: string; ip?: string; reason?: string }
    const dp = JSON.parse(prev.details) as { username?: string; ip?: string; reason?: string }
    check('آخرین رکورد = تلاش مسدودشده (rate_limited)', dl.reason === 'rate_limited' && dl.username === victim, JSON.stringify(dl))
    check('رکورد قبل از آن = unknown_user با IP', dp.reason === 'unknown_user' && dp.username === victim && typeof dp.ip === 'string' && dp.ip.length > 0, JSON.stringify(dp))
  } else {
    check('جزئیات رکوردهای LOGIN_FAILED موجود', false)
  }

  // ۵) رمز درستِ کاربرِ درست (ceo.arad) پس از تلاش‌های ناموفقِ کاربر دیگر → 200 (قبلاً آزموده شد)
  console.log(failures === 0 ? '\nنتیجه: همه تست‌های امنیت ورود پاس شدند ✅' : `\nنتیجه: ${failures} تست شکست خورد ❌`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
