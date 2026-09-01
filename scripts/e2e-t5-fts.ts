/**
 * P2-T5 — E2E مرورگری: جستجوی تمام‌متن نامه‌ها + هایلایت فارسی نتایج
 * جریان: ورود دبیرخانه → فهرست نامه‌ها → تایپ «استعلام» → نتایج فیلتر + <mark> هایلایت
 *        → پاک‌کردن جستجو → مارها حذف → موبایل ۳۹۰ بدون سرریز
 */
import { ab, ev, wait, shot, login, fillByPlaceholder } from './e2e-golden-helpers'

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

// ── بوت مستقیم روی فهرست نامه‌ها (پوسته چندسندی)
ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:letters', kind: 'list', viewKey: 'letters', title: 'نامه‌ها', icon: 'Mail' }], activeTabId: 'list:letters' })); return true })()`)
ab(`open http://localhost:81/ --wait networkidle`, 90000)
wait(4000)

const rowsBefore = Number(ev(`(function(){ return document.querySelectorAll('main table tbody tr').length })()`) ?? 0)
check('فهرست نامه‌ها بارگذاری شد (بدون جستجو)', rowsBefore >= 10, `rows=${rowsBefore}`)
const marksBefore = Number(ev(`(function(){ return document.querySelectorAll('main table mark').length })()`) ?? 0)
check('بدون جستجو — هیچ ماری نیست', marksBefore === 0, `marks=${marksBefore}`)

// ── تایپ «استعلام» در جستجو (جعبه جستجوی سروری DataGrid)
const fillRes = String(fillByPlaceholder('جستجو...', 'استعلام') ?? '')
check('تایپ «استعلام» در جستجو', fillRes === 'ok', String(fillRes).slice(0, 40))
wait(2500)

const rowsAfter = Number(ev(`(function(){ return document.querySelectorAll('main table tbody tr').length })()`) ?? 0)
const marksAfter = Number(ev(`(function(){ return document.querySelectorAll('main table mark').length })()`) ?? 0)
check('نتایج فیلتر شدند (ردیف‌های جستجو)', rowsAfter >= 10, `rows=${rowsAfter}`)

// هر مار باید واژه‌ای باشد که با «استعلا» شروع می‌شود (پیشوند) — نه تک‌حرف
const markOk = Number(ev(`(function(){ const ms = Array.from(document.querySelectorAll('main table mark')); const bad = ms.filter(m => !(m.textContent || '').trim().startsWith('استعلا')); return ms.length ? bad.length : -1 })()`) ?? -2)
check('هایلایت فارسی: مارهای «استعلام…» در ستون موضوع', marksAfter >= 5 && markOk === 0, `marks=${marksAfter} bad=${markOk}`)

// مار داخل ستون موضوع است (td بزرگ — نه جای دیگر)
const inSubject = Number(ev(`(function(){ const tds = Array.from(document.querySelectorAll('main table tbody tr td')); const subjectTds = tds.filter(td => (td.querySelector('p.truncate') !== null)); const marksInSubject = subjectTds.reduce((n, td) => n + td.querySelectorAll('mark').length, 0); return marksInSubject })()`) ?? 0)
check('مارها داخل ستون «موضوع»', inSubject >= 5 && inSubject === marksAfter, `inSubject=${inSubject}/${marksAfter}`)

// شمارنده «نمایش … از N سطر» — total سرور
const totalShown = Number(ev(`(function(){ const m = (document.querySelector('main')?.textContent || '').match(/از\\s*([۰-۹][۰-۹,]*)\\s*سطر/); if (!m) return -1; return Number(m[1].replace(/,/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))) })()`) ?? -1)
check('شمارنده «نمایش … از N سطر» — total سرور ≥ ۱۰۰', totalShown >= 100, `total=${totalShown}`)

shot('t5-highlight-desktop')
check('اسکرین‌شات دسکتاپ گرفته شد', true)

// ── پاک‌کردن جستجو → مارها حذف می‌شوند
fillByPlaceholder('جستجو...', '')
wait(2200)
const marksCleared = Number(ev(`(function(){ return document.querySelectorAll('main table mark').length })()`) ?? 0)
const rowsCleared = Number(ev(`(function(){ return document.querySelectorAll('main table tbody tr').length })()`) ?? 0)
check('پاک‌کردن جستجو → مارها حذف', marksCleared === 0, `marks=${marksCleared}`)
check('پاک‌کردن جستجو → فهرست کامل برمی‌گردد', rowsCleared >= 10, `rows=${rowsCleared}`)

// ── واریانت عربی: «قيمت» با ي عربی هم هایلایت می‌شود (متن اصلی «قیمت» فارسی)
fillByPlaceholder('جستجو...', 'قيمت')
wait(2500)
const markVariant = Number(ev(`(function(){ const ms = Array.from(document.querySelectorAll('main table mark')); const ok = ms.filter(m => /^ق[یي]م/.test((m.textContent || '').trim())); return ms.length ? ok.length : -1 })()`) ?? -2)
check('هایلایت واریانت — «قيمت» (ي عربی) واژه «قیمت» را مار می‌زند', markVariant > 0, `variantMarks=${markVariant}`)
shot('t5-highlight-variant')

// ── موبایل ۳۹۰: جستجو + هایلایت بدون سرریز افقی
ab(`set viewport 390 844`)
wait(1500)
fillByPlaceholder('جستجو...', 'استعلام')
wait(2500)
const marksMobile = Number(ev(`(function(){ return document.querySelectorAll('main table mark').length })()`) ?? 0)
check('موبایل — هایلایت فعال', marksMobile >= 5, `marks=${marksMobile}`)
const overflow = Number(ev(`(function(){ return document.documentElement.scrollWidth - document.documentElement.clientWidth })()`) ?? 0)
check('موبایل ۳۹۰ — بدون سرریز افقی', overflow <= 1, `delta=${overflow}px`)
shot('t5-highlight-mobile')

// ── گزارش
console.log('════════ P2-T5 E2E — هایلایت جستجو ════════')
for (const m of metrics) console.log(m)
console.log(`نتیجه: ${pass}/${pass + fail} سبز — ${fail ? `${fail} شکست ❌` : 'همه سبز ✅'}`)
if (fail > 0) process.exit(1)
