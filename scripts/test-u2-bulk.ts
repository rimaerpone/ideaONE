/**
 * P2.5-U2 — E2E مرورگری: انتخاب گروهی و اقدام گروهی (شکاف G3 بنچمارک ERP)
 *
 * بخش ۱ (نامه‌ها — دبیرخانه آراد):
 *   ۳ نامه seed شده → تیک ردیف‌ها → نوار شناور «۳ مورد انتخاب شد» → بایگانی گروهی
 *   → دیالوگ تأیید → توست جمع‌بندی → وضعیت هر ۳ نامه «بایگانی» + سجل حسابرسی هر ۳
 * بخش ۲ (درخواست‌ها — مدیرعامل آراد):
 *   «انتخاب همه در انتظار» رفت‌وبرگشت + انتخاب ۲ کارت → تأیید گروهی → وضعیت + اعلان متقاضی
 * بخش ۳ (VIEWER): cfo.hold روی آراد → گرید نامه‌ها بدون ستون چک‌باکس
 */
import { ab, ev, wait, login, logout, navigate, toastText } from './e2e-golden-helpers'
import { PrismaClient } from '@prisma/client'
import { mkdirSync } from 'node:fs'

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'
const prisma = new PrismaClient()
const OUT = '/home/z/my-project/download/qa-p2.5-u2'
mkdirSync(OUT, { recursive: true })

/** اسکرین‌شات در پوشه اختصاصی همین تست */
function shot(name: string): string {
  const r = ab(`screenshot ${OUT}/${name}.png`)
  return r.includes('✓') ? 'ok' : `fail(${r.slice(0, 60)})`
}

let pass = 0
let fail = 0
const metrics: string[] = []
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { pass++; metrics.push(`  ✓ ${name}`) } else { fail++; metrics.push(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ── کمکی‌های API (seed و راستی‌آزمایی سرورمحور) ──
async function apiLogin(username: string, password: string): Promise<Record<string, string>> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'u2-e2e/1.0' },
    body: JSON.stringify({ username, password }),
  })
  const body = (await res.json()) as { token?: string }
  if (!body.token) throw new Error(`ورود ${username} ناموفق`)
  return { cookie: `pos_sid=${body.token}`, 'x-session-token': body.token }
}

async function apiGet<T>(path: string, H: Record<string, string>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: H })
  return (await res.json()) as T
}

const marker = `U2E2E-${Math.floor(Date.now() / 1000) % 100000}`

async function main() {
  // ════════ Seed: ۳ نامه (دبیرخانه) + ۲ درخواست در انتظار (دبیرخانه = متقاضی) ════════
  const dabir = await apiLogin('dabir.arad', '12345678')
  const letterIds: string[] = []
  for (let i = 1; i <= 3; i++) {
    const res = await fetch(`${BASE}/api/letters`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...dabir },
      body: JSON.stringify({
        type: 'INTERNAL', subject: `${marker} نامه ${i}`,
        body: `متن آزمون اقدام گروهی ${i}`, confidentiality: 'NORMAL', urgency: 'NORMAL',
      }),
    })
    const b = (await res.json()) as { id?: string }
    if (b.id) letterIds.push(b.id)
  }
  check('Seed: ۳ نامه دبیرخانه ثبت شد', letterIds.length === 3, `${letterIds.length}/3`)

  const { warehouses } = await apiGet<{ warehouses: { id: string; name: string }[] }>('/api/warehouses', dabir)
  const { products } = await apiGet<{ products: { id: string; name: string }[] }>('/api/products', dabir)
  const wh = warehouses[0]
  const product = products[0]
  const requestIds: string[] = []
  for (let i = 1; i <= 2; i++) {
    const res = await fetch(`${BASE}/api/requests`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...dabir },
      body: JSON.stringify({
        warehouseId: wh.id, neededFor: `${marker} مصرف ${i}`,
        note: `درخواست آزمون گروهی ${i}`,
        items: [{ productId: product.id, qtyM2: '۱۲۰' }],
      }),
    })
    const b = (await res.json()) as { id?: string }
    if (b.id) requestIds.push(b.id)
  }
  check('Seed: ۲ درخواست در انتظار ثبت شد', requestIds.length === 2, `${requestIds.length}/2`)

  // ════════ بخش ۱: نامه‌ها — انتخاب ۳ ردیف و بایگانی گروهی (دبیرخانه) ════════
  ab('set viewport 1440 900')
  wait(400)
  check('ورود dabir.arad', login('dabir.arad', '12345678'))
  wait(1200)
  navigate('letters', 'اتوماسیون')
  wait(3500)

  // ستون چک‌باکس در سرستون و ردیف‌ها
  const hasHeaderCb = ev(`!!document.querySelector('main input[aria-label="انتخاب همه سطرهای این صفحه"]')`) === true
  check('سرستون چک‌باکس «انتخاب همه این صفحه» هست', hasHeaderCb)
  const rowCbCount = Number(ev(`document.querySelectorAll('main tbody input[type=checkbox]').length`) ?? 0)
  check('ردیف‌ها چک‌باکس دارند', rowCbCount > 0, `count=${rowCbCount}`)

  // رفت‌وبرگشت «انتخاب همه»: انتخاب → شمار → لغو
  ev(`(function(){ const cb = document.querySelector('main input[aria-label="انتخاب همه سطرهای این صفحه"]'); if (cb) { cb.click(); return true } return false })()`)
  wait(600)
  const barAfterAll = String(ev(`(function(){ const r = document.querySelector('[aria-label="نوار اقدام گروهی"]'); return r ? r.innerText : '' })()`) ?? '')
  check('انتخاب همه → نوار شناور ظاهر شد', barAfterAll.includes('مورد انتخاب شد'), barAfterAll.slice(0, 40))
  ev(`(function(){ const cb = document.querySelector('main input[aria-label="انتخاب همه سطرهای این صفحه"]'); if (cb) { cb.click(); return true } return false })()`)
  wait(500)
  const barGone = ev(`!document.querySelector('[aria-label="نوار اقدام گروهی"]')`) === true
  check('لغو انتخاب همه → نوار مخفی شد', barGone)

  // انتخاب دقیقاً ۳ ردیف نشانگر (نه ردیف‌های دیگر)
  const clicked = Number(ev(`(function(){
    const rows = Array.from(document.querySelectorAll('main tbody tr'))
    let n = 0
    for (const tr of rows) {
      if ((tr.textContent || '').includes('${marker}')) {
        const cb = tr.querySelector('input[type=checkbox]')
        if (cb && !cb.disabled) { cb.click(); n++ }
      }
    }
    return n
  })()`) ?? 0)
  check('تیک ۳ ردیف نامه نشانگر', clicked === 3, `clicked=${clicked}`)
  wait(500)
  shot('u2-letters-bulkbar')
  const bar3 = String(ev(`(function(){ const r = document.querySelector('[aria-label="نوار اقدام گروهی"]'); return r ? r.innerText : '' })()`) ?? '')
  check('نوار: «۳ مورد انتخاب شد»', bar3.includes('۳ مورد انتخاب شد'), bar3.slice(0, 60))
  check('دکمه «بایگانی گروهی» در نوار', bar3.includes('بایگانی گروهی'))

  // دیالوگ تأیید
  ev(`(function(){ const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent || '').trim() === 'بایگانی گروهی'); if (b) { b.click(); return true } return false })()`)
  wait(900)
  const dlg = String(ev(`(function(){ const d = document.querySelector('[role=dialog]'); return d ? d.innerText : '' })()`) ?? '')
  check('دیالوگ تأیید باز شد با پیامد', dlg.includes('بایگانی گروهی نامه‌ها') && dlg.includes('رکورد حسابرسی'), dlg.slice(0, 80))
  shot('u2-letters-confirm')

  // تأیید → توست جمع‌بندی
  ev(`(function(){ const b = Array.from(document.querySelectorAll('[role=dialog] button')).find(x => (x.textContent || '').trim() === 'بایگانی کن'); if (b) { b.click(); return true } return false })()`)
  let toasts = ''
  for (let i = 0; i < 20; i++) { wait(700); toasts = toastText(); if (toasts.includes('بایگانی گروهی')) break }
  check('توست «بایگانی گروهی انجام شد — ۳ نامه»', toasts.includes('بایگانی گروهی انجام شد') && toasts.includes('۳ نامه'), toasts.slice(0, 90))

  // راستی‌آزمایی پایگاه: وضعیت + حسابرسی برای هر ۳ نامه
  wait(1500)
  const lettersAfter = await prisma.letter.findMany({ where: { id: { in: letterIds } }, select: { id: true, status: true, currentHolderId: true } })
  const archivedCount = lettersAfter.filter((l) => l.status === 'ARCHIVED' && l.currentHolderId === null).length
  check('پایگاه: هر ۳ نامه ARCHIVED و بدون دارنده', archivedCount === 3, `${archivedCount}/3`)
  const audits = await prisma.auditLog.findMany({ where: { entity: 'letter', entityId: { in: letterIds }, action: 'ARCHIVE' } })
  check('پایگاه: سجل حسابرسی ARCHIVE برای هر ۳ نامه', audits.length === 3, `${audits.length}/3`)

  // UI: وضعیت ردیف‌ها «بایگانی» + انتخاب پاک شد
  let uiArchived = false
  for (let i = 0; i < 8; i++) {
    wait(1200)
    const rows = String(ev(`(function(){ const rows = Array.from(document.querySelectorAll('main tbody tr')).filter(tr => (tr.textContent || '').includes('${marker}')); return rows.length + ':' + (rows.every(tr => (tr.textContent || '').includes('بایگانی')) ? '1' : '0') })()`) ?? '')
    if (rows === '3:1') { uiArchived = true; break }
  }
  check('UI: هر ۳ ردیف نشانگر وضعیت «بایگانی»', uiArchived)
  shot('u2-letters-after')
  const barAfterAction = ev(`!document.querySelector('[aria-label="نوار اقدام گروهی"]')`) === true
  check('انتخاب‌ها پس از اقدام پاک شد', barAfterAction)
  const headerUnchecked = ev(`(function(){ const cb = document.querySelector('main input[aria-label="انتخاب همه سطرهای این صفحه"]'); return cb ? !cb.checked : 'nf' })()`) === true
  check('سرستون چک‌باکس پس از اقدام خاموش', headerUnchecked)

  // ════════ بخش ۲: درخواست‌ها — تأیید گروهی (مدیرعامل آراد) ════════
  logout()
  wait(1500)
  check('ورود ceo.arad (مدیر آراد)', login('ceo.arad', '12345678'))
  wait(1200)
  navigate('requests', 'درخواست')
  wait(3000)

  const selectAllLabel = String(ev(`(function(){ const l = Array.from(document.querySelectorAll('main label')).find(x => (x.textContent || '').includes('انتخاب همه در انتظار')); return l ? l.textContent.trim() : '' })()`) ?? '')
  check('برچسب «انتخاب همه در انتظار» هست', selectAllLabel.includes('انتخاب همه در انتظار'), selectAllLabel.slice(0, 50))

  // رفت‌وبرگشت انتخاب همه
  ev(`(function(){ const cb = document.querySelector('main input[aria-label="انتخاب همه درخواست‌های در انتظار این صفحه"]'); if (cb) { cb.click(); return true } return false })()`)
  wait(600)
  const reqBar = String(ev(`(function(){ const r = document.querySelector('[aria-label="نوار اقدام گروهی"]'); return r ? r.innerText : '' })()`) ?? '')
  check('انتخاب همه درخواست‌ها → نوار ظاهر', reqBar.includes('مورد انتخاب شد'), reqBar.slice(0, 40))
  ev(`(function(){ const cb = document.querySelector('main input[aria-label="انتخاب همه درخواست‌های در انتظار این صفحه"]'); if (cb) { cb.click(); return true } return false })()`)
  wait(500)
  check('لغو انتخاب همه → نوار مخفی', ev(`!document.querySelector('[aria-label="نوار اقدام گروهی"]')`) === true)

  // انتخاب ۲ کارت نشانگر
  const clickedReq = Number(ev(`(function(){
    const cards = Array.from(document.querySelectorAll('main .grid > div'))
    let n = 0
    for (const c of cards) {
      if ((c.textContent || '').includes('${marker}')) {
        const cb = c.querySelector('input[type=checkbox]')
        if (cb && !cb.disabled) { cb.click(); n++ }
      }
    }
    return n
  })()`) ?? 0)
  check('تیک ۲ کارت درخواست نشانگر', clickedReq === 2, `clicked=${clickedReq}`)
  wait(500)
  shot('u2-requests-bulkbar')
  const reqBar2 = String(ev(`(function(){ const r = document.querySelector('[aria-label="نوار اقدام گروهی"]'); return r ? r.innerText : '' })()`) ?? '')
  check('نوار درخواست‌ها: «۲ مورد انتخاب شد»', reqBar2.includes('۲ مورد انتخاب شد'), reqBar2.slice(0, 60))

  // تأیید گروهی → دیالوگ → توست
  ev(`(function(){ const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent || '').trim() === 'تأیید گروهی'); if (b) { b.click(); return true } return false })()`)
  wait(900)
  const reqDlg = String(ev(`(function(){ const d = document.querySelector('[role=dialog]'); return d ? d.innerText : '' })()`) ?? '')
  check('دیالوگ «تأیید گروهی درخواست‌ها» با اعلان متقاضی', reqDlg.includes('تأیید گروهی درخواست‌ها') && reqDlg.includes('اعلان'), reqDlg.slice(0, 90))
  shot('u2-requests-confirm')
  ev(`(function(){ const b = Array.from(document.querySelectorAll('[role=dialog] button')).find(x => (x.textContent || '').trim() === 'تأیید درخواست‌ها'); if (b) { b.click(); return true } return false })()`)
  let reqToasts = ''
  for (let i = 0; i < 20; i++) { wait(700); reqToasts = toastText(); if (reqToasts.includes('تأیید گروهی')) break }
  check('توست «تأیید گروهی انجام شد — ۲ درخواست»', reqToasts.includes('تأیید گروهی انجام شد') && reqToasts.includes('۲ درخواست'), reqToasts.slice(0, 90))

  // راستی‌آزمایی پایگاه: وضعیت + حسابرسی + اعلان متقاضی
  wait(1500)
  const reqsAfter = await prisma.goodsRequest.findMany({ where: { id: { in: requestIds } }, select: { id: true, status: true, decidedAt: true } })
  const approvedCount = reqsAfter.filter((r) => r.status === 'APPROVED' && r.decidedAt !== null).length
  check('پایگاه: هر ۲ درخواست APPROVED با تاریخ تصمیم', approvedCount === 2, `${approvedCount}/2`)
  const reqAudits = await prisma.auditLog.findMany({ where: { entity: 'goodsRequest', entityId: { in: requestIds }, action: 'REQUEST_APPROVE' } })
  check('پایگاه: سجل حسابرسی REQUEST_APPROVE برای هر ۲', reqAudits.length === 2, `${reqAudits.length}/2`)
  const dabirUser = await prisma.user.findUnique({ where: { username: 'dabir.arad' } })
  const notifs = await prisma.notification.findMany({
    where: { userId: dabirUser?.id ?? '', title: { contains: 'تأیید' }, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
  })
  check('پایگاه: اعلان تأیید به متقاضی (دبیرخانه) رفت', notifs.length >= 2, `${notifs.length} اعلان`)
  shot('u2-requests-after')

  // ════════ بخش ۳: VIEWER ستون چک‌باکس نمی‌بیند ════════
  logout()
  wait(1500)
  check('ورود cfo.hold (VIEWER آراد)', login('cfo.hold', '12345678'))
  wait(1500)
  // سوییچ شرکت فعال به آراد (cfo در هلدینگ مدیر است — VIEWER فقط روی آراد)
  // نکته: DropdownMenu رادیکس با pointerdown باز می‌شود (click تنها کافی نیست)
  const openedMenu = ev(`(function(){
    const b = Array.from(document.querySelectorAll('header button')).find(x => (x.textContent || '').includes('هلدینگ'))
    if (!b) return 'btn-not-found'
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0 }))
    b.click()
    return true
  })()`)
  wait(1100)
  const switched = ev(`(function(){ const items = Array.from(document.querySelectorAll('[role=menuitem]')); const it = items.find(i => (i.textContent || '').includes('آراد سرام')); if (it) { it.click(); return true } return 'item-not-found(' + items.length + ')' })()`)
  wait(3000)
  check('سوییچ شرکت فعال cfo به آراد', switched === true, `open=${String(openedMenu).slice(0, 30)} · switch=${String(switched).slice(0, 40)}`)
  navigate('letters', 'اتوماسیون')
  wait(3500)
  const viewerHeaderCb = ev(`!!document.querySelector('main input[aria-label="انتخاب همه سطرهای این صفحه"]')`) === false
  const viewerRowCb = Number(ev(`document.querySelectorAll('main tbody input[type=checkbox]').length`) ?? -1) === 0
  check('VIEWER: سرستون بدون چک‌باکس', viewerHeaderCb)
  check('VIEWER: ردیف‌ها بدون چک‌باکس', viewerRowCb)
  const viewerNoNew = String(ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent || '').includes('ثبت نامه جدید')); return b ? 'has' : 'none' })()`) ?? '')
  check('VIEWER: دکمه «ثبت نامه جدید» هم نیست (هم‌راستا با P1-T18)', viewerNoNew === 'none')
  shot('u2-viewer-nocheckbox')

  console.log('━'.repeat(60))
  console.log(`P2.5-U2 — انتخاب گروهی و اقدام گروهی · نشانگر: ${marker}`)
  metrics.forEach((m) => console.log(m))
  console.log('━'.repeat(60))
  console.log(`نتیجه: ${pass} پاس / ${fail} خطا`)

  try { ab('close', 15000) } catch { /* noop */ }
  await prisma.$disconnect()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(async (e) => {
  console.error('خطای مهلک:', e)
  metrics.forEach((m) => console.log(m))
  console.log(`نتیجه: ${pass} پاس / ${fail} خطا`)
  try { ab('close', 15000) } catch { /* noop */ }
  await prisma.$disconnect()
  process.exit(1)
})
