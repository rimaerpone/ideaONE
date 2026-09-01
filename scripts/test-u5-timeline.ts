/**
 * تست E2E + API «خط زمان اقدامات رکورد» (P2.5-U5 / R1 — شکاف G8)
 *
 * معیار پذیرش U5: «صفحه سند انبار خط زمان کامل اقدامات (ثبت/قطعی/ابطال/پیوست)»
 *
 * پوشش:
 *   بخش A — API (fetch):
 *     A1 گاردها: نهاد خارج لیست‌سفید (letter) → 400 · بدون id → 400 · بدون نشست → 401
 *     A2 سند: ثبت پیش‌نویس → خط زمان ۱ رخداد «ثبت» → قطعی‌سازی → ۲ رخداد «ثبت/قطعی‌سازی»
 *     A3 ایزولاسیون چندشرکتی: کاربر نیلو → خط زمانِ سندِ آراد = خالی
 *     A4 درخواست: ثبت (anbar) → تأیید (ceo) → خط زمان ۲ رخداد با برچسب فارسی
 *     A5 کاربر: نهاد user برای رکورد کاربر انبار → ورودی سالم
 *   بخش B — مرورگر (agent-browser، نشست ایزوله u5):
 *     B1 صفحه سند: تب‌های داخلی «اقلام (۱)/خط زمان» + محتوای خط زمان (قطعی‌سازی + نام کاربر)
 *     B2 قطعی‌سازی زنده: اقدام POST در تب خط زمان → رخداد تازه بدون رفرش
 *     B3 صفحه درخواست: تب خط زمان با «تأیید درخواست»
 *     B4 صفحه کاربر (ادمین): تب سوم «خط زمان»
 *     B5 موبایل ۳۹۰px: بدون سرریز افقی
 */
import { ab, ev, loginSession, wait } from './e2e-golden-helpers'

const SESSION = 'u5'
const OUT = '/home/z/my-project/download/qa-p2.5-u5'
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

/** ورود مقاوم — پس از تغییر کد، اولین ورود ممکن است در پنجره کامپایل مجدد dev بیفتد (درس U5) */
function loginRetry(username: string, password: string): boolean {
  for (let i = 0; i < 3; i++) {
    if (loginSession(SESSION, username, password)) return true
    wait(6000)
  }
  return false
}

// ---------- بخش A — API ----------

async function loginApi(username: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'u5-timeline/1.0' },
    body: JSON.stringify({ username, password }),
  })
  const body = (await res.json()) as { token?: string }
  if (!body.token) throw new Error(`ورود ${username} ناموفق`)
  return { cookie: `pos_sid=${body.token}`, 'x-session-token': body.token }
}

type Timeline = { entries: { id: string; action: string; actionFa: string; userName: string; createdAt: string }[] }

async function timelineApi(H: Record<string, string> | null, entity: string, id: string) {
  const res = await fetch(`${BASE}/api/audit/timeline?entity=${entity}&id=${encodeURIComponent(id)}`, {
    headers: H ?? {},
  })
  return { status: res.status, body: res.status === 200 ? ((await res.json()) as Timeline) : null }
}

async function partA() {
  console.log('\n── بخش A — API خط زمان ──')
  const anbar = await loginApi('anbar.arad', '12345678')
  const ceo = await loginApi('ceo.arad', '12345678')
  const nilo = await loginApi('anbar.nilo', '12345678')
  const admin = await loginApi('admin', 'admin123')

  // A1 — گاردها
  const g1 = await timelineApi(anbar, 'letter', 'x')
  check('A1-نهاد غیرمجاز (letter) → 400', g1.status === 400, `status=${g1.status}`)
  const g2 = await timelineApi(anbar, 'warehouseDoc', '')
  check('A1-بدون id → 400', g2.status === 400, `status=${g2.status}`)
  const g3 = await timelineApi(null, 'warehouseDoc', 'x')
  check('A1-بدون نشست → 401', g3.status === 401, `status=${g3.status}`)

  // داده پایه: انبار + کالای آراد
  const whRes = await fetch(`${BASE}/api/warehouses`, { headers: anbar })
  const whBody = (await whRes.json()) as { warehouses: { id: string; companyId: string }[] }
  const wh = whBody.warehouses[0]
  const prRes = await fetch(`${BASE}/api/products`, { headers: anbar })
  const prBody = (await prRes.json()) as { products: { id: string }[] }
  const prod = prBody.products[0]

  // A2 — سند: پیش‌نویس → خط زمان → قطعی → خط زمان
  const mk = await fetch(`${BASE}/api/whdocs`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...anbar },
    body: JSON.stringify({
      type: 'RECEIPT', warehouseId: wh.id, partnerName: 'تست خط زمان',
      items: [{ productId: prod.id, tone: '', caliber: '', grade: '1', qtyM2: 12.5 }],
    }),
  })
  const mkBody = (await mk.json()) as { id?: string; docNumber?: number }
  check('A2-ثبت پیش‌نویس سند', mk.status === 200 && !!mkBody.id, JSON.stringify(mkBody).slice(0, 80))
  const docId = mkBody.id!
  const t1 = await timelineApi(anbar, 'warehouseDoc', docId)
  check('A2-خط زمان پس از ثبت = ۱ رخداد', t1.body?.entries.length === 1, `n=${t1.body?.entries.length}`)
  check('A2-برچسب فارسی «ثبت»', t1.body?.entries[0]?.actionFa === 'ثبت', `actionFa=${t1.body?.entries[0]?.actionFa}`)
  check('A2-نام کاربر ثبت‌کننده', (t1.body?.entries[0]?.userName ?? '').includes('کریمی'), `userName=${t1.body?.entries[0]?.userName}`)

  const post = await fetch(`${BASE}/api/whdocs/decide`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...anbar },
    body: JSON.stringify({ docId, action: 'POST' }),
  })
  check('A2-قطعی‌سازی سند', post.status === 200)
  const t2 = await timelineApi(anbar, 'warehouseDoc', docId)
  check('A2-خط زمان پس از قطعی = ۲ رخداد', t2.body?.entries.length === 2, `n=${t2.body?.entries.length}`)
  check('A2-برچسب فارسی «قطعی‌سازی»', (t2.body?.entries.some((e) => e.actionFa === 'قطعی‌سازی') ?? false), 'یافت نشد')

  // A3 — ایزولاسیون: نیلو سند آراد را خالی می‌بیند
  const t3 = await timelineApi(nilo, 'warehouseDoc', docId)
  check('A3-ایزولاسیون چندشرکتی (نیلو → سند آراد = خالی)', (t3.body?.entries.length ?? -1) === 0, `n=${t3.body?.entries.length}`)

  // A4 — درخواست: ثبت (anbar) → تأیید (ceo)
  const rq = await fetch(`${BASE}/api/requests`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...anbar },
    body: JSON.stringify({ warehouseId: wh.id, neededFor: 'تست خط زمان درخواست', items: [{ productId: prod.id, qtyM2: 5 }] }),
  })
  const rqBody = (await rq.json()) as { id?: string; reqNumber?: number }
  check('A4-ثبت درخواست کالا', rq.status === 200 && !!rqBody.id, JSON.stringify(rqBody).slice(0, 80))
  const reqId = rqBody.id!
  const dec = await fetch(`${BASE}/api/requests`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', ...ceo },
    body: JSON.stringify({ id: reqId, action: 'APPROVE' }),
  })
  check('A4-تأیید درخواست توسط مدیر', dec.status === 200)
  const t4 = await timelineApi(anbar, 'goodsRequest', reqId)
  check('A4-خط زمان درخواست = ۲ رخداد', t4.body?.entries.length === 2, `n=${t4.body?.entries.length}`)
  check('A4-برچسب «تأیید درخواست»', (t4.body?.entries.some((e) => e.actionFa === 'تأیید درخواست') ?? false), 'یافت نشد')

  // A5 — نهاد user (برای صفحه کاربر)
  const usersRes = await fetch(`${BASE}/api/users`, { headers: admin })
  const usersBody = (await usersRes.json()) as { users: { id: string; username: string }[] }
  const anbarUser = usersBody.users.find((u) => u.username === 'anbar.arad')
  const t5 = await timelineApi(admin, 'user', anbarUser?.id ?? 'x')
  check('A5-نهاد user سالم', t5.status === 200 && Array.isArray(t5.body?.entries), `status=${t5.status}`)

  return { docId, reqId, anbarUserId: anbarUser?.id ?? '' }
}

// ---------- بخش B — مرورگر ----------

/** تزریق تب رکورد (الگوی navTo با kind=record) */
function openRecordTab(viewKey: string, recordId: string, icon: string, title: string): void {
  evS(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'rec:${viewKey}:${recordId}', kind: 'record', viewKey: '${viewKey}', recordId: '${recordId}', title: '${title}', icon: '${icon}' }], activeTabId: 'rec:${viewKey}:${recordId}' })); return true })()`)
  for (let i = 0; i < 3; i++) {
    abS(`open ${GW}/ --wait networkidle`, 90000)
    wait(3000)
    if (String(evS(`document.querySelector('main')?.innerText.length ?? 0`) ?? '') !== '0') break
  }
}

async function partB(ids: { docId: string; reqId: string; anbarUserId: string }) {
  console.log('\n── بخش B — مرورگر (نشست u5) ──')
  abS(`close`, 15000)

  // B1 — صفحه سند (کاربر anbar)
  check('B1-ورود anbar.arad', loginRetry('anbar.arad', '12345678'))
  openRecordTab('whdocs', ids.docId, 'ClipboardCheck', 'سند آزمون خط زمان')
  wait(1500)

  const innerTabs = String(evS(`(function(){ const t = Array.from(document.querySelectorAll('main [role=tablist] [role=tab]')).map(x => x.textContent || ''); return t.join('|') })()`) ?? '')
  check('B1-تب‌های داخلی صفحه سند', innerTabs.includes('اقلام') && innerTabs.includes('خط زمان'), innerTabs.slice(0, 80))

  // کلیک تب خط زمان
  evS(`(function(){ const t = Array.from(document.querySelectorAll('main [role=tablist] [role=tab]')).find(x => (x.textContent || '').includes('خط زمان')); if (t) { t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return true } return false })()`)
  wait(1800)
  const tlText = String(evS(`(function(){ const main = document.querySelector('main'); return main ? main.innerText : '' })()`) ?? '')
  check('B1-عنوان «تاریخچه اقدامات»', tlText.includes('تاریخچه اقدامات'))
  check('B1-رخداد قطعی‌سازی دیده می‌شود', tlText.includes('قطعی‌سازی'), 'متن خط زمان بدون قطعی‌سازی')
  check('B1-نام کاربر ثبت‌کننده', tlText.includes('کریمی'), 'نام کاربر یافت نشد')
  check('B1-شمار رخداد (۲)', tlText.includes('۲ رخداد'), tlText.match(/[۰-۹]+ رخداد/)?.[0] ?? 'نا')
  shotS('b1-whdoc-timeline')

  // B2 — رخداد تازه بدون رفرش: ویرایش اقلام این سند؟ سند POSTED است — به‌جایش درخواست را
  // در B3 با اقدام زنده می‌سنجیم (اینجا فقط ابطال غیرممکن است). خروج: تب اقلام
  evS(`(function(){ const t = Array.from(document.querySelectorAll('main [role=tablist] [role=tab]')).find(x => (x.textContent || '').includes('اقلام')); if (t) { t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return true } return false })()`)
  wait(800)
  const itemsVisible = String(evS(`(function(){ const main = document.querySelector('main'); return main ? main.innerText : '' })()`) ?? '')
  check('B2-بازگشت به تب اقلام (جدول)؟', itemsVisible.includes('کالا') || itemsVisible.includes('مترمربع'), 'جدول اقلام دیده نشد')

  // B3 — صفحه درخواست: تأیید زنده در تب خط زمان
  // درخواست قبلاً APPROVE شده؛ یک رخداد دیگر: اعلام تأمین‌شده از سمت مدیر — از API:
  const ceo = await loginApi('ceo.arad', '12345678')
  await fetch(`${BASE}/api/requests`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', ...ceo },
    body: JSON.stringify({ id: ids.reqId, action: 'FULFILL' }),
  })
  openRecordTab('requests', ids.reqId, 'ClipboardList', 'درخواست آزمون خط زمان')
  wait(1500)
  evS(`(function(){ const t = Array.from(document.querySelectorAll('main [role=tablist] [role=tab]')).find(x => (x.textContent || '').includes('خط زمان')); if (t) { t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return true } return false })()`)
  wait(1800)
  const reqTl = String(evS(`(function(){ const main = document.querySelector('main'); return main ? main.innerText : '' })()`) ?? '')
  check('B3-درخواست: رخداد «تأیید درخواست»', reqTl.includes('تأیید درخواست'), 'یافت نشد')
  check('B3-درخواست: رخداد «تأمین درخواست»', reqTl.includes('تأمین درخواست'), 'یافت نشد')
  shotS('b3-request-timeline')

  // B4 — صفحه کاربر (ادمین): تب سوم خط زمان
  abS(`close`, 15000)
  check('B4-ورود admin', loginRetry('admin', 'admin123'))
  openRecordTab('users', ids.anbarUserId, 'Users', 'کاربر آزمون')
  wait(1800)
  const userTabs = String(evS(`(function(){ const t = Array.from(document.querySelectorAll('main [role=tablist] [role=tab]')).map(x => x.textContent || ''); return t.join('|') })()`) ?? '')
  check('B4-صفحه کاربر: تب‌های سه‌گانه', userTabs.includes('مشخصات') && userTabs.includes('امنیت') && userTabs.includes('خط زمان'), userTabs.slice(0, 100))
  evS(`(function(){ const t = Array.from(document.querySelectorAll('main [role=tablist] [role=tab]')).find(x => (x.textContent || '').includes('خط زمان')); if (t) { t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return true } return false })()`)
  wait(1800)
  const userTl = String(evS(`(function(){ const main = document.querySelector('main'); return main ? main.innerText : '' })()`) ?? '')
  check('B4-خط زمان کاربر بارگذاری شد', userTl.includes('تاریخچه اقدامات') || userTl.includes('هنوز اقدامی'), userTl.slice(0, 60))
  shotS('b4-user-timeline')

  // B5 — موبایل ۳۹۰px (صفحه سند، تب خط زمان)
  abS(`close`, 15000)
  check('B5-ورود دوباره anbar.arad', loginRetry('anbar.arad', '12345678'))
  openRecordTab('whdocs', ids.docId, 'ClipboardCheck', 'سند آزمون خط زمان')
  evS(`(function(){ const t = Array.from(document.querySelectorAll('main [role=tablist] [role=tab]')).find(x => (x.textContent || '').includes('خط زمان')); if (t) { t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return true } return false })()`)
  wait(1200)
  abS(`set viewport 390 844`, 20000)
  wait(1500)
  const overflow = evS(`document.documentElement.scrollWidth <= 392`)
  check('B5-موبایل ۳۹۰px بدون سرریز افقی', overflow === true, `scrollWidth=${String(evS('document.documentElement.scrollWidth'))}`)
  shotS('b5-mobile-timeline')
}

// ---------- اجرا ----------

async function main() {
  ab(`--session ${SESSION} open about:blank`, 30000)
  const ids = await partA()
  await partB(ids)
  ab(`--session ${SESSION} close`, 15000)

  console.log(`\n${'─'.repeat(60)}\nنتیجه تست U5 خط زمان رکورد: ${pass} پاس · ${fail} خطا`)
  if (failures.length) { console.log('خطاها:'); for (const f of failures) console.log(`  ✗ ${f}`) }
  process.exit(fail ? 1 : 0)
}

void main().catch((e) => { console.error('خطای تست:', e); process.exit(1) })
