/**
 * P2-T13/T14 — E2E مرورگری:
 *  A) گزارش هفتگی کارتابل در تنظیمات←یکپارچه‌سازی (جدول + preset + آستانه + MD + پورتال چاپ + موبایل)
 *  B) کارت پیشنهاد AI ویرایش‌پذیر: دریافت (LLM زنده) → ویرایش طبقه/خلاصه → بازگردانی → اعمال نسخه ویرایش‌شده
 * اجرا: bunx tsx scripts/e2e-p2-t13-t14.ts  (سرور dev روشن؛ گیت‌وی ۸۱)
 */
import { ab, ev, wait, login, fillByLabel, toastText } from './e2e-golden-helpers'

const OUT = '/home/z/my-project/download/qa-p2-t13-t14'

function shot(name: string): string {
  const r = ab(`screenshot ${OUT}/${name}.png`)
  return r.includes('✓') ? 'ok' : `fail(${r.slice(0, 60)})`
}
let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { pass++ } else { fail++ }
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` — ${detail}` : ''}`)
}

/** پرکردن textarea با native setter (درس U10: React تغییر el.value مستقیم را نمی‌بیند) */
function setSummary(value: string): boolean {
  return String(ev(`(function(){
    const ta = document.querySelector('textarea[aria-label="خلاصه پیشنهاد"]')
    if (!ta) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(ta, ${JSON.stringify(value)})
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)) === 'true'
}

const AI_CATS = ['اداری و هماهنگی', 'مالی و بازرگانی', 'فنی و تولیدی', 'انبار و لجستیک', 'منابع انسانی', 'حقوقی و قراردادها', 'کیفیت و ایمنی']

/**
 * ورود قطعی به‌عنوان کاربر مشخص — مرورگر بین اجراها/بخش‌ها نشست قبلی دارد؛
 * login() کمکی روی نشست زنده short-circuit می‌کند → اول خروج سروری + رفرش، بعد ورود.
 */
function forceLogin(username: string, password: string): boolean {
  ev(`(async function(){ try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }) } catch (e) {} return true })()`)
  wait(1000)
  ab(`open http://localhost:81/ --wait networkidle`, 90000)
  wait(1500)
  return login(username, password)
}

// ═══════════ بخش A — P2-T13: گزارش هفتگی کارتابل (ادمین) ═══════════

ab(`set viewport 1280 900`)
wait(400)
check('A0: ورود admin', forceLogin('admin', 'admin123'))
wait(1500)

// بوت پوسته با نمای تنظیمات (deep-link جایگزین ناوبری)
ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:settings', kind: 'list', viewKey: 'settings', title: 'تنظیمات', icon: 'Settings' }], activeTabId: 'list:settings' })); return true })()`)
ab(`open http://localhost:81/ --wait networkidle`, 90000)
wait(4000)

// ورود به تب «یکپارچه‌سازی و گزارش‌ها»
const tabA = ab(`find role tab click --name "یکپارچه‌سازی و گزارش‌ها"`, 30000)
check('A1: تب یکپارچه‌سازی باز شد', tabA.includes('✓'), tabA.slice(0, 60))
wait(2500)

// کارت گزارش — بارگذاری خودکار در ورود به تب
let tableRows = 0
for (let i = 0; i < 15; i++) {
  wait(1000)
  tableRows = Number(ev(`(function(){ const t = document.querySelector('[data-testid=weekly-report-table]'); return t ? t.querySelectorAll('tbody tr').length : 0 })()`) ?? 0)
  if (tableRows > 0) break
}
check('A2: جدول گزارش رندر شد (بارگذاری خودکار)', tableRows > 3, `rows=${tableRows}`)
const sectionTxt = String(ev(`(function(){ const s = document.querySelector('[data-testid=weekly-report-section]'); return s ? s.innerText.slice(0, 600) : 'not-found' })()`) ?? '')
check('A3: عنوان بخش', sectionTxt.includes('گزارش هفتگی کارتابل نامه‌ها'), sectionTxt.slice(0, 80))
check('A3: سطر خلاصه بازه/جمع', sectionTxt.includes('بازه') && sectionTxt.includes('ورود') && sectionTxt.includes('معطل'))
check('A3: ستون‌های جدول', sectionTxt.includes('کاربر') && sectionTxt.includes('اقدام') && sectionTxt.includes('تفکیک اقدام'))
shot('t13-report-card')

// تغییر preset به «هفته گذشته» — جدول باید بازبارگذاری شود با بازه دیگر
const rangeBefore = String(ev(`(function(){ const s = document.querySelector('[data-testid=weekly-report-section] p'); return s ? s.textContent : '' })()`) ?? '')
ev(`(function(){ const btn = document.querySelector('button[aria-label="بازه گزارش"]'); if (btn) { btn.click(); return true } return false })()`)
wait(800)
ev(`(function(){ const opt = Array.from(document.querySelectorAll('[role=option]')).find(o => (o.textContent||'').includes('هفته گذشته')); if (opt) { opt.click(); return true } return false })()`)
wait(2500)
const rangeAfter = String(ev(`(function(){ const s = document.querySelector('[data-testid=weekly-report-section] p'); return s ? s.textContent : '' })()`) ?? '')
check('A4: preset هفته گذشته → بازه عوض شد', rangeBefore !== rangeAfter, `${rangeBefore.slice(0, 40)} | ${rangeAfter.slice(0, 40)}`)
shot('t13-preset-lastweek')

// تغییر آستانه معطلی به ۰ — معطل‌ها باید رشد کنند (بازه فعلی ثابت)
const stuckBefore = Number(ev(`(function(){ const cells = Array.from(document.querySelectorAll('[data-testid=weekly-report-table] tbody td:nth-child(5)')); return cells.reduce((a, c) => a + Number((c.textContent||'۰').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))), 0) })()`) ?? -1)
ev(`(function(){ const btn = document.querySelector('button[aria-label="آستانه معطلی"]'); if (btn) { btn.click(); return true } return false })()`)
wait(800)
ev(`(function(){ const opt = Array.from(document.querySelectorAll('[role=option]')).find(o => (o.textContent||'').includes('بدون تحرک')); if (opt) { opt.click(); return true } return false })()`)
wait(2500)
const stuckAfter = Number(ev(`(function(){ const cells = Array.from(document.querySelectorAll('[data-testid=weekly-report-table] tbody td:nth-child(5)')); return cells.reduce((a, c) => a + Number((c.textContent||'۰').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))), 0) })()`) ?? -1)
check('A5: آستانه ۰ → معطل‌ها ≥ آستانه ۳', stuckAfter >= stuckBefore && stuckAfter > 0, `${stuckBefore} → ${stuckAfter}`)

// متن Markdown (معیار پذیرش: خروجی MD)
ev(`(function(){ const s = document.querySelector('[data-testid=weekly-report-section] summary'); if (s) { s.click(); return true } return false })()`)
wait(600)
const mdTxt = String(ev(`(function(){ const p = document.querySelector('[data-testid=weekly-report-md]'); return p ? p.textContent : 'not-found' })()`) ?? '')
check('A6: متن MD — عنوان و جدول', mdTxt.includes('# گزارش هفتگی کارتابل نامه‌ها') && mdTxt.includes('| کاربر | ورود | اقدام | معطل | تفکیک اقدام |'), mdTxt.slice(0, 60))
check('A6: متن MD — جمع بازه', mdTxt.includes('جمع بازه:'))
shot('t13-markdown-details')

// پورتال چاپ — stub چاپ؛ فرزند body با جدول چاپی؛ afterprint پاک می‌کند
ev(`(function(){ window.__printCalls = 0; window.print = function(){ window.__printCalls += 1 }; return true })()`)
ev(`(function(){ const b = Array.from(document.querySelectorAll('[data-testid=weekly-report-section] button')).find(x => (x.textContent||'').includes('چاپ گزارش')); if (b) { b.click(); return true } return false })()`)
wait(1200)
const portalInfoRaw = ev(`(function(){ const p = document.querySelector('body > .report-print-root'); if (!p) return 'not-found'; return JSON.stringify({ h1: (p.querySelector('h1')||{}).textContent || '', rows: p.querySelectorAll('tbody tr').length }) })()`) ?? ''
// ev رشته JSON را خودش parse می‌کند (درس U9: ev دوباره JSON.parse می‌زند) — هر دو حالت پشتیبانی
const portalInfo = typeof portalInfoRaw === 'string' ? portalInfoRaw : JSON.stringify(portalInfoRaw)
const printCalls = Number(ev(`window.__printCalls`) ?? 0)
check('A7: window.print فراخوانی شد', printCalls >= 1, `calls=${printCalls}`)
check('A7: پورتال چاپ با جدول', portalInfo.includes('گزارش هفتگی کارتابل نامه‌ها') && /"rows":\d+/.test(portalInfo) && !portalInfo.includes('"rows":0'), portalInfo.slice(0, 80))
ev(`window.dispatchEvent(new Event('afterprint'))`)
wait(500)
const portalGone = String(ev(`!document.querySelector('body > .report-print-root')`) ?? '')
check('A7: afterprint پورتال را برداشت', portalGone === 'true')

// موبایل ۳۹۰px — بدون سرریز افقی
ab(`set viewport 390 844`)
wait(1500)
const overflowRaw = ev(`(function(){ const d = document.documentElement; return JSON.stringify({ sw: d.scrollWidth, iw: window.innerWidth }) })()`) ?? ''
const ov = (() => {
  const o = typeof overflowRaw === 'object' ? (overflowRaw as { sw: number; iw: number }) : (() => { try { return JSON.parse(String(overflowRaw)) as { sw: number; iw: number } } catch { return { sw: 999, iw: 0 } } })()
  return o.sw - o.iw
})()
check('A8: موبایل ۳۹۰px بدون سرریز افقی', ov <= 1, `delta=${ov}px`)
shot('t13-mobile-390')
ab(`set viewport 1280 900`)
wait(800)

// ═══════════ بخش B — P2-T14: کارت پیشنهاد AI ویرایش‌پذیر (دبیر) ═══════════

check('B0: ورود dabir.arad', forceLogin('dabir.arad', '12345678'))
wait(2000)
ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:letters', kind: 'list', viewKey: 'letters', title: 'نامه‌ها', icon: 'Mail' }], activeTabId: 'list:letters' })); return true })()`)
ab(`open http://localhost:81/ --wait networkidle`, 90000)
wait(4000)

// ثبت نامه پیش‌نویس تازه (دارنده = دبیر خودش)
ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent||'').includes('ثبت نامه جدید')); if (b) { b.click(); return true } return false })()`)
wait(2500)
const subjB = `نامه E2E ویرایش AI ${Math.floor(Date.now() / 1000) % 100000}`
check('B1: فرم نامه — موضوع', fillByLabel('موضوع', subjB) === 'ok')
check('B1: فرم نامه — متن', fillByLabel('متن نامه', 'آزمون E2E ویرایش پیشنهاد هوش مصنوعی پیش از اعمال — نسخه HITL نسخه ۲.') === 'ok')
ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent||'').trim() === 'ثبت نامه'); if (b) { b.click(); return true } return false })()`)
let recordOpen = false
for (let i = 0; i < 14; i++) {
  wait(1000)
  recordOpen = String(ev(`(function(){ return Array.from(document.querySelectorAll('main button')).some(b => (b.textContent||'').includes('دریافت پیشنهاد')) })()`) ?? '') === 'true'
  if (recordOpen) break
}
check('B1: نامه ثبت و رکورد باز شد', recordOpen)
wait(1500)

// دریافت پیشنهاد — فراخوانی زنده LLM (تا ۹۰ ثانیه صبر)
ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent||'').includes('دریافت پیشنهاد')); if (b) { b.click(); return true } return false })()`)
let cardReady = false
let aiErr = ''
for (let i = 0; i < 90; i++) {
  wait(1000)
  cardReady = String(ev(`!!document.querySelector('textarea[aria-label="خلاصه پیشنهاد"]')`) ?? '') === 'true'
  if (cardReady) break
  aiErr = String(ev(`(function(){ const p = document.querySelector('main .text-destructive'); return p ? p.textContent : '' })()`) ?? '')
  if (aiErr.includes('در دسترس نیست')) break
}
if (cardReady) {
  const catText = String(ev(`(function(){ const t = document.querySelector('button[aria-label="طبقه‌بندی پیشنهاد"]'); return t ? t.textContent.trim() : 'not-found' })()`) ?? '')
  check('B2: کارت پیشنهاد ویرایش‌پذیر رندر شد', true)
  check('B2: طبقه پیشنهادی در فهرست مجاز', AI_CATS.some((c) => catText.includes(c)), catText.slice(0, 40))
  const priorityRow = String(ev(`(function(){ const s = document.querySelector('main'); return (s.innerText||'').includes('اولویت پیشنهادی') })()`) ?? '')
  check('B2: اولویت پیشنهادی نمایش داده می‌شود', priorityRow === 'true')
  shot('t14-ai-card')

  // ویرایش طبقه از Select (گزینه متفاوت از فعلی)
  ev(`(function(){ const btn = document.querySelector('button[aria-label="طبقه‌بندی پیشنهاد"]'); if (btn) { btn.click(); return true } return false })()`)
  wait(800)
  const pickedCat = String(ev(`(function(){ const opts = Array.from(document.querySelectorAll('[role=option]')); const cur = ${JSON.stringify(catText)}; const other = opts.find(o => !cur.includes((o.textContent||'').trim())); if (other) { other.click(); return other.textContent.trim() } return 'no-option' })()`) ?? '')
  wait(600)
  const hintAfterCat = String(ev(`(function(){ const s = document.querySelector('main'); return (s.innerText||'').includes('پیشنهاد ویرایش شده') })()`) ?? '')
  check('B3: تغییر طبقه → هشدار کهربایی ویرایش', hintAfterCat === 'true' && pickedCat !== 'no-option', `picked=${pickedCat}`)

  // ویرایش خلاصه
  const editedSummary = 'خلاصه ویرایش‌شده توسط دبیر — نسخه آزمون E2E با ارقام ۲۰۰ تن.'
  check('B4: تایپ خلاصه ویرایشی', setSummary(editedSummary))
  wait(600)
  const applyBtnText = String(ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent||'').includes('تأیید و اعمال')); return b ? b.textContent.trim() : 'not-found' })()`) ?? '')
  check('B4: دکمه «اعمال نسخه ویرایش‌شده»', applyBtnText.includes('نسخه ویرایش‌شده'), applyBtnText.slice(0, 40))
  shot('t14-ai-edited')

  // بازگردانی پیشنهاد اصلی → هشدار ویرایش می‌رود
  ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent||'').includes('بازگردانی پیشنهاد اصلی')); if (b) { b.click(); return true } return false })()`)
  wait(700)
  const hintAfterReset = String(ev(`(function(){ const s = document.querySelector('main'); return (s.innerText||'').includes('پیشنهاد ویرایش شده') })()`) ?? '')
  check('B5: بازگردانی → هشدار ویرایش حذف شد', hintAfterReset === 'false')
  const summaryAfterReset = String(ev(`(function(){ const ta = document.querySelector('textarea[aria-label="خلاصه پیشنهاد"]'); return ta ? ta.value.slice(0, 30) : '' })()`) ?? '')
  check('B5: خلاصه به پیشنهاد اصلی برگشت', !!summaryAfterReset && summaryAfterReset !== editedSummary.slice(0, 30), summaryAfterReset.slice(0, 30))

  // ویرایش نهایی + اعمال → رکورد باید نسخه ویرایش‌شده را نشان دهد
  check('B6: تایپ دوباره خلاصه ویرایشی', setSummary(editedSummary))
  wait(500)
  ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent||'').includes('تأیید و اعمال')); if (b) { b.click(); return true } return false })()`)
  let appliedToast = ''
  let confirmedBlock = ''
  for (let i = 0; i < 14; i++) {
    wait(1000)
    appliedToast = toastText()
    confirmedBlock = String(ev(`(function(){ const s = document.querySelector('main'); const m = (s.innerText||'').match(/دستیار هوشمند \\(تأییدشده\\)/); return m ? 'yes' : '' })()`) ?? '')
    if (appliedToast.includes('پیشنهاد اعمال شد') && confirmedBlock === 'yes') break
  }
  check('B6: توست «پیشنهاد اعمال شد»', appliedToast.includes('پیشنهاد اعمال شد'), appliedToast.slice(0, 80))
  check('B6: بلوک «دستیار هوشمند (تأییدشده)»', confirmedBlock === 'yes')
  const recordSummary = String(ev(`(function(){ const s = document.querySelector('main'); const t = s.innerText || ''; return t.includes(${JSON.stringify(editedSummary)}) })()`) ?? '')
  check('B6: رکورد خلاصه ویرایش‌شده را نشان می‌دهد', recordSummary === 'true')
  shot('t14-ai-applied')
} else {
  console.log(`[SKIP] B2..B6: سرویس LLM در دسترس نبود (${aiErr.slice(0, 60)}) — سنجه‌های ویرایش کارت در همین اجرا قابل سنجش نبود`)
}

// ─── گزارش نهایی ───
console.log(`\n${'═'.repeat(50)}\nE2E P2-T13/T14 — ${pass} سبز / ${fail} قرمز`)
if (fail > 0) process.exit(1)
