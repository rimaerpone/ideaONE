/**
 * تست E2E «داشبورد نسل ۲» (برنامه D1..D6 + N1 — بازنگری دسته‌بندی و طراحی صفحات)
 *
 * پوشش:
 *   D1 — چهار KPI عملیاتی کلیک‌پذیر → ناوبری به نمای مرتبط (دو نقش)
 *   D2 — بخش «حاکمیت و راهبری» فقط برای مدیران (کاتالوگ پلاگین + AI + گیت در همان بلوک)
 *   D3 — نقش غیرمدیر: بدون بلوک حاکمیت، بدون KPI پلاگین/AI
 *   D4 — فید فعالیت عاری از رویداد ورود (LOGIN و هم‌خانواده)
 *   D5 — چیدمان KPI: دقیقاً ۴ کارت در یک ردیف در ۱۹۲۰px (بدون ردیف یتیم)
 *   D6 — کارت «نمای شرکت‌های هلدینگ» فقط در دامنه گروهی، با جمع منطق
 *   N1 — سایدبار بدون سربرگ تکراری «انبار و لجستیک»
 */
import { ab, ev, login, logout, wait, shot, GW } from './e2e-golden-helpers'

const OUT = '/home/z/my-project/scripts/audit-nav'
let pass = 0
let fail = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`) }
  else { fail += 1; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function readMain(): string {
  return (ev(`document.querySelector('main')?.innerText ?? ''`) as string) ?? ''
}

function parseArr(r: unknown): string[] {
  if (Array.isArray(r)) return r.map(String)
  if (typeof r === 'string') {
    try {
      const p = JSON.parse(r)
      return Array.isArray(p) ? p.map(String) : []
    } catch { return [] }
  }
  return []
}

function kpiButtons(): string[] {
  return parseArr(ev(`JSON.stringify([...document.querySelectorAll('main button[aria-label]')].map(b => b.getAttribute('aria-label')))`))
}

// ───────────────────────── بخش ۱ — مدیر هلدینگ (دامنه گروهی) ─────────────────────────
console.log('\n■ ۱) مدیر هلدینگ — KPIهای عملیاتی، حاکمیت، نمای شرکت‌ها')
ab('set viewport 1920 1080')
logout()
// مقاوم‌سازی ترتیب تست‌ها: workspace نشست قبلی (مثلاً «موجودی» از t35) در sessionStorage
// می‌ماند و پس از ورود همان نما فعال می‌شود — تست داشبورد باید از داشبوردِ پیش‌فرض شروع کند
wait(600)
ev(`window.sessionStorage.removeItem('io.workspace.v1'); return true`)
check('ورود admin', login('admin', 'admin123'))
wait(2500)

const main1 = readMain()
const kpis1 = kpiButtons()
check('D5 — دقیقاً ۴ KPI عملیاتی', kpis1.length === 4, `got ${kpis1.length}: ${kpis1.join(' | ')}`)
check('D5 — یک ردیف KPI در ۱۹۲۰px (y یکسان)', (() => {
  const ys = parseArr(ev(`JSON.stringify([...document.querySelectorAll('main button[aria-label]')].map(b => Math.round(b.getBoundingClientRect().y)))`)).map(Number)
  return ys.length === 4 && new Set(ys).size === 1
})())

// D2 — بلوک حاکمیت برای مدیر
check('D2 — بلوک «حاکمیت و راهبری» حاضر است', main1.includes('حاکمیت و راهبری'))
check('D2 — نشان «ویژه مدیران»', main1.includes('ویژه مدیران'))
check('D2 — خلاصه پلاگین‌ها در بلوک حاکمیت (نه KPI مستقل)', main1.includes('فعال از') && !kpis1.some((k) => k.includes('کاتالوگ')))
check('D2 — خلاصه غنی‌سازی AI در بلوک حاکمیت', main1.includes('غنی‌سازی AI'))
check('D2 — سنجه‌های گیت داخل بلوک حاکمیت', main1.includes('سنجه گیت') || main1.includes('سنجه‌های گیت') || main1.includes('از ۶ سنجه'))

// D6 — نمای شرکت‌ها در دامنه گروهی
check('D6 — کارت «نمای شرکت‌های هلدینگ» در دامنه گروهی', main1.includes('نمای شرکت‌های هلدینگ'))
const perCompanyRows = (() => {
  const r = ev(`document.querySelectorAll('table tbody tr').length`)
  return typeof r === 'number' ? r : 0
})()
check('D6 — جدول شرکت‌ها ۴ ردیف دارد', perCompanyRows === 4, `rows=${perCompanyRows}`)

// D4 — فید فعالیت بدون رویداد ورود
check('D4 — فید فعالیت بدون «ورود به سامانه»', !main1.includes('ورود به سامانه'))
check('D4 — فید فعالیت رویداد کسب‌وکاری دارد', main1.includes('آخرین فعالیت‌ها'))

shot('dash2-admin-holding')

// D1 — کلیک KPI → ناوبری (کارتابل)
const clickKpi = (label: string): boolean => {
  const r = ev(`(function(){ const b = [...document.querySelectorAll('main button[aria-label]')].find(x => x.getAttribute('aria-label').includes('${label}')); if (!b) return false; b.click(); return true; })()`)
  return r === true
}
check('D1 — کلیک «کارتابل من»', clickKpi('کارتابل من'))
wait(1800)
check('D1 — رسیدن به نمای کارتابل', readMain().includes('نامه‌های در انتظار اقدام'))
check('D1 — بازگشت به داشبورد', (() => { ev(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.includes('داشبورد')).click()`); return true })())
wait(2200)
check('D1 — کلیک «موجودی کل»', clickKpi('موجودی کل'))
wait(1800)
check('D1 — رسیدن به نمای موجودی انبار', readMain().includes('موجودی انبار'))
ev(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.includes('داشبورد')).click()`)
wait(2200)

// N1 — سایدبار بدون سربرگ تکراری
const navLines = parseArr(ev(`JSON.stringify(document.querySelector('aside nav').innerText.split('\\n').map(s => s.trim()).filter(Boolean))`))
const dupWarehouse = navLines.filter((l) => l === 'انبار و لجستیک').length
check('N1 — سربرگ «انبار و لجستیک» فقط یک‌بار', dupWarehouse === 1, `count=${dupWarehouse}`)
check('N1 — سربرگ ماژول متمایز حفظ شده (اتوماسیون اداری)', navLines.includes('اتوماسیون اداری و دبیرخانه'))

// ───────────────────────── بخش ۲ — نقش غیرمدیر (دامنه شرکت) ─────────────────────────
console.log('\n■ ۲) نقش غیرمدیر (dabir.arad) — داشبورد عملیاتی خالص')
logout()
wait(600)
ev(`window.sessionStorage.removeItem('io.workspace.v1'); return true`)
check('ورود dabir.arad', login('dabir.arad', '12345678'))
wait(2500)

const main2 = readMain()
const kpis2 = kpiButtons()
check('D3 — KPIهای عملیاتی همان چهار کارت', kpis2.length === 4)
check('D3 — بدون بلوک حاکمیت', !main2.includes('حاکمیت و راهبری'))
check('D3 — بدون سنجه گیت', !main2.includes('سنجه گیت') && !main2.includes('سنجه‌های گیت'))
check('D3 — بدون KPI کاتالوگ پلاگین‌ها', !kpis2.some((k) => k.includes('کاتالوگ')) && !main2.split('آخرین فعالیت‌ها')[0].includes('کاتالوگ پلاگین‌ها'))
check('D3 — دامنه شرکت: بدون کارت «نمای شرکت‌های هلدینگ»', !main2.includes('نمای شرکت‌های هلدینگ'))
check('D1 — زیرمتن مهلت‌گذشته برای نقش عملیاتی', main2.includes('مهلت') && (main2.includes('مهلت‌گذشته') || main2.includes('≤ ۳ روز')))
shot('dash2-dabir-company')

check('D1 — کلیک «درخواست کالای باز» (نقش غیرمدیر)', clickKpi('درخواست کالای باز'))
wait(1800)
check('D1 — رسیدن به نمای درخواست کالا', readMain().includes('درخواست'))

// ───────────────────────── جمع‌بندی ─────────────────────────
console.log('\n' + '─'.repeat(60))
console.log(`نتیجه تست داشبورد نسل ۲: ${pass} پاس · ${fail} خطا`)
if (failures.length) {
  console.log('خطاها:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log('✅ همه سنجه‌های داشبورد نسل ۲ سبز است')
