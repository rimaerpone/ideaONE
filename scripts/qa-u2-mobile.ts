// QA موبایل P2.5-U2 — نوار اقدام گروهی و ستون چک‌باکس در 390px (بدون سرریز افقی)
import { ab, ev, wait, login } from './e2e-golden-helpers'
import { mkdirSync } from 'node:fs'

const OUT = '/home/z/my-project/download/qa-p2.5-u2'
mkdirSync(OUT, { recursive: true })

let fail = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) fail++
}

ab('set viewport 390 844')
wait(500)
check('ورود dabir.arad', login('dabir.arad', '12345678'))
wait(1500)

// نمای نامه‌ها + انتخاب ۲ ردیف
ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:letters', kind: 'list', viewKey: 'letters', title: 'نامه‌ها', icon: 'Mail' }], activeTabId: 'list:letters' })); return true })()`)
ab('open http://localhost:81/ --wait networkidle', 90000)
wait(4000)

const mobileSel = ev(`(function(){
  // فقط چک‌باکس‌های فعال (نامه بایگانی‌شده = غیرفعال) — دو مورد اول
  const cbs = Array.from(document.querySelectorAll('main tbody input[type=checkbox]')).filter(cb => !cb.disabled).slice(0, 2)
  for (const cb of cbs) cb.click()
  return cbs.length
})()`)
check('حداقل یک چک‌باکس فعال در موبایل انتخاب شد', Number(mobileSel) >= 1, `sel=${String(mobileSel)} (صفحه اول موبایل ممکن است نامه‌های بایگانی‌شده داشته باشد)`)
wait(800)

// سرریز افقی صفحه
const overflow = ev(`(function(){ return { doc: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth } })()`)
const o = typeof overflow === 'string' ? JSON.parse(overflow) : overflow as { doc: boolean; sw: number; cw: number }
check('بدون سرریز افقی ۳۹۰px (نمای نامه‌ها با انتخاب)', o.doc === false, `sw=${o.sw} cw=${o.cw}`)

// نوار گروهی دیده می‌شود و داخل عرض صفحه است
const bar = ev(`(function(){ const r = document.querySelector('[aria-label="نوار اقدام گروهی"]'); if (!r) return 'gone'; const b = r.getBoundingClientRect(); return JSON.stringify({ text: r.innerText.slice(0, 30), left: Math.round(b.left), right: Math.round(b.right), vw: window.innerWidth }) })()`)
const b = typeof bar === 'string' ? (bar === 'gone' ? null : JSON.parse(bar)) : bar as { text: string; left: number; right: number; vw: number } | null
check('نوار گروهی در موبایل نمایان', b !== null, String(bar).slice(0, 40))
if (b) check('نوار داخل عرض صفحه (۳۹۰px)', b.left >= -1 && b.right <= b.vw + 1, `left=${b.left} right=${b.right} vw=${b.vw}`)

ab(`screenshot ${OUT}/u2-mobile-390-bulkbar.png`)
wait(300)

// نمای درخواست‌ها — کارت با چک‌باکس
ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:requests', kind: 'list', viewKey: 'requests', title: 'درخواست کالا', icon: 'ClipboardList' }], activeTabId: 'list:requests' })); return true })()`)
ab('open http://localhost:81/ --wait networkidle', 90000)
wait(3500)
const o2v = ev(`document.documentElement.scrollWidth > document.documentElement.clientWidth + 1`)
check('بدون سرریز افقی ۳۹۰px (نمای درخواست‌ها)', o2v === false)
ab(`screenshot ${OUT}/u2-mobile-390-requests.png`)

console.log(fail === 0 ? '✅ موبایل سبز' : `❌ ${fail} قرمز`)
try { ab('close', 15000) } catch { /* noop */ }
process.exit(fail === 0 ? 0 : 1)
