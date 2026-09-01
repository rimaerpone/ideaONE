// راستی‌آزمایی زندهٔ P0.5-T2 — شناسنامهٔ پالت ۱۴کاراکتری (مادر ۱۲ + ۲ رقم سری) روی سرور dev + Neon
// اجرا: ( unset DATABASE_URL; bun scripts/test-pallet.ts )
// پوشش:
//   P1) صدور با motherCode معتبر → palletId = مادر + ۲رقم، طول ۱۴، سری افزایشی
//   P2) صدور مجدد همان مادر → سری +۱
//   P3) motherCode کوتاه (۱۱) → خطای «۱۲ کاراکتر»
//   P4) مقدار ENUM نامعتبر در مادر → خطای اعتبارسنجی جزء
//   P5) صدور با parts (ساخت مادر از اجزا) → همان palletId قاعده‌مند
//   P6) طرحواره ناموجود → 404
//   P7) VIEWER (cfo.hold در آراد پس از switch-company) → 403
//   P8) رجیستری زنده: ۴۱ ردیف + شناسنامهٔ warehouse-inventory موجود (CMD-011)
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
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 PalletT2' },
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
  // ---------- P8) رجیستری زنده (CMD-011) ----------
  const total = await db.platformModule.count()
  check('P8a: رجیستری ۴۱ ردیف', total === 41, `count=${total}`)
  const hasWhInv = await db.platformModule.findUnique({ where: { code: 'warehouse-inventory' } })
  check('P8b: warehouse-inventory (بازنام‌گذاری CMD-011 ردیف ۱۵)', !!hasWhInv)
  const legacy = await db.platformModule.findMany({ where: { code: { in: ['finance', 'treasury', 'commercial', 'production', 'warehouse'] } } })
  check('P8c: شناسه‌های قدیمی حذف شدند', legacy.length === 0, `remaining=${legacy.map((m) => m.code).join('،') || '—'}`)

  // ---------- ورود مسئول انبار آراد (OPERATOR — نقش نوشتن) ----------
  const anbar = await login('anbar.arad', '12345678')
  check('ورود anbar.arad', !!anbar)
  if (!anbar) return finish()
  const jar = anbar

  // ---------- P1/P2) صدور و سری افزایشی ----------
  const MOTHER = 'TA601001A055' // T=A براق · A=9.5mm · 60=۶۰×۶۰ · 1=سالن۱ · 001=طرح · A=سفید · 0=بدون کنتراست · 5=استاندارد · 5=چاپ استاندارد
  const r1 = await api(jar, '/api/coding/pallet', 'POST', { schemeCode: 'tile', motherCode: MOTHER })
  check('P1a: صدور موفق', r1.status === 200, JSON.stringify(r1.data).slice(0, 120))
  const p1 = r1.data as { palletId?: string; motherCode?: string; serial?: number }
  check('P1b: palletId = مادر + ۲رقم سری', !!p1.palletId && p1.palletId.length === 14 && p1.palletId.startsWith(MOTHER), `palletId=${p1.palletId}`)
  check('P1c: مادر در پاسخ سالم', p1.motherCode === MOTHER)

  const r2 = await api(jar, '/api/coding/pallet', 'POST', { schemeCode: 'tile', motherCode: MOTHER })
  const p2 = r2.data as { serial?: number; palletId?: string }
  check('P2: صدور مجدد → سری +۱', r2.status === 200 && (p2.serial ?? 0) === (p1.serial ?? 0) + 1, `serial=${p1.serial}→${p2.serial}`)

  // ---------- P3) طول نامعتبر ----------
  const r3 = await api(jar, '/api/coding/pallet', 'POST', { schemeCode: 'tile', motherCode: 'TA601001A05' })
  check('P3: مادر ۱۱کاراکتری → خطای ۱۲ کاراکتر', r3.status === 400 && String(r3.data.error ?? '').includes('۱۲'), String(r3.data.error ?? '').slice(0, 80))

  // ---------- P4) ENUM نامعتبر ----------
  const r4 = await api(jar, '/api/coding/pallet', 'POST', { schemeCode: 'tile', motherCode: 'XA601001A055' })
  check('P4: لعاب X نامعتبر → خطای جزء', r4.status === 400 && String(r4.data.error ?? '').includes('لعاب'), String(r4.data.error ?? '').slice(0, 80))

  // ---------- P5) ساخت مادر از اجزا ----------
  const r5 = await api(jar, '/api/coding/pallet', 'POST', {
    schemeCode: 'tile',
    parts: { glaze: 'T', thickness: 'A', size: '60', hall: '1', design: '001', color: 'A', contrast: '0', spectrum: '5', shade: '5' },
  })
  const p5 = r5.data as { palletId?: string; motherCode?: string }
  check('P5: parts → همان مادر + سری معتبر', r5.status === 200 && p5.motherCode === MOTHER && (p5.palletId ?? '').startsWith(MOTHER), `palletId=${p5.palletId}`)

  // ---------- P6) طرحواره ناموجود ----------
  const r6 = await api(jar, '/api/coding/pallet', 'POST', { schemeCode: 'no-scheme', motherCode: MOTHER })
  check('P6: طرحواره ناموجود → 404', r6.status === 404)

  // ---------- P7) VIEWER → 403 (پیش از مصرف شمارنده) ----------
  const cfo = await login('cfo.hold', '12345678')
  check('ورود cfo.hold', !!cfo)
  if (cfo) {
    const me = await api(cfo, '/api/auth/me', 'GET')
    const companies = ((me.data.companies ?? []) as { id: string; code?: string }[])
    const arad = companies.find((c) => c.code === 'ARAD')
    if (arad) {
      await api(cfo, '/api/auth/switch-company', 'POST', { companyId: arad.id })
      const r7 = await api(cfo, '/api/coding/pallet', 'POST', { schemeCode: 'tile', motherCode: MOTHER })
      check('P7: VIEWER → 403 (شمارنده مصرف نشد)', r7.status === 403)
    } else {
      check('P7: یافتن شرکت آراد برای cfo', false, 'شرکت آراد در me.companies نیست')
    }
  }

  finish()
}

function finish() {
  console.log(failures === 0 ? '\n✅ همهٔ سنجه‌های پالت P0.5-T2 سبز' : `\n⛔ ${failures} سنجه شکست خورد`)
  process.exitCode = failures === 0 ? 0 : 1
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
