/**
 * P2-T16 — E2E مرورگری OCR نامه اسکن‌شده:
 *  A) فرم ثبت نامه: آپلود تصویر اسکن → استخراج متن (LLM زنده) → پیش‌پر شدن فیلدها (HITL) → ثبت نامه → رکورد + پیوست
 *  B) موبایل ۳۹۰px — بدون سرریز/بدون شکست
 * اجرا: bunx tsx scripts/e2e-t16-ocr.ts  (سرور dev روشن؛ گیت‌وی ۸۱)
 */
import { ab, ev, wait, login, toastText, switchCompanyUI } from './e2e-golden-helpers'
import { generateSamples, SAMPLES_DIR } from './t16-samples'

const OUT = '/home/z/my-project/download/qa-p2-t16'

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { pass++ } else { fail++ }
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` — ${detail}` : ''}`)
}
function shot(name: string): string {
  const r = ab(`screenshot ${OUT}/${name}.png`)
  return r.includes('✓') ? 'ok' : `fail(${r.slice(0, 60)})`
}

/** ورود قطعی (درس ۲۵: مرورگر بین اجراها نشست دارد) */
function forceLogin(username: string, password: string): boolean {
  ev(`(async function(){ try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }) } catch (e) {} return true })()`)
  wait(1000)
  ab(`open http://localhost:81/ --wait networkidle`, 90000)
  wait(1500)
  return login(username, password)
}

const subjVal = () => String(ev(`(function(){ const el = document.querySelector('#subject'); return el ? el.value : '' })()`) ?? '')
const bodyVal = () => String(ev(`(function(){ const el = document.querySelector('#body'); return el ? el.value : '' })()`) ?? '')
const senderVal = () => String(ev(`(function(){ const el = document.querySelector('#senderTitle'); return el ? el.value : '' })()`) ?? '')
/** نوع فعلی فرم = متن نشان هدر (وارده/صادره/داخلی) — همان watch('type') است */
const typeBadge = () => String(ev(`(function(){ const b = document.querySelector('main [data-slot=badge], main .inline-flex.items-center.rounded-full'); const all = Array.from(document.querySelectorAll('main span')).map(x => x.textContent || ''); const hit = all.find(t => t === 'وارده' || t === 'صادره' || t === 'داخلی'); return hit ?? '' })()`) ?? '')

// ═══════════ بخش A — اسکن → پیش‌پرکردن → ثبت (معیار پذیرش T16) ═══════════

ab(`set viewport 1280 900`)
wait(400)
check('A0: ورود admin', forceLogin('admin', 'admin123'))
wait(1500)

// بوت اولیه + سوییچ به شرکت عملیاتی (هلدینگ GROUP → دکمه ثبت غیرفعال) — سوییچ به داشبورد می‌رود، پس قبل از بوت workspace
ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:dashboard', kind: 'list', viewKey: 'dashboard', title: 'داشبورد', icon: 'LayoutDashboard' }], activeTabId: 'list:dashboard' })); return true })()`)
ab(`open http://localhost:81/ --wait networkidle`, 90000)
wait(4000)
const switched = switchCompanyUI('آراد سرام پیشرو')
check('A1: سوییچ به شرکت عملیاتی آراد سرام', switched)
wait(2000)

// بوت پوسته با نمای دبیرخانه (پس از سوییچ شرکت) + باز کردن تب فرم
ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:letters', kind: 'list', viewKey: 'letters', title: 'نامه‌ها', icon: 'Mail' }], activeTabId: 'list:letters' })); return true })()`)
ab(`open http://localhost:81/ --wait networkidle`, 90000)
wait(4000)
// پاک‌سازی پیش‌نویس اجراهای قبل (ذخیره خودکار — وگرنه سنجه‌های «پیش‌پر شدن» با داده قدیمی آلوده می‌شوند)
ev(`(function(){ Object.keys(window.localStorage).filter(k => k.startsWith('io.draft.v1') && k.includes(':letters')).forEach(k => window.localStorage.removeItem(k)); return true })()`)
ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent || '').includes('ثبت نامه جدید')); if (b) { b.click(); return true } return false })()`)
wait(2500)
check('A1: تب فرم ثبت نامه باز شد', String(ev(`(function(){ return document.querySelector('#new-letter-form') ? 'ok' : 'not-found' })()`) ?? '') === 'ok')
check('A1: سکشن OCR موجود است', String(ev(`(function(){ return document.querySelector('[data-testid=ocr-section]') ? 'ok' : 'not-found' })()`) ?? '') === 'ok')

// آپلود تصویر اسکن (نمونه ۱ — نامه وارده یادآوری تسویه) — سلکتور # در sh باید کوتیشن بگیرد وگرنه کامنت می‌شود
const up = ab(`upload '#ocr-file-input' ${SAMPLES_DIR}/sample1.png`, 30000)
check('A2: تصویر اسکن انتخاب شد', up.includes('✓'), up.slice(0, 60))
wait(600)
check('A2: نام فایل در چیپ نمایش داده می‌شود', String(ev(`(function(){ const s = document.querySelector('[data-testid=ocr-section]'); return s ? s.innerText : '' })()`) ?? '').includes('sample1.png'))

// اجرای OCR — LLM زنده: poll تا پیش‌پر شدن فیلدها (سقف ۹۰ث — درس R6)
ev(`(function(){ const b = document.querySelector('[data-testid=ocr-run]'); if (b) { b.click(); return true } return false })()`)
let filled = false
let rawShown = false
for (let i = 0; i < 45; i++) {
  wait(2000)
  if (subjVal().length > 5 || bodyVal().length > 40) { filled = true }
  if (String(ev(`(function(){ const p = document.querySelector('[data-testid=ocr-raw]'); return p ? p.textContent.length : 0 })()`) ?? '0') !== '0') { rawShown = true }
  if (filled && rawShown) break
}
check('A3: متن خام استخراج و نمایش داده شد', rawShown, 'poll 90s')
check('A3: فرم پیش‌پر شد (موضوع یا متن)', filled, `subject="${subjVal().slice(0, 40)}" body=${bodyVal().length}chars`)

if (rawShown) {
  const rawTxt = String(ev(`(function(){ const p = document.querySelector('[data-testid=ocr-raw]'); return p ? p.textContent : '' })()`) ?? '')
  check('A3: متن خام شامل محتوای نامه است', rawTxt.includes('تسویه') || rawTxt.includes('صورت'), rawTxt.slice(0, 60))
  shot('t16-ocr-filled')
}

// HITL — هشدار کهربایی «ماشین‌خوان» فقط پس از نمایش نتیجه ظاهر می‌شود
const ocrSectionTxt = String(ev(`(function(){ const s = document.querySelector('[data-testid=ocr-section]'); return s ? s.innerText : '' })()`) ?? '')
check('A4: هشدار بازبینی HITL نمایش داده می‌شود', ocrSectionTxt.includes('ماشین‌خوان'))

// اسکن به صف پیوست‌ها اضافه شده باشد (مدرک منبع)
const attachSection = String(ev(`(function(){ const f = Array.from(document.querySelectorAll('main form h3, main form p')).map(x => x.textContent || ''); return f.join(' | ') })()`) ?? '')
const pendingShown = String(ev(`(function(){ const els = Array.from(document.querySelectorAll('main form ul li')); return els.map(x => x.textContent || '').join('،') })()`) ?? '')
check('A5: اسکن به صف پیوست اضافه شد', pendingShown.includes('sample1.png'), pendingShown.slice(0, 80))

// بررسی مقادیر پیش‌پرشده (HITL — قابل ویرایش: مقدار در input است و کاربر می‌تواند تغییرش دهد)
const subject = subjVal()
const body = bodyVal()
check('A5: موضوع قابل ویرایش (input پر است)', subject.length > 3, `"${subject.slice(0, 40)}"`)
check('A5: متن نامه پر شده', body.length > 40, `chars=${body.length}`)
// فرستنده فقط وقتی نوع «وارده» است رندر/پر می‌شود (منطق merge فرم) — سنجه مشروط به نوع تشخیصی LLM
const currentType = typeBadge()
if (subject.length > 3 && currentType === 'وارده') {
  const sender = senderVal()
  check('A5: فرستنده (نامه وارده) پر شد — ساختاردهی کامل', sender.length > 2, `"${sender}"`)
}
check('A5: نوع نامه معتبر (نشان هدر)', ['وارده', 'صادره', 'داخلی'].includes(currentType), `"${currentType}"`)

// ویرایش دستی کاربر (HITL): موضوع را کامل/تصحیح کن و ثبت کن
const finalSubject = subject.length > 3 ? subject : 'نامه اسکن‌شده تست E2E (OCR)'
if (subject.length <= 3) {
  ev(`(function(){ const el = document.querySelector('#subject'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(finalSubject)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
}
// متن لازم — مسیرهای جایگزین HITL: دکمه «درج متن خام» و اگر نبود (ساختاردهی body نداد) درج مستقیم از pre خام
if (bodyVal().length <= 40) {
  ev(`(function(){ const b = document.querySelector('[data-testid=ocr-fill-raw]'); if (b) { b.click(); return 'btn' } return 'none' })()`)
  wait(400)
}
if (bodyVal().length <= 40) {
  ev(`(function(){
    const raw = document.querySelector('[data-testid=ocr-raw]')?.textContent || ''
    const ta = document.querySelector('#body')
    if (!raw || !ta) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(ta, raw.slice(0, 10000))
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  wait(400)
}
check('A6: پیش از ثبت موضوع معتبر است', subjVal().length > 3)
check('A6: پیش از ثبت متن معتبر است', bodyVal().length > 10, `chars=${bodyVal().length}`)

ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent || '').trim() === 'ثبت نامه'); if (b) { b.click(); return true } return false })()`)
let toasts = ''
for (let i = 0; i < 20; i++) { wait(1000); toasts = toastText(); if (toasts.includes('نامه ثبت شد')) break }
check('A7: نامه ثبت شد (توست)', toasts.includes('نامه ثبت شد'), toasts.slice(0, 80))
check('A7: پیوست اسکن بارگذاری شد (توست)', toasts.includes('پیوست'), toasts.slice(0, 120))
wait(3000)

// رکورد پس از ثبت — جامه‌ویژه: تب «نامه ۱۴۰۵/N — موضوع»
const mainTxt = String(ev(`(function(){ return document.querySelector('main')?.innerText?.slice(0, 1500) ?? '' })()`) ?? '')
check('A8: صفحه رکورد نامه باز شد', mainTxt.includes(finalSubject.slice(0, 25)) || mainTxt.includes('شناسنامه'), mainTxt.slice(0, 80))
shot('t16-record')

// تب پیوست‌ها — تصویر اسکن باید پیوست شده باشد (درس ۱۹: Radix TabsTrigger با mousedown)
ev(`(function(){ const t = Array.from(document.querySelectorAll('[role=tab]')).find(x => (x.textContent || '').includes('پیوست')); if (t) { t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); t.click(); return true } return false })()`)
wait(2500)
const attTxt = String(ev(`(function(){ return document.querySelector('main')?.innerText?.slice(0, 2000) ?? '' })()`) ?? '')
check('A9: تصویر اسکن در پیوست‌های نامه است', attTxt.includes('sample1.png'), attTxt.slice(0, 100))
shot('t16-attachments')

// ═══════════ بخش B — موبایل ۳۹۰px ═══════════
ab(`set viewport 390 844`)
wait(1500)
const overflow = Number(ev(`(function(){ return document.documentElement.scrollWidth - document.documentElement.clientWidth })()`) ?? 0)
check('B1: موبایل ۳۹۰ — بدون سرریز افقی', overflow <= 1, `delta=${overflow}px`)
shot('t16-mobile')

// ═══════════ جمع‌بندی ═══════════
console.log(`\n──── نتیجه E2E: ${pass} سبز · ${fail} شکست ────`)
if (fail > 0) process.exit(1)
