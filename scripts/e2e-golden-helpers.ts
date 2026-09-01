/**
 * کمکی‌های اتوماسیون مرورگر برای رگرسیون مسیرهای طلایی (P1-T36)
 * agent-browser CLI از طریق execSync — همه فرمان‌ها از گیت‌وی ۸۱
 */
import { execSync } from 'node:child_process'
import { sleepSync } from './e2e-golden-sleep'

export const GW = 'http://localhost:81'
export const OUT = '/home/z/my-project/download/qa-e2e-golden'

/** اجرای فرمان agent-browser (خروجی trim شده) */
export function ab(cmd: string, timeoutMs = 45000): string {
  try {
    return execSync(`agent-browser ${cmd}`, {
      encoding: 'utf-8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (e: unknown) {
    const err = e as { stdout?: string | Buffer; message?: string }
    const out = typeof err.stdout === 'string' ? err.stdout : ''
    return `__ERR__ ${(out || err.message || '').slice(0, 250)}`.trim()
  }
}

/**
 * اجرای جاوااسکریپت در صفحه — با base64 برای مصونیت از نقل‌قول bash.
 * ⚠ نکته حیاتی: atob خروجی بایت‌ساز است و متن فارسی را می‌شکند —
 * باید با TextDecoder به UTF-8 تبدیل شود (درس G1..G8: همه evهای فارسی بی‌صدا false می‌شدند).
 */
export function ev(js: string, session?: string): unknown {
  const b64 = Buffer.from(js, 'utf-8').toString('base64')
  const prefix = session ? `--session ${session} ` : ''
  const out = ab(`${prefix}eval "eval(new TextDecoder().decode(Uint8Array.from(atob('${b64}'), c => c.charCodeAt(0))))"`)
  if (out.startsWith('__ERR__')) return out
  try {
    const parsed = JSON.parse(out)
    // خروجی دوبار کدگذاری شده وقتی خود نتیجه رشته است
    if (typeof parsed === 'string' && (parsed.startsWith('{') || parsed.startsWith('['))) {
      try { return JSON.parse(parsed) } catch { return parsed }
    }
    return parsed
  } catch {
    return out
  }
}

/** انتظار به میلی‌ثانیه (همه‌جا sync تا ترتیب فرمان‌ها قطعی باشد) */
/**
 * ضریب مقیاس انتظارها — برای اجرای WAN (Neon، RTT ~۲۲۰ms): E2E_WAIT_SCALE=3
 * پیش‌فرض ۱ = رفتار دوره SQLite محلی. ثابت‌های انتظار این harness برای fetch های
 * میلی‌ثانیه‌ای محلی تنظیم شده‌اند؛ روی WAN واکشی داده چند ثانیه طول می‌کشد.
 */
export const WAIT_SCALE = Math.max(1, Number(process.env.E2E_WAIT_SCALE ?? 1))

export function wait(ms: number): void {
  sleepSync(Math.round(ms * WAIT_SCALE))
}

/** اسکرین‌شات با نام؛ خطا خورد = ثبت می‌شود ولی جریان ادامه می‌یابد */
export function shot(name: string): string {
  const r = ab(`screenshot ${OUT}/${name}.png`)
  return r.includes('✓') ? 'ok' : `fail(${r.slice(0, 60)})`
}

/**
 * ورود کاربر از صفحه لاگین گیت‌وی — قطعی با DOM مستقیم (id=username/password).
 * مقاوم به هیدریشن: پرکردن با native setter + رویداد input (React آن را می‌بیند)
 * و تلاش مجدد تا ۲ بار.
 */
export function login(username: string, password: string): boolean {
  // ⚠ درس مهم: بلافاصله پس از close، فرمان open گاهی به about:blank می‌رسد
  // (مسابقه راه‌اندازی مرورگر) — ناوبری باید با راستی‌آزمایی URL تکرار شود.
  for (let i = 0; i < 3; i++) {
    ab(`open ${GW}/ --wait networkidle`, 90000)
    wait(2000)
    const urlOk = ev(`location.href.startsWith('http')`) === true
    if (urlOk) break
  }
  const already = ev(`!!document.querySelector('nav[aria-label="ناوبری اصلی"]')`) === true
  if (already) return true
  for (let attempt = 0; attempt < 3; attempt++) {
    // پرکردن با setter بومی — نام‌پردازی find ناپایدار است (هیدریشن/تایمینگ)
    const filled = ev(`(function(){
      const u = document.getElementById('username')
      const p = document.getElementById('password')
      if (!u || !p) return 'inputs-not-found'
      const proto = window.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(u, '${username}')
      u.dispatchEvent(new Event('input', { bubbles: true }))
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(p, '${password}')
      p.dispatchEvent(new Event('input', { bubbles: true }))
      return u.value === '${username}' && p.value === '${password}'
    })()`)
    if (filled !== true) {
      wait(1800)
      // اگر صفحه سفید/blank شد، ناوبری تازه
      if (ev(`location.href === 'about:blank'`) === true) {
        ab(`open ${GW}/ --wait networkidle`, 90000)
        wait(2000)
      }
      continue
    }
    ev(`(function(){ const btn = Array.from(document.querySelectorAll('button')).find(b => b.type === 'submit' || (b.textContent || '').trim() === 'ورود'); if (btn) { btn.click(); return true } return false })()`)
    // پوسته پس از احراز هویت رندر می‌شود — تا ۹ ثانیه با گام ۱.۵ث
    for (let i = 0; i < 6; i++) {
      wait(1500)
      const nav = ev(`!!document.querySelector('nav[aria-label="ناوبری اصلی"]')`) === true
      if (nav) return true
    }
    // اگر فرم لاگین نیست (مثلاً خطای دیگر) تکرار بی‌فایده است
    const formGone = ev(`!document.body.innerText.includes('ورود به سامانه')`) === true
    if (formGone) return false
    wait(1500)
  }
  return false
}

/** تبدیل ارقام فارسی/عربی به عدد انگلیسی */
export function faToEnNumber(s: string): number {
  const fa = '۰۱۲۳۴۵۶۷۸۹'
  const ar = '٠١٢٣٤٥٦٧٨٩'
  const en = s.replace(/[۰-۹]/g, (d) => String(fa.indexOf(d))).replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)))
  const n = Number(en.replace(/[^0-9]/g, ''))
  return Number.isFinite(n) ? n : 0
}
/** لاگین روی نشست ایزوله (برای G5 — دومرورگری) با الگوی قطعی eval */
export function loginSession(session: string, username: string, password: string): boolean {
  ab(`--session ${session} open ${GW}/ --wait networkidle`, 90000)
  wait(2000)
  if (ev(`!!document.querySelector('nav[aria-label="ناوبری اصلی"]')`, session) === true) return true
  for (let attempt = 0; attempt < 3; attempt++) {
    const filled = ev(`(function(){
      const u = document.getElementById('username')
      const p = document.getElementById('password')
      if (!u || !p) return 'inputs-not-found'
      const proto = window.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(u, '${username}')
      u.dispatchEvent(new Event('input', { bubbles: true }))
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(p, '${password}')
      p.dispatchEvent(new Event('input', { bubbles: true }))
      return u.value === '${username}' && p.value === '${password}'
    })()`, session)
    if (filled !== true) { wait(1800); continue }
    ev(`(function(){ const btn = Array.from(document.querySelectorAll('button')).find(b => b.type === 'submit' || (b.textContent || '').trim() === 'ورود'); if (btn) { btn.click(); return true } return false })()`, session)
    for (let i = 0; i < 6; i++) {
      wait(1500)
      if (ev(`!!document.querySelector('nav[aria-label="ناوبری اصلی"]')`, session) === true) return true
    }
  }
  return false
}

/** خروج از نشست فعلی */
export function logout(): void {
  // مقاوم‌سازی (درس U4): منو/پاپ‌آور بازمانده (مثل «اندازه صفحه» t35) پس‌زمینه را
  // aria-hidden می‌کند و «find role» دکمه‌های هدر را نمی‌بیند — اول با Escape می‌بندیم.
  // سپس خروجِ بی‌راستی‌آزمایی قدیمی، کاربر قبلی را نگه می‌داشت و login بعدی «قبلاً
  // وارد شده» را می‌دید — الگو: راستی‌آزمایی فرم ورود + یک تلاش مجدد.
  if (ev(`!!document.querySelector('[data-state="open"]')`) === true) {
    ev(`(function(){ document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`)
    wait(800)
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    if (ev(`!!document.getElementById('username')`) === true) return // از قبل در صفحه ورودیم
    ab('find role button click --name "حساب کاربری"')
    wait(900)
    ab('find role menuitem click --name "خروج از حساب"')
    wait(2500)
    if (ev(`!!document.getElementById('username')`) === true) return
    // پشتیبان: منو شاید هنوز باز است — بستن و تلاش دوباره
    ev(`(function(){ document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`)
    wait(800)
  }
}

/**
 * ناوبری قطعی به نما: تزریق تب در sessionStorage + باز کردن ریشه.
 * (کلیک کشوی موبایل/دسکتاپ ناپایدار است — این مسیر صددرصد تکرارپذیر است)
 */
const VIEW_ICONS: Record<string, string> = {
  dashboard: 'LayoutDashboard', cartable: 'Inbox', letters: 'Mail', products: 'Package',
  partners: 'Users', stock: 'Boxes', whdocs: 'ClipboardCheck', requests: 'ClipboardList',
  modules: 'Puzzle', settings: 'Settings', users: 'Users', warehouses: 'Archive', 'my-account': 'UserRound',
}
const VIEW_LABELS: Record<string, string> = {
  dashboard: 'داشبورد', cartable: 'کارتابل', letters: 'نامه‌ها', products: 'محصولات',
  partners: 'شرکا', stock: 'موجودی انبار', whdocs: 'اسناد انبار', requests: 'درخواست کالا',
  modules: 'کاتالوگ پلاگین‌ها', settings: 'تنظیمات', users: 'کاربران', warehouses: 'انبارها', 'my-account': 'حساب من',
}

export function navigate(viewKey: string, expectHeading?: string): { ok: boolean; heading: string } {
  const icon = VIEW_ICONS[viewKey] ?? 'LayoutDashboard'
  const label = VIEW_LABELS[viewKey] ?? viewKey
  ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:${viewKey}', kind: 'list', viewKey: '${viewKey}', title: '${label}', icon: '${icon}' }], activeTabId: 'list:${viewKey}' })); return true })()`)
  // ناوبری با راستی‌آزمایی URL (درس about:blank پس از close)
  for (let i = 0; i < 3; i++) {
    ab(`open ${GW}/`, 90000)
    wait(3800)
    if (ev(`location.href.startsWith('http')`) === true) break
  }
  const h1 = ev(`(() => { const m = document.querySelector('main'); const h = m ? m.querySelector('h1,h2') : null; return h ? h.textContent.trim() : '' })()`) as string
  const ok = expectHeading ? String(h1).includes(expectHeading) : String(h1).length > 0
  return { ok: !!ok, heading: String(h1) }
}

/** متن بدنه صفحه (برای راستی‌آزمایی محتوا) */
export function bodyText(): string {
  return String(ev(`document.body.innerText`) ?? '')
}

/** ست مقدار فیلد متنی React از راه دور (RHF/controlled) */
export const SET_VALUE_JS = `
  (function(el, value){
    var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })(arguments[0], arguments[1])
`

/** پیدا کردن input با aria-label/placeholder و ست مقدار React */
export function fillByLabel(labelPart: string, value: string): string {
  // agent-browser find برچسب فارسی را می‌فهمد؛ fallback: مستقیم با label تریگر می‌کنیم
  const r = ab(`find role textbox fill --name "${labelPart}" "${value}"`)
  if (r.includes('✓')) return 'ok'
  // تلاش دوم: مستقیم DOM
  const ok = ev(`(function(){
    const inputs = Array.from(document.querySelectorAll('main input'))
    const el = inputs.find(i => (i.getAttribute('aria-label') || i.placeholder || '').includes('${labelPart}'))
    if (!el) return false
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, '${value.replace(/'/g, "\\'")}')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  return ok === true ? 'ok' : `fail(${r.slice(0, 80)})`
}

/** انتخاب گزینه Radix Select بر اساس برچسب فیلد (تریگر aria-label ندارد — نام از Label می‌آید) */
export function radixSelectByLabel(labelText: string, optionText: string): string {
  const opened = ev(`(function(){
    const labels = Array.from(document.querySelectorAll('main label'))
    const lab = labels.find(l => (l.textContent || '').includes('${labelText}'))
    if (!lab) return 'label-not-found'
    const wrap = lab.parentElement
    const trigger = wrap ? wrap.querySelector('button[role="combobox"]') : null
    if (!trigger) return 'trigger-not-found'
    trigger.click()
    return true
  })()`)
  if (opened !== true) return `fail(${String(opened)})`
  wait(1000)
  const picked = ev(`(function(){
    const opts = Array.from(document.querySelectorAll('[role="option"]'))
    const opt = opts.find(o => (o.textContent || '').includes('${optionText}'))
    if (!opt) return 'option-not-found(' + opts.length + ')'
    opt.click()
    return true
  })()`)
  wait(600)
  return picked === true ? 'ok' : `fail(${String(picked)})`
}

/** انتخاب گزینه Radix Select: کلیک روی تریگر با برچسب سپس گزینه */
export function radixSelect(triggerName: string, optionName: string): string {
  ab(`find role combobox click --name "${triggerName}"`)
  wait(900)
  const r = ab(`find role option click --name "${optionName}"`)
  wait(500)
  return r.includes('✓') ? 'ok' : `fail(${r.slice(0, 100)})`
}

/**
 * پرکردن input با placeholder (فیلدهای عددی اقلام بدون aria-label — مثل «-620»/«120»).
 * idx = چندمین input با آن placeholder (۰-مبنا)
 */
export function fillByPlaceholder(placeholder: string, value: string, idx = 0): string {
  const ok = ev(`(function(){
    const inputs = Array.from(document.querySelectorAll('main input[placeholder="${placeholder}"]'))
    const el = inputs[${idx}]
    if (!el) return 'not-found(' + inputs.length + ')'
    const proto = window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, '${value.replace(/'/g, "\\'")}')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  return ok === true ? 'ok' : `fail(${String(ok).slice(0, 80)})`
}

/** SearchSelect مشترک: کلیک تریگر با aria-label → تایپ جستجو → کلیک گزینه حاوی متن */
export function searchSelect(triggerAriaLabel: string, query: string, optionContains: string): string {
  const opened = ev(`(function(){
    const btn = Array.from(document.querySelectorAll('button[role="combobox"]'))
      .find(b => (b.getAttribute('aria-label') || '').includes('${triggerAriaLabel}'))
    if (!btn) return 'trigger-not-found'
    btn.click()
    return true
  })()`)
  if (opened !== true) return `fail(${String(opened)})`
  wait(900)
  // تایپ در input جستجوی پاپ‌آور (آخرین input نمایان)
  const typed = ev(`(function(){
    const inputs = Array.from(document.querySelectorAll('[data-radix-popper-content-wrapper] input, [role="dialog"] input'))
    const el = inputs[inputs.length - 1]
    if (!el) return 'search-input-not-found'
    const proto = window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, '${query.replace(/'/g, "\\'")}')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  if (typed !== true) return `fail(${String(typed)})`
  wait(1100)
  const picked = ev(`(function(){
    const opts = Array.from(document.querySelectorAll('[role="option"]'))
    const opt = opts.find(o => o.textContent.includes('${optionContains}'))
    if (!opt) return 'option-not-found(' + opts.length + ')'
    opt.click()
    return true
  })()`)
  wait(600)
  return picked === true ? 'ok' : `fail(${String(picked)})`
}

/** متن توست‌های فعال صفحه */
export function toastText(): string {
  return String(ev(`Array.from(document.querySelectorAll('[role=status]')).map(t => t.textContent.trim()).join(' || ')`) ?? '')
}

/** سوییچ شرکت از UI با راستی‌آزمایی هدر (تا ۲ تلاش) */
export function switchCompanyUI(targetName: string): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    // دکمه شرکت فعال = هر دکمه هدر با نام شرکت + شِوران — با نام شرکت فعلی
    const current = String(ev(`(function(){ const b = Array.from(document.querySelectorAll('header button')).find(x => (x.textContent||'').includes('سرام') || (x.textContent||'').includes('نیلو') || (x.textContent||'').includes('اصفهان') || (x.textContent||'').includes('لیان') || (x.textContent||'').includes('هلدینگ')); return b ? b.textContent.trim() : '' })()`) ?? '')
    if (current.includes(targetName)) return true // قبلاً سوییچ شده
    const opened = ab(`find role button click --name "${current.slice(0, 25)}"`)
    wait(1000)
    const clicked = ab(`find role menuitem click --name "${targetName}"`)
    wait(4000)
    const header = String(ev(`Array.from(document.querySelectorAll('header button')).map(b => b.textContent.trim()).join(' ')`) ?? '')
    if (header.includes(targetName)) return true
    if (attempt === 0) {
      // بستن منوی باز احتمالی با Escape و تلاش دوباره
      ab('press Escape')
      wait(600)
    }
  }
  return false
}

