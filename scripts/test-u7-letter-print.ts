/**
 * تست E2E + API «چاپ نامه با سربرگ + خروجی اکسل نامه‌ها» (P2.5-U7 / P2-T7 + P2-T20)
 *
 * معیار پذیرش U7: «نامه صادره با سربرگ هلدینگ چاپ می‌شود؛ اکسل نامه‌ها با فیلترها»
 *
 * پوشش:
 *   بخش A — API (fetch خام):
 *     A1 BOM سه‌بایتی EF BB BF + Content-Type + X-Csv-Rows + نام فایل letters-*.csv
 *     A2 ردیف نامه seed (#۵ صادره آراد «رنگ و لعاب اصفهان») + برچسب‌های فارسی وضعیت/نوع
 *     A3 فیلترها: box=inbox (کارتابل) / box=sent (ثبت من) / type=OUTGOING / q=استعلام
 *     A4 گارد: بدون نشست 401
 *     A5 escape: نامه تستی با کاما/نقل‌قول در موضوع → سلول CSV نقل‌قول‌دار با ""
 *     A6 جزئیات: letterhead (null) + legalName + اقدام PRINT=200 + سجل حسابرسی action=PRINT
 *     A7 تنظیم سربرگ (admin → switch ARAD → letterhead.subtitle/footer) → getLetter نشان می‌دهد
 *   بخش B — مرورگر (ab؛ نشست ایزوله u7 = dabir، u7v = e2e.karbar VIEWER):
 *     B1 لینک مستقیم ?rec=letters:<id> → صفحه رکورد نامه صادره
 *     B2 دکمه «چاپ» در نوار اقدام (خواندنی — مستقل از دارنده)
 *     B3 کلیک چاپ → پورتال .letter-print-root + کاغذ A4: به نام خدا / نام شرکت /
 *        سطر قانونی / شماره / تاریخ جلالی / گیرنده / موضوع / متن / امضا سازنده
 *     B4 stub window.print + دکمه چاپ نوار ابزار → فراخوانی ثبت شد؛ «بستن» می‌بندد
 *     B5 Esc پورتال را می‌بندد (لایه آخر — تب فعال نمی‌بندد)
 *     B6 سربرگ اختصاصی پس از A7 → reload → سطر و پاورقی جدید در کاغذ
 *     B7 VIEWER: دکمه «خروجی اکسل» هست، «ثبت نامه جدید» نیست؛ «چاپ» در رکورد هست
 *     B8 CSV مرورگر: کلیک خروجی → توست شمار ردیف، بدون تب جدید
 *     B9 موبایل ۳۹۰px: فهرست نامه‌ها بدون سرریز
 */
import { ab, ev, loginSession, wait } from './e2e-golden-helpers'

const SESSION = 'u7'
const SESSION_V = 'u7v'
const OUT = '/home/z/my-project/download/qa-p2.5-u7'
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
    headers: { 'content-type': 'application/json', 'user-agent': 'u7-print/1.0' },
    body: JSON.stringify({ username, password }),
  })
  const body = (await res.json()) as { token?: string }
  if (!body.token) throw new Error(`ورود ${username} ناموفق`)
  return { cookie: `pos_sid=${body.token}`, 'x-session-token': body.token }
}

let dabirH: Record<string, string> = {}
let targetLetter = { id: '', number: 0, subject: '', receiver: '', bodySnippet: '' }

async function partA() {
  console.log('\n── بخش A — API چاپ/CSV نامه‌ها ──')
  dabirH = await loginApi('dabir.arad', '12345678')

  // آماده‌سازی idempotent: سربرگ ARAD را به حالت پیش‌فرض (خالی) برگردان —
  // اجرای مجدد تست نباید به خاطر وضعیت اجرای قبل قرمز شود (درس A6)
  const adminH0 = await loginApi('admin', 'admin123')
  const me0 = await (await fetch(`${BASE}/api/auth/me`, { headers: adminH0 })).json() as { companies: { id: string; code: string }[] }
  const arad0 = me0.companies.find((c) => c.code === 'ARAD')
  if (arad0) {
    await fetch(`${BASE}/api/auth/switch-company`, { method: 'POST', headers: { ...adminH0, 'content-type': 'application/json' }, body: JSON.stringify({ companyId: arad0.id }) })
    await fetch(`${BASE}/api/platform/company-settings`, { method: 'PATCH', headers: { ...adminH0, 'content-type': 'application/json' }, body: JSON.stringify({ key: 'letterhead.subtitle', value: '' }) })
    await fetch(`${BASE}/api/platform/company-settings`, { method: 'PATCH', headers: { ...adminH0, 'content-type': 'application/json' }, body: JSON.stringify({ key: 'letterhead.footer', value: '' }) })
  }

  // A1 — BOM + هدرها
  const raw = await fetch(`${BASE}/api/letters?format=csv&sort=number:asc`, { headers: dabirH })
  const buf = new Uint8Array(await raw.arrayBuffer())
  check('A1-status 200', raw.status === 200, `status=${raw.status}`)
  check('A1-BOM سه‌بایتی (EF BB BF)', buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF, `${buf[0]},${buf[1]},${buf[2]}`)
  check('A1-Content-Type csv/utf-8', (raw.headers.get('content-type') ?? '').includes('text/csv') && (raw.headers.get('content-type') ?? '').includes('utf-8'))
  check('A1-X-Csv-Rows عددی > 0', Number(raw.headers.get('x-csv-rows') ?? '0') > 0, raw.headers.get('x-csv-rows') ?? 'null')
  check('A1-فایل‌نام letters-*.csv', /letters-\d+-\d+\.csv/.test(raw.headers.get('content-disposition') ?? ''), raw.headers.get('content-disposition') ?? 'null')

  const txt = new TextDecoder().decode(buf)
  const lines = txt.split('\r\n')
  check('A1-سرصفحه فارسی', lines[0].startsWith('شماره,نوع,موضوع,وضعیت,فرستنده,گیرنده,ثبت‌کننده'), lines[0].slice(0, 60))

  // یافتن نامه هدف: صادره آراد شماره ۵ «رنگ و لعاب اصفهان» (seed)
  const list = await (await fetch(`${BASE}/api/letters?pageSize=300&sort=number:asc`, { headers: dabirH })).json() as { items: { id: string; number: number; subject: string; receiverTitle: string | null; type: string; companyCode: string }[] }
  const target = list.items.find((l) => l.type === 'OUTGOING' && l.companyCode === 'ARAD' && l.receiverTitle === 'رنگ و لعاب اصفهان')
  check('A2-نامه هدف seed یافت شد', !!target, 'OUTGOING ARAD «رنگ و لعاب اصفهان» در فهرست نیست')
  targetLetter = {
    id: target?.id ?? '', number: target?.number ?? 0, subject: target?.subject ?? '',
    receiver: target?.receiverTitle ?? '', bodySnippet: '',
  }
  if (targetLetter.id) {
    const det = await (await fetch(`${BASE}/api/letters/${targetLetter.id}`, { headers: dabirH })).json() as { letter: { body: string } }
    targetLetter.bodySnippet = det.letter.body.replace(/\s+/g, ' ').slice(0, 18)
    // A2 — ردیف CSV نامه هدف با برچسب فارسی
    const row = lines.find((l) => l.includes('رنگ و لعاب اصفهان') && l.includes('صادره'))
    check('A2-ردیف CSV نامه seed (صادره + گیرنده)', !!row, 'ردیف «رنگ و لعاب اصفهان» یافت نشد')
    check('A2-وضعیت فارسی «پاسخ داده»', !!row && row.includes('پاسخ داده'), row?.slice(0, 80) ?? '')
  }

  // A3 — فیلترها (آینه نمای فعال)
  const inbox = await (await fetch(`${BASE}/api/letters?format=csv&box=inbox`, { headers: dabirH })).text()
  const sent = await (await fetch(`${BASE}/api/letters?format=csv&box=sent`, { headers: dabirH })).text()
  const outType = await (await fetch(`${BASE}/api/letters?format=csv&type=OUTGOING`, { headers: dabirH })).text()
  const qRes = await (await fetch(`${BASE}/api/letters?format=csv&q=${encodeURIComponent('استعلام')}`, { headers: dabirH })).text()
  const count = (s: string) => Math.max(0, s.split('\r\n').length - 1)
  check('A3-box=inbox فیلتر کارتابل', count(inbox) > 0 && count(inbox) < count(txt), `inbox=${count(inbox)} all=${count(txt)}`)
  check('A3-box=sent ≠ box=inbox', count(sent) !== count(inbox), `sent=${count(sent)} inbox=${count(inbox)}`)
  check('A3-type=OUTGOING همه صادره', outType.includes('صادره') && !outType.includes('وارده'), 'ردیف وارده در خروجی type=OUTGOING')
  check('A3-q=استعلام محدودتر', count(qRes) < count(txt), `q=${count(qRes)} all=${count(txt)}`)

  // A4 — گارد بدون نشست
  const noAuth = await fetch(`${BASE}/api/letters?format=csv`)
  check('A4-بدون نشست 401', noAuth.status === 401, `status=${noAuth.status}`)

  // A5 — escape کاما/نقل‌قول (نامه تستی)
  const subj = 'تست چاپ U7، با «کاما» و "کوت"'
  const created = await fetch(`${BASE}/api/letters`, {
    method: 'POST',
    headers: { ...dabirH, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'OUTGOING', subject: subj, body: 'متن تستی خروجی چاپ U7', receiverTitle: 'واحد تست' }),
  })
  const createdBody = (await created.json()) as { ok?: boolean; id?: string }
  check('A5-ثبت نامه تستی', created.status === 200 && !!createdBody.ok, `status=${created.status}`)
  const after = await (await fetch(`${BASE}/api/letters?format=csv&q=${encodeURIComponent('تست چاپ U7')}`, { headers: dabirH })).text()
  const escRow = after.split('\r\n').find((l) => l.includes('تست چاپ U7')) ?? ''
  check('A5-escape کاما/نقل‌قول', escRow.includes('"تست چاپ U7، با «کاما» و ""کوت""'), escRow.slice(0, 100))

  // A6 — جزئیات + PRINT + سجل حسابرسی
  const det6 = await (await fetch(`${BASE}/api/letters/${targetLetter.id}`, { headers: dabirH })).json() as { letter: { letterheadSubtitle: string | null; letterheadFooter: string | null; companyLegalName: string | null } }
  check('A6-letterhead پیش‌فرض null', det6.letter.letterheadSubtitle === null && det6.letter.letterheadFooter === null)
  check('A6-legalName شرکت موجود', (det6.letter.companyLegalName ?? '').includes('آراد سرام پیشرو'), det6.letter.companyLegalName ?? 'null')
  const pr = await fetch(`${BASE}/api/letters/${targetLetter.id}/actions`, {
    method: 'POST', headers: { ...dabirH, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'PRINT' }),
  })
  check('A6-اقدام PRINT=200', pr.status === 200, `status=${pr.status}`)
  // سجل حسابرسی فقط برای مدیران قابل مشاهده است — نشست admin جدا؛ پاکت: { logs: { items } }
  const adminH6 = await loginApi('admin', 'admin123')
  const auditRes = await (await fetch(`${BASE}/api/audit?action=PRINT&pageSize=10`, { headers: adminH6 })).json() as { logs?: { items?: { action: string; entity: string; entityId: string }[] } }
  check('A6-سجل حسابرسی PRINT ثبت شد', (auditRes.logs?.items ?? []).some((a) => a.entity === 'letter' && a.entityId === targetLetter.id), `rows=${(auditRes.logs?.items ?? []).length}`)

  // A7 — تنظیم سربرگ per-company (admin → ARAD)
  const adminH = await loginApi('admin', 'admin123')
  const me = await (await fetch(`${BASE}/api/auth/me`, { headers: adminH })).json() as { companies: { id: string; code: string }[] }
  const arad = me.companies.find((c) => c.code === 'ARAD')
  check('A7-شرکت ARAD در فهرست admin', !!arad)
  if (arad) {
    await fetch(`${BASE}/api/auth/switch-company`, { method: 'POST', headers: { ...adminH, 'content-type': 'application/json' }, body: JSON.stringify({ companyId: arad.id }) })
    await fetch(`${BASE}/api/platform/company-settings`, { method: 'PATCH', headers: { ...adminH, 'content-type': 'application/json' }, body: JSON.stringify({ key: 'letterhead.subtitle', value: 'گروه تولیدی کاشی و سرامیک' }) })
    await fetch(`${BASE}/api/platform/company-settings`, { method: 'PATCH', headers: { ...adminH, 'content-type': 'application/json' }, body: JSON.stringify({ key: 'letterhead.footer', value: 'اصفهان، شهرک صنعتی سایه — تلفن ۰۳۱-۳۶۶۹۰۰' }) })
    const det7 = await (await fetch(`${BASE}/api/letters/${targetLetter.id}`, { headers: dabirH })).json() as { letter: { letterheadSubtitle: string | null; letterheadFooter: string | null } }
    check('A7-سربرگ subtitle حاکم', det7.letter.letterheadSubtitle === 'گروه تولیدی کاشی و سرامیک', det7.letter.letterheadSubtitle ?? 'null')
    check('A7-پاورقی footer حاکم', (det7.letter.letterheadFooter ?? '').includes('شهرک صنعتی سایه'), det7.letter.letterheadFooter ?? 'null')
  }

  // A8 — کاربر VIEWER اختصاصی تست (ایزوله از داده‌های seed — e2e.karbar رمزش نامعلوم است)
  const viewerCreds = { username: 'u7.viewer', password: 'U7viewer!1405' }
  const mkViewer = await fetch(`${BASE}/api/users`, {
    method: 'POST',
    headers: { ...adminH, 'content-type': 'application/json' },
    body: JSON.stringify({
      username: viewerCreds.username,
      fullName: 'بازدیدکننده تست U7',
      jobTitle: 'کارشناس تماشاگر',
      password: viewerCreds.password,
      memberships: [{ companyId: arad?.id ?? '', role: 'VIEWER' }],
    }),
  })
  const mkBody = (await mkViewer.json().catch(() => ({}))) as { id?: string; error?: string }
  const viewerReady = mkViewer.status === 201 || /قبلاً ثبت شده/.test(mkBody.error ?? '')
  check('A8-کاربر VIEWER u7.viewer آماده', viewerReady, `status=${mkViewer.status} err=${mkBody.error ?? ''}`)
  const vLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: viewerCreds.username, password: viewerCreds.password }),
  })
  check('A8-ورود VIEWER موفق', vLogin.status === 200, `status=${vLogin.status}`)
  if (vLogin.status === 200) {
    const vTok = ((await vLogin.json()) as { token?: string }).token ?? ''
    const vWrite = await fetch(`${BASE}/api/letters`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: `pos_sid=${vTok}`, 'x-session-token': vTok },
      body: JSON.stringify({ type: 'OUTGOING', subject: 'نباید ثبت شود', body: 'متن' }),
    })
    check('A8-VIEWER نوشتن ممنوع 403', vWrite.status === 403, `status=${vWrite.status}`)
  }

  return viewerCreds
}

async function partB(viewerCreds: { username: string; password: string }) {
  console.log('\n── بخش B — مرورگر: چاپ سربرگ‌دار ──')
  const okLogin = loginSession(SESSION, 'dabir.arad', '12345678')
  check('B1-ورود dabir.arad', okLogin)
  if (!okLogin) return

  // لیست نامه‌ها در sessionStorage + لینک مستقیم رکورد (?rec — درس U10: کوتیشن تک)
  evS(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:letters', kind: 'list', viewKey: 'letters', title: 'اتوماسیون اداری', icon: 'Mail' }], activeTabId: 'list:letters' })); return true })()`)
  abS(`open '${GW}/?rec=letters:${targetLetter.id}' --wait networkidle`, 90000)
  wait(3500)
  const recordText = String(evS(`document.querySelector('main')?.innerText ?? ''`) ?? '')
  check('B1-صفحه رکورد نامه باز شد', recordText.includes(targetLetter.subject.slice(0, 20)), `subject=${targetLetter.subject.slice(0, 20)}`)

  // B2 — دکمه چاپ در نوار اقدام (خواندنی — نامه پاسخ‌داده در کارتابل dabir نیست، چاپ باید باشد)
  const printBtn = evS(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent || '').trim() === 'چاپ'); return b ? 'found' : 'not-found' })()`)
  check('B2-دکمه «چاپ» در نوار اقدام', printBtn === 'found', String(printBtn))

  // B3 — کلیک چاپ → پورتال + محتوای کاغذ A4
  evS(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent || '').trim() === 'چاپ'); if (b) { b.click(); return 'clicked' } return 'not-found' })()`)
  wait(1200)
  const portal = evS(`!!document.querySelector('.letter-print-root')`)
  check('B3-پورتال چاپ باز شد', portal === true)
  const sheetText = String(evS(`(function(){ const s = document.querySelector('.letter-print-sheet'); return s ? s.innerText : '' })()`) ?? '')
  check('B3-به نام خدا', sheetText.includes('به نام خدا'))
  check('B3-نام شرکت سربرگ', sheetText.includes('آراد سرام پیشرو'), sheetText.slice(0, 80))
  check('B3-شماره/تاریخ جلالی', sheetText.includes('شماره:') && /تاریخ:\s*[\u06F0-\u06F9]{1,2} [\u0600-\u06FF]{2,} [\u06F0-\u06F9]{4}/.test(sheetText), sheetText.split('\n').slice(2, 8).join(' | '))
  check('B3-گیرنده صادره', sheetText.includes(`گیرنده: ${targetLetter.receiver}`), `expect ${targetLetter.receiver}`)
  check('B3-موضوع', sheetText.includes(`موضوع: ${targetLetter.subject}`))
  check('B3-متن نامه', targetLetter.bodySnippet.length > 0 && sheetText.includes(targetLetter.bodySnippet), `snippet=${targetLetter.bodySnippet}`)
  check('B3-امضا سازنده', sheetText.includes('با احترام') && sheetText.includes('مریم احمدی'), 'امضا/نام سازنده مفقود')
  check('B3-پیوست شمار', sheetText.includes('پیوست:'))
  shotS('b3-print-preview')

  // B4 — stub window.print + دکمه چاپ نوار ابزار → فراخوانی؛ سپس «بستن»
  evS(`(function(){ window.__printCalled = false; window.print = function(){ window.__printCalled = true }; return true })()`)
  evS(`(function(){ const b = document.querySelector('.letter-print-root button'); const all = Array.from(document.querySelectorAll('.letter-print-root button')); const p = all.find(x => (x.textContent || '').includes('چاپ')); if (p) { p.click(); return 'clicked' } return 'not-found' })()`)
  wait(600)
  check('B4-window.print فراخوانی شد', evS(`window.__printCalled === true`) === true)
  evS(`(function(){ const all = Array.from(document.querySelectorAll('.letter-print-root button')); const c = all.find(x => (x.textContent || '').includes('بستن')); if (c) { c.click(); return 'clicked' } return 'not-found' })()`)
  wait(700)
  check('B4-«بستن» پورتال را می‌بندد', evS(`!document.querySelector('.letter-print-root')`) === true)

  // B5 — Esc می‌بندد؛ تب فعال نمی‌بندد (لایه‌بندی Esc)
  const tabsBefore = Number(evS(`document.querySelectorAll('[role=tablist][aria-label="تب‌های کاری"] [role=tab]').length`) ?? -1)
  evS(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent || '').trim() === 'چاپ'); if (b) { b.click(); return 'clicked' } return 'not-found' })()`)
  wait(900)
  evS(`(function(){ window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`)
  wait(700)
  const tabsAfterEsc = Number(evS(`document.querySelectorAll('[role=tablist][aria-label="تب‌های کاری"] [role=tab]').length`) ?? -1)
  check('B5-Esc پورتال را می‌بندد', evS(`!document.querySelector('.letter-print-root')`) === true)
  check('B5-Esc تب فعال را نمی‌بندد', tabsAfterEsc === tabsBefore, `tabs=${tabsAfterEsc} vs ${tabsBefore}`)

  // B6 — سربرگ اختصاصی (A7) → reload → سطر + پاورقی
  abS(`open '${GW}/?rec=letters:${targetLetter.id}' --wait networkidle`, 90000)
  wait(3500)
  evS(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent || '').trim() === 'چاپ'); if (b) { b.click(); return 'clicked' } return 'not-found' })()`)
  wait(1200)
  const sheet2 = String(evS(`(function(){ const s = document.querySelector('.letter-print-sheet'); return s ? s.innerText : '' })()`) ?? '')
  check('B6-سطر سربرگ اختصاصی', sheet2.includes('گروه تولیدی کاشی و سرامیک'), 'subtitle سفارشی در کاغذ نیست')
  check('B6-پاورقی اختصاصی', sheet2.includes('شهرک صنعتی سایه') && sheet2.includes('۰۳۱-۳۶۶۹۰۰'), 'footer سفارشی در کاغذ نیست')
  shotS('b6-custom-letterhead')
  evS(`(function(){ const all = Array.from(document.querySelectorAll('.letter-print-root button')); const c = all.find(x => (x.textContent || '').includes('بستن')); if (c) c.click(); return true })()`)
  wait(500)

  // B7 — VIEWER: خروجی بله، ثبت نه؛ چاپ در رکورد بله
  const okV = loginSession(SESSION_V, viewerCreds.username, viewerCreds.password)
  check('B7-ورود VIEWER u7.viewer', okV)
  if (okV) {
    ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:letters', kind: 'list', viewKey: 'letters', title: 'اتوماسیون اداری', icon: 'Mail' }], activeTabId: 'list:letters' })); return true })()`, SESSION_V)
    ab(`--session ${SESSION_V} open '${GW}/?view=letters' --wait networkidle`, 90000)
    wait(3500)
    const vText = String(ev(`document.querySelector('main')?.innerText ?? ''`, SESSION_V) ?? '')
    const hasExport = String(ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent || '').includes('خروجی اکسل')); return b ? 'found' : 'not-found' })()`, SESSION_V) ?? '')
    check('B7-VIEWER: دکمه خروجی اکسل هست', hasExport === 'found', String(hasExport))
    check('B7-VIEWER: «ثبت نامه جدید» نیست', !vText.includes('ثبت نامه جدید'))
    // رکورد: چاپ برای VIEWER
    ab(`--session ${SESSION_V} open '${GW}/?rec=letters:${targetLetter.id}' --wait networkidle`, 90000)
    wait(3500)
    const vPrint = String(ev(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent || '').trim() === 'چاپ'); return b ? 'found' : 'not-found' })()`, SESSION_V) ?? '')
    check('B7-VIEWER: دکمه «چاپ» در رکورد', vPrint === 'found', String(vPrint))
    ab(`--session ${SESSION_V} close`, 15000)
  }

  // B8 — CSV مرورگر (dabir): ابتدا به فهرست نامه‌ها → کلیک → توست شمار ردیف
  evS(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:letters', kind: 'list', viewKey: 'letters', title: 'اتوماسیون اداری', icon: 'Mail' }], activeTabId: 'list:letters' })); return true })()`)  
  abS(`open '${GW}/?view=letters' --wait networkidle`, 90000)
  wait(3500)
  const tabsB8 = Number(evS(`document.querySelectorAll('[role=tablist][aria-label="تب‌های کاری"] [role=tab]').length`) ?? -1)
  evS(`(function(){ const b = Array.from(document.querySelectorAll('main button')).find(x => (x.textContent || '').includes('خروجی اکسل')); if (b) { b.click(); return 'clicked' } return 'not-found' })()`)
  let toast = ''
  for (let i = 0; i < 18; i++) {
    wait(750)
    toast = String(evS(`(function(){ const vp = Array.from(document.querySelectorAll('ol')).find(o => String(o.className).includes('fixed')); const li = vp ? vp.querySelector('li') : null; return li ? li.innerText : '' })()`) ?? '')
    if (toast.includes('CSV') || toast.includes('خطا')) break
  }
  const tabsB8After = Number(evS(`document.querySelectorAll('[role=tablist][aria-label="تب‌های کاری"] [role=tab]').length`) ?? -1)
  check('B8-توست خروجی (شمار ردیف)', toast.includes('CSV') || toast.includes('ردیف'), toast.slice(0, 60))
  check('B8-بدون تب جدید', tabsB8After === tabsB8, `tabs=${tabsB8After} vs ${tabsB8}`)
  shotS('b8-csv-toast')

  // B9 — موبایل ۳۹۰px
  abS(`set viewport 390 844`, 20000)
  wait(1500)
  const overflow = evS(`document.documentElement.scrollWidth <= 392`)
  check('B9-موبایل ۳۹۰px بدون سرریز', overflow === true, `sw=${String(evS('document.documentElement.scrollWidth'))}`)
  shotS('b9-mobile-letters')
  abS(`set viewport 1920 1080`, 20000)
}

// ---------- اجرا ----------

async function main() {
  ab(`--session ${SESSION} open about:blank`, 30000)
  const viewerCreds = await partA()
  await partB(viewerCreds)
  ab(`--session ${SESSION} close`, 15000)

  console.log(`\n${'─'.repeat(60)}\nنتیجه تست U7 چاپ سربرگ + اکسل نامه‌ها: ${pass} پاس · ${fail} خطا`)
  if (failures.length) { console.log('خطاها:'); for (const f of failures) console.log(`  ✗ ${f}`) }
  process.exit(fail ? 1 : 0)
}

void main().catch((e) => { console.error('خطای تست:', e); process.exit(1) })
