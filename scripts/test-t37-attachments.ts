/**
 * P1-T37 — راستی‌آزمایی رگرسیون: آپلود پیوست در همان فرم ثبت نامه
 * جریان: ورود دبیرخانه → فرم ثبت نامه → انتخاب فایل در صف → ثبت →
 *        توست «نامه ثبت شد · ۱ پیوست بارگذاری شد» → تب پیوست‌های رکورد فایل را نشان می‌دهد
 */
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { login, ab, ev, wait, shot, fillByLabel, toastText, OUT } from './e2e-golden-helpers'
import { sleepSync } from './e2e-golden-sleep'

mkdirSync('/tmp/t37', { recursive: true })
// فایل نمونه پیوست (متن — در allowlist)
writeFileSync('/tmp/t37/گزارش-فنی.txt', 'پیوست آزمون P1-T37 — محتوای فایل نمونه\n'.repeat(20))

let pass = 0
let fail = 0
const metrics: string[] = []
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { pass++; metrics.push(`  ✓ ${name}`) } else { fail++; metrics.push(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ── ۱) ورود دبیرخانه آراد
check('ورود dabir.arad', login('dabir.arad', '12345678'))
wait(1000)

// ── ۲) باز کردن فرم ثبت نامه از نمای نامه‌ها
ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:letters', kind: 'list', viewKey: 'letters', title: 'نامه‌ها', icon: 'Mail' }], activeTabId: 'list:letters' })); return true })()`)
ab(`open http://localhost:81/ --wait networkidle`, 90000)
wait(3500)
const openedNew = ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent||'').includes('ثبت نامه جدید')); if (b) { b.click(); return true } return false })()`)
wait(2500)
check('باز شدن فرم ثبت نامه (تب جدید)', openedNew === true)
shot('t37-form-empty')

// ── ۳) پر کردن فرم (موضوع + متن)
const subj = `نامه آزمون پیوست T37 ${Math.floor(Date.now() / 1000) % 100000}`
check('پر کردن موضوع', fillByLabel('موضوع', subj) === 'ok')
check('پر کردن متن نامه', fillByLabel('متن نامه', 'متن آزمون پیوست در همان فرم ثبت — بدون باز کردن جزئیات.') === 'ok')

// ── ۴) انتخاب فایل در صف پیوست (P1-T37)
// P2-T16: input OCR جدید بالاتر در DOM است — سلکتور باید صریحاً input پیوست را بگیرد (نه «اولین input»)
const up = ab(`upload 'input[type=file]:not(#ocr-file-input)' /tmp/t37/گزارش-فنی.txt`, 30000)
wait(1200)
const queueText = String(ev(`(function(){ const el = Array.from(document.querySelectorAll('main p')).find(p => (p.textContent||'').includes('فایل در صف')); return el ? el.textContent.trim() : '' })()`) ?? '')
check('انتخاب فایل در صف پیوست', up.includes('✓'), up.slice(0, 80))
check('نمایش «۱ فایل در صف» در برچسب', queueText.includes('۱ فایل در صف'), queueText)
const queueItem = String(ev(`(function(){ const li = Array.from(document.querySelectorAll('main li')).find(l => (l.textContent||'').includes('گزارش-فنی')); return li ? li.textContent.trim() : '' })()`) ?? '')
check('فایل در فهرست صف دیده می‌شود', queueItem.includes('گزارش-فنی'), queueItem.slice(0, 60))
shot('t37-form-with-file')

// ── ۵) ثبت نامه
ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent||'').trim() === 'ثبت نامه'); if (b) { b.click(); return true } return false })()`)
// انتظار: ثبت + آپلود پیوست + جامه‌ویژه تب
let toasts = ''
for (let i = 0; i < 14; i++) {
  wait(1000)
  toasts = toastText()
  if (toasts.includes('نامه ثبت شد')) break
}
check('توست «نامه ثبت شد»', toasts.includes('نامه ثبت شد'), toasts.slice(0, 120))
check('توست شامل «۱ پیوست بارگذاری شد»', toasts.includes('پیوست بارگذاری شد'), toasts.slice(0, 160))
shot('t37-after-submit')

// ── ۶) تب رکورد: جامه‌ویژه به «نامه N — موضوع»؛ تب پیوست‌ها فایل را نشان می‌دهد
wait(2500)
const tabText = String(ev(`(function(){ const t = Array.from(document.querySelectorAll('[role=tab]')).map(x => x.textContent.trim()); return t.join(' | ') })()`) ?? '')
check('جامه‌ویژه تب به رکورد نامه', tabText.includes(subj.slice(0, 20)), tabText.slice(0, 120))
// کلیک تب داخلی «پیوست‌ها» — نکته: کلیک JS خام روی Radix TabsTrigger فعال‌سازی نمی‌کند؛ فرمان بومی لازم است
const attTab = ab(`find role tab click --name "پیوست‌ها"`)
wait(1800)
check('تب داخلی «پیوست‌ها» باز شد', attTab.includes('✓'), attTab.slice(0, 80))
let attBody = ''
for (let i = 0; i < 10; i++) {
  attBody = String(ev(`document.body.innerText`) ?? '')
  if (attBody.includes('گزارش-فنی')) break
  wait(700)
}
check('فایل در تب پیوست‌های رکورد موجود است', attBody.includes('گزارش-فنی'), '')
shot('t37-record-attachments')

// ── ۷) پاک‌سازی: بستن تب رکورد (نامه آزمونی می‌ماند — سجل audit دارد، مشکلی نیست؛ DRAFT دبیرخانه)
ev(`(function(){ const b = Array.from(document.querySelectorAll('button[aria-label*="بستن"]')).slice(-1)[0]; if (b) { b.click(); return true } return false })()`)

console.log('━'.repeat(60))
console.log('P1-T37 — پیوست در همان فرم ثبت نامه')
metrics.forEach((m) => console.log(m))
console.log('━'.repeat(60))
console.log(`نتیجه: ${pass} پاس / ${fail} خطا`)
if (fail > 0) process.exit(1)
