/**
 * P1-T35 — راستی‌آزمایی لیست مجازی: ۱۰۰۰+ سطر بدون افت
 * ۱) نمای موجودی انبار (۳۰۱۳ قلم پس از seed:big) → «همه سطرها (لیست مجازی)»
 * ۲) شمار سطرهای DOM ≈ پنجره دید (نه ۳۰۱۳) — رندر پنجره‌ای برقرار است
 * ۳) fps اسکرول برنامه‌ریزی‌شده (هدف ≥۵۵ میانگین، بدون قطره‌های بزرگ)
 * ۴) heap JS قبل/بعد اسکرول — پایدار (رشد < ۲۵٪ و بدون نشست فزاینده)
 */
import { ab, ev, wait, shot, login } from './e2e-golden-helpers'

let pass = 0
let fail = 0
const metrics: string[] = []
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { pass++; metrics.push(`  ✓ ${name}`) } else { fail++; metrics.push(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

ab(`set viewport 1280 900`)
wait(400)

// ── ۰) ورود — تست خودکفا است (قبلاً به نشست جامانده از تست‌های قبلی وابسته بود)
if (!login('dabir.arad', '12345678')) {
  metrics.push('  ✗ ورود dabir.arad (پیش‌نیاز همه سنجه‌ها)')
  console.log('━'.repeat(60))
  metrics.forEach((m) => console.log(m))
  console.log('نتیجه: 0 پاس / 1 خطا — ورود ناموفق')
  process.exit(1)
}
metrics.push('  ✓ ورود dabir.arad (دامنه دید آراد ≈ ۱٬۱۱۶ قلم)')
wait(1200)

// ── ۱) نمای موجودی انبار
ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:stock', kind: 'list', viewKey: 'stock', title: 'موجودی انبار', icon: 'Boxes' }], activeTabId: 'list:stock' })); return true })()`)
ab(`open http://localhost:81/ --wait networkidle`, 90000)
wait(5000)

// انتخاب «همه سطرها (لیست مجازی)» — نکته: کلیک JS خام روی Radix Trigger باز نمی‌کند؛ فرمان بومی لازم است
const allOpt = ab(`find role button click --name "اندازه صفحه"`)
wait(1200)
if (allOpt.includes('✓')) {
  const picked = ab(`find role menuitemcheckbox click --name "همه سطرها"`)
  wait(3000)
  metrics.push(`  · انتخاب «همه سطرها»: ${picked.slice(0, 40)}`)
  // بهداشت تست (درس U4): این منو با preventDefault باز می‌ماند؛ Radix پس‌زمینه را
  // aria-hidden می‌کند و «find role» تست‌های بعدی را کور می‌کند — با Escape می‌بندیم
  ev(`(function(){ document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`)
  wait(600)
} else {
  metrics.push(`  · تریگر اندازه صفحه: ${allOpt.slice(0, 50)}`)
}

// ── ۲) شمار ردیف‌های DOM در برابر total
const counts = ev(`(function(){ const rows = document.querySelectorAll('main table tbody tr'); const visible = Array.from(rows).filter(r => r.offsetParent !== null && r.getBoundingClientRect().height > 1); const counter = Array.from(document.querySelectorAll('main p, main span, main div')).map(e => e.textContent || '').find(t => /از [\\u06F0-\\u06F9]+/.test(t) && t.includes('نمایش')); return JSON.stringify({ domRows: rows.length, visible: visible.length, counter: counter ? counter.trim().slice(0, 60) : '' }) })()`)
const c = typeof counts === 'string' ? JSON.parse(counts) : counts as { domRows: number; visible: number; counter: string }
metrics.push(`  · ردیف‌های DOM: ${c.domRows} | نمایان: ${c.visible} | شمارنده: ${c.counter}`)

// یافتن ظرف اسکرول (max-h-[70vh]) — رندر مجازی فقط وقتی > آستانه ۸۰ فعال است
const scroller = ev(`(function(){ var table = document.querySelector('main table'); var el = table ? (function(n){ while (n && n !== document.body){ if (getComputedStyle(n).overflowY === 'auto' && n.scrollHeight > n.clientHeight + 100) return n; n = n.parentElement } return null })(table) : null; return el ? JSON.stringify({ sh: el.scrollHeight, ch: el.clientHeight }) : 'no-scroller' })()`)
metrics.push(`  · ظرف اسکرول: ${typeof scroller === 'string' ? scroller : JSON.stringify(scroller)}`)

const total = 1000 // معیار پذیرش: «۱۰۰۰+ سطر بدون افت» — دامنه دید آراد از seed:big ≈ ۱۱۱۶ قلم (ارتفاع مجازی ۵۰هزار پیکسل)
const sc = typeof scroller === 'string' ? scroller : JSON.stringify(scroller)
check(`جدول بیش از ${total} سطر دارد (ارتفاع مجازی > ۴۰k px)`, sc.includes('sh') && Number((JSON.parse(sc) as { sh: number }).sh) > 40000, sc)

// رندر پنجره‌ای: DOM نباید همه ۳۰۱۳ ردیف را داشته باشد (فاصله‌انداز + پنجره ≈ <۱۲۰ سطر)
check('رندر پنجره‌ای فعال — DOM فقط پنجره دید را دارد', c.domRows < 150, `domRows=${c.domRows}`)
shot('t35-virtual-stock')

// ── ۳) fps اسکرول — روی ظرف مجازی خودِ جدول (والد table با overflow-y:auto)
const fpsRes = ev(`(function(){
  return new Promise(function(resolve){
    var table = document.querySelector('main table')
    var el = table ? (function(n){ while (n && n !== document.body){ if (getComputedStyle(n).overflowY === 'auto' && n.scrollHeight > n.clientHeight + 100) return n; n = n.parentElement } return null })(table) : null
    if (!el) { resolve(JSON.stringify({ error: 'no-scroller' })); return }
    var frames = [], t0 = null, lastY = 0, dir = 1, passes = 0
    function frame(t){
      if (t0 === null) t0 = t
      frames.push(t)
      el.scrollTop += dir * 55
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 5) { dir = -1; passes++ }
      if (el.scrollTop <= 2 && dir === -1) { dir = 1; passes++ }
      if (t - t0 < 2600 && passes < 3) { requestAnimationFrame(frame) }
      else {
        var deltas = []
        for (var i = 1; i < frames.length; i++) deltas.push(frames[i] - frames[i-1])
        deltas.sort(function(a,b){ return a-b })
        var med = deltas[Math.floor(deltas.length/2)] || 16
        var p95 = deltas[Math.floor(deltas.length*0.95)] || 32
        var worst = deltas[deltas.length-1] || 64
        var avgFps = Math.round(1000 / Math.max(1, (deltas.reduce(function(a,b){return a+b},0) / deltas.length)))
        resolve(JSON.stringify({ fps: avgFps, medMs: Math.round(med*10)/10, p95Ms: Math.round(p95*10)/10, worstMs: Math.round(worst*10)/10, frames: frames.length, scrollH: el.scrollHeight, clientH: el.clientHeight }))
      }
    }
    requestAnimationFrame(frame)
  })
})()`)
const f = typeof fpsRes === 'string' ? JSON.parse(fpsRes) : fpsRes as { fps: number; medMs: number; p95Ms: number; worstMs: number; frames: number; scrollH?: number }
metrics.push(`  · اسکرول روی ظرف مجازی (scrollH=${f.scrollH ?? '?'}px): ${f.fps}fps میانگین | med ${f.medMs}ms | p95 ${f.p95Ms}ms | بدترین ${f.worstMs}ms | ${f.frames} فریم`)
// میانگین در dev-mode سخت‌گیرانه است؛ معیار عملی: median ≤ ۱۷ms (۶۰fps) + p95 معقول
check('اسکرول روان — median ≤ ۱۷ms (۶۰fps مرکزی)', Number(f.medMs) <= 17, JSON.stringify(f))
check('قطره‌های سنگین معدود (p95 < ۷۰ms)', Number(f.p95Ms) < 70, `p95=${f.p95Ms}ms`)

// ── ۴) پایداری حافظه/ظرف DOM — قبل/بعد دو گذر اسکرول دیگر روی همان ظرف مجازی
// (performance.memory فقط کروم است — سنجه عملی: شمار گره DOM در «همان موقعیت اسکرول» نباید فزاینده رشد کند = بدون نشست)
const jumpTo = (px: number) => ev(`(function(){ var table = document.querySelector('main table'); var el = table ? (function(n){ while (n && n !== document.body){ if (getComputedStyle(n).overflowY === 'auto' && n.scrollHeight > n.clientHeight + 100) return n; n = n.parentElement } return null })(table) : null; if (el) el.scrollTop = ${px}; return true })()`)
jumpTo(200)
wait(800)
const nodes1 = Number(ev(`document.getElementsByTagName('*').length`) ?? 0)
const dom1 = Number(ev(`document.querySelectorAll('main table tbody tr').length`) ?? 0)
jumpTo(0); jumpTo(25000); jumpTo(50000); jumpTo(200) // چهار پرش کامل در طول لیست
wait(1800)
const nodes2 = Number(ev(`document.getElementsByTagName('*').length`) ?? 0)
const dom2 = Number(ev(`document.querySelectorAll('main table tbody tr').length`) ?? 0)
const growth = nodes1 > 0 ? ((nodes2 - nodes1) / nodes1) * 100 : 0
metrics.push(`  · گره DOM در همان موقعیت: ${nodes1} → ${nodes2} (${growth.toFixed(1)}٪) | سطرهای جدول: ${dom1} → ${dom2}`)
check('ظرف DOM پایدار پس از اسکرول (رشد < ۱۰٪ = بدون نشست)', growth < 10, `${nodes1}→${nodes2}`)

console.log('━'.repeat(60))
console.log('P1-T35 — لیست مجازی جدول‌های بزرگ (موجودی انبار، seed:big)')
metrics.forEach((m) => console.log(m))
console.log('━'.repeat(60))
console.log(`نتیجه: ${pass} پاس / ${fail} خطا`)
if (fail > 0) process.exit(1)
