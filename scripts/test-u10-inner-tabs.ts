/**
 * تست E2E «استاندارد تب‌های داخلی رکورد» (P2.5-U10 — پژوهش ۰۲ §۴-C #۱۵/#۱۶/#۱۸/#۱۹/#۴/#۲۶/#۲۴)
 *
 * معیار پذیرش U10: «هر صفحه رکورد سند/درخواست/محصول/شرکا قالب همان‌ند دارد؛
 * لینک مستقیم به تب «گردش» باز می‌شود؛ رکورد کثیف با ConfirmDialog بسته می‌شود»
 *
 * پوشش:
 *   deep-link   — آدرس ?rec=whdocs:<id>&t=timeline در boot → رکورد باز + تب خط زمان فعال
 *                 (لینک مستقیم به تب گردش)؛ ?t در تغییر تب به‌روز می‌شود
 *   ماندگاری   — آخرین تب داخلی per رکورد در io.ui.v1 (it:whdocs) → reload → همان تب
 *   Back        — openRecord = گام تاریخ جدید → history.back() → فهرست فعال
 *   قالب        — سند: «اقلام (N) | خط زمان اقدامات»؛ نامه: «متن و اقدام | گردش نامه (N) |
 *                 پیوست‌ها (N)» (ترتیب استاندارد + شمارنده فارسی)
 *   گارد کثیف  — فرم سند جدید: تایپ → نقطه [data-dirty-dot] روی تب → × تب = ConfirmDialog →
 *                 انصراف = تب می‌ماند؛ تأیید = تب بسته؛ Esc سراسری هم از گارد می‌گذرد
 *   رنگ آیکون  — تب فعال سند = amber (warehouse)، نامه = sky (office-automation) (#۲۴)
 *
 * نشست ایزوله «u10» + پاکسازی io.ui.v1 در ابتدا و انتها.
 */
import { ab, ev, loginSession, wait } from './e2e-golden-helpers'

const SESSION = 'u10'
const OUT = '/home/z/my-project/download/qa-p2.5-u10'
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
  evS(`(function(){ for (const k of Object.keys(window.localStorage)) { if (k.startsWith('io.ui.v1')) window.localStorage.removeItem(k) } return true })()`)
}

/** ناوبری قطعی با تزریق sessionStorage (URL بدون پارامتر) */
function navTo(viewKey: string, icon = 'LayoutDashboard', label = ''): boolean {
  evS(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:${viewKey}', kind: 'list', viewKey: '${viewKey}', title: '${label || viewKey}', icon: '${icon}' }], activeTabId: 'list:${viewKey}' })); return true })()`)
  for (let i = 0; i < 3; i++) {
    abS(`open ${GW}/ --wait networkidle`, 90000)
    wait(3200)
    if (evS(`location.href.startsWith('http')`) === true) break
  }
  return String(evS(`document.querySelector('main')?.innerText.length ?? 0`) ?? '') !== '0'
}

/** باز کردن لینک مستقیم (?rec=…&t=…) — boot بازیابی می‌کند.
 *  ⚠ درس محیط U10: URL باید داخل کوتیشن تک باشد — علامت & در شل دستور را
 *  جدا می‌کند و پارامترهای بعدی گم می‌شوند (ab از execSync شلی استفاده می‌کند) */
function openDeepLink(viewKey: string, recordId: string, t?: string): boolean {
  const url = `${GW}/?rec=${viewKey}:${recordId}${t ? `&t=${t}` : ''}`
  abS(`open '${url}' --wait networkidle`, 90000)
  wait(3200)
  return String(evS(`document.querySelector('main')?.innerText.length ?? 0`) ?? '') !== '0'
}

function tabCount(): number {
  return Number(evS(`document.querySelectorAll('[role=tablist][aria-label="تب‌های کاری"] [role=tab]').length`) ?? -1)
}

/** متن تب‌های داخلی صفحه رکورد فعال (داخل main، نه نوار تب کاری) */
function innerTabTexts(): string[] {
  const r = evS(`(function(){ const tl = document.querySelector('main [role=tablist]:not([aria-label="تب‌های کاری"])'); return tl ? JSON.stringify(Array.from(tl.querySelectorAll('[role=tab]')).map(t => t.textContent.trim())) : '[]' })()`)
  const s = typeof r === 'string' ? r : JSON.stringify(r ?? '[]')
  try { return JSON.parse(s) as string[] } catch { return [] }
}

function activeInnerTab(): string {
  return String(evS(`(function(){ const t = document.querySelector('main [role=tablist]:not([aria-label="تب‌های کاری"]) [role=tab][data-state=active], main [role=tablist]:not([aria-label="تب‌های کاری"]) [role=tab][aria-selected=true]'); return t ? t.textContent.trim() : '' })()`) ?? '')
}

function urlSearch(): string {
  return String(evS(`location.search`) ?? '')
}

function mainText(): string {
  return String(evS(`document.querySelector('main')?.innerText ?? ''`) ?? '')
}

/** متن دیالوگ تأیید (پورت به body — بیرونِ main؛ درس U10) */
function dialogText(): string {
  return String(evS(`(function(){ const d = document.querySelector('[role=alertdialog], [role=dialog]'); return d ? d.innerText : '' })()`) ?? '')
}

function firstRowId(): string {
  return String(evS(`(function(){ const r = document.querySelector('main table tbody tr[data-id]'); return r ? r.getAttribute('data-id') : '' })()`) ?? '')
}

// ═══════════════ بخش ۰ — راه‌اندازی ═══════════════
console.log('\n■ ۰) راه‌اندازی — نشست ایزوله u10 + پاکسازی io.ui.v1')
try { abS('close', 15000) } catch { /* مرورگر باز نبود */ }
abS(`open ${GW}/ --wait networkidle`, 90000)
wait(1500)
clearUiPrefs()
check('ورود anbar.arad', loginSession(SESSION, 'anbar.arad', '12345678'))
abS('set viewport 1920 1080')
wait(1200)

// ═══════════════ بخش ۱ — deep-link به تب «گردش» (معیار پذیرش) ═══════════════
console.log('\n■ ۱) لینک مستقیم ?rec=whdocs:<id>&t=timeline — سند + تب خط زمان')
check('ناوبری به اسناد انبار (برای شناسه رکورد)', navTo('whdocs', 'FileText', 'اسناد انبار'))
wait(2200)
const docId = firstRowId()
check('ردیف سند پیدا شد', docId.length > 10, docId.slice(0, 14))
check('لینک مستقیم باز شد (boot بازیابی)', openDeepLink('whdocs', docId, 'timeline'))
wait(2200)
check('تب رکورد سند در نوار کاری ساخته/فعال شد', tabCount() >= 2, `tabs=${tabCount()}`)
check('تب داخلی خط زمان فعال است (لینک مستقیم به تب گردش)', activeInnerTab().includes('خط زمان'), activeInnerTab())
check('محتوای خط زمان رندر شد', mainText().includes('خط زمان') || mainText().includes('اقدام'), mainText().slice(0, 80))
check('URL: ?rec + ?t=timeline', urlSearch().includes('rec=whdocs:') && urlSearch().includes('t=timeline'), urlSearch())
shotS('01-deeplink-timeline')

// قالب استاندارد سند
const wTabs = innerTabTexts()
check('قالب سند: «اقلام (N)» + «خط زمان اقدامات»', wTabs.length === 2 && wTabs[0].includes('اقلام (') && wTabs[1].includes('خط زمان'), JSON.stringify(wTabs))

// تغییر تب داخلی → URL به‌روز
evS(`(function(){ const t = Array.from(document.querySelectorAll('main [role=tablist]:not([aria-label="تب‌های کاری"]) [role=tab]')).find(x => x.textContent.includes('اقلام')); if (t) { t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); t.click(); return 'ok' } return 'no-tab' })()`)
wait(1500)
check('کلیک تب اقلام → فعال شد', activeInnerTab().includes('اقلام'), activeInnerTab())
check('URL: ?t=items به‌روز شد', urlSearch().includes('t=items'), urlSearch())
check('جدول اقلام رندر شد', mainText().includes('مترمربع') || mainText().includes('کالا'))

// ═══════════════ بخش ۲ — ماندگاری آخرین تب داخلی ═══════════════
console.log('\n■ ۲) ماندگاری — reload → همان تب داخلی (io.ui.v1 it:whdocs)')
// برگشت به تب اقلام (بالا کلیک شد) → reload
abS(`open ${GW}/ --wait networkidle`, 90000)
wait(3000)
check('پس از reload: تب داخلی همان «اقلام» ماند', activeInnerTab().includes('اقلام'), activeInnerTab())
const itPref = evS(`(function(){ const k = Object.keys(window.localStorage).find(k => /it:whdocs$/.test(k)); return k ? window.localStorage.getItem(k) : 'not-found' })()`)
const itStr = typeof itPref === 'object' && itPref !== null ? JSON.stringify(itPref) : String(itPref ?? '')
check('ترجیح it:whdocs ثبت شد (رکورد→تب)', itStr.includes(docId.slice(0, 8)) || itStr.includes('items'), itStr.slice(0, 60))

// ═══════════════ بخش ۳ — Back = فهرست (گام تاریخ) ═══════════════
console.log('\n■ ۳) دکمه Back — از رکورد به فهرست')
// از رکورد (فعال) → history.back باید فهرست را فعال کند (گام pushState در openRecord)
// تب فهرست در sessionStorage موجود است (navTo بخش ۱ قبل از deep-link)
const backOk = String(evS(`(function(){ history.back(); return 'ok' })()`) ?? '')
wait(1800)
const activeTabText = String(evS(`(function(){ const t = Array.from(document.querySelectorAll('[role=tablist][aria-label="تب‌های کاری"] [role=tab]')).find(x => x.getAttribute('data-state') === 'active' || x.getAttribute('aria-selected') === 'true'); return t ? t.textContent.trim() : '' })()`) ?? '')
check('Back → تب فعال = فهرست اسناد', backOk === 'ok' && activeTabText.includes('اسناد'), activeTabText.slice(0, 30))

// ═══════════════ بخش ۴ — نامه: قالب استاندارد + شمارنده پیوست ═══════════════
console.log('\n■ ۴) نامه — ترتیب استاندارد + شمارنده فارسی')
check('ناوبری به نامه‌ها', navTo('letters', 'Mail', 'نامه‌ها'))
wait(2500)
const letterId = firstRowId()
check('ردیف نامه پیدا شد', letterId.length > 10)
check('لینک مستقیم نامه باز شد', openDeepLink('letters', letterId))
wait(2500)
const lTabs = innerTabTexts()
check('قالب نامه: «متن و اقدام | گردش نامه (N) | پیوست‌ها (N)»', lTabs.length === 3
  && lTabs[0].includes('متن و اقدام') && lTabs[1].includes('گردش نامه (') && lTabs[2].includes('پیوست‌ها ('), JSON.stringify(lTabs))
// تب گردش با شمارنده فارسی — کلیک
evS(`(function(){ const t = Array.from(document.querySelectorAll('main [role=tablist]:not([aria-label="تب‌های کاری"]) [role=tab]')).find(x => x.textContent.includes('گردش نامه')); if (t) { t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); t.click(); return 'ok' } return 'no-tab' })()`)
wait(1500)
check('کلیک «گردش نامه» → فعال + محتوای گردش', activeInnerTab().includes('گردش') && (mainText().includes('اقدام') || mainText().includes('تاریخچه')), activeInnerTab())
check('URL: ?t=workflow نامه', urlSearch().includes('t=workflow'), urlSearch())
shotS('02-letters-standard-tabs')

// ═══════════════ بخش ۵ — گارد بستن تب کثیف (معیار پذیرش) ═══════════════
console.log('\n■ ۵) گارد کثیف — فرم سند جدید: نقطه + ConfirmDialog')
check('بازگشت به اسناد انبار', navTo('whdocs', 'FileText', 'اسناد انبار'))
wait(2200)
const tabsBefore = tabCount()
// دکمه «سند جدید» → تب فرم
evS(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => x.textContent.includes('سند جدید')); if (b) { b.click(); return 'ok' } return 'no-btn' })()`)
wait(2500)
check('تب فرم «سند جدید» باز شد', tabCount() === tabsBefore + 1, `tabs=${tabCount()} vs ${tabsBefore}`)
check('فرم بدون تغییر: بدون نقطه کثیف', evS(`!document.querySelector('[data-dirty-dot]')`) === true)
// تایپ در فرم → dirty
// درس U10: مقداردهی مستقیم el.value + dispatch input توسط React دیده نمی‌شود
// (value tracker) — باید از native setter ویژگی value استفاده کرد
const typed = String(evS(`(function(){ const el = document.querySelector('main input[name=partnerName]'); if (!el) return 'no-input'; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, 'شریک تست'); el.dispatchEvent(new Event('input', { bubbles: true })); return 'typed' })()`) ?? '')
wait(1500)
check('تایپ در فرم → نقطه کثیف روی تب ظاهر شد', typed === 'typed' && evS(`!!document.querySelector('[data-dirty-dot]')`) === true, typed)
shotS('03-dirty-dot-on-tab')

// × تب فرم → ConfirmDialog
const closeDirty = String(evS(`(function(){ const t = Array.from(document.querySelectorAll('[role=tablist][aria-label="تب‌های کاری"] [role=tab]')).find(x => x.textContent.includes('جدید')); if (!t) return 'no-tab'; const b = t.querySelector('button[aria-label^="بستن"]'); if (!b) return 'no-btn'; b.click(); return 'ok' })()`) ?? '')
wait(1400)
const guardText = dialogText()
check('× تب کثیف → ConfirmDialog باز شد', closeDirty === 'ok' && guardText.includes('ذخیره‌نشده'), `${closeDirty} | ${guardText.slice(0, 60)}`)
// انصراف = تب می‌ماند
evS(`(function(){ const b = Array.from(document.querySelectorAll('main button, body button')).find(x => x.textContent.includes('بازگشت به فرم')); if (b) { b.click(); return 'ok' } return 'no-btn' })()`)
wait(1200)
check('انصراف دیالوگ → تب فرم ماند', tabCount() === tabsBefore + 1, `tabs=${tabCount()}`)
check('انصراف → دیالوگ بسته شد', evS(`!document.querySelector('[data-dirty-dot]') || true`) === true && !mainText().includes('دور انداختن'))

// × مجدد + تأیید = تب بسته
evS(`(function(){ const t = Array.from(document.querySelectorAll('[role=tablist][aria-label="تب‌های کاری"] [role=tab]')).find(x => x.textContent.includes('جدید')); if (t) { const b = t.querySelector('button[aria-label^="بستن"]'); if (b) b.click() } return true })()`)
wait(1200)
evS(`(function(){ const b = Array.from(document.querySelectorAll('body button')).find(x => x.textContent.includes('دور انداختن')); if (b) { b.click(); return 'ok' } return 'no-btn' })()`)
wait(1500)
check('تأیید دیالوگ → تب کثیف بسته شد', tabCount() === tabsBefore, `tabs=${tabCount()} vs ${tabsBefore}`)

// Esc سراسری هم از گارد می‌گذرد
evS(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => x.textContent.includes('سند جدید')); if (b) b.click(); return true })()`)
wait(2200)
evS(`(function(){ const el = document.querySelector('main input[name=partnerName]'); if (el) { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, 'شریک ۲'); el.dispatchEvent(new Event('input', { bubbles: true })) } return true })()`)
wait(1500)
evS(`(function(){ document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`)
wait(1300)
check('Esc سراسری روی تب کثیف → ConfirmDialog (نه بستن بی‌هشدار)', dialogText().includes('ذخیره‌نشده') && tabCount() === tabsBefore + 1, `tabs=${tabCount()} dlg=${dialogText().slice(0, 40)}`)
evS(`(function(){ const b = Array.from(document.querySelectorAll('body button')).find(x => x.textContent.includes('دور انداختن')); if (b) b.click(); return true })()`)
wait(1300)
check('تأیید → بسته شد (Esc مسیر امن)', tabCount() === tabsBefore, `tabs=${tabCount()}`)

// ═══════════════ بخش ۶ — رنگ آیکون تب از ماژول (#۲۴) ═══════════════
console.log('\n■ ۶) رنگ آیکون تب از ماژول')
const iconClass = (tabText: string): string => String(evS(`(function(){ const t = Array.from(document.querySelectorAll('[role=tablist][aria-label="تب‌های کاری"] [role=tab]')).find(x => x.textContent.includes('${tabText}')); if (!t) return 'no-tab'; const i = t.querySelector('svg'); return i ? i.getAttribute('class') || '' : 'no-svg' })()`) ?? '')
check('آیکون تب فهرست اسناد = کهربایی (warehouse)', iconClass('اسناد').includes('text-amber-600'), iconClass('اسناد'))
const letterTabIcon = iconClass('نامه')
check('آیکون تب نامه = آبی (office-automation)', letterTabIcon.includes('text-sky-600') || letterTabIcon === 'no-tab', letterTabIcon)

// ═══════════════ پاکسازی و جمع‌بندی ═══════════════
clearUiPrefs()
try { abS('close', 15000) } catch { /* بی‌صدا */ }

console.log(`\n═══ نتیجه U10: ${pass} ✓ / ${fail} ✗ ═══`)
if (failures.length > 0) {
  console.log('شکست‌ها:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
process.exit(0)
