// تست خودکار ماتریس RBAC — P1-T14 (گارد تنظیمات) + P1-T15 (فیلتر حسابرسی/CSV) + P1-T18 (گارد نقش نوشتن)
// ماتریس متقاطع نقش × عملیات روی همه endpointهای نوشتاری + گارد تنظیمات + CSV/BOM
// اجرا: bunx tsx scripts/test-rbac.ts  (سرور dev باید روشن باشد)
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'
const ADMIN = { username: 'admin', password: 'admin123' } // مدیر پلتفرم seed

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL'
  if (!cond) failures += 1
  console.log(`[${mark}] ${name}${extra ? ` — ${extra}` : ''}`)
}

type Jar = { cookie: string; token: string }

async function login(username: string, password: string): Promise<{ status: number; jar: Jar | null; error: string }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 RbacTest/1.0' },
    body: JSON.stringify({ username, password }),
  })
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string }
  if (res.status !== 200 || !body.token) return { status: res.status, jar: null, error: body.error ?? '' }
  return { status: res.status, jar: { cookie: `pos_sid=${body.token}`, token: body.token }, error: '' }
}

function h(jar: Jar): Record<string, string> {
  return { 'content-type': 'application/json', cookie: jar.cookie, 'x-session-token': jar.token }
}

async function api(jar: Jar | null, path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: jar ? h(jar) : { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
  return { status: res.status, data }
}

async function rawGet(jar: Jar, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: h(jar) })
  return { status: res.status, headers: res.headers, text: await res.text() }
}

/** بایت‌های خام — برای راستی‌آزمایی BOM (text() هنگام دیکد UTF-8 آن را حذف می‌کند) */
async function rawBytes(jar: Jar, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: h(jar) })
  const buf = new Uint8Array(await res.arrayBuffer())
  return { status: res.status, headers: res.headers, bytes: buf, text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(buf) }
}

async function main() {
  const stamp = Date.now() % 1000000

  // ---------- آماده‌سازی: ورود مدیر پلتفرم ----------
  const admin = await login(ADMIN.username, ADMIN.password)
  check('ورود مدیر پلتفرم موفق', admin.status === 200, admin.error)
  const jar = admin.jar!

  // شرکت عملیاتی اول (نه GROUP) + انبار و کالای همان شرکت
  const companies = (await api(jar, '/api/platform/companies', 'GET')).data.companies as { id: string; code: string; name: string; type: string }[]
  const op = companies.find((c) => c.type !== 'GROUP')!
  check('شرکت عملیاتی برای تست یافت شد', !!op, op?.name)
  const warehouses = (await api(jar, `/api/warehouses?companyId=${op.id}`, 'GET')).data as { warehouses?: { id: string; companyId: string }[]; items?: { id: string }[] }
  const whList = (warehouses.warehouses ?? warehouses.items ?? []) as { id: string }[]
  check('انبار شرکت یافت شد', whList.length > 0)
  const whId = whList[0]!.id
  const products = (await api(jar, '/api/products', 'GET')).data.products as { id: string; companyCode: string }[]
  const prod = products.find((p) => p.companyCode === op.code)
  check('کالای شرکت یافت شد', !!prod)

  // ---------- ایجاد کاربران چهار نقش در شرکت عملیاتی ----------
  const roles: { role: 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER'; label: string }[] = [
    { role: 'ADMIN', label: 'مدیر شرکت' },
    { role: 'MANAGER', label: 'مدیر' },
    { role: 'OPERATOR', label: 'کارشناس' },
    { role: 'VIEWER', label: 'بازدیدکننده' },
  ]
  const jars: Partial<Record<'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER', Jar>> = {}
  const userIds: Partial<Record<'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER', string>> = {}
  for (const { role } of roles) {
    const uname = `t.rbac.${role.toLowerCase()}.${stamp}`
    const create = await api(jar, '/api/users', 'POST', {
      username: uname, fullName: `تست ${role}`, jobTitle: 'تست RBAC',
      password: 'Passw0rd123', memberships: [{ companyId: op.id, role }],
    })
    check(`ایجاد کاربر ${role} → 201`, create.status === 201, String(create.data.error))
    userIds[role] = create.data.id as string
    const li = await login(uname, 'Passw0rd123')
    check(`ورود کاربر ${role}`, li.status === 200, li.error)
    jars[role] = li.jar ?? undefined
  }

  const letterBody = { type: 'INTERNAL', subject: `تست RBAC ${stamp}`, body: 'متن تست ماتریس نقش‌ها', confidentiality: 'NORMAL', urgency: 'NORMAL' }
  const docBody = { type: 'RECEIPT', warehouseId: whId, items: [{ productId: prod!.id, qtyM2: '۱۰' }] }
  const reqBody = { warehouseId: whId, neededFor: 'تست RBAC', items: [{ productId: prod!.id, qtyM2: '۵' }] }

  // ---------- P1-T18: ماتریس نقش × عملیات نوشتاری ----------
  // ثبت نامه
  for (const { role } of roles) {
    const r = await api(jars[role]!, '/api/letters', 'POST', letterBody)
    if (role === 'VIEWER') check('VIEWER: ثبت نامه → 403 فارسی', r.status === 403 && /بازدیدکننده/.test(String(r.data.error)), `status=${r.status} err=${r.data.error}`)
    else check(`${role}: ثبت نامه مجاز`, r.status === 200, `status=${r.status} err=${r.data.error}`)
  }

  // ثبت سند انبار
  const docIds: Partial<Record<string, string>> = {}
  for (const { role } of roles) {
    const r = await api(jars[role]!, '/api/whdocs', 'POST', docBody)
    if (role === 'VIEWER') check('VIEWER: ثبت سند انبار → 403', r.status === 403 && /بازدیدکننده/.test(String(r.data.error)), `status=${r.status} err=${r.data.error}`)
    else { check(`${role}: ثبت سند انبار مجاز`, r.status === 200, String(r.data.error)); docIds[role] = r.data.id as string }
  }

  // قطعی‌سازی و ابطال سند (سند پیش‌نویس مدیر شرکت)
  const postR = await api(jars.VIEWER!, '/api/whdocs/decide', 'POST', { docId: docIds.ADMIN, action: 'POST' })
  check('VIEWER: قطعی‌سازی سند → 403', postR.status === 403, `status=${postR.status} err=${postR.data.error}`)
  const cancelR = await api(jars.VIEWER!, '/api/whdocs/decide', 'POST', { docId: docIds.ADMIN, action: 'CANCEL' })
  check('VIEWER: ابطال سند → 403 «اجازه ابطال»', cancelR.status === 403 && /ابطال/.test(String(cancelR.data.error)), `status=${cancelR.status} err=${cancelR.data.error}`)
  const opCancel = await api(jars.OPERATOR!, '/api/whdocs/decide', 'POST', { docId: docIds.MANAGER, action: 'CANCEL' })
  check('OPERATOR: ابطال سند پیش‌نویس مجاز', opCancel.status === 200, String(opCancel.data.error))

  // ثبت درخواست کالا
  const reqIds: Partial<Record<string, string>> = {}
  for (const { role } of roles) {
    const r = await api(jars[role]!, '/api/requests', 'POST', reqBody)
    if (role === 'VIEWER') check('VIEWER: ثبت درخواست کالا → 403', r.status === 403 && /بازدیدکننده/.test(String(r.data.error)), `status=${r.status} err=${r.data.error}`)
    else { check(`${role}: ثبت درخواست مجاز`, r.status === 200, String(r.data.error)); reqIds[role] = r.data.id as string }
  }

  // تصمیم درخواست (APPROVE) — هر تصمیم‌گیر روی درخواست تازه‌ای (وضعیت PENDING)
  const decideMatrix: { role: 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER'; target?: string }[] = [
    { role: 'ADMIN', target: reqIds.OPERATOR }, // مدیر شرکت تصمیم می‌گیرد
    { role: 'MANAGER', target: reqIds.MANAGER }, // مدیر روی درخواست خودش
    { role: 'OPERATOR', target: reqIds.ADMIN },
    { role: 'VIEWER', target: reqIds.ADMIN },
  ]
  for (const { role, target } of decideMatrix) {
    const r = await api(jars[role]!, '/api/requests', 'PATCH', { id: target, action: 'APPROVE' })
    if (role === 'ADMIN' || role === 'MANAGER') check(`${role}: تصمیم درخواست مجاز`, r.status === 200, `status=${r.status} err=${r.data.error}`)
    else check(`${role}: تصمیم درخواست → 403 «مدیران»`, r.status === 403 && /مدیران/.test(String(r.data.error)), `status=${r.status} err=${r.data.error}`)
  }

  // ثبت کالا
  for (const { role } of roles) {
    const r = await api(jars[role]!, '/api/products', 'POST', {
      code: `RBAC-${role}-${stamp}`, name: `کالای تست ${role}`, productLine: 'تست', size: '60×60', color: 'سفید',
    })
    if (role === 'VIEWER') check('VIEWER: ثبت کالا → 403 (قبلاً فقط UI مهار می‌کرد)', r.status === 403 && /بازدیدکننده/.test(String(r.data.error)), `status=${r.status} err=${r.data.error}`)
    else check(`${role}: ثبت کالا مجاز`, r.status === 200, String(r.data.error))
  }

  // اعمال AI (نوشتن) — نامه پیش‌نویس مدیر شرکت
  const myLetters = await api(jars.ADMIN!, '/api/letters?box=sent&page=1&pageSize=5', 'GET')
  const draftLetter = ((myLetters.data.items as { id: string; subject: string }[]) ?? []).find((l) => l.subject.includes(`تست RBAC ${stamp}`))
  if (draftLetter) {
    const r = await api(jars.VIEWER!, '/api/ai/apply', 'POST', { letterId: draftLetter.id, category: 'اداری و هماهنگی', summary: 'خلاصه تست' })
    check('VIEWER: اعمال AI → 403', r.status === 403, `status=${r.status} err=${r.data.error}`)
  } else {
    check('نامه تست برای AI یافت شد', false, 'نامه پیش‌نویس تست پیدا نشد')
  }

  // ---------- P1-T14: گارد تنظیمات ----------
  for (const { role } of roles) {
    const r = await api(jars[role]!, '/api/audit?pageSize=5', 'GET')
    if (role === 'ADMIN') check('ADMIN شرکت: دیدن حسابرسی مجاز', r.status === 200, `status=${r.status} err=${r.data.error}`)
    else check(`${role}: حسابرسی → 403 فارسی`, r.status === 403 && /تنظیمات بستر فقط برای مدیران/.test(String(r.data.error)), `status=${r.status} err=${r.data.error}`)
  }
  const adminAudit = await api(jar, '/api/audit?pageSize=5', 'GET')
  check('مدیر پلتفرم (isAdmin): حسابرسی مجاز', adminAudit.status === 200, String(adminAudit.data.error))

  for (const { role } of roles) {
    const r = await api(jars[role]!, '/api/platform/governance', 'GET')
    if (role === 'ADMIN') check('ADMIN شرکت: حاکمیت بستر مجاز', r.status === 200, `status=${r.status}`)
    else check(`${role}: حاکمیت بستر → 403`, r.status === 403, `status=${r.status}`)
  }

  // دایرکتوری حداقلی کاربران برای غیرمدیران (حفظ ارجاع نامه)
  const viewerUsers = await api(jars.VIEWER!, '/api/users', 'GET')
  const vUsers = (viewerUsers.data.users ?? []) as Record<string, unknown>[]
  check('VIEWER: دایرکتوری کاربران → 200', viewerUsers.status === 200, String(viewerUsers.data.error))
  check('VIEWER: دایرکتوری بدون نام کاربری (داده حساس)', vUsers.length > 0 && vUsers.every((u) => !('username' in u)), `${vUsers.length} کاربر`)
  check('VIEWER: دایرکتوری شامل نام و سمت', vUsers.every((u) => 'fullName' in u && 'jobTitle' in u))
  const adminUsers = await api(jars.ADMIN!, '/api/users', 'GET')
  const aUsers = (adminUsers.data.users ?? []) as Record<string, unknown>[]
  check('ADMIN شرکت: پروفایل کامل کاربران (با username و ماتریس)', aUsers.length > 0 && aUsers.some((u) => 'username' in u && 'companies' in u))

  // ---------- P1-T15: فیلترهای حسابرسی + CSV ----------
  const fAction = await api(jars.ADMIN!, '/api/audit?action=LOGIN&pageSize=10', 'GET')
  const loginItems = ((fAction.data.logs as { items: { action: string }[] }).items) ?? []
  check('فیلتر اقدام: همه سطرها LOGIN', fAction.status === 200 && loginItems.length > 0 && loginItems.every((l) => l.action === 'LOGIN'), `${loginItems.length} سطر err=${fAction.data.error}`)

  const fCompany = await api(jars.ADMIN!, `/api/audit?companyId=${op.id}&pageSize=10`, 'GET')
  check('فیلتر شرکت در دامنه دید', fCompany.status === 200, String(fCompany.data.error))
  const fCompanyBad = await api(jars.ADMIN!, '/api/audit?companyId=not-a-company', 'GET')
  check('فیلتر شرکت خارج دامنه → 400 فارسی', fCompanyBad.status === 400 && /دامنه دید/.test(String(fCompanyBad.data.error)), `status=${fCompanyBad.status} err=${fCompanyBad.data.error}`)

  const fRange = await api(jars.ADMIN!, '/api/audit?from=۱۴۰۴/۰۱/۰۱&to=۱۴۰۵/۱۲/۲۹&pageSize=10', 'GET')
  check('فیلتر بازه جلالی معتبر', fRange.status === 200, `status=${fRange.status} err=${fRange.data.error}`)
  const fRangeItems = ((fRange.data.logs as { items: { createdAt: string }[] }).items) ?? []
  check('بازه: همه سطرها در محدوده', fRangeItems.every((l) => new Date(l.createdAt).getTime() < new Date('2027-03-21').getTime()))
  const fBadFrom = await api(jars.ADMIN!, '/api/audit?from=ردیف-نامعتبر', 'GET')
  check('بازه نامعتبر → 400 فارسی «از»', fBadFrom.status === 400 && /«از» نامعتبر/.test(String(fBadFrom.data.error)), `status=${fBadFrom.status} err=${fBadFrom.data.error}`)
  const fSwap = await api(jars.ADMIN!, '/api/audit?from=۱۴۰۵/۱۲/۲۹&to=۱۴۰۴/۰۱/۰۱', 'GET')
  check('بازه معکوس → 400 فارسی', fSwap.status === 400 && /قبل از/.test(String(fSwap.data.error)), `status=${fSwap.status} err=${fSwap.data.error}`)

  const fQ = await api(jars.ADMIN!, '/api/audit?q=ورود&pageSize=10', 'GET')
  check('جستجوی متنی حسابرسی', fQ.status === 200, String(fQ.data.error))

  // CSV — مدیر شرکت (بایت خام برای BOM — اکسل آن را لازم دارد)
  const csvR = await rawBytes(jars.ADMIN!, '/api/audit?format=csv&action=LOGIN')
  check('CSV: مدیر شرکت → 200', csvR.status === 200, `status=${csvR.status}`)
  check('CSV: Content-Type متن csv utf-8', (csvR.headers.get('content-type') ?? '').includes('text/csv') && (csvR.headers.get('content-type') ?? '').includes('utf-8'))
  check('CSV: BOM ابتدای فایل (اکسل فارسی)', csvR.bytes[0] === 0xef && csvR.bytes[1] === 0xbb && csvR.bytes[2] === 0xbf, `بایت اول: 0x${csvR.bytes[0]?.toString(16)}`)
  check('CSV: هدر فارسی ستون‌ها', csvR.text.includes('زمان') && csvR.text.includes('کاربر') && csvR.text.includes('اقدام'))
  check('CSV: سطر داده با برچسب فارسی اقدام', /ورود \(LOGIN\)/.test(csvR.text))
  check('CSV: نام فایل پیوست دانلود', (csvR.headers.get('content-disposition') ?? '').includes('attachment; filename="audit-'))
  check('CSV: فیلتر اعمال‌شده (همه سطرها LOGIN)', csvR.text.split('\r\n').slice(1).filter((l) => l.trim()).every((l) => /LOGIN/.test(l)))
  check('CSV: سطرها با CRLF (سازگار اکسل ویندوز)', csvR.text.includes('\r\n'))
  const csvViewer = await rawGet(jars.VIEWER!, '/api/audit?format=csv')
  check('CSV: VIEWER → 403', csvViewer.status === 403, `status=${csvViewer.status}`)
  const csvNoAuth = await rawGet({ cookie: 'pos_sid=x', token: 'x' }, '/api/audit?format=csv')
  check('CSV: بدون نشست → 401', csvNoAuth.status === 401, `status=${csvNoAuth.status}`)

  // ---------- P1-T28: گارد API در سطح ماژول (SC-008 شاخه API) ----------
  const modsList = (await api(jar, '/api/modules', 'GET')).data.modules as { id: string; code: string }[]
  // CMD-011 (P0.5-T2): کد رجیستری انبار بازنام‌گذاری شد — تست با v1.1 هم‌گام
  const whMod = modsList.find((m) => m.code === 'warehouse-inventory')
  check('T28: ماژول warehouse در رجیستری یافت شد', !!whMod)

  // خاموشی سراسری → همه APIهای انبار 404 فارسی
  const offG = await api(jar, '/api/modules', 'PATCH', { moduleId: whMod!.id, scope: 'global', enabled: false })
  check('T28: خاموشی سراسری warehouse → 200', offG.status === 200, String(offG.data.error))
  const g1 = await api(jars.MANAGER!, '/api/stock', 'GET')
  check('T28: خاموشی سراسری — GET /api/stock → 404 فارسی', g1.status === 404 && /فعال نیست/.test(String(g1.data.error)), `status=${g1.status} err=${g1.data.error}`)
  const g2 = await api(jars.MANAGER!, '/api/requests', 'GET')
  check('T28: خاموشی سراسری — GET /api/requests → 404', g2.status === 404, `status=${g2.status}`)
  const g3 = await api(jars.MANAGER!, '/api/requests', 'POST', reqBody)
  check('T28: خاموشی سراسری — POST /api/requests → 404 (نه 403)', g3.status === 404, `status=${g3.status}`)
  const g4 = await api(jars.MANAGER!, `/api/requests/${reqIds.MANAGER}`, 'GET')
  check('T28: خاموشی سراسری — GET /api/requests/[id] → 404', g4.status === 404, `status=${g4.status}`)
  const g5 = await api(jars.MANAGER!, '/api/whdocs', 'GET')
  check('T28: خاموشی سراسری — GET /api/whdocs → 404', g5.status === 404, `status=${g5.status}`)
  const g6 = await api(jar, '/api/stock', 'GET')
  check('T28: خاموشی سراسری — مدیر پلتفرم هم 404 (آینه منو، بدون بای‌پس)', g6.status === 404, `status=${g6.status}`)
  const g7 = await api(jar, '/api/modules', 'GET')
  check('T28: رجیستری ماژول‌ها زنده می‌ماند (مسیر بازگشت قطع نمی‌شود)', g7.status === 200, `status=${g7.status}`)
  const onG = await api(jar, '/api/modules', 'PATCH', { moduleId: whMod!.id, scope: 'global', enabled: true })
  check('T28: روشن‌سازی سراسری → 200', onG.status === 200, String(onG.data.error))
  const g8 = await api(jars.MANAGER!, '/api/stock', 'GET')
  check('T28: پس از روشن‌سازی — GET /api/stock → 200 (کش بلافاصله بی‌اعتبار)', g8.status === 200, `status=${g8.status} err=${g8.data.error}`)

  // خاموشی شرکتی (توسط ADMIN شرکت) → فقط همان شرکت
  const offC = await api(jars.ADMIN!, '/api/modules', 'PATCH', { moduleId: whMod!.id, scope: 'company', enabled: false })
  check('T28: خاموشی شرکتی warehouse (ADMIN شرکت) → 200', offC.status === 200, String(offC.data.error))
  const c1 = await api(jars.MANAGER!, '/api/requests', 'GET')
  check('T28: خاموشی شرکتی — GET /api/requests → 404', c1.status === 404, `status=${c1.status}`)
  const onC = await api(jars.ADMIN!, '/api/modules', 'PATCH', { moduleId: whMod!.id, scope: 'company', enabled: true })
  check('T28: روشن‌سازی شرکتی → 200', onC.status === 200, String(onC.data.error))
  const c2 = await api(jars.MANAGER!, '/api/requests', 'GET')
  check('T28: پس از روشن‌سازی شرکتی → 200', c2.status === 200, `status=${c2.status}`)
  const vToggle = await api(jars.VIEWER!, '/api/modules', 'PATCH', { moduleId: whMod!.id, scope: 'company', enabled: false })
  check('T31: VIEWER — toggle ماژول → 403', vToggle.status === 403, `status=${vToggle.status}`)

  // ---------- P1-T29: دید درخواست کالا per-company (همه / خودم+مدیران) ----------
  const vSet = await api(jars.VIEWER!, '/api/platform/company-settings', 'PATCH', { key: 'requests.visibility', value: 'SELF_MANAGERS' })
  check('T29: VIEWER — تغییر تنظیم شرکت → 403', vSet.status === 403 && /مدیران سامانه/.test(String(vSet.data.error)), `status=${vSet.status}`)
  const mSet = await api(jars.MANAGER!, '/api/platform/company-settings', 'GET')
  check('T29: MANAGER — خواندن تنظیم شرکت → 403 (تنظیمات بستر)', mSet.status === 403, `status=${mSet.status}`)

  const setVis = await api(jars.ADMIN!, '/api/platform/company-settings', 'PATCH', { key: 'requests.visibility', value: 'SELF_MANAGERS' })
  check('T29: ADMIN — فعال‌سازی دید محدود → 200', setVis.status === 200, String(setVis.data.error))

  const mgrNew = await api(jars.MANAGER!, '/api/requests', 'POST', { ...reqBody, neededFor: 'دید محدود — درخواست مدیر' })
  check('T29: MANAGER — ثبت درخواست در حالت محدود', mgrNew.status === 200, String(mgrNew.data.error))
  const opNew = await api(jars.OPERATOR!, '/api/requests', 'POST', { ...reqBody, neededFor: 'دید محدود — درخواست کارشناس' })
  check('T29: OPERATOR — ثبت درخواست در حالت محدود', opNew.status === 200, String(opNew.data.error))

  const opList = (await api(jars.OPERATOR!, '/api/requests?pageSize=100', 'GET')).data.items as { requesterName: string }[]
  check('T29: OPERATOR — فقط درخواست‌های خودش', opList.length > 0 && opList.every((r) => r.requesterName === 'تست OPERATOR'), `${opList.length} درخواست`)
  const mgrListAll = (await api(jars.MANAGER!, '/api/requests?pageSize=100', 'GET')).data.items as { requesterName: string }[]
  check('T29: MANAGER — همه درخواست‌های شرکت (خودش + کارشناس)', mgrListAll.some((r) => r.requesterName === 'تست MANAGER') && mgrListAll.some((r) => r.requesterName === 'تست OPERATOR'))
  const vNone = (await api(jars.VIEWER!, '/api/requests?pageSize=100', 'GET')).data.items as unknown[]
  check('T29: VIEWER — بدون درخواست خودش → فهرست خالی', vNone.length === 0, `${vNone.length} درخواست`)

  const opForeign = await api(jars.OPERATOR!, `/api/requests/${mgrNew.data.id}`, 'GET')
  check('T29: OPERATOR — صفحه رکورد درخواست مدیر → 404', opForeign.status === 404, `status=${opForeign.status}`)
  const opOwn = await api(jars.OPERATOR!, `/api/requests/${opNew.data.id}`, 'GET')
  check('T29: OPERATOR — صفحه رکورد درخواست خودش → 200', opOwn.status === 200, `status=${opOwn.status}`)

  const resetVis = await api(jars.ADMIN!, '/api/platform/company-settings', 'PATCH', { key: 'requests.visibility', value: 'ALL' })
  check('T29: ADMIN — بازگشت به دید همه → 200', resetVis.status === 200, String(resetVis.data.error))
  const opList2 = (await api(jars.OPERATOR!, '/api/requests?pageSize=100', 'GET')).data.items as { requesterName: string }[]
  check('T29: OPERATOR — پس از بازگشت، درخواست مدیر هم دیده می‌شود', opList2.some((r) => r.requesterName === 'تست MANAGER'))

  // ---------- P1-T30: اعلان گزینشی مدیران (سقف متراژ — پیش‌مالی) ----------
  const setCeil = await api(jars.ADMIN!, '/api/platform/company-settings', 'PATCH', { key: 'requests.notifyCeilingM2', value: '100' })
  check('T30: ADMIN — سقف اعلان ۱۰۰ مترمربع → 200', setCeil.status === 200, String(setCeil.data.error))

  const notifs = (j: Jar) => api(j, '/api/notifications', 'GET').then((r) => (r.data.notifications as { kind: string; body?: string | null }[]).filter((n) => n.kind === 'REQUEST'))
  const beforeN = await notifs(jars.MANAGER!)

  const small = await api(jars.OPERATOR!, '/api/requests', 'POST', { ...reqBody, items: [{ productId: prod!.id, qtyM2: '۵' }], neededFor: 'زیر سقف اعلان' })
  check('T30: ثبت درخواست کوچک (۵ مترمربع)', small.status === 200, String(small.data.error))
  const afterSmall = await notifs(jars.MANAGER!)
  check('T30: درخواست زیر سقف — بدون اعلان جدید به مدیر', afterSmall.length === beforeN.length, `پیش=${beforeN.length} پس=${afterSmall.length}`)

  const big = await api(jars.OPERATOR!, '/api/requests', 'POST', { ...reqBody, items: [{ productId: prod!.id, qtyM2: '۱۵۰' }], neededFor: 'بالای سقف اعلان' })
  check('T30: ثبت درخواست بزرگ (۱۵۰ مترمربع)', big.status === 200, String(big.data.error))
  const afterBig = await notifs(jars.MANAGER!)
  check('T30: درخواست بالای سقف — اعلان به مدیر', afterBig.length === beforeN.length + 1, `پیش=${beforeN.length} پس=${afterBig.length}`)
  check('T30: متن اعلان شامل شماره و متراژ', afterBig.some((n) => (n.body ?? '').includes(String(big.data.reqNumber)) && (n.body ?? '').includes('مترمربع')))

  const resetCeil = await api(jars.ADMIN!, '/api/platform/company-settings', 'PATCH', { key: 'requests.notifyCeilingM2', value: '0' })
  check('T30: ADMIN — بازنشانی سقف به ۰ (اعلان همه)', resetCeil.status === 200, String(resetCeil.data.error))

  // ---------- پاک‌سازی ----------
  const createdLetters = await db.letter.findMany({ where: { subject: { contains: `تست RBAC ${stamp}` } }, select: { id: true } })
  await db.letterReferral.deleteMany({ where: { letterId: { in: createdLetters.map((l) => l.id) } } })
  await db.letter.deleteMany({ where: { id: { in: createdLetters.map((l) => l.id) } } })
  await db.warehouseDoc.deleteMany({ where: { id: { in: Object.values(docIds).filter((x): x is string => !!x) } } })
  // درخواست‌های کاربران تست — حذف بر اساس requesterId (مقاوم: هر درخواستی که این اجرا ساخته،
  // حتی اگر مجموعه آیدی‌ها ناقص مانده باشد — درس اجرای اول: POST تستِ T28 هنگام شکست گارد)
  const testUserIds = Object.values(userIds).filter((x): x is string => !!x)
  await db.goodsRequestItem.deleteMany({ where: { request: { requesterId: { in: testUserIds } } } })
  await db.goodsRequest.deleteMany({ where: { requesterId: { in: testUserIds } } })
  // تنظیمات شرکتی آزمایشی → حذف کامل (بازگشت به پیش‌فرض)
  await db.companySetting.deleteMany({ where: { companyId: op.id, key: { startsWith: 'requests.' } } })
  await db.product.deleteMany({ where: { AND: [{ code: { startsWith: 'RBAC-' } }, { code: { contains: String(stamp) } }] } })
  for (const uid of Object.values(userIds).filter((x): x is string => !!x)) {
    await db.knownDevice.deleteMany({ where: { userId: uid } })
    await db.notification.deleteMany({ where: { userId: uid } })
    await db.session.deleteMany({ where: { userId: uid } })
    await db.membership.deleteMany({ where: { userId: uid } })
    await db.auditLog.deleteMany({ where: { userId: uid } })
    await db.user.delete({ where: { id: uid } })
  }
  const leftovers = await db.user.count({ where: { username: { contains: `t.rbac.${stamp}` } } })
  check('پاک‌سازی کامل کاربران تست', leftovers === 0, `${leftovers} کاربر باقی`)

  await db.$disconnect()
  console.log(failures === 0 ? '\n✅ همه سنجه‌های RBAC سبز است' : `\n❌ ${failures} سنجه قرمز است`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('خطای تست:', e); process.exit(1) })
