// scripts/test-ux-foundation.ts — رگرسیون سه‌گانه زیرساخت UX (P1-T1/T2/T20)
// ۱) سازنده‌های اسکیمای فارسی (core/forms/schemas) — پیام‌ها و رفتار
// ۲) پاریته پیام کلاینت↔سرور: همان ورودی بد → متن خطای سرور == متن zod
// ۳) قرارداد فهرست‌ها (letters/whdocs/requests/stock) از گیت‌وی
// اجرا: bunx tsx scripts/test-ux-foundation.ts
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { faJalaliDate, faNumberField, faOptional, faRequired } from '../src/core/forms/schemas'
import { normalizeFaText, parseNumericInput } from '../src/core/shared/normalize'

const BASE = 'http://127.0.0.1:81'
let pass = 0
let fail = 0
const ok = (name: string, cond: boolean, extra?: string) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`) }
}

// ---------- بخش ۱: سازنده‌های اسکیما ----------
console.log('\n■ ۱) سازنده‌های اسکیمای فارسی (core/forms/schemas)')

{
  const s = z.object({ subject: faRequired('موضوع نامه', 200), body: faRequired('متن نامه', 10000) })
  const bad = s.safeParse({ subject: '   ', body: '' })
  ok('متن خالی → «موضوع نامه الزامی است»', !bad.success && bad.error.issues.some((i) => i.message === 'موضوع نامه الزامی است'))
  ok('متن خالی → «متن نامه الزامی است»', !bad.success && bad.error.issues.some((i) => i.message === 'متن نامه الزامی است'))
  const good = s.safeParse({ subject: '  تریم  ', body: 'متن' })
  ok('trim خودکار مقدار معتبر', good.success && good.data?.subject === 'تریم')
}

{
  const s = z.object({ q: faNumberField('مقدار (متر مربع)', { min: 0.01 }) })
  ok('عدد فارسی «۱٬۲۰۰٫۵» معتبر', s.safeParse({ q: '۱٬۲۰۰٫۵' }).success)
  ok('عدد لاتین «1200.5» معتبر', s.safeParse({ q: '1200.5' }).success)
  const neg = z.object({ q: faNumberField('مقدار') })
  ok('عدد منفی «-620» در فیلد بدون حداقل معتبر', neg.safeParse({ q: '-620' }).success)
  const bad = s.safeParse({ q: '۱۲abc' })
  ok('ورودی مخلوط رد با پیام راهنما', !bad.success && /عدد معتبر نیست/.test(bad.error.issues[0]?.message ?? ''))
  const zero = s.safeParse({ q: '۰' })
  ok('کمتر از حداقل رد', !zero.success && /حداقل/.test(zero.error.issues[0]?.message ?? ''))
}

{
  const s = z.object({ note: faOptional(10) })
  ok('اختیاری خالی مجاز', s.safeParse({ note: '' }).success)
  const long = s.safeParse({ note: '۰۱۲۳۴۵۶۷۸۹۰' })
  ok('سقف طول با ارقام فارسی در پیام', !long.success && /۱۰/.test(long.error.issues[0]?.message ?? ''))
}

{
  const s = z.object({ deadline: faJalaliDate('مهلت اقدام') })
  ok('تاریخ جلالی معتبر', s.safeParse({ deadline: '1405/06/05' }).success)
  ok('تاریخ فارسی‌رقم معتبر', s.safeParse({ deadline: '۱۴۰۵/۰۶/۰۵' }).success)
  ok('خالی = اختیاری', s.safeParse({ deadline: '' }).success)
  const bad = s.safeParse({ deadline: '1405/13/01' })
  ok('ماه نامعتبر رد با نمونه درست', !bad.success && /نمونه درست: ۱۴۰۵\/۰۶\/۰۵/.test(bad.error.issues[0]?.message ?? ''))
}

// ---------- بخش ۲: پاریته پیام کلاینت↔سرور ----------
console.log('\n■ ۲) پاریته پیام خطا: zod ↔ سرور (آینه P1-T20)')

const login = async (username: string, password: string) => {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = (await res.json()) as { ok?: boolean }
  if (!data.ok) throw new Error(`login failed: ${username}`)
  return res.headers.get('set-cookie')?.split(';')[0] ?? ''
}

// اسکیمای محلی آینه‌ی سرور (همان ساختار فرم سند در whdocs-view)
const docMirror = z.object({
  warehouseId: z.string().min(1, 'انبار الزامی است'),
  items: z.array(z.object({ productId: z.string(), qtyM2: z.string() })),
  itemsRoot: z.string(),
}).superRefine((v, ctx) => {
  v.items.forEach((it, idx) => {
    if (!it.productId) return
    const qty = parseNumericInput(it.qtyM2)
    if (qty === null || qty === 0) ctx.addIssue({ code: 'custom', path: ['items', idx, 'qtyM2'], message: 'مقدار هر قلم باید عددی غیرصفر باشد' })
  })
  const valid = v.items.filter((it) => it.productId && (parseNumericInput(it.qtyM2) ?? 0) !== 0)
  if (valid.length === 0) ctx.addIssue({ code: 'custom', path: ['itemsRoot'], message: 'حداقل یک قلم کالا الزامی است' })
})

const requestMirror = z.object({
  warehouseId: z.string().min(1, 'انبار الزامی است'),
  items: z.array(z.object({ productId: z.string(), qtyM2: z.string() })),
  itemsRoot: z.string(),
}).superRefine((v, ctx) => {
  v.items.forEach((it, idx) => {
    if (!it.productId) return
    const qty = parseNumericInput(it.qtyM2)
    if (qty === null || qty <= 0) ctx.addIssue({ code: 'custom', path: ['items', idx, 'qtyM2'], message: 'مقدار هر قلم باید عددی مثبت باشد' })
  })
  const valid = v.items.filter((it) => it.productId && (parseNumericInput(it.qtyM2) ?? 0) > 0)
  if (valid.length === 0) ctx.addIssue({ code: 'custom', path: ['itemsRoot'], message: 'حداقل یک قلم کالا الزامی است' })
})

const main = async () => {
  let cookie = await login('admin', 'admin123')
  // اعتبارسنجی فرم فقط در شرکت عملیاتی معنا دارد — سوئیچ به آراد سرام پیشرو
  const me = (await (await fetch(`${BASE}/api/auth/me`, { headers: { cookie } })).json()) as {
    activeCompanyId?: string; companies?: { id: string; code: string }[]
  }
  const arad = me.companies?.find((c) => c.code === 'ARAD')
  if (arad && me.activeCompanyId !== arad.id) {
    await fetch(`${BASE}/api/auth/switch-company`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ companyId: arad.id }),
    })
  }

  // --- پاریته سند انبار ---
  const whs = (await (await fetch(`${BASE}/api/warehouses`, { headers: { cookie } })).json()) as { warehouses?: { id: string; companyCode: string }[] }
  const whId = whs.warehouses?.find((w) => w.companyCode === 'ARAD')?.id ?? ''
  const prods = (await (await fetch(`${BASE}/api/products`, { headers: { cookie } })).json()) as { products?: { id: string; companyCode: string }[] }
  const prodId = prods.products?.find((p) => p.companyCode === 'ARAD')?.id ?? 'p'
  const emptyDoc = { type: 'RECEIPT', warehouseId: '', items: [] as { productId: string; qtyM2: string }[], post: false }
  const r1 = await fetch(`${BASE}/api/whdocs`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(emptyDoc) })
  const d1 = (await r1.json()) as { error?: string }
  const m1 = docMirror.safeParse({ warehouseId: '', items: [], itemsRoot: '' })
  ok('سند بدون انبار: پیام سرور = پیام zod', d1.error === 'انبار الزامی است' && (m1.error?.issues.some((i) => i.message === d1.error) ?? false))

  const docBadQty = { type: 'RECEIPT', warehouseId: whId, items: [{ productId: prodId, qtyM2: 'abc', tone: '', caliber: '', grade: '1' }], post: false }
  const r2 = await fetch(`${BASE}/api/whdocs`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(docBadQty) })
  const d2 = (await r2.json()) as { error?: string }
  const m2 = docMirror.safeParse({ warehouseId: whId, items: [{ productId: 'p', qtyM2: 'abc' }], itemsRoot: '' })
  ok('سند مقدار بد: «مقدار هر قلم باید عددی غیرصفر باشد» هر دو طرف', d2.error === 'مقدار هر قلم باید عددی غیرصفر باشد' && (m2.error?.issues.some((i) => i.message === d2.error) ?? false))

  // --- پاریته درخواست کالا ---
  const r3 = await fetch(`${BASE}/api/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ warehouseId: '', items: [] }) })
  const d3 = (await r3.json()) as { error?: string }
  const m3 = requestMirror.safeParse({ warehouseId: '', items: [], itemsRoot: '' })
  ok('درخواست بدون انبار: پیام سرور = پیام zod', d3.error === 'انبار الزامی است' && (m3.error?.issues.some((i) => i.message === d3.error) ?? false))

  const reqBadQty = { warehouseId: whId, items: [{ productId: 'p', qtyM2: '-5' }] }
  const r4 = await fetch(`${BASE}/api/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(reqBadQty) })
  const d4 = (await r4.json()) as { error?: string }
  const m4 = requestMirror.safeParse({ warehouseId: whId, items: [{ productId: 'p', qtyM2: '-5' }], itemsRoot: '' })
  ok('درخواست مقدار منفی: «مقدار هر قلم باید عددی مثبت باشد» هر دو طرف', d4.error === 'مقدار هر قلم باید عددی مثبت باشد' && (m4.error?.issues.some((i) => i.message === d4.error) ?? false))

  // --- پاریته نامه ---
  const r5 = await fetch(`${BASE}/api/letters`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ type: 'INTERNAL', subject: ' ', body: '' }) })
  const d5 = (await r5.json()) as { error?: string }
  const letterMirror = z.object({ subject: faRequired('موضوع نامه', 200), body: faRequired('متن نامه', 10000) })
  const m5 = letterMirror.safeParse({ subject: ' ', body: '' })
  ok('نامه بدون موضوع: پیام سرور = پیام zod', d5.error === 'موضوع نامه الزامی است' && (m5.error?.issues.some((i) => i.message === d5.error) ?? false))

  // ---------- بخش ۳: قرارداد فهرست‌ها (P1-T3 — پاکت استاندارد ListEnvelope) ----------
  console.log('\n■ ۳) قرارداد فهرست‌ها (پاکت استاندارد P1-T3: items/total/page/pageSize/pageCount)')
  type Env = { items?: unknown[]; total?: number; page?: number; pageSize?: number; pageCount?: number }
  const isEnv = (v: Env) => Array.isArray(v.items) && typeof v.total === 'number' && typeof v.page === 'number' && typeof v.pageSize === 'number' && typeof v.pageCount === 'number'
  const l = await (await fetch(`${BASE}/api/letters?box=all&q=`, { headers: { cookie } })).json() as Env
  ok('GET /api/letters?box&q — پاکت استاندارد', isEnv(l))
  const w = await (await fetch(`${BASE}/api/whdocs`, { headers: { cookie } })).json() as Env
  ok('GET /api/whdocs — پاکت استاندارد', isEnv(w))
  const rq = await (await fetch(`${BASE}/api/requests`, { headers: { cookie } })).json() as Env
  ok('GET /api/requests — پاکت استاندارد', isEnv(rq))
  const st = await (await fetch(`${BASE}/api/stock`, { headers: { cookie } })).json() as Env
  ok('GET /api/stock — پاکت استاندارد', isEnv(st))

  // ---------- بخش ۴: نرمال‌سازی جستجوی فارسی (P1-T1) ----------
  console.log('\n■ ۴) نرمال‌سازی جستجوی فارسی (normalizeFaText)')
  ok('ارقام فارسی ↔ لاتین', normalizeFaText('۱۲۳') === normalizeFaText('123'))
  ok('ک/ی عربی یکسان', normalizeFaText('كتاب ي') === normalizeFaText('کتاب ی'))
  ok('نیم‌فاصله = فاصله', normalizeFaText('می‌شود') === normalizeFaText('می شود'))
  ok('حروف اول جمله بی‌اثر', normalizeFaText('SalAm') === 'salam')

  console.log(`\n──────────────────────────────\nنتیجه: ${pass} پاس · ${fail} خطا`)
  if (fail > 0) process.exit(1)
}

void main()
