/**
 * تست E2E «صفحه رکورد در نیم‌صفحه — FCL نسل ۲» (P2.5-U9 — پژوهش ۰۲ §۳-ت۱، §۴-B #۸..#۱۰)
 *
 * معیار پذیرش U9: «کلیک ردیف سند انبار در ۱۹۲۰px → لیست زنده می‌ماند + رکورد کامل
 * (اقلام/جمع/اقدامات) در ~۵۰٪ عرض؛ تغییر سطح عرض → ماندگار پس از refresh؛
 * موبایل ۳۹۰px رفتار قبلی»
 *
 * پوشش:
 *   اسناد انبار (دسکتاپ ۱۹۲۰) — پیش‌فرض نیم‌صفحه؛ عرض ~۵۰٪؛ لیست زنده؛ جهت RTL
 *      (جدول راست/پنل چپ)؛ رکورد کامل (شناسنامه/اقلام/جمع/اقدامات DRAFT/تب داخلی)؛
 *      سگمنت باریک↔نیم؛ ردیف دوم = به‌روزرسانی؛ کیبورد Space/↓ بدون تب؛
 *      Ctrl+Enter = تمام‌صفحه (تب)
 *   ماندگاری      — mode+open در io.ui.v1 pv:whdocs → reload → همان سطح عرض
 *   نامه‌ها       — رکورد کامل در پنل (نوار وضعیت/تب داخلی متن/شناسنامه)؛
 *                   حالت باریک + «باز کردن کامل» = تب
 *   درخواست‌ها    — کارت → پنل نیم = صفحه رکورد کامل
 *   موبایل ۳۹۰px  — بدون پنل؛ کلیک = تب رکورد (رفتار قبلی)؛ بدون سرریز
 *
 * نشست ایزوله «u9» (درس #۱۳) + پاکسازی io.ui.v1 در ابتدا و انتها.
 */
import { ab, ev, loginSession, wait } from './e2e-golden-helpers'

const SESSION = 'u9'
const OUT = '/home/z/my-project/download/qa-p2.5-u9'
const GW = 'http://localhost:81'

let pass = 0
let fail = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`) }
  else { fail += 1; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function abS(cmd: string, timeoutMs = 45000): string {
  return ab(`--session ${SESSION} ${cmd}`, timeoutMs)
}

function evS(js: string): unknown {
  return ev(js, SESSION)
}

function shotS(name: string): string {
  const r = abS(`screenshot ${OUT}/${name}.png`)
  return r.includes('✓') ? 'ok' : `fail(${r.slice(0, 60)})`
}

function clearUiPrefs(): void {
  evS(`(function(){ let n = 0; for (const k of Object.keys(window.localStorage)) { if (k.startsWith('io.ui.v1')) { window.localStorage.removeItem(k); n += 1 } } return n })()`)
}

/** ناوبری قطعی با تزریق sessionStorage (الگوی helpers) */
function navTo(viewKey: string, icon = 'LayoutDashboard', label = ''): boolean {
  evS(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:${viewKey}', kind: 'list', viewKey: '${viewKey}', title: '${label || viewKey}', icon: '${icon}' }], activeTabId: 'list:${viewKey}' })); return true })()`)
  for (let i = 0; i < 3; i++) {
    abS(`open ${GW}/ --wait networkidle`, 90000)
    wait(3200)
    if (evS(`location.href.startsWith('http')`) === true) break
  }
  return String(evS(`document.querySelector('main')?.innerText.length ?? 0`) ?? '') !== '0'
}

/** شمار تب‌های کاری نوار بالا (درس U5: فقط نوار «تب‌های کاری») */
function tabCount(): number {
  return Number(evS(`document.querySelectorAll('[role=tablist][aria-label="تب‌های کاری"] [role=tab]').length`) ?? -1)
}

function panelText(): string {
  return String(evS(`(function(){ const p = document.querySelector('[data-preview-panel]'); return p ? p.innerText : '' })()`) ?? '')
}

function paneMode(): string {
  return String(evS(`(function(){ const p = document.querySelector('[data-preview-panel]'); return p ? (p.getAttribute('data-panel-mode') || 'none') : 'no-panel' })()`) ?? '')
}

/** هندسه پنل/جدول — عرض، نسبت ~۵۰٪، جهت RTL (پنل چپ/جدول راست) */
function paneGeo(): { paneW: number; tableW: number; paneX: number; tableX: number } {
  const g = evS(`(function(){ const p = document.querySelector('[data-preview-panel]'); const t = document.querySelector('main table'); if (!p || !t) return null; const pr = p.getBoundingClientRect(); const tr = t.getBoundingClientRect(); return JSON.stringify({ paneW: Math.round(pr.width), tableW: Math.round(tr.width), paneX: Math.round(pr.x), tableX: Math.round(tr.x) }) })()`)
  // درس U3 (بازتولید U9): ev خروجی JSON رشته‌ای را دوبار parse می‌کند → شیء آماده
  if (g && typeof g === 'object') return g as { paneW: number; tableW: number; paneX: number; tableX: number }
  if (typeof g === 'string' && g.length > 2) { try { return JSON.parse(g) } catch { /* */ } }
  return { paneW: -1, tableW: -1, paneX: -1, tableX: -1 }
}

/** کلیک روی دکمه سگمنت پنل (باریک/نیم) با راستی‌آزمایی pollشده */
function switchMode(label: 'پنل باریک' | 'نیم‌صفحه', expect: 'narrow' | 'half'): boolean {
  const r = String(evS(`(function(){ const b = document.querySelector('[data-preview-panel] [role=group] button[aria-label="${label}"]'); if (!b) return 'no-btn'; b.click(); return 'ok' })()`) ?? '')
  if (r !== 'ok') return false
  for (let i = 0; i < 8; i++) {
    wait(300)
    if (paneMode() === expect) return true
  }
  return false
}

function focusRow(idx: number): string {
  return String(evS(`(function(){ const rows = document.querySelectorAll('main table tbody tr[data-id]'); const r = rows[${idx}]; if (!r) return 'no-row(' + rows.length + ')'; r.focus(); return 'ok:' + (document.activeElement === r) })()`) ?? '')
}

function keyOnFocusedRow(key: string, code = '', ctrl = false): string {
  return String(evS(`(function(){
    const el = document.activeElement
    if (!el || el.tagName !== 'TR') return 'no-focus(tr=' + (el ? el.tagName : 'null') + ')'
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', code: '${code}', ctrlKey: ${ctrl}, bubbles: true, cancelable: true }))
    return 'ok'
  })()`) ?? '')
}

// ═══════════════ بخش ۰ — راه‌اندازی ═══════════════
console.log('\n■ ۰) راه‌اندازی — نشست ایزوله u9 + پاکسازی io.ui.v1')
try { abS('close', 15000) } catch { /* مرورگر باز نبود */ }
abS(`open ${GW}/ --wait networkidle`, 90000)
wait(1500)
clearUiPrefs()
check('ورود anbar.arad (انبار‌دار — مجاز ثبت سند)', loginSession(SESSION, 'anbar.arad', '12345678'))
abS('set viewport 1920 1080')
wait(1500)

// ═══════════════ بخش ۱ — اسناد انبار: معیار پذیرش U9 ═══════════════
console.log('\n■ ۱) اسناد انبار ۱۹۲۰px — کلیک ردیف = نیم‌صفحه رکورد کامل')
check('ناوبری به اسناد انبار', navTo('whdocs', 'FileText', 'اسناد انبار'))
wait(2500)
const tabs0 = tabCount()
check('یک تب باز است (فهرست اسناد)', tabs0 >= 1, `tabs=${tabs0}`)

const click1 = String(evS(`(function(){ const r = document.querySelector('main table tbody tr[data-id]'); if (!r) return 'no-row'; r.click(); return 'clicked' })()`) ?? '')
wait(2500)
check('کلیک ردیف اول انجام شد', click1 === 'clicked', click1)
check('پنل باز شد در حالت نیم‌صفحه (پیش‌فرض U9)', paneMode() === 'half', paneMode())

const g1 = paneGeo()
const total = g1.paneW + g1.tableW
check('عرض پنل ≈ نصف قاب (~۵۰٪)', total > 0 && g1.paneW / total >= 0.44 && g1.paneW / total <= 0.58, `pane=${g1.paneW} table=${g1.tableW} ratio=${total > 0 ? (g1.paneW / total).toFixed(2) : 'n/a'}`)
check('جهت RTL: پنل چپ، جدول راست (#۱۰ پژوهش ۰۲)', g1.paneX >= 0 && g1.tableX > g1.paneX, `paneX=${g1.paneX} tableX=${g1.tableX}`)
check('لیست زنده می‌ماند (جدول ≥۱۰ ردیف)', Number(evS(`document.querySelectorAll('main table tbody tr[data-id]').length`) ?? 0) >= 10)
const p1 = panelText()
check('رکورد کامل در پنل: شناسنامه (نوع/انبار/شرکت)', p1.includes('نوع سند') && p1.includes('انبار'), p1.slice(0, 100))
check('رکورد کامل در پنل: جدول اقلام + جمع', p1.includes('مترمربع') && p1.includes('جمع سند'), p1.slice(0, 100))
check('رکورد کامل در پنل: تب داخلی خط زمان (U5 هم در قاب)', p1.includes('خط زمان') || p1.includes('اقلام ('))
check('بدون تب جدید (کلیک = پنل، نه تب)', tabCount() === tabs0, `tabs=${tabCount()} vs ${tabs0}`)
shotS('01-whdocs-half-default')

// ═══════════════ بخش ۱-ب — اقدامات DRAFT در قاب + ردیف دوم ═══════════════
console.log('\n■ ۱-ب) اقدامات رکورد در قاب + به‌روزرسانی با ردیف دوم')
// یافتن سند DRAFT (دکمه «قطعی‌سازی» فقط برای DRAFT+canWrite رندر می‌شود)
let draftFound = false
for (let i = 0; i < 6 && !draftFound; i++) {
  evS(`(function(){ const rows = document.querySelectorAll('main table tbody tr[data-id]'); if (rows[${i}]) rows[${i}].click(); return true })()`)
  wait(1600)
  if (panelText().includes('قطعی‌سازی')) draftFound = true
}
check('اقدامات رکورد در قاب: دکمه «قطعی‌سازی» برای سند DRAFT', draftFound)
if (draftFound) shotS('02-whdocs-half-actions')

// سند POSTED → دکمه اقدام نیست (یافتن قطعی: ردیفی با وضعیت «قطعی»، نه فرضِ ردیف آخر —
// داده وابسته است: رگرسیون‌های هم‌روز اسناد DRAFT تازه می‌سازند و مرز صفحه ۳۰تایی جابه‌جا می‌شود)
let postedClicked = false
for (let i = 0; i < 12 && !postedClicked; i++) {
  const isPosted = String(evS(`(function(){ const rows = document.querySelectorAll('main table tbody tr[data-id]'); return rows[${i}] ? (rows[${i}].innerText.includes('قطعی') && !rows[${i}].innerText.includes('پیش‌نویس')) : 'end' })()`) ?? '')
  if (isPosted === 'end') break
  if (isPosted !== 'true') continue
  evS(`(function(){ const rows = document.querySelectorAll('main table tbody tr[data-id]'); if (rows[${i}]) rows[${i}].click(); return true })()`)
  wait(1800)
  postedClicked = true
}
const p2 = panelText()
check('سند POSTED در قاب: بدون دکمه اقدام (رفتار شرطی واقعی)', postedClicked && !p2.includes('قطعی‌سازی'), postedClicked ? 'ردیف قطعی پیدا شد' : 'no-posted-row')
const title1 = String(evS(`(function(){ const t = document.querySelector('[data-preview-panel] .text-sm.font-bold'); return t ? t.innerText : '' })()`) ?? '')
const row1title = String(evS(`(function(){ const r = document.querySelector('main table tbody tr[data-id]'); return r ? r.innerText : '' })()`) ?? '')
check('عنوان پنل = سند انتخاب‌شده (نه ردیف قبلی)', title1.length > 0 && row1title.includes(title1.split('·')[0].trim().split(' ')[0] || 'سند'), `title=${title1.slice(0, 30)}`)

// ═══════════════ بخش ۱-ج — سگمنت سطح عرض ═══════════════
console.log('\n■ ۱-ج) سگمنت سه‌سطحی — باریک ↔ نیم')
check('سوییچ به باریک (سگمنت)', switchMode('پنل باریک', 'narrow'))
wait(1000)
const g2 = paneGeo()
check('حالت باریک: عرض ۳۲۰–۵۶۰ (درگ U4 پابرجا)', g2.paneW >= 320 && g2.paneW <= 560, `paneW=${g2.paneW}`)
const pNarrow = panelText()
check('حالت باریک: خلاصه فقط-خواندنی (بدون تب داخلی خط زمان)', pNarrow.length > 0 && !pNarrow.includes('خط زمان اقدامات'), pNarrow.slice(0, 60))
check('حالت باریک: دکمه «باز کردن کامل» در فوتر', pNarrow.includes('باز کردن کامل'))
shotS('03-whdocs-narrow-segment')

check('سوییچ برگشت به نیم (سگمنت)', switchMode('نیم‌صفحه', 'half'))
wait(1200)
const g3 = paneGeo()
check('برگشت به نیم: عرض ~۵۰٪ دوباره', g3.paneW > 0 && g3.paneW / (g3.paneW + g3.tableW) >= 0.44, `pane=${g3.paneW} table=${g3.tableW}`)

// ═══════════════ بخش ۱-د — کیبورد در حالت نیم ═══════════════
console.log('\n■ ۱-د) کیبورد — Space/↓ پیمایش زنده در نیم‌صفحه؛ Ctrl+Enter تمام‌صفحه')
check('فوکوس روی ردیف اول', focusRow(0).startsWith('ok'))
wait(300)
const sp = keyOnFocusedRow(' ', 'Space')
wait(1500)
check('Space روی ردیف → رکورد در نیم‌پنل', sp === 'ok' && paneMode() === 'half', sp)
const down = keyOnFocusedRow('ArrowDown', 'ArrowDown')
wait(1500)
check('↓ → رکورد بعدی در نیم‌پنل (پیمایش زنده)', down === 'ok' && panelText().includes('مترمربع'), down)
check('همچنان بدون تب جدید', tabCount() === tabs0, `tabs=${tabCount()} vs ${tabs0}`)

// Ctrl+Enter = تمام‌صفحه
const ce = keyOnFocusedRow('Enter', 'Enter', true)
wait(3000)
check('Ctrl+Enter → تب رکورد باز شد (تمام‌صفحه)', ce === 'ok' && tabCount() === tabs0 + 1, `ce=${ce} tabs=${tabCount()} vs ${tabs0}`)
const activeTitle = String(evS(`(function(){ const t = Array.from(document.querySelectorAll('[role=tablist][aria-label="تب‌های کاری"] [role=tab]')).find(x => x.getAttribute('data-state') === 'active' || x.getAttribute('aria-selected') === 'true'); return t ? t.textContent.trim() : '' })()`) ?? '')
check('تب فعال = رکورد سند (نه فهرست)', !activeTitle.includes('اسناد انبار'), activeTitle.slice(0, 40))
shotS('04-ctrl-enter-full-tab')

// ═══════════════ بخش ۲ — ماندگاری سطح عرض پس از refresh ═══════════════
console.log('\n■ ۲) ماندگاری — mode+open در io.ui.v1 (معیار «تغییر سطح عرض → ماندگار»)')
check('بازگشت به فهرست اسناد', navTo('whdocs', 'FileText', 'اسناد انبار'))
wait(2200)
// پنل از قبل باز است (pv:whdocs open=true) اما رکوردی انتخاب نیست (mount تازه) → کلیک ردیف
evS(`(function(){ const r = document.querySelector('main table tbody tr[data-id]'); if (r) r.click(); return true })()`)
wait(2000)
const pvRaw = evS(`(function(){ const k = Object.keys(window.localStorage).find(k => /^io\\.ui\\.v1:.*:pv:whdocs$/.test(k)); return k ? window.localStorage.getItem(k) : 'key-not-found' })()`)
const pvStr = typeof pvRaw === 'object' && pvRaw !== null ? JSON.stringify(pvRaw) : String(pvRaw ?? '')
check('ترجیح pv:whdocs ثبت شد (open+mode)', pvStr.includes('"open"') && pvStr.includes('half'), pvStr.slice(0, 80))
check('reload اسناد انبار', navTo('whdocs', 'FileText', 'اسناد انبار'))
wait(2800)
check('پس از reload: پنل باز ماند', evS(`!!document.querySelector('[data-preview-panel]')`) === true)
check('پس از reload: حالت نیم ماند (سطح عرض ماندگار)', paneMode() === 'half', paneMode())

// رفع باگ کشف‌شده U9: پنل باز + بدون رکورد انتخابی (وضعیت بازیابی‌شده) + Esc
// → باید پنل بسته شود، نه تب فعال (پیش‌تر Esc به میان‌بر سراسری می‌رسید)
focusRow(0)
wait(300)
const escEmpty = keyOnFocusedRow('Escape', 'Escape')
wait(1200)
check('Esc با پنلِ باز بدون رکورد → پنل بسته شد (رفع باگ U9)', escEmpty === 'ok' && evS(`!document.querySelector('[data-preview-panel]')`) === true, escEmpty)
check('Esc تب فهرست را نبست (رفع باگ U9 — لایه بالایی اول بسته می‌شود)', tabCount() === tabs0, `tabs=${tabCount()} vs ${tabs0}`)

// رکورد انتخاب می‌کنیم — سنجه عرض پس از reload
evS(`(function(){ const r = document.querySelector('main table tbody tr[data-id]'); if (r) r.click(); return true })()`)
wait(2000)
const g4 = paneGeo()
check('پس از reload: عرض ~۵۰٪ ماند', g4.paneW > 0 && g4.tableW > 0 && g4.paneW / (g4.paneW + g4.tableW) >= 0.44, `pane=${g4.paneW} table=${g4.tableW} ratio=${g4.paneW > 0 ? (g4.paneW / (g4.paneW + g4.tableW)).toFixed(2) : 'n/a'}`)
shotS('05-whdocs-persist-half')

// Esc در حالت نیم → بستن پنل (نه تب)
focusRow(0)
wait(300)
const esc = keyOnFocusedRow('Escape', 'Escape')
wait(1000)
check('Esc → پنل بسته شد (در حالت نیم هم)', esc === 'ok' && evS(`!document.querySelector('[data-preview-panel]')`) === true, esc)
check('Esc تب را نبست', tabCount() === tabs0, `tabs=${tabCount()} vs ${tabs0}`)

// ═══════════════ بخش ۳ — نامه‌ها: رکورد کامل در نیم‌پنل ═══════════════
console.log('\n■ ۳) نامه‌ها — صفحه رکورد کامل در نیم‌پنل (یک کد، دو قاب)')
check('ناوبری به نامه‌ها', navTo('letters', 'Mail', 'نامه‌ها'))
wait(2500)
const tabsL0 = tabCount()
const clickL = String(evS(`(function(){ const r = document.querySelector('main table tbody tr[data-id]'); if (!r) return 'no-row'; r.click(); return 'clicked' })()`) ?? '')
wait(2500)
check('کلیک نامه → نیم‌پنل (پیش‌فرض)', clickL === 'clicked' && paneMode() === 'half', paneMode())
const pL = panelText()
check('رکورد کامل نامه در پنل: نوار وضعیت (ثبت/در جریان/بایگانی)', pL.includes('ثبت') && pL.includes('بایگانی'), pL.slice(0, 80))
check('رکورد کامل نامه در پنل: تب داخلی (متن/گردش/پیوست)', pL.includes('متن و اقدام') && pL.includes('گردش'), pL.slice(0, 80))
check('رکورد کامل نامه در پنل: شناسنامه (تاریخ ثبت/شرکت)', pL.includes('تاریخ ثبت') || pL.includes('شرکت'), pL.slice(0, 80))
check('بدون بردکرامب در قاب (فهرست کنار است)', !pL.includes('بازگشت به'))
check('بدون تب جدید', tabCount() === tabsL0, `tabs=${tabCount()} vs ${tabsL0}`)
shotS('06-letters-half-record')

// حالت باریک + باز کردن کامل = تب رکورد
check('سوییچ نامه به باریک', switchMode('پنل باریک', 'narrow'))
wait(1000)
const pLN = panelText()
check('حالت باریک نامه: خلاصه با متن نامه', pLN.includes('متن نامه') || pLN.includes('متن'), pLN.slice(0, 60))
const openFullL = String(evS(`(function(){ const b = Array.from(document.querySelectorAll('[data-preview-panel] button')).find(x => (x.getAttribute('aria-label') || x.innerText).includes('باز کردن کامل')); if (b) { b.click(); return 'ok' } return 'btn-not-found' })()`) ?? '')
wait(3000)
check('«باز کردن کامل» نامه → تب رکورد', openFullL === 'ok' && tabCount() === tabsL0 + 1, `openFull=${openFullL} tabs=${tabCount()}`)

// ═══════════════ بخش ۴ — درخواست‌ها (کارت) ═══════════════
console.log('\n■ ۴) درخواست‌ها — کارت → نیم‌پنل صفحه رکورد کامل')
check('ناوبری به درخواست‌ها', navTo('requests', 'ClipboardList', 'درخواست کالا'))
wait(2500)
const tabsR0 = tabCount()
const clickR = String(evS(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.className || '').includes('w-full text-start')); if (b) { b.click(); return 'clicked' } return 'card-not-found' })()`) ?? '')
wait(2500)
check('کلیک کارت درخواست → نیم‌پنل', clickR === 'clicked' && paneMode() === 'half', paneMode())
const pR = panelText()
check('رکورد کامل درخواست در پنل (متقاضی/شناسنامه)', pR.includes('متقاضی') || pR.includes('اقلام درخواست') || pR.includes('انبار'), pR.slice(0, 80))
check('درخواست: تب داخلی خط زمان در قاب', pR.includes('خط زمان') || pR.includes('اقلام ('))
check('درخواست هم بدون تب جدید', tabCount() === tabsR0, `tabs=${tabCount()} vs ${tabsR0}`)
shotS('07-requests-half-record')

// ═══════════════ بخش ۵ — موبایل ۳۹۰px: رفتار قبلی ═══════════════
console.log('\n■ ۵) موبایل ۳۹۰px — بدون پنل؛ کلیک = تب رکورد (رفتار قبلی)')
abS('set viewport 390 844')
wait(900)
check('ناوبری به اسناد انبار (موبایل)', navTo('whdocs', 'FileText', 'اسناد انبار'))
wait(2500)
const tabsM0 = tabCount()
const clickM = String(evS(`(function(){ const r = document.querySelector('main table tbody tr[data-id]'); if (!r) return 'no-row'; r.click(); return 'clicked' })()`) ?? '')
wait(2800)
check('موبایل: پنل رندر نشد (رفتار قبلی)', evS(`!document.querySelector('[data-preview-panel]')`) === true)
check('موبایل: کلیک ردیف = تب رکورد باز شد', clickM === 'clicked' && tabCount() === tabsM0 + 1, `click=${clickM} tabs=${tabCount()} vs ${tabsM0}`)
const noOverflow = evS(`document.documentElement.scrollWidth <= window.innerWidth + 1`) === true
check('موبایل: بدون سرریز افقی', noOverflow)
shotS('08-mobile-390-no-panel')

// ═══════════════ پاکسازی و جمع‌بندی ═══════════════
abS('set viewport 1920 1080', 15000)
clearUiPrefs()
try { abS('close', 15000) } catch { /* بی‌صدا */ }

console.log(`\n═══ نتیجه U9: ${pass} ✓ / ${fail} ✗ ═══`)
if (failures.length > 0) {
  console.log('شکست‌ها:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
process.exit(0)
