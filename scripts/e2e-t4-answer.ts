/**
 * P2-T4/T6 — E2E مرورگری: پنل پاسخ درون‌خطی + قالب شماره «۱۴۰۵/۴۲» در نشان رکورد
 * جریان: ورود دبیرخانه → ثبت نامه → نشان «شماره ۱۴۰۵/N» → دکمه «ثبت پاسخ» → پنل با متن الزامی
 *        → ثبت → وضعیت پاسخ داده شد + بلوک متن پاسخ در «گردش نامه»
 */
import { ab, ev, wait, shot, login, fillByLabel, toastText } from './e2e-golden-helpers'

let pass = 0
let fail = 0
const metrics: string[] = []
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { pass++; metrics.push(`  ✓ ${name}`) } else { fail++; metrics.push(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

ab(`set viewport 1280 900`)
wait(500)
check('ورود dabir.arad', login('dabir.arad', '12345678'))
wait(1200)

// ── ثبت نامه از فرم (با ارجاع به خود دبیرخانه؟ نه — بدون ارجاع → DRAFT خودم)
ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:letters', kind: 'list', viewKey: 'letters', title: 'نامه‌ها', icon: 'Mail' }], activeTabId: 'list:letters' })); return true })()`)
ab(`open http://localhost:81/ --wait networkidle`, 90000)
wait(4000)
ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent||'').includes('ثبت نامه جدید')); if (b) { b.click(); return true } return false })()`)
wait(2500)

const subj = `نامه E2E پاسخ T4 ${Math.floor(Date.now() / 1000) % 100000}`
check('پر کردن موضوع', fillByLabel('موضوع', subj) === 'ok')
check('پر کردن متن نامه', fillByLabel('متن نامه', 'متن نامه آزمون پاسخ‌دهی — E2E') === 'ok')
ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent||'').trim() === 'ثبت نامه'); if (b) { b.click(); return true } return false })()`)
let toasts = ''
for (let i = 0; i < 14; i++) { wait(1000); toasts = toastText(); if (toasts.includes('نامه ثبت شد')) break }
check('توست «نامه ثبت شد»', toasts.includes('نامه ثبت شد'), toasts.slice(0, 100))
check('توست شماره با قالب سال (۱۴۰۵/…)', /شماره نامه: ۱۴۰۵\/[۰-۹]+/.test(toasts), toasts.slice(0, 120))
wait(2500)

// ── نشان رکورد: «وارده · شماره ۱۴۰۵/N»
const badge = String(ev(`(function(){ const b = Array.from(document.querySelectorAll('main span')).find(s => (s.textContent||'').includes('شماره ۱۴۰۵/')); return b ? b.textContent.trim() : '' })()`) ?? '')
check('نشان رکورد «… شماره ۱۴۰۵/N»', /شماره ۱۴۰۵\/[۰-۹]+/.test(badge), badge)
shot('t4-t6-record-badge')

// ── پنل پاسخ: دکمه → پنل درون‌خطی → دکمه ثبت بدون متن غیرفعال
const answerBtn = ab(`find role button click --name "ثبت پاسخ"`)
wait(1200)
check('باز شدن پنل پاسخ', answerBtn.includes('✓'), answerBtn.slice(0, 50))
const panelVisible = ev(`(function(){ const ta = document.querySelector('main textarea[aria-label="متن پاسخ"]'); return !!ta })()`) === true
check('textarea «متن پاسخ» نمایان است', panelVisible)
const submitDisabled = ev(`(function(){ const btns = Array.from(document.querySelectorAll('main button')).filter(b => (b.textContent||'').includes('ثبت پاسخ') && b.closest('div.rounded-xl')); const btn = btns[btns.length - 1]; return btn ? btn.disabled : 'not-found' })()`)
check('دکمه ثبت پاسخ بدون متن غیرفعال', submitDisabled === true, String(submitDisabled))

// تایپ متن پاسخ
const typed = ev(`(function(){ const ta = document.querySelector('main textarea[aria-label=\\"متن پاسخ\\"]'); if (!ta) return false; const proto = window.HTMLTextAreaElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(ta, 'پاسخ نهایی E2E: بررسی انجام شد و نتیجه در پیوست ارسال می‌گردد.'); ta.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
wait(400)
check('تایپ متن پاسخ', typed === true)
const submitEnabled = ev(`(function(){ const btns = Array.from(document.querySelectorAll('main button')).filter(b => (b.textContent||'').includes('ثبت پاسخ') && b.closest('div.rounded-xl')); const btn = btns[btns.length - 1]; return btn ? !btn.disabled : 'not-found' })()`)
check('دکمه ثبت پاسخ با متن فعال شد', submitEnabled === true, String(submitEnabled))
shot('t4-answer-panel')

// ── ثبت پاسخ → وضعیت + بلوک پاسخ در گردش
ev(`(function(){ const btns = Array.from(document.querySelectorAll('main button')).filter(b => (b.textContent||'').includes('ثبت پاسخ') && b.closest('div.rounded-xl')); const btn = btns[btns.length - 1]; if (btn) { btn.click(); return true } return false })()`)
let acted = false
for (let i = 0; i < 12; i++) {
  wait(1000)
  const t = toastText()
  const body = String(ev(`document.body.innerText`) ?? '')
  if (t.includes('انجام شد') || body.includes('پاسخ داده')) { acted = true; break }
}
check('توست «انجام شد» پس از پاسخ', acted)
wait(1500)
const bodyAfter = String(ev(`document.body.innerText`) ?? '')
check('وضعیت نامه = «پاسخ داده‌شده»', bodyAfter.includes('پاسخ داده'))
const panelClosed = ev(`(function(){ return !document.querySelector('main textarea[aria-label="متن پاسخ"]') })()`) === true
check('پنل پاسخ پس از ثبت بسته شد', panelClosed)

// تب «گردش نامه» — بلوک برجسته پاسخ
ab(`find role tab click --name "گردش نامه"`)
wait(1600)
const flow = String(ev(`(function(){ const tabs = Array.from(document.querySelectorAll('[role=tab]')); const active = tabs.find(t => t.getAttribute('data-state') === 'active'); return active ? active.textContent.trim() : '' })()`) ?? '')
check('تب «گردش نامه» فعال', flow.includes('گردش'), flow)
const flowBody = String(ev(`document.body.innerText`) ?? '')
check('بلوک متن پاسخ در گردش نامه', flowBody.includes('پاسخ نهایی E2E'))
shot('t4-timeline-answer')

console.log('━'.repeat(60))
console.log('P2-T4/T6 — پنل پاسخ درون‌خطی + قالب شماره سالانه')
metrics.forEach((m) => console.log(m))
console.log('━'.repeat(60))
console.log(`نتیجه: ${pass} پاس / ${fail} خطا`)
if (fail > 0) process.exit(1)
