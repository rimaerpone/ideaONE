// تست UI موتور کدگذاری — کدساز در فرم محصول + رمزگشا + موبایل ۳۹۰
// اجرا: bunx tsx scripts/test-coding-ui.ts  (سرور dev روشن)
import { execSync } from 'node:child_process'
import { ab, ev, wait, shot, login, logout, navigate, toastText } from './e2e-golden-helpers'

const OUT = '/home/z/my-project/download/qa-coding'
let failures = 0
let passed = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) passed += 1
  else failures += 1
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${extra ? ` — ${extra}` : ''}`)
}
function snap(name: string): string {
  const r = ab(`screenshot ${OUT}/${name}.png`)
  return r.includes('✓') ? 'ok' : `fail(${r.slice(0, 50)})`
}

execSync(`mkdir -p ${OUT}`)

/** مقدار select بومی (کدساز از select بومی استفاده می‌کند نه Radix) */
function nativeSelectByLabel(label: string, value: string): boolean {
  return ev(`(function(){
    const sel = Array.from(document.querySelectorAll('select[aria-label="${label}"]'))
    if (!sel.length) return 'not-found'
    sel[0].value = '${value}'
    sel[0].dispatchEvent(new Event('change', { bubbles: true }))
    return sel[0].value === '${value}'
  })()`) === true
}

async function main() {
  logout()
  const okLogin = login('anbar.arad', '12345678')
  check('ورود anbar.arad (OPERATOR آراد — مجاز به صدور شمارنده)', okLogin)

  // فرم محصول جدید
  navigate('products', 'محصولات')
  ab('find role button click --name "محصول جدید"')
  wait(2500)
  const composerVisible = ev(`!!document.querySelector('select[aria-label="انتخاب طرحواره کدگذاری"]')`) === true
  check('کدساز در فرم محصول ظاهر شد', composerVisible)
  // انتخاب صریح طرحواره کاشی (مقاوم به ترتیب/پیش‌فرض)
  const tileSelected = nativeSelectByLabel('انتخاب طرحواره کدگذاری', 'tile')
  check('طرحواره کاشی انتخاب شد', tileSelected)
  wait(600)

  // انتخاب اجزای کاشی: لعاب T + ضخامت A + سایز 60 + سالن 1 + رنگ A + کنتراست 0 + طیف 5 + شید 5 + درجه 1 + کلاس M + قالب 1 + جذب 1 + پرداخت R + بسته‌بندی 1 + برند IS
  const picks: [string, string][] = [
    ['نوع لعاب', 'T'], ['ضخامت', 'A'], ['سایز', '60'], ['واحد تولید', '1'], ['رنگ', 'A'],
    ['کنتراست', '0'], ['طیف', '5'], ['شید', '5'], ['درجه', '1'], ['کلاس سایز', 'M'],
    ['نوع قالب', '1'], ['گروه جذب آب', '1'], ['نوع پرداخت نهایی', 'R'], ['تیپ بسته‌بندی', '1'], ['برند', 'IS'],
  ]
  let picked = 0
  for (const [label, value] of picks) {
    if (nativeSelectByLabel(label, value)) picked += 1
    else wait(300)
  }
  wait(600)
  check(`۱۵ جزء enum انتخاب شد (${picked}/۱۵)`, picked === 15)

  // کد زنده باید ۱۵ جزء + جای خالی شمارنده نشان دهد
  const liveText = String(ev(`(function(){ const t = document.body.innerText; const i = t.indexOf('کد مادر'); return i >= 0 ? t.slice(Math.max(0, i - 200), i + 80) : '' })()`) ?? '')
  check('کد مادر زنده رندر می‌شود (۹ جزء پر)', liveText.includes('TA601') && liveText.includes('کد مادر'))

  // دکمه «بعدی» — صدور شماره طرح از سرور
  ab('find role button click --name "بعدی"')
  wait(3000)
  const afterIssue = String(ev(`(function(){ const t = document.body.innerText; const i = t.indexOf('کد کامل است'); return i >= 0 ? t.slice(Math.max(0, i - 120), i + 40) : '' })()`) ?? '')
  check('پس از صدور شماره: «کد کامل است»', afterIssue.includes('کد کامل است'), afterIssue.slice(0, 80))
  // توست گذرا است — راستی‌آزمایی حالت: کد کامل + مقدار عددی ۳رقمی جزء طرح در صفحه
  const designShown = String(ev(`(function(){ const chips = Array.from(document.querySelectorAll('span.font-mono')); return chips.map(c => c.textContent.trim()).filter(t => /^\\d{3}$/.test(t)).join(',') })()`) ?? '')
  check('جزء طرح با شماره صادرشده (۳ رقمی) پر شد', /^\d{3}$/.test(designShown), designShown)
  snap('01-composer-live')

  // درج در فرم — کد + نگاشت معنایی فیلدها
  ab('find role button click --name "درج در فرم"')
  wait(1200)
  const codeVal = String(ev(`(function(){ const el = Array.from(document.querySelectorAll('main input')).find(i => (i.placeholder || '').includes('از کدساز') || (i.getAttribute('aria-label') || '').includes('کد کالا')); return el ? el.value : 'nf' })()`) ?? '')
  check('کد ۲۰ کاراکتری در فیلد کد کالا نشست', /^[A-Z0-9]{20}$/.test(codeVal), `code=${codeVal}`)
  const sizeVal = String(ev(`(function(){ const el = Array.from(document.querySelectorAll('main input')).find(i => (i.getAttribute('aria-label') || '') === 'ابعاد' || (i.placeholder || '') === '۶۰×۶۰'); return el ? el.value : 'nf' })()`) ?? '')
  check('نگاشت سایز → ابعاد (۶۰×۶۰)', sizeVal.includes('۶۰×۶۰'), sizeVal)
  const colorVal = String(ev(`(function(){ const el = Array.from(document.querySelectorAll('main input')).find(i => (i.placeholder || '') === 'سفید'); return el ? el.value : 'nf' })()`) ?? '')
  check('نگاشت رنگ → سفید', colorVal.includes('سفید'), colorVal)
  const surfaceVal = String(ev(`(function(){ const el = Array.from(document.querySelectorAll('main input')).find(i => (i.placeholder || '') === 'پولیش / مات / روستیک'); return el ? el.value : 'nf' })()`) ?? '')
  check('نگاشت لعاب → سطح (براق)', surfaceVal.includes('براق'), surfaceVal)
  snap('02-inserted-to-form')

  // نام دستی + ثبت محصول واقعی با کد ساختاری
  const nameFilled = ev(`(function(){
    const el = Array.from(document.querySelectorAll('main input')).find(i => (i.placeholder || '') === 'پرسلان پولیش سفید کلاسیک')
    if (!el) return 'nf'
    const proto = window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, 'کاشی کدساز تست خودکار')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return el.value
  })()`)
  check('نام محصول دستی تکمیل شد', String(nameFilled).includes('کدساز'))
  // خط محصول هم لازم است (الزام فرم) — از نام طرح/خط seed
  ev(`(function(){
    const el = Array.from(document.querySelectorAll('main input')).find(i => (i.placeholder || '') === 'پرسلان پولیش')
    if (!el) return 'nf'
    const proto = window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, 'پرسلان پولیش')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  ab('find role button click --name "ثبت محصول"')
  wait(6000)
  const savedTab = String(ev(`(function(){ const t = Array.from(document.querySelectorAll('[role=tab]')).find(x => x.getAttribute('aria-selected') === 'true'); return t ? t.textContent.trim() : '' })()`) ?? '')
  check('محصول با کد ساختاری ثبت شد (تب رکورد مادیالایز شد)', savedTab.includes('کاشی کدساز تست خودکار'), savedTab.slice(0, 40))
  snap('03-product-saved')

  // ---------------- رمزگشا در فرم محصول تازه ----------------
  // فرم تازه با state مستقیم workspace (دکمه «محصول جدید» در نمای فهرست است، نه رکورد)
  ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'new:products', kind: 'record', viewKey: 'products', recordId: 'new', title: 'محصول جدید', icon: 'Package' }], activeTabId: 'new:products' })); return true })()`)
  ab('open http://localhost:81/', 90000)
  wait(4200)
  // از حالت ساخت به رمزگشایی سوئیچ (دکمه toggle — متن کامل «رمزگشایی کد موجود»)
  ev(`(function(){ const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('رمزگشایی کد موجود')); if (btn) { btn.click(); return true } return 'no-toggle' })()`)
  wait(1200)
  const decInput = ev(`(function(){
    const el = Array.from(document.querySelectorAll('main input')).find(i => (i.getAttribute('aria-label') || '') === 'کد برای رمزگشایی')
    if (!el) return 'nf'
    const proto = window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, '${codeVal}')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return el.value.length
  })()`)
  check('ورودی رمزگشا با کد ثبت‌شده پر شد', Number(decInput) === 20, String(decInput))
  ev(`(function(){ const panel = Array.from(document.querySelectorAll('input[aria-label="کد برای رمزگشایی"]'))[0]?.closest('div'); const btn = panel ? Array.from(panel.parentElement.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'رمزگشایی') : null; if (btn) { btn.click(); return true } return 'no-decode-btn' })()`)
  wait(3500)
  const decText = String(ev(`document.body.innerText`) ?? '')
  check('رمزگشا: تطبیق کامل کاشی', decText.includes('تطبیق کامل') && decText.includes('کدینگ محصولات کاشی'))
  check('رمزگشا: اجزا با لیبل فارسی', decText.includes('نوع لعاب') && decText.includes('براق (ترانس)'))
  check('رمزگشا: نشان کد مادر', decText.includes('مادر'))
  snap('04-decoder')

  // رمزگشای کد تجهیزات — تشخیص خودکار طرحواره
  ev(`(function(){
    const el = Array.from(document.querySelectorAll('main input')).find(i => (i.getAttribute('aria-label') || '') === 'کد برای رمزگشایی')
    if (!el) return 'nf'
    const proto = window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, 'KLN-2-007')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  ev(`(function(){ const panel = Array.from(document.querySelectorAll('input[aria-label="کد برای رمزگشایی"]'))[0]?.closest('div'); const btn = panel ? Array.from(panel.parentElement.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'رمزگشایی') : null; if (btn) { btn.click(); return true } return 'no-decode-btn' })()`)
  wait(3500)
  const dec2 = String(ev(`document.body.innerText`) ?? '')
  check('تشخیص خودکار: KLN-2-007 → تجهیزات', dec2.includes('کدینگ تجهیزات') && dec2.includes('کوره پخت'))
  snap('05-decoder-equipment')

  // ---------------- موبایل ۳۹۰ ----------------
  ab('set viewport 390 844')
  wait(1500)
  snap('06-mobile-390')
  const mobileOk = String(ev(`document.body.innerText`) ?? '').includes('کدساز')
  check('کدساز در موبایل ۳۹۰ حاضر است', mobileOk)
  ab('set viewport 1560 900')
  wait(1000)

  // پاک‌سازی: محصول تستی حذف؟ (حذف محصول API ندارد — رکورد تستی می‌ماند؛ نامش مشخص است)
  console.log(`\n━━━ نتیجه UI: ${passed} پاس / ${failures} خطا ━━`)
  // بستن نشست (درس کروم‌های بازمانده → OOM)
  ab('close')
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
