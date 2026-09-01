/**
 * P1-T26 — راستی‌آزمایی نان‌رد موبایل در ۳۹۰px:
 * ۱) صفحه رکورد نامه → دکمه «بازگشت به نامه‌ها» نمایان (sm:hidden فقط موبایل)
 * ۲) بردکرامب دسکتاپ در موبایل مخفی است
 * ۳) کلیک بازگشت → تب فهرست فعال می‌شود و تب رکورد باز می‌ماند
 * ۴) الگو در فرم ثبت (new) هم برقرار است
 */
import { ab, ev, wait, shot } from './e2e-golden-helpers'

let pass = 0
let fail = 0
const metrics: string[] = []
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { pass++; metrics.push(`  ✓ ${name}`) } else { fail++; metrics.push(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// مرورگر از ممیزی قبل: dabir لاگین است، viewport 390x844
ab(`set viewport 390 844`)
wait(500)
const vp = String(ev(`window.innerWidth + 'x' + window.innerHeight`) ?? '')
check('viewport موبایل ۳۹۰px', vp.includes('390'), vp)

// ── ۱) باز کردن رکورد نامه (اولین نامه از فهرست)
ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:letters', kind: 'list', viewKey: 'letters', title: 'نامه‌ها', icon: 'Mail' }], activeTabId: 'list:letters' })); return true })()`)
ab(`open http://localhost:81/ --wait networkidle`, 90000)
wait(4000)
const rowClick = ev(`(function(){ const rows = Array.from(document.querySelectorAll('main table tbody tr')); if (rows.length === 0) return 'no-rows'; rows[0].click(); return true })()`)
wait(3000)
check('باز شدن رکورد نامه از فهرست', rowClick === true, String(rowClick))

// ── ۲) دکمه بازگشت موبایل نمایان و بردکرامب دسکتاپ مخفی
const mobileBarRaw = ev(`(function(){ const btns = Array.from(document.querySelectorAll('main button')).filter(b => (b.textContent||'').includes('بازگشت به')); const visible = btns.filter(b => b.offsetParent !== null); return JSON.stringify({ total: btns.length, visible: visible.length, label: visible[0] ? visible[0].textContent.trim() : '' }) })()`)
const mb = typeof mobileBarRaw === 'string' ? JSON.parse(mobileBarRaw) : (mobileBarRaw as { total: number; visible: number; label: string })
check('دکمه «بازگشت به نامه‌ها» در موبایل نمایان', mb.visible >= 1, JSON.stringify(mobileBarRaw))
const desktopCrumbHidden = ev(`(function(){ const nav = document.querySelector('nav[aria-label="مسیر"]'); if (!nav) return 'not-found'; return getComputedStyle(nav).display === 'none' })()`) === true
check('بردکرامب دسکتاپ در ۳۹۰px مخفی', desktopCrumbHidden)
const pathText = ev(`(function(){ const bar = Array.from(document.querySelectorAll('main div')).find(d => (d.textContent||'').includes('نامه‌ها /') && d.className.includes('sm:hidden')); return bar ? 'has-path' : 'no-path' })()`)
check('مسیر کوچک کنار دکمه بازگشت', pathText === 'has-path', String(pathText))
shot('t26-record-backbar-390')

// ── ۳) کلیک بازگشت → فهرست فعال، رکورد باز می‌ماند
const tabsBefore = String(ev(`(function(){ return Array.from(document.querySelectorAll('[role=tab]')).map(t => t.textContent.trim()).join(' | ') })()`) ?? '')
const backClick = ab(`find role button click --name "بازگشت به نامه‌ها"`)
wait(2500)
const activeAfter = String(ev(`(function(){ const t = Array.from(document.querySelectorAll('[role=tab]')).find(x => x.getAttribute('data-state') === 'active' || x.getAttribute('aria-selected') === 'true'); return t ? t.textContent.trim() : '' })()`) ?? '')
check('کلیک بازگشت موفق', backClick.includes('✓'), backClick.slice(0, 60))
check('تب فعال = فهرست نامه‌ها', activeAfter.includes('نامه‌ها') && !activeAfter.includes('شماره'), activeAfter)
const tabsAfter = String(ev(`(function(){ return Array.from(document.querySelectorAll('[role=tab]')).map(t => t.textContent.trim()).join(' | ') })()`) ?? '')
check('تب رکورد باز ماند (چندسندی)', tabsAfter.split('|').length >= 2, tabsAfter.slice(0, 80))
shot('t26-after-back-390')

// ── ۴) فرم ثبت نامه — همان الگو
const newForm = ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'new:letters', kind: 'new', viewKey: 'letters', recordId: 'new', title: 'ثبت نامه جدید', icon: 'Mail' }], activeTabId: 'new:letters' })); return true })()`)
ab(`open http://localhost:81/ --wait networkidle`, 90000)
wait(3500)
const formBack = ev(`(function(){ const btns = Array.from(document.querySelectorAll('main button')).filter(b => (b.textContent||'').includes('بازگشت به') && b.offsetParent !== null); return btns.length })()`)
check('فرم ثبت هم دکمه بازگشت موبایل دارد', Number(formBack) >= 1, String(formBack))
const formOverflow = ev(`document.documentElement.scrollWidth <= window.innerWidth + 1`) === true
check('فرم ثبت بدون سرریز افقی ۳۹۰px', formOverflow)
shot('t26-new-form-390')

console.log('━'.repeat(60))
console.log('P1-T26 — نان‌رد موبایل (۳۹۰px)')
metrics.forEach((m) => console.log(m))
console.log('━'.repeat(60))
console.log(`نتیجه: ${pass} پاس / ${fail} خطا`)
if (fail > 0) process.exit(1)
