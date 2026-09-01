/**
 * تست E2E «شخصی‌سازی ماندگار» (P2.5-U3 — G4 + N2 + D7)
 *
 * پوشش (معیار پذیرش U3: «تغییر ستون‌ها → refresh → همان تنظیمات»):
 *   ستون‌ها   — مخفی‌سازی «دارنده فعلی» در نامه‌ها → reload → همان چیدمان؛
 *              ایزولاسیون per-view (موجودی دست‌نخورده)؛ «بازنشانی به پیش‌فرض»
 *   سکشن     — بستن «پیوست‌ها» در فرم نامه → reload → همچنان بسته؛ بازگشایی
 *   پین نما   — پین «دفتر مکاتبات» → «دسترسی سریع» → reload → ماندگار → برداشتن پین
 *   داشبورد  — بازه ۹۰ روز (D7) → روند نامه + دلتا → reload → همان بازه؛ بازگشت به ۳۰
 *   موبایل   — چیپ‌های بازه در ۳۹۰px بدون سرریز افقی
 *
 * نشست ایزوله «u3» (درس #۱۳: سشن پیش‌فرض بین agentها مشترک است — localStorage
 * شخصی‌سازی نباید به رگرسیون‌های دیگر نشت کند) + پاکسازی io.ui.v1 در ابتدا و انتها.
 */
import { ab, ev, loginSession, wait } from './e2e-golden-helpers'

const SESSION = 'u3'
const OUT = '/home/z/my-project/download/qa-p2.5-u3'
const GW = 'http://localhost:81'

let pass = 0
let fail = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`) }
  else { fail += 1; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** فرمان agent-browser روی نشست ایزوله */
function abS(cmd: string, timeoutMs = 45000): string {
  return ab(`--session ${SESSION} ${cmd}`, timeoutMs)
}

/** اجرای JS در صفحه نشست ایزوله */
function evS(js: string): unknown {
  return ev(js, SESSION)
}

function shotS(name: string): string {
  const r = abS(`screenshot ${OUT}/${name}.png`)
  return r.includes('✓') ? 'ok' : `fail(${r.slice(0, 60)})`
}

/** پاک‌سازی همه ترجیحات io.ui.v1 (قبل/بعد تست) */
function clearUiPrefs(): void {
  evS(`(function(){ let n = 0; for (const k of Object.keys(window.localStorage)) { if (k.startsWith('io.ui.v1')) { window.localStorage.removeItem(k); n += 1 } } return n })()`)
}

/** ناوبری قطعی (الگوی navigate در helpers — تزریق sessionStorage + ریشه) روی نشست ایزوله */
function navTo(viewKey: string, expectText?: string): boolean {
  const icons: Record<string, string> = {
    dashboard: 'LayoutDashboard', letters: 'Mail', stock: 'Boxes',
  }
  const labels: Record<string, string> = { dashboard: 'داشبورد', letters: 'نامه‌ها', stock: 'موجودی انبار' }
  const icon = icons[viewKey] ?? 'LayoutDashboard'
  const label = labels[viewKey] ?? viewKey
  evS(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:${viewKey}', kind: 'list', viewKey: '${viewKey}', title: '${label}', icon: '${icon}' }], activeTabId: 'list:${viewKey}' })); return true })()`)
  for (let i = 0; i < 3; i++) {
    abS(`open ${GW}/ --wait networkidle`, 90000)
    wait(3200)
    if (evS(`location.href.startsWith('http')`) === true) break
  }
  const main = String(evS(`document.querySelector('main')?.innerText ?? ''`) ?? '')
  return expectText ? main.includes(expectText) : main.length > 0
}

/** سرستون‌های جدول فعال — ev برای رشته‌های JSON خودش دوبار parse می‌کند (آرایه آماده) */
function gridHeaders(): string[] {
  const r = evS(`JSON.stringify([...document.querySelectorAll('main table thead th')].map(th => (th.innerText || th.getAttribute('aria-label') || '').trim()))`)
  if (Array.isArray(r)) return r.map(String)
  try {
    const p = JSON.parse(String(r))
    return Array.isArray(p) ? p.map(String) : []
  } catch { return [] }
}

/** خواندن مقدار خام یک کلید io.ui.v1 — خروجی ev ممکن است object آماده باشد */
function rawUiKey(pattern: string): string {
  const r = evS(`(function(){ const k = Object.keys(window.localStorage).find(k => ${pattern}.test(k)); return k ? window.localStorage.getItem(k) : 'key-not-found' })()`)
  if (typeof r === 'object' && r !== null) return JSON.stringify(r)
  return String(r ?? '')
}

/** آیا کلیدی مطابق الگو اصلاً وجود دارد؟ */
function uiKeyExists(pattern: string): boolean {
  return evS(`(function(){ return Object.keys(window.localStorage).some(k => ${pattern}.test(k)) })()`) === true
}

/** باز کردن منوی چیدمان ستون‌ها (درس U2: رادیکس با pointerdown باز می‌شود) */
function openColumnsMenu(): string {
  return String(evS(`(function(){
    const b = document.querySelector('main button[aria-label="چیدمان ستون‌ها"]')
    if (!b) return 'btn-not-found'
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0 }))
    b.click()
    return 'ok'
  })()`) ?? '')
}

/** کلیک روی آیتم منو (menuitem / menuitemcheckbox) با متن داده‌شده */
function clickMenuItem(text: string, role: 'menuitem' | 'menuitemcheckbox' = 'menuitemcheckbox'): string {
  return String(evS(`(function(){
    const items = Array.from(document.querySelectorAll('[role=${role}]'))
    const it = items.find(i => (i.textContent || '').includes('${text}'))
    if (!it) return 'item-not-found(' + items.length + ')'
    it.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0 }))
    it.click()
    return 'ok'
  })()`) ?? '')
}

// ═══════════════ بخش ۰ — راه‌اندازی نشست ایزوله ═══════════════
console.log('\n■ ۰) راه‌اندازی — نشست ایزوله u3 + پاک‌سازی io.ui.v1')
try { abS('close', 15000) } catch { /* مرورگر باز نبود */ }
abS(`open ${GW}/ --wait networkidle`, 90000)
wait(1500)
clearUiPrefs()
check('ورود admin (نشست ایزوله)', loginSession(SESSION, 'admin', 'admin123'))
abS('set viewport 1920 1080')
wait(1500)

// ═══════════════ بخش ۱ — ماندگاری چیدمان ستون‌ها ═══════════════
console.log('\n■ ۱) ستون‌ها — مخفی‌سازی در نامه‌ها، ماندگاری پس از reload')
check('ناوبری به دفتر مکاتبات', navTo('letters', 'اتوماسیون'))
wait(2500)
const headers1 = gridHeaders()
check('ستون «دارنده فعلی» پیش‌فرض نمایان است', headers1.some((h) => h.includes('دارنده فعلی')), headers1.join(' | '))

check('باز کردن منوی چیدمان ستون‌ها', openColumnsMenu() === 'ok')
wait(900)
check('برداشتن تیک «دارنده فعلی»', clickMenuItem('دارنده فعلی') === 'ok')
wait(900)
const headers2 = gridHeaders()
check('ستون بلافاصله مخفی شد', !headers2.some((h) => h.includes('دارنده فعلی')), headers2.join(' | '))
const storedCols = rawUiKey('/^io\\.ui\\.v1:.*:cols:letters$/')
check('چیدمان در io.ui.v1 ثبت شد (کلید hidden)', storedCols.includes('holder'), storedCols.slice(0, 80))
shotS('01-letters-col-hidden')

// reload → همان چیدمان (معیار پذیرش U3)
check('reload نامه‌ها', navTo('letters', 'اتوماسیون'))
wait(2500)
const headers3 = gridHeaders()
check('ماندگاری پس از refresh — «دارنده فعلی» همچنان مخفی', !headers3.some((h) => h.includes('دارنده فعلی')), headers3.join(' | '))

// ایزولاسیون per-view: موجودی دست‌نخورده
check('ناوبری به موجودی انبار', navTo('stock', 'موجودی'))
wait(2200)
const stockHeaders = gridHeaders()
check('ایزولاسیون — چیدمان موجودی پیش‌فرض ماند', stockHeaders.some((h) => h.includes('انبار')) && stockHeaders.some((h) => h.includes('کالا')), stockHeaders.join(' | '))
check('ایزولاسیون — کلید چیدمان موجودی ساخته نشد', !uiKeyExists('/^io\\.ui\\.v1:.*:cols:stock$/'))

// بازنشانی به پیش‌فرض
check('بازگشت به نامه‌ها', navTo('letters', 'اتوماسیون'))
wait(2200)
check('باز کردن منوی چیدمان (بار دوم)', openColumnsMenu() === 'ok')
wait(900)
check('کلیک «بازنشانی به پیش‌فرض»', clickMenuItem('بازنشانی به پیش‌فرض', 'menuitem') === 'ok')
wait(900)
const headers4 = gridHeaders()
check('بازنشانی — «دارنده فعلی» بازگشت', headers4.some((h) => h.includes('دارنده فعلی')), headers4.join(' | '))
const storedAfterReset = rawUiKey('/^io\\.ui\\.v1:.*:cols:letters$/')
check('بازنشانی در ذخیره هم ثبت شد (hidden=[])', storedAfterReset.replace(/"/g, '').includes('hidden:[]'), storedAfterReset.slice(0, 80))

// ═══════════════ بخش ۲ — ماندگاری سکشن فرم (پیوست‌های نامه) ═══════════════
console.log('\n■ ۲) سکشن — «پیوست‌ها» در فرم نامه جدید')
check('ناوبری به نامه‌ها (فرم)', navTo('letters', 'اتوماسیون'))
wait(2200)
check('باز کردن فرم «ثبت نامه جدید»', String(evS(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent || '').includes('ثبت نامه جدید')); if (b) { b.click(); return 'ok' } return 'btn-not-found' })()`) ?? '') === 'ok')
wait(2200)
const secState1 = String(evS(`(function(){ const s = document.querySelector('section[aria-label^="پیوست"]'); if (!s) return 'sec-not-found'; const b = s.querySelector('button[aria-expanded]'); return b ? b.getAttribute('aria-expanded') : 'no-toggle' })()`) ?? '')
check('سکشن «پیوست‌ها» جمع‌شونده است و پیش‌فرض باز', secState1 === 'true', secState1)

check('بستن سکشن پیوست‌ها', String(evS(`(function(){ const s = document.querySelector('section[aria-label^="پیوست"]'); const b = s ? s.querySelector('button[aria-expanded]') : null; if (b) { b.click(); return 'ok' } return 'btn-not-found' })()`) ?? '') === 'ok')
wait(700)
const secState2 = String(evS(`(function(){ const s = document.querySelector('section[aria-label^="پیوست"]'); const b = s ? s.querySelector('button[aria-expanded]') : null; return b ? b.getAttribute('aria-expanded') : 'gone' })()`) ?? '')
check('سکشن بسته شد (aria-expanded=false)', secState2 === 'false', secState2)
shotS('02-letter-attachments-collapsed')

check('reload فرم (بازگشایی تب نامه‌ها + فرم جدید)', navTo('letters', 'اتوماسیون'))
wait(2200)
String(evS(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent || '').includes('ثبت نامه جدید')); if (b) b.click(); return true })()`) ?? '')
wait(2200)
const secState3 = String(evS(`(function(){ const s = document.querySelector('section[aria-label^="پیوست"]'); const b = s ? s.querySelector('button[aria-expanded]') : null; return b ? b.getAttribute('aria-expanded') : 'gone' })()`) ?? '')
check('ماندگاری پس از reload — سکشن همچنان بسته', secState3 === 'false', secState3)

// بازگشایی = پاکسازی حالت برای گام‌های بعد
String(evS(`(function(){ const s = document.querySelector('section[aria-label^="پیوست"]'); const b = s ? s.querySelector('button[aria-expanded]') : null; if (b) b.click(); return true })()`) ?? '')
wait(500)

// ═══════════════ بخش ۳ — پین نما (دسترسی سریع) ═══════════════
console.log('\n■ ۳) پین — «دسترسی سریع» در سایدبار')
const navText0 = String(evS(`document.querySelector('nav[aria-label="ناوبری اصلی"]')?.innerText ?? ''`) ?? '')
check('پیش از پین: بخش «دسترسی سریع» وجود ندارد', !navText0.includes('دسترسی سریع'))

check('پین کردن «دفتر مکاتبات»', String(evS(`(function(){ const b = document.querySelector('button[aria-label="پین کردن دفتر مکاتبات"]'); if (b) { b.click(); return 'ok' } return 'btn-not-found' })()`) ?? '') === 'ok')
wait(800)
const navText1 = String(evS(`document.querySelector('nav[aria-label="ناوبری اصلی"]')?.innerText ?? ''`) ?? '')
check('بخش «دسترسی سریع» با «دفتر مکاتبات» ظاهر شد', navText1.includes('دسترسی سریع') && navText1.includes('دفتر مکاتبات'))
shotS('03-sidebar-pinned')

check('reload برای پین', navTo('dashboard', 'داشبورد'))
wait(2500)
const navText2 = String(evS(`document.querySelector('nav[aria-label="ناوبری اصلی"]')?.innerText ?? ''`) ?? '')
check('ماندگاری پین پس از reload', navText2.includes('دسترسی سریع') && navText2.includes('دفتر مکاتبات'))

check('کلیک روی نمای پین‌شده → باز شدن نامه‌ها', (() => {
  String(evS(`(function(){ const pins = document.querySelectorAll('nav ul'); for (const ul of pins) { for (const li of ul.querySelectorAll('li')) { const btn = li.querySelector('button'); if (btn && (btn.innerText || '').trim() === 'دفتر مکاتبات') { btn.click(); return true } } } return false })()`) ?? '')
  wait(2200)
  const h = String(evS(`document.querySelector('main h1, main h2')?.textContent ?? ''`) ?? '')
  return h.includes('اتوماسیون')
})())

check('برداشتن پین', String(evS(`(function(){ const b = document.querySelector('button[aria-label="برداشتن پین دفتر مکاتبات"]'); if (b) { b.click(); return 'ok' } return 'btn-not-found' })()`) ?? '') === 'ok')
wait(800)
const navText3 = String(evS(`document.querySelector('nav[aria-label="ناوبری اصلی"]')?.innerText ?? ''`) ?? '')
check('بخش «دسترسی سریع» برداشته شد', !navText3.includes('دسترسی سریع'), navText3.slice(0, 60))

// ═══════════════ بخش ۴ — بازه تحلیلی داشبورد (D7) ═══════════════
console.log('\n■ ۴) داشبورد — بازه ۷/۳۰/۹۰ + روند نامه + دلتا')
check('ناوبری به داشبورد', navTo('dashboard', 'داشبورد'))
wait(3000)
const pressedDefault = String(evS(`(function(){ const g = document.querySelector('[data-dash-range]'); const b = g ? g.querySelector('button[aria-pressed="true"]') : null; return b ? b.innerText.trim() : 'none' })()`) ?? '')
check('پیش‌فرض بازه = ۳۰ روز', pressedDefault.includes('۳۰ روز'), pressedDefault)
const mainDash = String(evS(`document.querySelector('main')?.innerText ?? ''`) ?? '')
check('کارت «روند نامه‌ها» حاضر است (D7)', mainDash.includes('روند نامه‌ها'))
check('دلتا نسبت به دوره قبل نمایش داده می‌شود', mainDash.includes('نسبت به دوره قبل'))
check('کارت «روند اسناد انبار» در ردیف تحلیل انبار', mainDash.includes('روند اسناد انبار'))
check('KPI موجودی (مترمربع) پابرجاست', /مترمربع/.test(mainDash))
shotS('04-dashboard-range30')

check('انتخاب بازه ۹۰ روز', String(evS(`(function(){ const g = document.querySelector('[data-dash-range]'); const b = g ? Array.from(g.querySelectorAll('button')).find(x => (x.innerText || '').includes('۹۰ روز')) : null; if (b) { b.click(); return 'ok' } return 'btn-not-found' })()`) ?? '') === 'ok')
wait(2800)
const mainDash90 = String(evS(`document.querySelector('main')?.innerText ?? ''`) ?? '')
check('بازه ۹۰ روز در زیرعنوان روند نامه', mainDash90.includes('۹۰ روز اخیر'))
check('دلتا پس از تغییر بازه مجدداً محاسبه شد', mainDash90.includes('نسبت به دوره قبل'))
const pressed90 = String(evS(`(function(){ const g = document.querySelector('[data-dash-range]'); const b = g ? g.querySelector('button[aria-pressed="true"]') : null; return b ? b.innerText.trim() : 'none' })()`) ?? '')
check('چیپ ۹۰ روز فعال (aria-pressed)', pressed90.includes('۹۰ روز'), pressed90)
shotS('05-dashboard-range90')

check('reload داشبورد — ماندگاری بازه', navTo('dashboard', 'داشبورد'))
wait(3000)
const pressedAfter = String(evS(`(function(){ const g = document.querySelector('[data-dash-range]'); const b = g ? g.querySelector('button[aria-pressed="true"]') : null; return b ? b.innerText.trim() : 'none' })()`) ?? '')
check('بازه ۹۰ روز پس از reload ماندگار است', pressedAfter.includes('۹۰ روز'), pressedAfter)

// بازگشت به پیش‌فرض (پاکسازی)
String(evS(`(function(){ const g = document.querySelector('[data-dash-range]'); const b = g ? Array.from(g.querySelectorAll('button')).find(x => (x.innerText || '').includes('۳۰ روز')) : null; if (b) b.click(); return true })()`) ?? '')
wait(2600)

// ═══════════════ بخش ۵ — موبایل + پاکسازی نهایی ═══════════════
console.log('\n■ ۵) موبایل ۳۹۰px + پاکسازی')
abS('set viewport 390 844')
check('ناوبری موبایل به داشبورد', navTo('dashboard', 'داشبورد'))
wait(3000)
const overflow = Number(evS(`document.documentElement.scrollWidth - window.innerWidth`) ?? 0)
check('بدون سرریز افقی در ۳۹۰px', overflow <= 1, `diff=${overflow}`)
shotS('06-dashboard-mobile-390')

// پاکسازی نهایی — هیچ ردپای io.ui.v1 برای رگرسیون‌های بعدی نماند
clearUiPrefs()
const leftover = Number(evS(`Object.keys(window.localStorage).filter(k => k.startsWith('io.ui.v1')).length`) ?? 0)
check('پاکسازی نهایی io.ui.v1', leftover === 0, `left=${leftover}`)

abS('close', 15000)

// ═══════════════ جمع‌بندی ═══════════════
console.log('\n' + '─'.repeat(60))
console.log(`نتیجه تست شخصی‌سازی ماندگار (P2.5-U3): ${pass} پاس / ${fail} خراب`)
if (failures.length > 0) {
  console.log('خرابی‌ها:')
  for (const f of failures) console.log(`  ✗ ${f}`)
}
console.log(`اسکرین‌شات‌ها: ${OUT}/`)
process.exit(fail > 0 ? 1 : 0)
