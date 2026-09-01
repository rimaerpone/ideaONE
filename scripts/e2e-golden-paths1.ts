#!/usr/bin/env tsx
/**
 * P1-T36 — رگرسیون خودکار مسیرهای طلایی G1..G8
 * اجرا: bunx tsx scripts/e2e-golden.ts
 * خروجی: گزارش سبز/قرمز + اسکرین‌شات در download/qa-e2e-golden/report.md
 *
 * اصول: هر مسیر مستقل است (شکست یکی بقیه را متوقف نمی‌کند)؛
 * داده تست هر مسیر در پایان همان مسیر پاک می‌شود (Prisma مستقیم).
 */
import { PrismaClient } from '@prisma/client'
import { mkdirSync, writeFileSync } from 'node:fs'
import {
  ab, ev, wait, shot, login, logout, navigate, bodyText, fillByLabel, toastText,
  fillByPlaceholder, searchSelect, radixSelectByLabel, faToEnNumber, switchCompanyUI,
  GW, OUT,
} from './e2e-golden-helpers'

const prisma = new PrismaClient()
mkdirSync(OUT, { recursive: true })

type PathResult = { id: string; title: string; pass: boolean; checks: string[]; notes: string[] }
const results: PathResult[] = []

function record(id: string, title: string, checks: string[], notes: string[] = []) {
  const pass = checks.every((c) => c.includes('✓'))
  results.push({ id, title, pass, checks, notes })
  console.log(`${pass ? '✅' : '⛔'} ${id} — ${title}`)
  for (const c of checks) console.log(`   ${c}`)
  for (const n of notes) console.log(`   ℹ ${n}`)
}

// داده تست برای پاک‌سازی
const testArtifact = { letterIds: [] as string[], whdocIds: [] as string[], requestIds: [] as string[] }

// ─────────────────────────── G1 — ورود/داشبورد/سوییچ شرکت/ایزولاسیون
async function g1() {
  const checks: string[] = []
  try {
    ab('close', 15000)
  } catch { /* مرورگر باز نبود */ }
  const okLogin = login('admin', 'admin123')
  checks.push(`${okLogin ? '✓' : '✗'} ورود admin`)

  // KPI داشبورد هلدینگ (نمای گروهی)
  const nav1 = navigate('dashboard', 'داشبورد')
  checks.push(`${nav1.ok ? '✓' : '✗'} داشبورد هلدینگ رندر شد (${nav1.heading})`)
  const kpiHold = ev(`(() => { const m = document.querySelector('main'); const t = m ? m.innerText : ''; const match = t.match(/([\\d,٬۰-۹]+)\\s*مترمربع/); return match ? match[1] : '' })()`) as string
  shot('g1-dashboard-holding')

  // سوییچ شرکت: هلدینگ → آراد سرام پیشرو (با راستی‌آزمایی هدر)
  const switched = switchCompanyUI('آراد سرام پیشرو')
  checks.push(`${switched ? '✓' : '✗'} نام شرکت در هدر پس از سوییچ`)
  wait(2500) // بازتنظیم پوسته به داشبورد + واکشی داده شرکت جدید

  // KPI داشبورد آراد — مقدار باید با هلدینگ تفاوت داشته باشد (ایزولاسیون داده)
  // (رگرسیون G1 باگ تجمیع موجودی بدون فیلتر شرکت را کشف و رفع کرد — ۱۴۰۵/۰۶/۲۹)
  const kpiArad = ev(`(() => { const m = document.querySelector('main'); const t = m ? m.innerText : ''; const match = t.match(/([\\d,٬۰-۹]+)\\s*مترمربع/); return match ? match[1] : '' })()`) as string
  shot('g1-dashboard-arad')
  const isolated = kpiHold !== '' && kpiArad !== '' && kpiHold !== kpiArad
  checks.push(`${isolated ? '✓' : '✗'} ایزولاسیون داده: KPI هلدینگ «${kpiHold}» ≠ آراد «${kpiArad}»`)

  record('G1', 'ورود admin → داشبورد → سوییچ شرکت → ایزولاسیون', checks,
    [`سناریو: SC-005`])
}

// ─────────────────────────── G2 — ثبت نامه وارده + ارجاع (دبیرخانه)
async function g2() {
  const checks: string[] = []
  logout()
  const okLogin = login('dabir.arad', '12345678')
  checks.push(`${okLogin ? '✓' : '✗'} ورود dabir.arad (دبیرخانه آراد)`)

  navigate('letters', 'اتوماسیون')
  ab('find role button click --name "ثبت نامه جدید"')
  wait(2000)

  // پر کردن فرم: نوع=وارده (پیش‌فرض) + فرستنده + موضوع + متن
  fillByLabel('فرستنده', 'شرکت بازرگانی نمونه (تست G2)')
  fillByLabel('موضوع', 'نامه آزمایشی مسیر طلایی G2')
  fillByLabel('متن نامه', 'متن نامه آزمایشی برای راستی‌آزمایی شماره‌گذاری خودکار و ارجاع.')
  wait(400)
  shot('g2-letter-form')

  ab('find role button click --name "ثبت نامه"')
  wait(4500)
  // شماره خودکار: تب جامه‌ویژه «نامه N — ...» (ارقام فارسی)
  const tabTitle = ev(`(() => { const t = Array.from(document.querySelectorAll('[role=tab]')).find(x => x.getAttribute('aria-selected') === 'true'); return t ? t.textContent.trim() : '' })()`) as string
  const numMatch = tabTitle.match(/نامه\s*([۰-۹0-9]+)/)
  const letterNum = numMatch ? faToEnNumber(numMatch[1]) : 0
  checks.push(`${letterNum > 0 ? '✓' : '✗'} شماره‌گذاری خودکار: تب «${tabTitle.slice(0, 30)}»`)
  shot('g2-letter-created')

  // ارجاع به مدیرعامل (ناصر رضایی) از پنل درون‌خطی
  ab('find role button click --name "ارجاع"')
  wait(1200)
  const referred = searchSelect('گیرنده ارجاع', 'رضایی', 'رضایی')
  wait(500)
  ab('find role button click --name "ثبت ارجاع"')
  wait(3000)
  shot('g2-letter-referred')

  // راستی‌آزمایی: toast + گردش نامه
  const t = toastText()
  const timelineOk = bodyText().includes('رضایی')
  checks.push(`${referred === 'ok' && (t.includes('ارجاع') || timelineOk) ? '✓' : '✗'} ارجاع ثبت شد (${referred}/${t.slice(0, 50) || 'گردش ثبت شد'})`)

  // پاک‌سازی: حذف نامه تستی
  if (letterNum > 0) {
    const letter = await prisma.letter.findFirst({ where: { number: letterNum, subject: 'نامه آزمایشی مسیر طلایی G2' } })
    if (letter) {
      testArtifact.letterIds.push(letter.id)
      await prisma.letterReferral.deleteMany({ where: { letterId: letter.id } })
      await prisma.auditLog.deleteMany({ where: { entity: 'letter', entityId: letter.id } })
      await prisma.letter.delete({ where: { id: letter.id } })
      checks.push('✓ پاک‌سازی نامه تستی')
    }
  }
  record('G2', 'ثبت نامه وارده → شماره خودکار → ارجاع به مدیر', checks, ['سناریو: SC-001'])
}

// ─────────────────────────── G3 — سند رسید ۲ قلم + قطعی‌سازی + موجودی
async function g3() {
  const checks: string[] = []
  logout()
  const okLogin = login('anbar.arad', '12345678')
  checks.push(`${okLogin ? '✓' : '✗'} ورود anbar.arad (انبار آراد)`)

  // موجودی قبل — از داشبورد یا نمای موجودی (جمع)
  navigate('stock', 'موجودی')
  const stockBefore = ev(`(() => { const t = document.body.innerText; const m = t.match(/جمع دامنه دید:\\s*([\\d,٬۰-۹]+)/); return m ? m[1] : '' })()`) as string

  // فرم سند جدید
  navigate('whdocs', 'اسناد')
  ab('find role button click --name "سند جدید"')
  wait(2200)

  // نوع = رسید + انبار محصول آراد سرام
  const t1 = radixSelectByLabel('نوع سند', 'رسید')
  wait(400)
  const t2 = radixSelectByLabel('انبار', 'انبار محصول آراد سرام')
  wait(600)
  checks.push(`${t1 === 'ok' ? '✓' : '✗'} نوع سند = رسید (${t1})`)
  checks.push(`${t2 === 'ok' ? '✓' : '✗'} انبار = انبار محصول آراد (${t2})`)
  shot('g3-whdoc-form-head')

  // قلم ۱: جستجوی کالا + متراژ با ارقام فارسی «۱٬۲۵۰٫۵»
  const p1 = searchSelect('انتخاب کالای قلم 1', 'پرسلان', 'پرسلان')
  const qty1 = fillByPlaceholder('-620', '۱٬۲۵۰٫۵', 0)
  checks.push(`${p1 === 'ok' ? '✓' : '✗'} انتخاب کالای قلم ۱ (${p1})`)
  checks.push(`${qty1 === 'ok' ? '✓' : '✗'} متراژ قلم ۱ با ارقام فارسی «۱٬۲۵۰٫۵» (${qty1})`)

  // افزودن قلم ۲
  ab('find role button click --name "افزودن قلم"')
  wait(900)
  const p2 = searchSelect('انتخاب کالای قلم 2', 'کاشی', 'کاشی')
  const qty2 = fillByPlaceholder('-620', '750', 1)
  checks.push(`${p2 === 'ok' ? '✓' : '✗'} انتخاب کالای قلم ۲ (${p2})`)
  // جمع زنده باید ۲ قلم معتبر را نشان دهد (بدون بک‌اسلش در JS — مصون از escaping)
  wait(800)
  const liveSum = String(ev(`(function(){ const t = document.body.innerText; const i = t.indexOf('جمع زنده'); return i >= 0 ? t.slice(i, i + 40) : '' })()`) ?? '')
  checks.push(`${liveSum.includes('قلم') ? '✓' : '✗'} جمع زنده: «${liveSum}»`)
  shot('g3-whdoc-form-2items')

  // ذخیره پیش‌نویس (مسیر امن)
  ab('find role button click --name "ذخیره پیش‌نویس"')
  wait(4500)
  const tabTitle = ev(`(() => { const t = Array.from(document.querySelectorAll('[role=tab]')).find(x => x.getAttribute('aria-selected') === 'true'); return t ? t.textContent.trim() : '' })()`) as string
  const draftOk = tabTitle.includes('رسید') || tabTitle.includes('سند')
  checks.push(`${draftOk ? '✓' : '✗'} پیش‌نویس سند ثبت شد (تب: ${tabTitle.slice(0, 25)})`)
  shot('g3-whdoc-draft')

  // قطعی‌سازی: دکمه اقدام → ConfirmDialog → «قطعی‌سازی»
  ab('find role button click --name "قطعی‌سازی و اعمال موجودی"')
  wait(1200)
  ab('find role button click --name "قطعی‌سازی"')
  wait(4500)
  const posted = bodyText().includes('قطعی') || bodyText().includes('POSTED')
  checks.push(`${posted ? '✓' : '✗'} سند قطعی شد (POSTED) — نوار وضعیت`)
  shot('g3-whdoc-posted')

  // موجودی بعد — جمع باید تغییر کرده باشد
  navigate('stock', 'موجودی')
  wait(2000)
  const stockAfter = ev(`(() => { const t = document.body.innerText; const m = t.match(/جمع دامنه دید:\\s*([\\d,٬۰-۹]+)/); return m ? m[1] : '' })()`) as string
  const grew = stockBefore !== '' && stockAfter !== '' && stockBefore !== stockAfter
  checks.push(`${grew ? '✓' : '✗'} جمع موجودی پس از رسید: «${stockBefore}» → «${stockAfter}»`)

  // پاک‌سازی: آخرین سند ساخت anbar در ۱۰ دقیقه اخیر + برگرداندن موجودی
  const anbarUser = await prisma.user.findUnique({ where: { username: 'anbar.arad' } })
  const recent = anbarUser ? await prisma.warehouseDoc.findFirst({
    where: { createdById: anbarUser.id, docDate: { gt: new Date(Date.now() - 10 * 60 * 1000) } },
    orderBy: { docDate: 'desc' },
  }) : null
  if (recent) {
    testArtifact.whdocIds.push(recent.id)
    const items = await prisma.docItem.findMany({ where: { docId: recent.id } })
    for (const it of items) {
      const si = await prisma.stockItem.findFirst({ where: { productId: it.productId, warehouseId: recent.warehouseId, tone: it.tone, caliber: it.caliber, grade: it.grade } })
      if (si && recent.type === 'RECEIPT') {
        await prisma.stockItem.update({ where: { id: si.id }, data: { qtyM2: si.qtyM2 - it.qtyM2 } })
      }
    }
    await prisma.docItem.deleteMany({ where: { docId: recent.id } })
    await prisma.warehouseDoc.delete({ where: { id: recent.id } })
    await prisma.auditLog.deleteMany({ where: { entity: 'whdoc', entityId: recent.id } })
    checks.push('✓ پاک‌سازی سند تستی + برگرداندن موجودی')
  }
  record('G3', 'سند رسید ۲ قلم (ارقام فارسی) → قطعی‌سازی → افزایش موجودی', checks, ['سناریو: SC-002'])
}

// ─────────────────────────── G4 — درخواست کالا → تصمیم مدیر → اعلان متقاضی
async function g4() {
  const checks: string[] = []
  logout()
  const okLogin = login('dabir.arad', '12345678')
  checks.push(`${okLogin ? '✓' : '✗'} ورود dabir.arad (متقاضی)`)

  navigate('requests', 'درخواست')
  ab('find role button click --name "درخواست جدید"')
  wait(2200)

  // فرم درخواست: انبار + واحد مصرف‌کننده (نشانگر تست) + قلم کالا + متراژ
  const wsel = radixSelectByLabel('انبار', 'انبار محصول آراد سرام')
  wait(500)
  fillByLabel('واحد مصرف‌کننده', 'واحد تست مسیر طلایی G4')
  const p1 = searchSelect('انتخاب کالای قلم 1', 'پرسلان', 'پرسلان')
  const q1 = fillByPlaceholder('۱۲۰ یا 120', '۱۵۰', 0)
  checks.push(`${wsel === 'ok' ? '✓' : '✗'} انبار درخواست انتخاب شد (${wsel})`)
  checks.push(`${p1 === 'ok' && q1 === 'ok' ? '✓' : '✗'} قلم درخواست با متراژ فارسی «۱۵۰» (${p1}/${q1})`)
  shot('g4-request-form')

  ab('find role button click --name "ثبت درخواست"')
  wait(4500)
  const createdTab = ev(`(() => { const t = Array.from(document.querySelectorAll('[role=tab]')).find(x => x.getAttribute('aria-selected') === 'true'); return t ? t.textContent.trim() : '' })()`) as string
  checks.push(`${createdTab.includes('درخواست') ? '✓' : '✗'} درخواست ثبت شد (تب: ${createdTab.slice(0, 25)})`)
  shot('g4-request-created')

  // مدیر تصمیم می‌گیرد: ورود ceo.arad در همان مرورگر
  logout()
  const okCeo = login('ceo.arad', '12345678')
  checks.push(`${okCeo ? '✓' : '✗'} ورود ceo.arad (تصمیم‌گیرنده)`)

  // درخواست در انتظار در نمای درخواست‌ها (مدیر همه را می‌بیند)
  navigate('requests', 'درخواست')
  wait(2000)
  const listHas = bodyText().includes('واحد تست مسیر طلایی G4')
  checks.push(`${listHas ? '✓' : '✗'} درخواست در فهرست مدیر دیده می‌شود`)

  // باز کردن رکورد و تأیید — کلیک روی عنصر فهرست حاوی نشانگر (بدون وابستگی به ساختار کارت)
  const opened = ev(`(function(){ const els = Array.from(document.querySelectorAll('main button, main [role=button], main a, main li, main article')); const el = els.find(e => (e.textContent || '').includes('واحد تست مسیر طلایی G4') && (e.textContent || '').length < 300); if (el) { el.click(); return 'clicked' } return 'not-found' })()`)
  wait(3500)
  checks.push(`${opened === 'clicked' ? '✓' : '✗'} رکورد درخواست باز شد (${String(opened).slice(0, 40)})`)
  ab('find role button click --name "تأیید"')
  wait(2500)
  shot('g4-request-approved')
  const approved = bodyText().includes('تأییدشده') || bodyText().includes('تأیید شده') || bodyText().includes('APPROVED')
  checks.push(`${approved ? '✓' : '✗'} وضعیت درخواست «تأییدشده»`)

  // پاک‌سازی
  const req = await prisma.goodsRequest.findFirst({ where: { neededFor: 'واحد تست مسیر طلایی G4' } })
  if (req) {
    testArtifact.requestIds.push(req.id)
    await prisma.goodsRequestItem.deleteMany({ where: { requestId: req.id } })
    await prisma.notification.deleteMany({ where: { body: { contains: 'G4' } } })
    await prisma.auditLog.deleteMany({ where: { entity: 'request', entityId: req.id } })
    await prisma.goodsRequest.delete({ where: { id: req.id } })
    checks.push('✓ پاک‌سازی درخواست تستی')
  }
  record('G4', 'درخواست کالا → تصمیم مدیر → وضعیت نهایی', checks, ['سناریو: SC-003'])
}

export { g1, g2, g3, g4, results, record, prisma, testArtifact }
