/**
 * P2-T10 — E2E مرورگری: مهلت اختصاصی گام در پنل ارجاع + چیپ رنگی در تب «گردش نامه»
 * جریان: ورود دبیرخانه → ثبت نامه (پیش‌نویس) → ارجاع با دیت‌پیکر مهلت (امروز → قرمز، +۲ روز → کهربایی)
 *        → تب گردش: چیپ «مهلت گام: …» با لحن رنگی + هشدار تاریخ گذشته در فرم
 * اجرا: bunx tsx scripts/e2e-t10-deadline.ts  (سرور dev روشن؛ گیت‌وی ۸۱)
 */
import { ab, ev, wait, login, fillByLabel, toastText, searchSelect } from './e2e-golden-helpers'
import { toJalali } from '../src/core/shared/jalali'

const OUT = '/home/z/my-project/download/qa-p2-t10-t11'

/** اسکرین‌شات محلی (shot کمکیِ golden به دایرکتوری qa-e2e-golden ذخیره می‌کند) */
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

/** روز جلالی امروز + امن بودن انتخاب «+۲ روز» در همان ماه جاری */
const { jy, jm, jd } = toJalali(new Date())
const amberDaySafe = jd <= 27 // همه ماه‌های جلالی ≥ ۲۹ روز دارند → روز +۲ رندر می‌شود
const fa = (s: string | number) => String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
console.log(`[INFO] امروز جلالی: ${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')} | amber(+2day)=${amberDaySafe ? 'فعال' : 'رد (پایان ماه)'}`)

/** کلیک روی سلول روز تقویم رmdp (امروز یا روز N همین ماه — سلول‌های ماه مجاور rmdp-deactive هستند) */
function pickRmdpDay(day: number | 'today'): string {
  const clicked = ev(`(function(){
    const fa = '۰۱۲۳۴۵۶۷۸۹'
    const norm = (s) => String(s).replace(/[۰-۹]/g, (d) => String(fa.indexOf(d))).trim()
    const days = Array.from(document.querySelectorAll('.rmdp-day')).filter(d => !d.className.includes('rmdp-deactive'))
    let cell
    if ('${String(day)}' === 'today') {
      cell = days.find(d => d.className.includes('rmdp-today')) || days.find(d => norm(d.textContent) === String(${jd}))
    } else {
      const target = String(${day})
      cell = days.find(d => norm(d.textContent) === target)
    }
    if (!cell) return 'day-not-found(days=' + days.length + ')'
    cell.click()
    return true
  })()`)
  wait(500)
  return clicked === true ? 'ok' : `fail(${String(clicked).slice(0, 60)})`
}

/** باز کردن دیت‌پیکر مهلت گام (کلیک روی ورودی فقط-خواندنی) */
function openDeadlinePicker(): string {
  const opened = ev(`(function(){
    const el = document.querySelector('input[aria-label="مهلت اقدام گیرنده..."]')
    if (!el) return 'input-not-found'
    el.click()
    return true
  })()`)
  wait(900)
  return opened === true ? 'ok' : `fail(${String(opened).slice(0, 60)})`
}

/** متن چیپ «مهلت گام» آخرین گام + کلاس رنگی آن */
function deadlineChipInfo(): { text: string; cls: string } {
  const info = ev(`(function(){
    const chips = Array.from(document.querySelectorAll('main span')).filter(s => (s.textContent || '').includes('مهلت گام:'))
    const chip = chips[chips.length - 1]
    if (!chip) return null
    return { text: chip.textContent.trim(), cls: chip.className }
  })()`)
  const o = (info ?? {}) as { text?: string; cls?: string }
  return { text: o.text ?? '', cls: o.cls ?? '' }
}

// ═══════════ سنجه ۱: نامه با ارجاعِ مهلت‌دار «امروز» → چیپ قرمز ═══════════

ab(`set viewport 1280 900`)
wait(500)
check('ورود dabir.arad', login('dabir.arad', '12345678'))
wait(1500)

// بوت پوسته با نمای فهرست نامه‌ها (deep-link جایگزین ناوبری)
ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:letters', kind: 'list', viewKey: 'letters', title: 'نامه‌ها', icon: 'Mail' }], activeTabId: 'list:letters' })); return true })()`)
ab(`open http://localhost:81/ --wait networkidle`, 90000)
wait(4000)

// ثبت نامه پیش‌نویس (بدون ارجاع اولیه — دبیرخانه خودش دارنده DRAFT است)
ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent||'').includes('ثبت نامه جدید')); if (b) { b.click(); return true } return false })()`)
wait(2500)
const subj1 = `نامه E2E مهلت قرمز ${Math.floor(Date.now() / 1000) % 100000}`
check('پر کردن موضوع (نامه ۱)', fillByLabel('موضوع', subj1) === 'ok')
check('پر کردن متن نامه (نامه ۱)', fillByLabel('متن نامه', 'آزمون E2E مهلت گام — لحن قرمز (امروز).') === 'ok')
ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent||'').trim() === 'ثبت نامه'); if (b) { b.click(); return true } return false })()`)
let toast1 = ''
for (let i = 0; i < 14; i++) {
  wait(1000)
  toast1 = toastText()
  // توست گاهی در گذار صفحه می‌گذرد — ظاهر شدن دکمه اقدام رکورد = ثبت موفق
  const recordReady = String(ev(`(function(){ return Array.from(document.querySelectorAll('main button')).some(b => (b.textContent||'').includes('ثبت پاسخ')) })()`) ?? '') === 'true'
  if (toast1.includes('نامه ثبت شد') || recordReady) break
}
const recordReady1 = String(ev(`(function(){ return Array.from(document.querySelectorAll('main button')).some(b => (b.textContent||'').includes('ثبت پاسخ')) })()`) ?? '') === 'true'
check('ثبت نامه ۱ (توست یا صفحه رکورد)', toast1.includes('نامه ثبت شد') || recordReady1, toast1.slice(0, 100))
wait(2500)

// پنل ارجاع: گیرنده + مهلت «امروز»
const referBtn1 = ab(`find role button click --name "ارجاع"`, 30000)
wait(1200)
check('باز شدن پنل ارجاع', referBtn1.includes('✓'), referBtn1.slice(0, 60))
check('انتخاب گیرنده (مدیرعامل رضایی)', searchSelect('گیرنده ارجاع', 'رضایی', 'رضایی') === 'ok')
check('باز شدن دیت‌پیکر مهلت گام', openDeadlinePicker() === 'ok')
const calOpen = ev(`!!document.querySelector('.rmdp-calendar')`) === true
check('تقویم جلالی رmdp باز شد', calOpen)
shot('t10-calendar-open')
check('انتخاب روز «امروز» در تقویم', pickRmdpDay('today') === 'ok')
wait(700)
const picked = String(ev(`(function(){ const el = document.querySelector('input[aria-label="مهلت اقدام گیرنده..."]'); return el ? el.value : 'not-found' })()`) ?? '')
// نمایش ورودی با ارقام فارسی است (locale تقویم)؛ حالت داخلی لاتین — هر دو پذیرفته
check('ورودی مهلت مقدار گرفت', /^[\d۰-۹]{4}\/[\d۰-۹]{2}\/[\d۰-۹]{2}$/.test(picked), picked)
const warnPast = String(ev(`document.body.innerText`) ?? '').includes('این تاریخ در گذشته است')
check('هشدار کهربایی «تاریخ در گذشته» زیر دیت‌پیکر', warnPast)
shot('t10-refer-panel-past-warning')

// ثبت ارجاع → وضعیت در جریان
ev(`(function(){ const btns = Array.from(document.querySelectorAll('main button')).filter(b => (b.textContent||'').includes('ثبت ارجاع')); const btn = btns[btns.length - 1]; if (btn) { btn.click(); return true } return false })()`)
let acted1 = false
for (let i = 0; i < 12; i++) {
  wait(1000)
  const t = toastText()
  if (t.includes('ارجاع شد')) { acted1 = true; break }
}
check('توست «ارجاع شد»', acted1)
wait(2000)

// تب «گردش نامه» — چیپ مهلت با لحن قرمز (امروز = گذشته)
ab(`find role tab click --name "گردش نامه"`)
wait(1800)
const chip1 = deadlineChipInfo()
check('چیپ «مهلت گام: …» در گردش نامه رندر شد', chip1.text.startsWith('مهلت گام:'), chip1.text.slice(0, 60))
check('چیپ شامل تاریخ جلالی امروز', chip1.text.includes(`${fa(jy)}/${fa(String(jm).padStart(2, '0'))}`), chip1.text)
check('چیپ با پسوند «— گذشته»', chip1.text.includes('گذشته'), chip1.text)
check('لحن قرمز چیپ (text-red-600)', chip1.cls.includes('text-red-600'), chip1.cls.slice(0, 80))
shot('t10-workflow-red-chip')

// سرصفحه رکورد — سطر «مهلت گام جاری» قرمز
const headerRow = String(ev(`(function(){ const rows = Array.from(document.querySelectorAll('main dt, main .text-xs, main span')).filter(e => (e.textContent||'') === 'مهلت گام جاری'); return rows.length })()`) ?? '')
check('سطر «مهلت گام جاری» در شناسنامه', headerRow !== '0', headerRow)

// ═══════════ سنجه ۲: نامه دوم با مهلت «+۲ روز» → چیپ کهربایی ═══════════
if (amberDaySafe) {
  // بازگشت به تب فهرست نامه‌ها (دکمه «ثبت نامه جدید» فقط آنجاست)
  ab(`find role tab click --name "نامه‌ها"`, 30000)
  wait(2000)
  ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent||'').includes('ثبت نامه جدید')); if (b) { b.click(); return true } return false })()`)
  wait(2500)
  const subj2 = `نامه E2E مهلت کهربایی ${Math.floor(Date.now() / 1000) % 100000}`
  check('پر کردن موضوع (نامه ۲)', fillByLabel('موضوع', subj2) === 'ok')
  check('پر کردن متن نامه (نامه ۲)', fillByLabel('متن نامه', 'آزمون E2E مهلت گام — لحن کهربایی (+۲ روز).') === 'ok')
  ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent||'').trim() === 'ثبت نامه'); if (b) { b.click(); return true } return false })()`)
  let toast2 = ''
  for (let i = 0; i < 14; i++) {
    wait(1000)
    toast2 = toastText()
    const recordReady = String(ev(`(function(){ return Array.from(document.querySelectorAll('main button')).some(b => (b.textContent||'').includes('ثبت پاسخ')) })()`) ?? '') === 'true'
    if (toast2.includes('نامه ثبت شد') || recordReady) break
  }
  const recordReady2 = String(ev(`(function(){ return Array.from(document.querySelectorAll('main button')).some(b => (b.textContent||'').includes('ثبت پاسخ')) })()`) ?? '') === 'true'
  check('ثبت نامه ۲ (توست یا صفحه رکورد)', toast2.includes('نامه ثبت شد') || recordReady2, toast2.slice(0, 100))
  wait(2500)

  const referBtn2 = ab(`find role button click --name "ارجاع"`, 30000)
  wait(1200)
  check('باز شدن پنل ارجاع (نامه ۲)', referBtn2.includes('✓'), referBtn2.slice(0, 60))
  check('انتخاب گیرنده (نامه ۲)', searchSelect('گیرنده ارجاع', 'رضایی', 'رضایی') === 'ok')
  check('باز شدن دیت‌پیکر مهلت (نامه ۲)', openDeadlinePicker() === 'ok')
  check(`انتخاب روز ${jd + 2} (امروز+۲)`, pickRmdpDay(jd + 2) === 'ok')
  wait(700)
  const picked2 = String(ev(`(function(){ const el = document.querySelector('input[aria-label="مهلت اقدام گیرنده..."]'); return el ? el.value : 'not-found' })()`) ?? '')
  check('ورودی مهلت مقدار گرفت (نامه ۲)', /^[\d۰-۹]{4}\/[\d۰-۹]{2}\/[\d۰-۹]{2}$/.test(picked2), picked2)
  const noWarn = !String(ev(`document.body.innerText`) ?? '').includes('این تاریخ در گذشته است')
  check('بدون هشدار تاریخ گذشته (تاریخ آینده)', noWarn)

  ev(`(function(){ const btns = Array.from(document.querySelectorAll('main button')).filter(b => (b.textContent||'').includes('ثبت ارجاع')); const btn = btns[btns.length - 1]; if (btn) { btn.click(); return true } return false })()`)
  let acted2 = false
  for (let i = 0; i < 12; i++) {
    wait(1000)
    if (toastText().includes('ارجاع شد')) { acted2 = true; break }
  }
  check('توست «ارجاع شد» (نامه ۲)', acted2)
  wait(2000)

  ab(`find role tab click --name "گردش نامه"`)
  wait(1800)
  const chip2 = deadlineChipInfo()
  check('چیپ «مهلت گام: …» (نامه ۲)', chip2.text.startsWith('مهلت گام:'), chip2.text.slice(0, 60))
  check('چیپ با پسوند «— نزدیک»', chip2.text.includes('نزدیک'), chip2.text)
  check('لحن کهربایی چیپ (text-amber-600)', chip2.cls.includes('text-amber-600'), chip2.cls.slice(0, 80))
  shot('t10-workflow-amber-chip')
} else {
  metrics.push('  ○ لحن کهربایی در این اجرا رد شد (پایان ماه جلالی) — پوشش کامل در تست API')
}

// ═══════════ جمع‌بندی ═══════════
console.log('─'.repeat(60))
console.log(`E2E T10: ${pass} سبز / ${fail} قرمز`)
for (const m of metrics) console.log(m)
process.exitCode = fail === 0 ? 0 : 1
