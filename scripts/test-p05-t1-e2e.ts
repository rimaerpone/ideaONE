// راستی‌آزمایی زندهٔ P0.5-T1 (معیارهای پذیرش ۱، ۲، ۳ فایل فاز) روی سرور dev + Neon
// اجرا: ( unset DATABASE_URL; bun scripts/test-p05-t1-e2e.ts )
// پوشش:
//   A) قطعی‌سازی اتمیک RECEIPT: سند POSTED + موجودی اعمال + رویداد outbox
//   B) idempotency زنده: POST دوباره همان سند → خطای «قبلاً قطعی»
//   C) rollback زنده (C1): حواله با کمبود → خطا + سند DRAFT + موجودی دست‌نخورده
//   D) رقابت واقعی اقدام نامه: دو REFER موازی → یک 200 + یک 409 + بدون ارجاع یتیم
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
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 P05T1' },
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
  // ---------- ورود مسئول انبار آراد (شرکت عملیاتی، نقش مجاز POST) ----------
  const anbar = await login('anbar.arad', '12345678')
  check('ورود anbar.arad', !!anbar)
  if (!anbar) return finish()
  const jar = anbar

  // ---------- انتخاب انبار و کالای آراد ----------
  const whs = await api(jar, '/api/warehouses', 'GET')
  const whList = (whs.data.warehouses ?? whs.data.items ?? []) as { id: string; name: string }[]
  check('فهرست انبارها غیرخالی', whList.length > 0, `count=${whList.length}`)
  const wh = whList[0]
  const prods = await api(jar, '/api/products?pageSize=5', 'GET')
  const pList = (prods.data.products ?? prods.data.items ?? []) as { id: string; code: string }[]
  check('فهرست کالاها غیرخالی', pList.length > 0, `count=${pList.length}`)
  const prod = pList[0]
  if (!wh || !prod) return finish()

  const stockKey = { warehouseId: wh.id, productId: prod.id, tone: '', caliber: '', grade: '1' }
  const before = await db.stockItem.findUnique({ where: { warehouseId_productId_tone_caliber_grade: stockKey } })
  const beforeQty = before?.qtyM2 ?? 0

  // ---------- A) RECEIPT با post=true: اتمیک روی Neon ----------
  const stamp = Date.now() % 100000
  const receipt = await api(jar, '/api/whdocs', 'POST', {
    type: 'RECEIPT',
    warehouseId: wh.id,
    partnerName: `تأمین‌کننده آزمون P0.5-T1 ${stamp}`,
    items: [{ productId: prod.id, qtyM2: 5 }],
    post: true,
  })
  check('ثبت+قطعی رسید: پاسخ موفق', receipt.status === 200 || receipt.status === 201, JSON.stringify(receipt.data).slice(0, 90))
  const docId = receipt.data.id as string
  if (!docId) return finish()

  const docAfter = await db.warehouseDoc.findUnique({ where: { id: docId } })
  const stockAfter = await db.stockItem.findUnique({ where: { warehouseId_productId_tone_caliber_grade: stockKey } })
  check('A1: سند در POSTED', docAfter?.status === 'POSTED', `status=${docAfter?.status}`)
  check('A2: موجودی +۵ اعمال شد', (stockAfter?.qtyM2 ?? 0) === beforeQty + 5, `before=${beforeQty} after=${stockAfter?.qtyM2}`)
  const evt = await db.outboxEvent.findFirst({ where: { type: 'doc.posted', payload: { contains: docId } } })
  check('A3: رویداد doc.posted ثبت شد', !!evt)

  // ---------- B) POST دوباره همان سند → idempotency ----------
  const again = await api(jar, '/api/whdocs/decide', 'POST', { docId, action: 'POST' })
  check('B1: POST دوباره رد شد', again.status === 400, `status=${again.status}`)
  check('B2: پیام «سند قبلاً قطعی شده است»', String(again.data.error ?? '').includes('سند قبلاً قطعی شده'), JSON.stringify(again.data).slice(0, 90))
  const stockAfterB = await db.stockItem.findUnique({ where: { warehouseId_productId_tone_caliber_grade: stockKey } })
  check('B3: موجودی دوبار اعمال نشد', (stockAfterB?.qtyM2 ?? 0) === beforeQty + 5, `qty=${stockAfterB?.qtyM2}`)

  // ---------- C) حواله با کمبود → rollback کامل (C1 زنده) ----------
  // قرارداد علامت: قلم حواله از سمت فرم «منفی» ارسال می‌شود (سرور علامت قلم را اعمال می‌کند)
  const issue = await api(jar, '/api/whdocs', 'POST', {
    type: 'ISSUE',
    warehouseId: wh.id,
    partnerName: `گیرنده آزمون کمبود ${stamp}`,
    items: [{ productId: prod.id, qtyM2: -999_999 }],
    post: true,
  })
  check('C1: حواله با کمبود رد شد', issue.status === 400, `status=${issue.status}`)
  check('C2: پیام «موجودی کافی نیست»', String(issue.data.error ?? '').includes('موجودی کافی نیست'), JSON.stringify(issue.data).slice(0, 110))
  // پاسخ fail شناسه ندارد؛ سند DRAFT یتیم را از روی نام شریک آزمونی پیدا می‌کنیم
  const issueDoc = await db.warehouseDoc.findFirst({ where: { partnerName: { contains: `گیرنده آزمون کمبود ${stamp}` } }, orderBy: { docNumber: 'desc' } })
  check('C3: سند حواله در DRAFT ماند (rollback وضعیت)', issueDoc?.status === 'DRAFT', `status=${issueDoc?.status}`)
  const stockAfterC = await db.stockItem.findUnique({ where: { warehouseId_productId_tone_caliber_grade: stockKey } })
  check('C4: موجودی دست‌نخورده (rollback اقلام)', (stockAfterC?.qtyM2 ?? 0) === beforeQty + 5, `qty=${stockAfterC?.qtyM2}`)

  // ---------- D) رقابت واقعی اقدام نامه: دو REFER موازی ----------
  const dabir = await login('dabir.arad', '12345678')
  check('ورود dabir.arad', !!dabir)
  if (!dabir) return finish()
  const djar = dabir

  const created = await api(djar, '/api/letters', 'POST', { type: 'INCOMING', subject: `نامه آزمون رقابت P0.5-T1 ${stamp}`, body: 'آزمون اقدام هم‌زمان.' })
  check('ثبت نامه آزمونی', created.status === 200 || created.status === 201, JSON.stringify(created.data).slice(0, 80))
  const letterId = created.data.id as string
  if (!letterId) return finish()

  const [ceo, anbarUser] = await Promise.all([db.user.findUnique({ where: { username: 'ceo.arad' } }), db.user.findUnique({ where: { username: 'anbar.arad' } })])
  check('دو گیرندهٔ آزمون موجود', !!ceo && !!anbarUser)

  // ارجاع دبیرخانه (DRAFT سازنده) + هم‌زمان ارجاع دوباره: فقط یکی برنده است
  const first = api(djar, `/api/letters/${letterId}/actions`, 'POST', { action: 'REFER', toUserId: ceo?.id, note: 'رقابت ۱' })
  const second = api(djar, `/api/letters/${letterId}/actions`, 'POST', { action: 'REFER', toUserId: anbarUser?.id, note: 'رقابت ۲' })
  const [r1, r2] = await Promise.all([first, second])
  const codes = [r1.status, r2.status].sort()
  check('D1: دقیقاً یک 200 و یک 409', codes[0] === 200 && codes[1] === 409, `statuses=${r1.status},${r2.status}`)
  const loser = r1.status === 409 ? r1 : r2
  check('D2: پیام 409 «هم‌زمان»', String(loser.data.error ?? '').includes('هم‌زمان'), JSON.stringify(loser.data).slice(0, 90))

  const letterAfter = await db.letter.findUnique({ where: { id: letterId }, include: { referrals: true } })
  const winners = [r1, r2].filter((r) => r.status === 200)
  const winnerTarget = winners.length === 1 && r1.status === 200 ? ceo?.id : anbarUser?.id
  check('D3: ارجاع یتیم ثبت نشد', letterAfter?.referrals.length === 1, `referrals=${letterAfter?.referrals.length}`)
  check('D4: دارنده = گیرندهٔ برنده', letterAfter?.currentHolderId === winnerTarget, `holder=${letterAfter?.currentHolderId}`)

  finish()
}

function finish() {
  console.log('----------------------------------------')
  if (failures === 0) console.log('P0.5-T1 e2e: همهٔ سنجه‌ها سبز ✔')
  else console.log(`P0.5-T1 e2e: ${failures} سنجه قرمز ✘`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('خطای اجرای آزمون:', e)
  process.exit(1)
})
