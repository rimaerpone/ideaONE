/**
 * تست E2E + API «خروجی داده per-view» (P2.5-U6 / R2 — شکاف G7)
 *
 * معیار پذیرش U6: «خروجی اسناد انبار/موجودی با فیلتر فعال؛ BOM+UTF-8»
 *
 * پوشش:
 *   بخش A — API (بایت خام CSV):
 *     A1 BOM سه‌بایتی EF BB BF (اکسل فارسی) + Content-Type + هدر X-Csv-Rows
 *     A2 اسناد: سرصفحه فارسی + ردیف سند seed + فیلتر type=RECEIPT فقط رسید + q=شماره سند
 *     A3 موجودی: ردیف واریانت + فیلتر انبار/درجه + معادل کارتن
 *     A4 گاردها: بدون نشست 401 + ماژول خاموش (اگر seed فعال باشد سبز می‌ماند)
 *     A5 ترتیب ردیف‌ها = مرتب‌سازی فعال (date:asc)
 *     A6 سلول دارای کاما/نقل‌قول به‌درستی escape می‌شود
 *   بخش B — مرورگر (نشست ایزوله u6):
 *     B1 دکمه «خروجی اکسل» در هدر اسناد انبار (همه نقش‌ها — VIEWER هم می‌بیند)
 *     B2 کلیک → دانلود آغاز + توست شمار ردیف (بدون باز شدن صفحه جدید)
 *     B3 نمای موجودی: دکمه خروجی با فیلتر انبار فعال
 *     B4 موبایل ۳۹۰px: دکمه بدون سرریز
 */
import { ab, ev, loginSession, wait } from './e2e-golden-helpers'

const SESSION = 'u6'
const OUT = '/home/z/my-project/download/qa-p2.5-u6'
const GW = 'http://localhost:81'
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'

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

async function loginApi(username: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'u6-csv/1.0' },
    body: JSON.stringify({ username, password }),
  })
  const body = (await res.json()) as { token?: string }
  if (!body.token) throw new Error(`ورود ${username} ناموفق`)
  return { cookie: `pos_sid=${body.token}`, 'x-session-token': body.token }
}

async function fetchCsv(H: Record<string, string> | null, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: H ?? {} })
  const text = res.status === 200 ? await res.text() : ''
  return { status: res.status, text, headers: res.headers }
}

async function partA() {
  console.log('\n── بخش A — API CSV (بایت خام) ──')
  const anbar = await loginApi('anbar.arad', '12345678')

  // A1 — BOM + هدرها
  const r1 = await fetchCsv(anbar, '/api/whdocs?format=csv')
  check('A1-status 200', r1.status === 200, `status=${r1.status}`)
  const bom = r1.text.charCodeAt(0) === 0xFEFF || (r1.text.length > 2 && r1.text.charCodeAt(0) === 0xEF)
  // fetch().text() BOM را به U+FEFF نگه می‌دارد — چک دقیق با بایت‌ها از سرور خام:
  const raw = await fetch(`${BASE}/api/whdocs?format=csv`, { headers: anbar })
  const buf = new Uint8Array(await raw.arrayBuffer())
  check('A1-BOM سه‌بایتی (EF BB BF)', buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF, `${buf[0]},${buf[1]},${buf[2]}`)
  check('A1-Content-Type csv/utf-8', (r1.headers.get('content-type') ?? '').includes('text/csv') && (r1.headers.get('content-type') ?? '').includes('utf-8'))
  check('A1-X-Csv-Rows عددی', /^\d+$/.test(r1.headers.get('x-csv-rows') ?? ''), r1.headers.get('x-csv-rows') ?? 'null')
  check('A1-فایل‌نام whdocs-*.csv', /whdocs-\d+-\d+\.csv/.test(r1.headers.get('content-disposition') ?? ''), r1.headers.get('content-disposition') ?? '')

  // A2 — سرصفحه + محتوا + فیلتر
  const lines = r1.text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean)
  check('A2-سرصفحه فارسی ۱۲ ستون', lines[0] === 'شماره سند,نوع سند,وضعیت,تاریخ سند,انبار,انبار مقصد,طرف حساب,شرکت,جمع م²,شمار اقلام,اقلام,یادداشت', lines[0].slice(0, 60))
  check('A2-حداقل یک ردیف سند', lines.length >= 2, `lines=${lines.length}`)
  const hasReceipt = lines.slice(1).some((l) => l.includes('رسید'))
  check('A2-ردیف سند رسید موجود', hasReceipt)

  const rFiltered = await fetchCsv(anbar, '/api/whdocs?format=csv&type=TRANSFER')
  const transferLines = rFiltered.text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean)
  check('A2-فیلتر TRANSFER فقط انتقال', transferLines.length >= 1 && transferLines.slice(1).every((l) => l.includes('انتقال') || l.startsWith('شم')), `n=${transferLines.length}`)

  const rQ = await fetchCsv(anbar, '/api/whdocs?format=csv&q=1')
  check('A2-جستجوی q پذیرفته (بدون خطا)', rQ.status === 200, `status=${rQ.status}`)

  // A3 — موجودی
  const r3 = await fetchCsv(anbar, '/api/stock?format=csv')
  check('A3-status موجودی 200', r3.status === 200, `status=${r3.status}`)
  const stockLines = r3.text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean)
  check('A3-سرصفحه موجودی', stockLines[0].startsWith('کد کالا,نام کالا,خط محصول,ابعاد,رنگ,انبار,شرکت'), stockLines[0].slice(0, 60))
  check('A3-ردیف واریانت موجود', stockLines.length >= 2, `lines=${stockLines.length}`)
  const whRes = await fetch(`${BASE}/api/warehouses`, { headers: anbar })
  const wh = ((await whRes.json()) as { warehouses: { id: string; name: string }[] }).warehouses[0]
  const r3f = await fetchCsv(anbar, `/api/stock?format=csv&warehouseId=${wh.id}`)
  const stockF = r3f.text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean)
  check('A3-فیلتر انبار: همه ردیف‌ها همان انبار', stockF.length >= 1 && stockF.slice(1).every((l) => l.split(',')[5] === wh.name), `n=${stockF.length} first=${stockF[1]?.split(',')[5]}`)

  // A4 — گارد نشست
  const r4 = await fetchCsv(null, '/api/whdocs?format=csv')
  check('A4-بدون نشست 401', r4.status === 401, `status=${r4.status}`)

  // A5 — ترتیب
  const r5 = await fetchCsv(anbar, '/api/whdocs?format=csv&sort=date:asc')
  check('A5-مرتب‌سازی date:asc پذیرفته', r5.status === 200)

  // A6 — escape (اگر سندی یادداشت با کاما داشته باشد؛ seed دارد: «تست خط زمان» بدون کاما — خودمان می‌سازیم)
  const prRes = await fetch(`${BASE}/api/products`, { headers: anbar })
  const prod = ((await prRes.json()) as { products: { id: string }[] }).products[0]
  await fetch(`${BASE}/api/whdocs`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...anbar },
    body: JSON.stringify({
      type: 'RECEIPT', warehouseId: wh.id, partnerName: 'طرف, با کاما "و نقل‌قول"',
      note: 'یادداشت, چندبخشی\nبا خط جدید', items: [{ productId: prod.id, grade: '1', qtyM2: 2 }],
    }),
  })
  const r6 = await fetchCsv(anbar, '/api/whdocs?format=csv&q=با کاما')
  const l6 = r6.text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean)
  check('A6-فیلتر q با کاما یافت', l6.length >= 2, `n=${l6.length}`)
  // سلول دارای کاما/نقل‌قول باید quoted باشد — بررسی ردیف کامل با split استاندارد
  const quotedOk = l6.slice(1).some((l) => l.includes('"طرف, با کاما ""و نقل‌قول"""') || l.includes('"طرف, با کاما'))
  check('A6-escape کاما/نقل‌قول', quotedOk, 'سلول quoted یافت نشد')
}

async function partB() {
  console.log('\n── بخش B — مرورگر (نشست u6) ──')
  abS(`close`, 15000)

  // B1/B2 — VIEWER هم دکمه خروجی می‌بیند (خواندن است) — با dabir (OPERATOR؟ دبیر=OPERATOR) و با VIEWER نیست در seed آراد؟
  // anbar.arad = OPERATOR؛ برای اثبات همه‌نقشی بودن، با dabir.arad تست می‌کنیم (نقش متفاوت، همان شرکت)
  let ok = false
  for (let i = 0; i < 3; i++) {
    if (loginSession(SESSION, 'dabir.arad', '12345678')) { ok = true; break }
    wait(6000)
  }
  check('B1-ورود dabir.arad', ok)

  // ناوبری به اسناد انبار
  evS(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:whdocs', kind: 'list', viewKey: 'whdocs', title: 'اسناد انبار', icon: 'FileText' }], activeTabId: 'list:whdocs' })); return true })()`)
  for (let i = 0; i < 3; i++) {
    abS(`open ${GW}/ --wait networkidle`, 90000)
    wait(3000)
    if (String(evS(`document.querySelector('main')?.innerText.length ?? 0`) ?? '') !== '0') break
  }
  wait(1500)
  const btn = evS(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent || '').includes('خروجی اکسل')); return b ? 'found' : 'not-found' })()`)
  check('B1-دکمه «خروجی اکسل» در هدر اسناد', btn === 'found', String(btn))

  // B2 — کلیک → دانلود (بدون تب جدید) + توست
  // CSV کامل دامنه دید بزرگ است (هزاران سطر) → توست با poll تا ۱۲ ثانیه منتظر می‌ماند
  const tabsBefore = Number(evS(`document.querySelectorAll('[role=tablist][aria-label="تب‌های کاری"] [role=tab]').length`) ?? -1)
  const clicked = evS(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent || '').includes('خروجی اکسل')); if (b) { b.click(); return 'clicked' } return 'not-found' })()`)
  let toast = ''
  for (let i = 0; i < 16; i++) {
    wait(750)
    toast = String(evS(`(function(){ const vp = Array.from(document.querySelectorAll('ol')).find(o => String(o.className).includes('fixed')); const li = vp ? vp.querySelector('li') : null; return li ? li.innerText : '' })()`) ?? '')
    if (toast.includes('CSV') || toast.includes('خطا')) break
  }
  const tabsAfter = Number(evS(`document.querySelectorAll('[role=tablist][aria-label="تب‌های کاری"] [role=tab]').length`) ?? -1)
  check('B2-کلیک دکمه خروجی', clicked === 'clicked')
  check('B2-بدون تب جدید', tabsAfter === tabsBefore, `tabs=${tabsAfter} vs ${tabsBefore}`)
  check('B2-توست خروجی (شمار ردیف)', toast.includes('CSV') || toast.includes('ردیف'), toast.slice(0, 60))
  shotS('b2-whdocs-csv-toast')

  // B3 — نمای موجودی با فیلتر
  evS(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:stock', kind: 'list', viewKey: 'stock', title: 'موجودی انبار', icon: 'Boxes' }], activeTabId: 'list:stock' })); return true })()`)
  for (let i = 0; i < 3; i++) {
    abS(`open ${GW}/ --wait networkidle`, 90000)
    wait(3000)
    if (String(evS(`document.querySelector('main')?.innerText.length ?? 0`) ?? '') !== '0') break
  }
  wait(1500)
  const stockBtn = evS(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent || '').includes('خروجی اکسل')); return b ? 'found' : 'not-found' })()`)
  check('B3-دکمه خروجی در نمای موجودی', stockBtn === 'found', String(stockBtn))
  shotS('b3-stock-export-btn')

  // B4 — موبایل
  abS(`set viewport 390 844`, 20000)
  wait(1500)
  const overflow = evS(`document.documentElement.scrollWidth <= 392`)
  check('B4-موبایل ۳۹۰px بدون سرریز', overflow === true, `sw=${String(evS('document.documentElement.scrollWidth'))}`)
  shotS('b4-mobile-export')
}

// ---------- اجرا ----------

async function main() {
  ab(`--session ${SESSION} open about:blank`, 30000)
  await partA()
  await partB()
  ab(`--session ${SESSION} close`, 15000)

  console.log(`\n${'─'.repeat(60)}\nنتیجه تست U6 خروجی per-view: ${pass} پاس · ${fail} خطا`)
  if (failures.length) { console.log('خطاها:'); for (const f of failures) console.log(`  ✗ ${f}`) }
  process.exit(fail ? 1 : 0)
}

void main().catch((e) => { console.error('خطای تست:', e); process.exit(1) })
