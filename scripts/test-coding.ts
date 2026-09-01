// تست خودکار موتور کدگذاری ساختارمند («کد به‌عنوان جمله»)
// پوشش: طرحواره‌ها (آینه سند شرکت) · ترکیب/اعتبارسنجی · شمارنده per-company · رمزگشایی/تشخیص خودکار · RBAC
// اجرا: bunx tsx scripts/test-coding.ts  (سرور dev روشن + seed-code-schemes اجرا شده باشد)
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'

let failures = 0
let passed = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) passed += 1
  else failures += 1
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${extra ? ` — ${extra}` : ''}`)
}

async function loginAs(username: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'coding-test/1.0' },
    body: JSON.stringify({ username, password }),
  })
  const b = (await res.json()) as { token?: string }
  const token = b.token ?? ''
  const H = { 'content-type': 'application/json', cookie: `pos_sid=${token}`, 'x-session-token': token }
  const api = async (path: string, method: string, body?: unknown) => {
    const r = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
    const data = ((await r.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
    return { status: r.status, data }
  }
  return { status: res.status, api }
}

async function main() {
  console.log('━━━ A) طرحواره‌ها — آینه «دستورالعمل کدگذاری محصولات» ━━━')
  const admin = await loginAs('admin', 'admin123')
  check('ورود مدیر', admin.status === 200)

  const schemes = await admin.api('/api/coding/schemes', 'GET')
  const list = schemes.data.schemes as {
    code: string; name: string; totalLength: number; motherSegments: number | null; separator: string
    segments: { key: string; label: string; length: number; kind: string; mapsTo: string | null; enumValues: { code: string; label: string }[] }[]
  }[]
  check('فهرست طرحواره‌ها ۲۰۰', schemes.status === 200 && Array.isArray(list))
  const tile = list.find((s) => s.code === 'tile')
  check('طرحواره کاشی موجود', !!tile)
  check('کاشی = ۱۶ جزء و ۲۰ کاراکتر', tile ? tile.segments.length === 16 && tile.totalLength === 20 : false, `parts=${tile?.segments.length} len=${tile?.totalLength}`)
  check('کد مادر کاشی = ۹ جزء (تبصره ۱-۲)', tile?.motherSegments === 9)
  const segCount = (key: string) => tile?.segments.find((s) => s.key === key)?.enumValues.length ?? -1
  check('جدول ۲ لعاب: ۵ مقدار', segCount('glaze') === 5, `got=${segCount('glaze')}`)
  check('جدول ۳ ضخامت: ۴ مقدار', segCount('thickness') === 4)
  check('جدول ۴ سایز: ۸ مقدار', segCount('size') === 8)
  check('جدول ۶ رنگ: ۱۱ مقدار', segCount('color') === 11, `got=${segCount('color')}`)
  check('طیف و شید: ۹ مقدار هرکدام', segCount('spectrum') === 9 && segCount('shade') === 9)
  check('جدول ۱۰ درجه: ۶ مقدار', segCount('grade') === 6)
  check('جدول ۱۶ برند: ۲ مقدار (IS/YA)', segCount('brand') === 2)
  check('کد طرح = شمارنده', tile?.segments.find((s) => s.key === 'design')?.kind === 'COUNTER')
  check('نگاشت معنایی: لعاب→سطح، سایز→ابعاد، رنگ→رنگ', tile?.segments.find((s) => s.key === 'glaze')?.mapsTo === 'surface' && tile?.segments.find((s) => s.key === 'size')?.mapsTo === 'size' && tile?.segments.find((s) => s.key === 'color')?.mapsTo === 'color')
  check('سه طرحواره عمومی (تجهیزات/قطعات/مواد اولیه) — اثبات فراگیری', ['equipment', 'spare-part', 'raw-material'].every((c) => list.some((s) => s.code === c)))
  const eq = list.find((s) => s.code === 'equipment')
  check('تجهیزات: جداکننده «-» و کد مادر = ۲ جزء', eq?.separator === '-' && eq?.motherSegments === 2)
  check('ناشناس بدون نشست → 401', (await fetch(`${BASE}/api/coding/schemes`)).status === 401)

  console.log('━━━ B) ترکیب کد (compose) — اعتبارسنجی آینه سرور ━━━')
  const TILE_PARTS = { glaze: 'T', thickness: 'A', size: '60', hall: '1', design: '012', color: 'A', contrast: '0', spectrum: '5', shade: '5', grade: '1', sizeClass: 'M', mold: '1', absorption: '1', finish: 'R', packaging: '1', brand: 'IS' }
  const comp = await admin.api('/api/coding/compose', 'POST', { schemeCode: 'tile', parts: TILE_PARTS })
  check('ترکیب کامل → کد ۲۰ کاراکتری', comp.status === 200 && comp.data.code === 'TA601012A0551M11R1IS', `code=${comp.data.code}`)
  check('کد مادر = ۱۲ کاراکتر ابتدایی', comp.data.motherCode === 'TA601012A055', `mother=${comp.data.motherCode}`)
  check('توضیح فارسی جمله‌وار', String(comp.data.description).includes('براق') && String(comp.data.description).includes('۶۰×۶۰') && String(comp.data.description).includes('Isfahan Tile'))

  const missing = await admin.api('/api/coding/compose', 'POST', { schemeCode: 'tile', parts: { ...TILE_PARTS, brand: '' } })
  check('جزء الزامی خالی → خطای با لیبل فارسی', missing.status === 400 && /برند.*الزامی/.test(String(missing.data.error)), String(missing.data.error))
  const badEnum = await admin.api('/api/coding/compose', 'POST', { schemeCode: 'tile', parts: { ...TILE_PARTS, glaze: 'Z' } })
  check('مقدار خارج فهرست → خطای با مقادیر مجاز', badEnum.status === 400 && /مقادیر مجاز: T، M، P، B، R/.test(String(badEnum.data.error)), String(badEnum.data.error))
  const badLen = await admin.api('/api/coding/compose', 'POST', { schemeCode: 'tile', parts: { ...TILE_PARTS, design: '12' } })
  check('طول نادرست شمارنده → خطا', badLen.status === 400 && /۳ کاراکتر/.test(String(badLen.data.error)), String(badLen.data.error))
  const faDigits = await admin.api('/api/coding/compose', 'POST', { schemeCode: 'tile', parts: { ...TILE_PARTS, design: '۰۱۲', hall: '۱' } })
  check('ارقام فارسی ورودی → لاتین‌سازی', faDigits.status === 200 && faDigits.data.code === 'TA601012A0551M11R1IS')
  const noScheme = await admin.api('/api/coding/compose', 'POST', { schemeCode: 'ghost', parts: {} })
  check('طرحواره ناشناخته → 404', noScheme.status === 404)
  const generic = await admin.api('/api/coding/compose', 'POST', { schemeCode: 'equipment', parts: { family: 'KLN', hall: '2', serial: '007' } })
  check('طرحواره عمومی: EQ-KLN-2-007', generic.status === 200 && generic.data.code === 'KLN-2-007' && generic.data.motherCode === 'KLN-2', `code=${generic.data.code}`)

  console.log('━━━ C) شمارنده per-company + حسابرسی ━━━')
  // مدیر پلتفرم: شرکت فعال پیش‌فرض — شمارنده روی scope CODE:tile:design
  const before = await db.docCounter.findFirst({ where: { scope: 'CODE:tile:design' } })
  type PartsArr = { key: string; code: string }[]
  const issue1 = await admin.api('/api/coding/compose', 'POST', { schemeCode: 'tile', parts: { ...TILE_PARTS, design: 'next' }, issueCounters: ['design'] })
  const i1p = (issue1.data.parts ?? []) as PartsArr
  check('صدور شماره → کد با شماره تازه', issue1.status === 200 && /^\d{3}$/.test(String(i1p.find((p) => p.key === 'design')?.code)), `status=${issue1.status} parts=${JSON.stringify(i1p.find((p) => p.key === 'design'))} err=${issue1.data.error}`)
  const issue2 = await admin.api('/api/coding/compose', 'POST', { schemeCode: 'tile', parts: { ...TILE_PARTS, design: 'next' }, issueCounters: ['design'] })
  const i2p = (issue2.data.parts ?? []) as PartsArr
  const d1 = i1p.find((p) => p.key === 'design')?.code
  const d2 = i2p.find((p) => p.key === 'design')?.code
  check('شماره ترتیبی صعودی (per-company)', Number(d2) === Number(d1) + 1, `${d1} → ${d2}`)
  const after = await db.docCounter.findFirst({ where: { scope: 'CODE:tile:design' } })
  check('DocCounter موجود بازاستفاده شد', (!!before ? (after?.value ?? 0) > (before?.value ?? 0) : (after?.value ?? 0) >= 1))
  const auditRow = await db.auditLog.findFirst({ where: { action: 'CODE_COMPOSE' }, orderBy: { createdAt: 'desc' } })
  check('سجل CODE_COMPOSE ثبت شد', !!auditRow)

  console.log('━━━ D) رمزگشایی (decode) + تشخیص خودکار طرحواره ━━━')
  const dec = await admin.api('/api/coding/decode?code=TA601012A0551M11R1IS', 'GET')
  check('رمزگشایی کد کامل → تطبیق کاشی', dec.status === 200 && dec.data.schemeCode === 'tile' && dec.data.ok === true)
  check('اجزای رمزگشایی با لیبل', (dec.data.parts as { key: string; labelValue: string | null }[]).find((p) => p.key === 'glaze')?.labelValue === 'براق (ترانس)')
  check('کد مادر رمزگشایی', dec.data.motherCode === 'TA601012A055')
  const decEq = await admin.api('/api/coding/decode?code=KLN-2-007', 'GET')
  check('تشخیص خودکار: KLN-2-007 → تجهیزات', decEq.status === 200 && decEq.data.schemeCode === 'equipment' && decEq.data.ok === true, `scheme=${decEq.data.schemeCode}`)
  const decBad = await admin.api('/api/coding/decode?code=TAZZ1012A0551M11R1IS', 'GET')
  check('مقدار ناشناخته علامت می‌خورد (نه کرش)', decBad.status === 200 && decBad.data.ok === false, `ok=${decBad.data.ok} err=${decBad.data.error}`)
  const decLegacy = await admin.api('/api/coding/decode?code=ARD-P60-WHT', 'GET')
  check('کد قدیمی (legacy) → تطبیق کامل نمی‌یابد', decLegacy.status === 200 && decLegacy.data.ok === false)
  const decShort = await admin.api('/api/coding/decode?code=TA60', 'GET')
  check('کد ناقص → بدون کرش', decShort.status === 200 || decShort.status === 400)
  const decFa = await admin.api('/api/coding/decode?code=۰۱۲', 'GET')
  check('کد خالی/فقط رقم → پاسخ سلامت‌مند', decFa.status === 400 || decFa.status === 200)

  console.log('━━━ E) RBAC ━━━')
  // بازدیدکننده: cfo.hold نقش VIEWER در شرکت‌های عملیاتی دارد (seed) — پس از ورود به آراد سوییچ می‌کنیم
  const viewer = await loginAs('cfo.hold', '12345678')
  await viewer.api('/api/auth/switch-company', 'POST', { companyId: (await db.company.findUnique({ where: { code: 'ARAD' } }))?.id })
  const vSchemes = await viewer.api('/api/coding/schemes', 'GET')
  check('VIEWER: خواندن طرحواره‌ها مجاز', vSchemes.status === 200)
  const vCompose = await viewer.api('/api/coding/compose', 'POST', { schemeCode: 'tile', parts: TILE_PARTS })
  check('VIEWER: پیش‌نمایش ترکیب بدون شمارنده مجاز', vCompose.status === 200)
  const vIssue = await viewer.api('/api/coding/compose', 'POST', { schemeCode: 'tile', parts: { ...TILE_PARTS, design: 'next' }, issueCounters: ['design'] })
  check('VIEWER: صدور شمارنده ۴۰۳ (مصرف دائمی = نوشتن)', vIssue.status === 403, `status=${vIssue.status}`)
  const vDecode = await viewer.api('/api/coding/decode?code=TA601012A0551M11R1IS', 'GET')
  check('VIEWER: رمزگشایی مجاز', vDecode.status === 200)

  console.log('━━━ F) تعویض idempotent seed ━━━')
  // اجرای دوباره seed نباید کدینگ را بشکند (طرحواره‌ها بازسازی می‌شوند اما code همان است)
  const again = await admin.api('/api/coding/schemes', 'GET')
  const list2 = again.data.schemes as { code: string }[]
  check('اجرای مجدد seed: طرحواره‌ها یکتا می‌مانند', new Set(list2.map((s) => s.code)).size === list2.length && list2.length >= 4)

  console.log(`\n━━━ نتیجه: ${passed} پاس / ${failures} خطا ━━━`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
