// تست دودی APIهای جدید صفحه رکورد (P1.5-T8): GET /api/whdocs/[id] و GET /api/requests/[id]
// پوشش: نشست معتبر → ۲۰۰ با اقلام · آیدی جعلی → 404 · بدون نشست → 401
// اجرا: bunx tsx scripts/test-record-pages.ts  (سرور dev باید روشن باشد)
export {} // ماژول‌سازی — جلوگیری از برخورد حوزه سراسری با سایر اسکریپت‌های تست

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'
const ADMIN = { username: 'admin', password: 'admin123' } // مدیر پلتفرم seed

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  if (!cond) failures++
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${extra ? ` — ${extra}` : ''}`)
}

type Jar = { cookie: string; token: string }

async function login(username: string, password: string): Promise<Jar | null> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 RecordPageTest/1.0' },
    body: JSON.stringify({ username, password }),
  })
  const body = (await res.json().catch(() => ({}))) as { token?: string }
  if (res.status !== 200 || !body.token) return null
  return { cookie: `pos_sid=${body.token}`, token: body.token }
}

function h(jar: Jar): Record<string, string> {
  return { 'content-type': 'application/json', cookie: jar.cookie, 'x-session-token': jar.token }
}

async function get<T>(jar: Jar, path: string): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BASE}${path}`, { headers: h(jar) })
  return { status: res.status, data: (await res.json().catch(() => ({}))) as T }
}

async function main() {
  const jar = await login(ADMIN.username, ADMIN.password)
  check('ورود مدیر پلتفرم موفق', !!jar)
  if (!jar) { console.log('❌ ورود ناموفق — سرویس/seed را بررسی کنید'); process.exit(1) }

  // ---------- سند انبار ----------
  const docs = await get<{ items: { id: string; docNumber: number; items: unknown[] }[] }>(jar, '/api/whdocs?pageSize=1&sort=date:desc')
  check('فهرست اسناد در دسترس', docs.status === 200 && (docs.data.items?.length ?? 0) > 0)
  if (docs.data.items?.length) {
    const d = docs.data.items[0]
    const res = await get<{ doc?: { items: { size: string }[]; warehouseName: string } }>(jar, `/api/whdocs/${d.id}`)
    check('GET /api/whdocs/[id] → ۲۰۰', res.status === 200)
    check('سند شامل اقلام با ابعاد', Array.isArray(res.data.doc?.items) && res.data.doc!.items.length > 0 && typeof res.data.doc!.items[0].size === 'string', `اقلام: ${res.data.doc?.items.length}`)
    check('سند شامل نام انبار', !!res.data.doc?.warehouseName)
    const bad = await fetch(`${BASE}/api/whdocs/nonexistent-id`, { headers: h(jar) })
    check('آیدی جعلی → ۴۰۴', bad.status === 404)
  }

  // ---------- درخواست کالا ----------
  const reqs = await get<{ items: { id: string; reqNumber: number }[] }>(jar, '/api/requests?pageSize=1')
  check('فهرست درخواست‌ها در دسترس', reqs.status === 200)
  if (reqs.data.items?.length) {
    const r = reqs.data.items[0]
    const res = await get<{ request?: { items: unknown[]; requesterName: string; warehouseName: string } }>(jar, `/api/requests/${r.id}`)
    check('GET /api/requests/[id] → ۲۰۰', res.status === 200)
    check('درخواست شامل اقلام و متقاضی', Array.isArray(res.data.request?.items) && !!res.data.request?.requesterName)
    const bad = await fetch(`${BASE}/api/requests/nonexistent-id`, { headers: h(jar) })
    check('آیدی جعلی → ۴۰۴', bad.status === 404)
  }

  // ---------- گارد نشست ----------
  const noAuth = await fetch(`${BASE}/api/whdocs/x`)
  check('بدون نشست → ۴۰۱', noAuth.status === 401)

  console.log('─'.repeat(44))
  if (failures === 0) console.log('✅ همه سنجه‌های API صفحه رکورد سبز است')
  else { console.log(`❌ ${failures} سنجه قرمز`); process.exit(1) }
}

void main()
