/**
 * تست E2E «پیش‌نمایش کنار فهرست — Master-Detail» (P2.5-U4 — شکاف G5)
 *
 * معیار پذیرش U4: «در نمای نامه‌ها، پیمایش ۵ نامه با فقط کیبورد، بدون باز شدن تب جدید»
 *
 * پوشش:
 *   نامه‌ها (دسکتاپ) — کلیک ردیف → پنل باز (سوژه + متن + گردش)؛ کلیک ردیف دوم →
 *                      به‌روزرسانی؛ ↑↓×۴ با پنل باز = پیمایش ۵ نامه فقط با کیبورد
 *                      و «بدون تب جدید»؛ Space → پیش‌نمایش ردیف متمرکز؛ Esc → بستن
 *   «باز کردن کامل»  — همان رفتار قبلی: تب رکورد باز می‌شود
 *   ماندگاری        — پنل باز → reload → همچنان باز (io.ui.v1 pv:letters)
 *   اسناد انبار     — کلیک ردیف → پنل با اقلام؛ باز کردن کامل
 *   درخواست‌ها      — کلیک کارت (دسکتاپ) → پنل؛ باز کردن کامل
 *   موبایل ۳۹۰px    — پنل رندر نمی‌شود؛ کلیک ردیف = تب رکورد (رفتار قبلی)؛ بدون سرریز
 *
 * نشست ایزوله «u4» (درس #۱۳) + پاکسازی io.ui.v1 در ابتدا و انتها.
 */
import { ab, ev, loginSession, wait } from './e2e-golden-helpers'

const SESSION = 'u4'
const OUT = '/home/z/my-project/download/qa-p2.5-u4'
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

/** شمار تب‌های کاری (فقط تب فهرست باید بماند — پنل نباید تب بسازد)
 *  U5: فقط نوار «تب‌های کاری» شمرده می‌شود — تب‌های داخلی صفحه رکورد (U5/U10) نباید
 *  در این شمار بیایند (درس U5: شمارش سراسری [role=tab] با innerTabs صفحه درخواست تداخل کرد) */
function tabCount(): number {
  return Number(evS(`document.querySelectorAll('[role=tablist][aria-label="تب‌های کاری"] [role=tab]').length`) ?? -1)
}

/** متن پنل پیش‌نمایش */
function panelText(): string {
  return String(evS(`(function(){ const p = document.querySelector('[data-preview-panel]'); return p ? p.innerText : '' })()`) ?? '')
}

/**
 * P2.5-U9 — پنل پیش‌فرض دسکتاپ حالا «نیم‌صفحه» است (رکورد کامل)؛
 * سنجه‌های U4 حالت «باریک» (خلاصه فقط-خواندنی) را می‌سنجند → سوییچ می‌کنیم.
 * خودِ سوییچ سگمنت هم سنجه‌ای U9 است (تعامل پایدار UI).
 */
function switchNarrow(): boolean {
  const r = String(evS(`(function(){ const b = document.querySelector('[data-preview-panel] [role=group] button[aria-label="پنل باریک"]'); if (!b) return 'no-btn'; b.click(); return 'ok' })()`) ?? '')
  if (r !== 'ok') return false
  // رندر React ناهمگام است — poll کوتاه تا mode=narrow در DOM بنشیند
  for (let i = 0; i < 6; i++) {
    wait(300)
    const mode = String(evS(`(function(){ const p = document.querySelector('[data-preview-panel]'); return p ? (p.getAttribute('data-panel-mode') || '') : '' })()`) ?? '')
    if (mode === 'narrow') return true
  }
  return false
}

/** رویداد کیبورد واقعی روی ردیف متمرکز */
function keyOnFocusedRow(key: string, code = ''): string {
  return String(evS(`(function(){
    const el = document.activeElement
    if (!el || el.tagName !== 'TR') return 'no-focus(tr=' + (el ? el.tagName : 'null') + ')'
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', code: '${code}', bubbles: true, cancelable: true }))
    return 'ok'
  })()`) ?? '')
}

/** فوکوس دادن به ردیف n-ام جدول (idx ۰-مبا) */
function focusRow(idx: number): string {
  return String(evS(`(function(){ const rows = document.querySelectorAll('main table tbody tr[data-id]'); const r = rows[${idx}]; if (!r) return 'no-row(' + rows.length + ')'; r.focus(); return 'ok:' + (document.activeElement === r) })()`) ?? '')
}

// ═══════════════ بخش ۰ — راه‌اندازی ═══════════════
console.log('\n■ ۰) راه‌اندازی — نشست ایزوله u4 + پاکسازی io.ui.v1')
try { abS('close', 15000) } catch { /* مرورگر باز نبود */ }
abS(`open ${GW}/ --wait networkidle`, 90000)
wait(1500)
clearUiPrefs()
check('ورود dabir.arad (نشست ایزوله)', loginSession(SESSION, 'dabir.arad', '12345678'))
abS('set viewport 1440 900')
wait(1500)

// ═══════════════ بخش ۱ — نامه‌ها: کلیک → پنل؛ پیمایش کیبورد ═══════════════
console.log('\n■ ۱) نامه‌ها — کلیک ردیف = پیش‌نمایش (نه تب جدید)')
check('ناوبری به نامه‌ها', navTo('letters', 'Mail', 'نامه‌ها'))
wait(2500)

const tabs0 = tabCount()
check('یک تب باز است (فهرست نامه‌ها)', tabs0 >= 1, `tabs=${tabs0}`)

// کلیک ردیف اول → پنل
const click1 = String(evS(`(function(){ const r = document.querySelector('main table tbody tr[data-id]'); if (!r) return 'no-row'; r.click(); return 'clicked' })()`) ?? '')
wait(2200)
check('کلیک ردیف اول انجام شد', click1 === 'clicked', click1)
check('U9: پیش‌فرض پنل = نیم‌صفحه (رکورد کامل)', String(evS(`(function(){ const p = document.querySelector('[data-preview-panel]'); return p ? p.getAttribute('data-panel-mode') : '' })()`) ?? '') === 'half')
check('U9: سوییچ به باریک (سگمنت) کار کرد', switchNarrow())
wait(1200)
const panel1 = panelText()
check('پنل پیش‌نمایش باز شد', panel1.length > 0, panel1.slice(0, 60))
check('پنل: متن نامه در پیش‌نمایش هست', panel1.includes('متن نامه'), panel1.slice(0, 120))
check('پنل: دکمه «باز کردن کامل» هست', panel1.includes('باز کردن کامل'))
check('بدون تب جدید پس از کلیک', tabCount() === tabs0, `tabs=${tabCount()} vs ${tabs0}`)
const subject1 = String(evS(`(function(){ const t = document.querySelector('[data-preview-panel] .text-sm.font-bold'); return t ? t.innerText : '' })()`) ?? '')
shotS('01-letters-preview-open')

// کلیک ردیف دوم → به‌روزرسانی پنل
const click2 = String(evS(`(function(){ const rows = document.querySelectorAll('main table tbody tr[data-id]'); if (rows.length < 2) return 'no-row-2'; rows[1].click(); return 'clicked' })()`) ?? '')
wait(1800)
const subject2 = String(evS(`(function(){ const t = document.querySelector('[data-preview-panel] .text-sm.font-bold'); return t ? t.innerText : '' })()`) ?? '')
check('کلیک ردیف دوم → سوژه پنل عوض شد', click2 === 'clicked' && subject2 !== '' && subject2 !== subject1, `${subject1.slice(0, 24)} → ${subject2.slice(0, 24)}`)
check('همچنان بدون تب جدید', tabCount() === tabs0, `tabs=${tabCount()}`)

// ردیف در حال پیش‌نمایش هایلایت شده (data-preview-selected)
const highlighted = evS(`(function(){ const rows = document.querySelectorAll('main table tbody tr[data-id]'); return Array.from(rows).filter(r => r.hasAttribute('data-preview-selected')).length })()`) ?? 0
check('فقط ردیف پیش‌نمایش‌شده هایلایت است', Number(highlighted) === 1, `highlighted=${highlighted}`)

// ═══════════════ بخش ۲ — پیمایش ۵ نامه فقط با کیبورد (معیار پذیرش U4) ═══════════════
console.log('\n■ ۲) معیار پذیرش — پیمایش ۵ نامه با فقط کیبورد')
// از ردیف ۱ (اندیس ۰) شروع: فوکوس + Space (پیش‌نمایش ردیف ۱) سپس ۴× ↓ = ۵ نامه
check('فوکوس روی ردیف اول', focusRow(0).startsWith('ok'))
wait(300)
const sp = keyOnFocusedRow(' ', 'Space')
wait(1400)
check('Space روی ردیف → پیش‌نمایش', sp === 'ok' && panelText().length > 0, sp)

/** شناسه ردیف در حال پیش‌نمایش (هایلایت‌شده در جدول) */
function previewedRowId(): string {
  return String(evS(`(function(){ const r = document.querySelector('main table tbody tr[data-preview-selected]'); return r ? r.getAttribute('data-id') : '' })()`) ?? '')
}
function panelSubject(): string {
  return String(evS(`(function(){ const t = document.querySelector('[data-preview-panel] .text-sm.font-bold'); return t ? t.innerText : '' })()`) ?? '')
}

/** سوژه ستون موضوع همان ردیف هایلایت‌شده (تطابق Master-Detail) */
function gridSubjectOfHighlighted(): string {
  return String(evS(`(function(){ const r = document.querySelector('main table tbody tr[data-preview-selected]'); const p = r ? r.querySelector('p.truncate') : null; return p ? p.innerText : '' })()`) ?? '')
}

// سنجه = ۵ «شناسه ردیف» متمایز (سوژه‌ها در seed تکراری‌اند) + تطابق سوژه پنل با ردیف هایلایت
const visitedIds = new Set<string>([previewedRowId()])
let arrowsOk = 0
let subjectMatch = true
for (let i = 0; i < 4; i++) {
  const r = keyOnFocusedRow('ArrowDown', 'ArrowDown')
  wait(1300)
  if (r === 'ok') arrowsOk++
  else subjectMatch = false
  const id = previewedRowId()
  if (id) visitedIds.add(id)
  if (panelSubject() !== gridSubjectOfHighlighted()) subjectMatch = false
}
check('۴×↓ روی ردیف‌های متمرکز کار کرد', arrowsOk === 4, `arrowsOk=${arrowsOk}`)
check('پیمایش ۵ ردیف فقط با کیبورد (۵ شناسه متمایز)', visitedIds.size >= 5, `distinct ids=${visitedIds.size}`)
check('سوژه پنل در هر گام = سوژه ردیف هایلایت‌شده', subjectMatch)
check('هیچ تب جدیدی باز نشد (کل گام)', tabCount() === tabs0, `tabs=${tabCount()} vs ${tabs0}`)
shotS('02-letters-keyboard-nav')

// ↑ برگشت
const up = keyOnFocusedRow('ArrowUp', 'ArrowUp')
wait(1300)
check('↑ هم کار می‌کند (برگشت به رکورد قبلی)', up === 'ok', up)

// ═══════════════ بخش ۳ — Esc بستن پنل؛ «باز کردن کامل» تب می‌سازد ═══════════════
console.log('\n■ ۳) Esc و «باز کردن کامل»')
const esc = keyOnFocusedRow('Escape', 'Escape')
wait(900)
check('Esc → پنل بسته شد', esc === 'ok' && evS(`!document.querySelector('[data-preview-panel]')`) === true, esc)
check('Esc تب را نبست (تفکیک از میان‌بر بستن تب)', tabCount() === tabs0, `tabs=${tabCount()}`)

// باز کردن مجدد + باز کردن کامل
evS(`(function(){ const r = document.querySelector('main table tbody tr[data-id]'); if (r) r.click(); return true })()`)
wait(1800)
const openFull = String(evS(`(function(){ const b = Array.from(document.querySelectorAll('[data-preview-panel] button')).find(x => (x.getAttribute('aria-label') || x.innerText).includes('باز کردن کامل')); if (b) { b.click(); return 'ok' } return 'btn-not-found' })()`) ?? '')
wait(3000)
check('«باز کردن کامل» → تب رکورد باز شد', openFull === 'ok' && tabCount() === tabs0 + 1, `openFull=${openFull} tabs=${tabCount()}`)
const activeTab = String(evS(`(function(){ const t = Array.from(document.querySelectorAll('[role=tab]')).find(x => x.getAttribute('data-state') === 'active' || x.getAttribute('aria-selected') === 'true'); return t ? t.textContent.trim() : '' })()`) ?? '')
check('تب فعال = رکورد نامه (نه فهرست)', !activeTab.includes('نامه‌ها') || activeTab.includes('شماره') || activeTab.length > 12, activeTab.slice(0, 40))
shotS('03-open-full-record-tab')

// ═══════════════ بخش ۴ — ماندگاری پنل (io.ui.v1 pv:letters) ═══════════════
console.log('\n■ ۴) ماندگاری — reload با پنل باز')
check('بازگشت به فهرست نامه‌ها', navTo('letters', 'Mail', 'نامه‌ها'))
wait(2000)
// پنل پس از پاکسازی اولیه بسته بود؛ بازش می‌کنیم و reload می‌گیریم
evS(`(function(){ const r = document.querySelector('main table tbody tr[data-id]'); if (r) r.click(); return true })()`)
wait(1800)
check('پنل باز شد برای تست ماندگاری', evS(`!!document.querySelector('[data-preview-panel]')`) === true)
const storedPvRaw = evS(`(function(){ const k = Object.keys(window.localStorage).find(k => /^io\\.ui\\.v1:.*:pv:letters$/.test(k)); return k ? window.localStorage.getItem(k) : 'key-not-found' })()`)
// ev برای خروجی JSON رشته‌ای دوبار parse می‌کند — شیء آماده برمی‌گرداند (درس U3)
const storedPv = typeof storedPvRaw === 'object' && storedPvRaw !== null ? JSON.stringify(storedPvRaw) : String(storedPvRaw ?? '')
check('ترجیح پنل در io.ui.v1 ثبت شد (open=true)', storedPv.includes('open') && storedPv.includes('true'), storedPv.slice(0, 80))
check('reload نامه‌ها', navTo('letters', 'Mail', 'نامه‌ها'))
wait(2500)
check('پنل پس از reload همچنان باز است (خالی — بدون رکورد انتخابی)', evS(`!!document.querySelector('[data-preview-panel]')`) === true)
const emptyHint = panelText()
check('راهنمای «ردیفی انتخاب نشده» نمایش داده شد', emptyHint.includes('کلیک کنید') || emptyHint.includes('پیمایش'), emptyHint.slice(0, 80))
shotS('04-letters-persist-open')

// ═══════════════ بخش ۵ — اسناد انبار ═══════════════
console.log('\n■ ۵) اسناد انبار — پنل با اقلام')
check('ناوبری به اسناد انبار', navTo('whdocs', 'FileText', 'اسناد انبار'))
wait(2500)
const tabsW0 = tabCount()
const clickDoc = String(evS(`(function(){ const r = document.querySelector('main table tbody tr[data-id]'); if (!r) return 'no-row'; r.click(); return 'clicked' })()`) ?? '')
wait(2200)
check('U9: سوییچ سند به باریک (سگمنت)', switchNarrow())
wait(1200)
const panelW = panelText()
check('کلیک سند → پنل باز شد', clickDoc === 'clicked' && panelW.length > 0, `${clickDoc} | ${panelW.slice(0, 50)}`)
check('پنل سند: اقلام/جمع اقلام هست', panelW.includes('اقلام') || panelW.includes('مترمربع'), panelW.slice(0, 120))
check('پنل سند: باز کردن کامل هست', panelW.includes('باز کردن کامل'))
check('سند هم بدون تب جدید', tabCount() === tabsW0, `tabs=${tabCount()} vs ${tabsW0}`)
shotS('05-whdocs-preview')

// ═══════════════ بخش ۶ — درخواست‌ها (کارت‌ها) ═══════════════
console.log('\n■ ۶) درخواست‌ها — کلیک کارت = پیش‌نمایش (دسکتاپ)')
check('ناوبری به درخواست‌ها', navTo('requests', 'ClipboardList', 'درخواست کالا'))
wait(2500)
const tabsR0 = tabCount()
const clickReq = String(evS(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.className || '').includes('w-full text-start')); if (b) { b.click(); return 'clicked' } return 'card-not-found' })()`) ?? '')
wait(2200)
check('U9: سوییچ درخواست به باریک (سگمنت)', switchNarrow())
wait(1200)
const panelR = panelText()
check('کلیک کارت درخواست → پنل باز شد', clickReq === 'clicked' && panelR.length > 0, `${clickReq} | ${panelR.slice(0, 50)}`)
check('پنل درخواست: متقاضی/اقلام هست', panelR.includes('متقاضی') || panelR.includes('اقلام درخواست'), panelR.slice(0, 120))
check('درخواست هم بدون تب جدید', tabCount() === tabsR0, `tabs=${tabCount()} vs ${tabsR0}`)
const openFullR = String(evS(`(function(){ const b = Array.from(document.querySelectorAll('[data-preview-panel] button')).find(x => (x.getAttribute('aria-label') || x.innerText).includes('باز کردن کامل')); if (b) { b.click(); return 'ok' } return 'btn-not-found' })()`) ?? '')
wait(3000)
check('«باز کردن کامل» درخواست → تب رکورد', openFullR === 'ok' && tabCount() === tabsR0 + 1, `openFullR=${openFullR} tabs=${tabCount()}`)
shotS('06-requests-preview')

// ═══════════════ بخش ۷ — موبایل ۳۹۰px: رفتار قبلی (تب مستقیم) ═══════════════
console.log('\n■ ۷) موبایل ۳۹۰px — بدون پنل؛ کلیک = تب رکورد')
abS('set viewport 390 844')
wait(900)
check('ناوبری به نامه‌ها (موبایل)', navTo('letters', 'Mail', 'نامه‌ها'))
wait(2500)
const tabsM0 = tabCount()
const clickM = String(evS(`(function(){ const r = document.querySelector('main table tbody tr[data-id]'); if (!r) return 'no-row'; r.click(); return 'clicked' })()`) ?? '')
wait(2800)
check('موبایل: پنل رندر نشد', evS(`!document.querySelector('[data-preview-panel]')`) === true)
check('موبایل: کلیک ردیف = تب رکورد باز شد (رفتار قبلی)', clickM === 'clicked' && tabCount() === tabsM0 + 1, `click=${clickM} tabs=${tabCount()} vs ${tabsM0}`)
const noOverflow = evS(`document.documentElement.scrollWidth <= window.innerWidth + 1`) === true
check('موبایل: بدون سرریز افقی', noOverflow)
shotS('07-mobile-390-no-panel')

// ═══════════════ پاکسازی و جمع‌بندی ═══════════════
abS('set viewport 1440 900', 15000)
try { abS('close', 15000) } catch { /* بی‌صدا */ }

console.log(`\n═══ نتیجه U4: ${pass} ✓ / ${fail} ✗ ═══`)
if (failures.length > 0) {
  console.log('شکست‌ها:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
process.exit(0)
