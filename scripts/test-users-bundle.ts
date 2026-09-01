// تست خودکار بسته مدیریت کاربران P1-T4/T6/T7/T8/T19
// CRUD کاربر + ماتریس عضویت + سیاست گذرواژه + مدیریت نشست + اعلان دستگاه جدید
// اجرا: bunx tsx scripts/test-users-bundle.ts  (سرور dev باید روشن باشد)
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'
const ADMIN = { username: 'admin', password: 'admin123' } // کاربر مدیر پلتفرم seed

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL'
  if (!cond) failures += 1
  console.log(`[${mark}] ${name}${extra ? ` — ${extra}` : ''}`)
}

type Jar = { cookie: string; token: string }

async function login(username: string, password: string, ua = 'Mozilla/5.0 TestBundle/1.0'): Promise<{ status: number; jar: Jar | null; error: string }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': ua },
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

async function main() {
  const stamp = Date.now() % 1000000
  const uname = `t.user.${stamp}`

  // ---------- ورود مدیر ----------
  const admin = await login(ADMIN.username, ADMIN.password)
  check('ورود مدیر پلتفرم موفق', admin.status === 200, admin.error)
  const jar = admin.jar!
  const adminId = (await api(jar, '/api/auth/me', 'GET')).data.user as { id: string }

  // ---------- P1-T4: ایجاد کاربر — اعتبارسنجی ----------
  const badCases: [string, Record<string, unknown>, RegExp][] = [
    ['نام کاربری کوتاه', { username: 'ab', fullName: 'تست تستی', password: 'Passw0rd123', memberships: [] }, /۳ تا ۳۲/],
    ['نام کاربری غیرلاتین', { username: 'کاربر۱۲', fullName: 'تست تستی', password: 'Passw0rd123', memberships: [] }, /لاتین/],
    ['نام کامل کوتاه', { username: uname, fullName: 'ت', password: 'Passw0rd123', memberships: [] }, /نام کامل/],
    ['گذرواژه کوتاه', { username: uname, fullName: 'تست تستی', password: 'Ab1', memberships: [] }, /۸ نویسه/],
    ['گذرواژه بدون رقم', { username: uname, fullName: 'تست تستی', password: 'ABCDEFGH', memberships: [] }, /حروف و اعداد/],
    ['گذرواژه شامل نام کاربری', { username: uname, fullName: 'تست تستی', password: `Xy${uname}9z`, memberships: [] }, /نام کاربری/],
    ['بدون عضویت', { username: uname, fullName: 'تست تستی', password: 'Passw0rd123', memberships: [] }, /عضویت/],
    ['نقش نامعتبر', { username: uname, fullName: 'تست تستی', password: 'Passw0rd123', memberships: [{ companyId: 'x', role: 'SUPER' }] }, /نقش|شرکت/],
  ]
  for (const [name, body, re] of badCases) {
    const r = await api(jar, '/api/users', 'POST', body)
    check(`رد ${name} با پیام فارسی`, r.status === 400 && re.test(String(r.data.error ?? '')), `status=${r.status} err=${r.data.error}`)
  }

  // ---------- P1-T4: ایجاد کاربر موفق با ماتریس عضویت ----------
  const companies = (await api(jar, '/api/platform/companies', 'GET')).data.companies as { id: string; code: string; name: string }[]
  check('فهرست شرکت‌ها برای مدیر', companies.length >= 4, `${companies.length} شرکت`)
  const c1 = companies[0], c2 = companies[1]

  const create = await api(jar, '/api/users', 'POST', {
    username: uname,
    fullName: 'توسط تستی',
    jobTitle: 'کارشناس تست',
    password: 'Passw0rd123',
    memberships: [
      { companyId: c1.id, role: 'OPERATOR' },
      { companyId: c2.id, role: 'VIEWER' },
    ],
  })
  check('ایجاد کاربر با دو عضویت → 201', create.status === 201, `status=${create.status} err=${create.data.error}`)
  const userId = create.data.id as string

  const dup = await api(jar, '/api/users', 'POST', {
    username: uname, fullName: 'تکراری تستی', password: 'Passw0rd123', memberships: [{ companyId: c1.id, role: 'VIEWER' }],
  })
  check('نام کاربری تکراری رد می‌شود', dup.status === 400 && /قبلاً ثبت/.test(String(dup.data.error)), String(dup.data.error))

  const auditCreate = await db.auditLog.findFirst({ where: { action: 'USER_CREATE', entityId: userId } })
  check('سجل USER_CREATE ثبت شد', !!auditCreate)
  if (auditCreate?.details) {
    const d = JSON.parse(auditCreate.details)
    check('سجل شامل عضویت‌ها', Array.isArray(d.memberships) && d.memberships.length === 2)
  }

  // ---------- P1-T4: ویرایش + جایگزینی ماتریس ----------
  const upd = await api(jar, `/api/users/${userId}`, 'PATCH', {
    fullName: 'توسط تستی ویرایش‌شده',
    memberships: [{ companyId: c1.id, role: 'MANAGER' }],
  })
  check('ویرایش کاربر + ماتریس تک‌عضویت', upd.status === 200, String(upd.data.error))
  const memCount = await db.membership.count({ where: { userId } })
  check('عضویت‌ها جایگزین شد (۲→۱)', memCount === 1, `count=${memCount}`)
  const mem1 = await db.membership.findFirst({ where: { userId } })
  check('نقش جدید MANAGER اعمال شد', mem1?.role === 'MANAGER', mem1?.role)

  // ---------- محافظ‌های خودکار ----------
  const selfDeactivate = await api(jar, `/api/users/${adminId.id}`, 'PATCH', { isActive: false })
  check('غیرفعال‌سازی خود ممنوع', selfDeactivate.status === 400 && /خودتان/.test(String(selfDeactivate.data.error)), String(selfDeactivate.data.error))
  const selfDemote = await api(jar, `/api/users/${adminId.id}`, 'PATCH', { isAdmin: false })
  check('برداشتن سطح مدیر خود ممنوع', selfDemote.status === 400 && /خود/.test(String(selfDemote.data.error)), String(selfDemote.data.error))

  // ---------- P1-T7: بازنشانی رمز توسط مدیر ----------
  const weakReset = await api(jar, `/api/users/${userId}/reset-password`, 'POST', { password: 'short' })
  check('بازنشانی با رمز ضعیف رد', weakReset.status === 400 && /۸ نویسه/.test(String(weakReset.data.error)), String(weakReset.data.error))
  const reset = await api(jar, `/api/users/${userId}/reset-password`, 'POST', { password: 'NewPass99x' })
  check('بازنشانی رمز موفق', reset.status === 200, String(reset.data.error))

  // ورود با رمز جدید (از UA جدید → باید اعلان دستگاه جدید هم بسازد)
  const notifBefore = await db.notification.count({ where: { userId, kind: 'SECURITY' } })
  const newUserLogin = await login(uname, 'NewPass99x', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DifferentUA/2.0')
  check('ورود کاربر جدید با رمز بازنشانی‌شده', newUserLogin.status === 200, newUserLogin.error)
  const notifAfter = await db.notification.count({ where: { userId, kind: 'SECURITY' } })
  check('P1-T19: اعلان ورود از دستگاه جدید ساخته شد', notifAfter === notifBefore + 1, `${notifBefore} → ${notifAfter}`)
  const secNotif = await db.notification.findFirst({ where: { userId, kind: 'SECURITY' }, orderBy: { createdAt: 'desc' } })
  check('اعلان به نمای my-account لینک دارد', secNotif?.targetView === 'my-account', secNotif?.targetView ?? '')
  const newDeviceAudit = await db.auditLog.findFirst({ where: { action: 'LOGIN_NEW_DEVICE', entityId: null, details: { contains: uname } } })
  check('سجل LOGIN_NEW_DEVICE ثبت شد', !!newDeviceAudit)
  const knownDevices = await db.knownDevice.count({ where: { userId } })
  check('یک دستگاه شناخته‌شده برای کاربر', knownDevices === 1, `count=${knownDevices}`)

  // ورود دوباره از همان دستگاه → اعلان جدید نباید ساخته شود
  const ujar = newUserLogin.jar!
  await api(ujar, '/api/auth/logout', 'POST')
  const secondLogin = await login(uname, 'NewPass99x', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DifferentUA/2.1')
  check('ورود دوباره همان دستگاه موفق', secondLogin.status === 200)
  const notifAfter2 = await db.notification.count({ where: { userId, kind: 'SECURITY' } })
  check('دستگاه شناخته‌شده → بدون اعلان جدید', notifAfter2 === notifAfter, `${notifAfter} → ${notifAfter2}`)

  const ujar2 = secondLogin.jar!

  // ---------- P1-T8: نشست‌های کاربر ----------
  // نشست دوم از دستگاه متفاوت (UA دیگر)
  const thirdLogin = await login(uname, 'NewPass99x', 'Mozilla/5.0 (X11; Linux x86_64) ThirdDevice/3.0')
  check('ورود از دستگاه سوم موفق (اعلان جدید می‌سازد)', thirdLogin.status === 200)
  const sessions1 = (await api(ujar2, '/api/auth/sessions', 'GET')).data.sessions as { isCurrent: boolean; device: string; ip: string | null }[]
  check('فهرست نشست‌ها: ۲ دستگاه دیده می‌شود', sessions1.length === 2, `count=${sessions1.length}`)
  check('نشست جاری علامت خورده', sessions1.some((s) => s.isCurrent))
  check('متادیتای دستگاه ثبت شده', sessions1.every((s) => !!s.device && !!s.ip))

  // ---------- P1-T7: تغییر رمز توسط خود کاربر ----------
  const wrongCurrent = await api(ujar2, '/api/auth/change-password', 'POST', { currentPassword: 'WRONG123', newPassword: 'Final444x' })
  check('گذرواژه فعلی نادرست رد', wrongCurrent.status === 400 && /فعلی نادرست/.test(String(wrongCurrent.data.error)), String(wrongCurrent.data.error))
  const samePw = await api(ujar2, '/api/auth/change-password', 'POST', { currentPassword: 'NewPass99x', newPassword: 'NewPass99x' })
  check('رمز یکسان با فعلی رد', samePw.status === 400, String(samePw.data.error))
  const weakNew = await api(ujar2, '/api/auth/change-password', 'POST', { currentPassword: 'NewPass99x', newPassword: '12345' })
  check('رمز جدید ضعیف رد', weakNew.status === 400 && /۸ نویسه/.test(String(weakNew.data.error)), String(weakNew.data.error))

  const sessionsBefore = await db.session.count({ where: { userId } })
  const changePw = await api(ujar2, '/api/auth/change-password', 'POST', { currentPassword: 'NewPass99x', newPassword: 'Final444x' })
  check('تغییر رمز موفق', changePw.status === 200, String(changePw.data.error))
  const sessionsAfter = await db.session.count({ where: { userId } })
  check('نشست‌های دیگر ابطال شد (۲→۱)', sessionsBefore === 2 && sessionsAfter === 1, `${sessionsBefore} → ${sessionsAfter}`)

  // نشست سوم (دستگاه دیگر) حالا باید 401 بدهد
  const deadSession = await api(thirdLogin.jar, '/api/auth/me', 'GET')
  check('نشست ابطال‌شده → 401', deadSession.status === 401, `status=${deadSession.status}`)

  // ---------- P1-T6: پروفایل ----------
  const profile = await api(ujar2, '/api/auth/profile', 'PATCH', { fullName: 'توسط تستی نهایی', jobTitle: 'کارشناس ارشد تست' })
  check('ویرایش پروفایل موفق', profile.status === 200, String(profile.data.error))
  const me = (await api(ujar2, '/api/auth/me', 'GET')).data.user as { fullName: string; jobTitle: string }
  check('پروفایل ذخیره شد', me.fullName === 'توسط تستی نهایی' && me.jobTitle === 'کارشناس ارشد تست', `${me.fullName} / ${me.jobTitle}`)

  // ---------- P1-T8: خروج از همه دستگاه‌ها ----------
  const revokeAll = await api(ujar2, '/api/auth/sessions', 'DELETE', { exceptCurrent: false })
  check('خروج از همه دستگاه‌ها موفق', revokeAll.status === 200 && (revokeAll.data.revoked as number) >= 1, JSON.stringify(revokeAll.data))
  const sessionsFinal = await db.session.count({ where: { userId } })
  check('همه نشست‌ها پایان یافتند', sessionsFinal === 0, `count=${sessionsFinal}`)

  // ---------- P1-T4: غیرفعال‌سازی ----------
  const deactivate = await api(jar, `/api/users/${userId}`, 'PATCH', { isActive: false })
  check('غیرفعال‌سازی کاربر موفق', deactivate.status === 200, String(deactivate.data.error))
  const blockedLogin = await login(uname, 'Final444x')
  check('کاربر غیرفعال وارد نمی‌شود', blockedLogin.status === 401, `status=${blockedLogin.status}`)

  // ---------- مجوز: کاربر عادی نمی‌تواند کاربر بسازد ----------
  // فعال‌سازی مجدد + ورود + تلاش ایجاد کاربر
  await api(jar, `/api/users/${userId}`, 'PATCH', { isActive: true })
  const plainLogin = await login(uname, 'Final444x')
  check('فعال‌سازی مجدد کار می‌کند', plainLogin.status === 200)
  const forbidden = await api(plainLogin.jar, '/api/users', 'POST', {
    username: `x.${stamp}`, fullName: 'مquires تستی', password: 'Passw0rd123', memberships: [{ companyId: c1.id, role: 'VIEWER' }],
  })
  check('کاربر عادی (بدون ADMIN) → 403', forbidden.status === 403, `status=${forbidden.status} err=${forbidden.data.error}`)
  const forbiddenCompanies = await api(plainLogin.jar, '/api/platform/companies', 'GET')
  check('فهرست شرکت‌ها برای غیرمدیر → 403', forbiddenCompanies.status === 403, `status=${forbiddenCompanies.status}`)

  // ---------- پاک‌سازی ----------
  await api(plainLogin.jar, '/api/auth/logout', 'POST')
  await db.knownDevice.deleteMany({ where: { userId } })
  await db.notification.deleteMany({ where: { userId } })
  await db.session.deleteMany({ where: { userId } })
  await db.membership.deleteMany({ where: { userId } })
  await db.auditLog.deleteMany({ where: { userId } })
  await db.user.delete({ where: { id: userId } })
  console.log('\nپاک‌سازی انجام شد — کاربر تست حذف گردید')

  await db.$disconnect()
  console.log(failures === 0 ? '\n✅ همه تست‌ها پاس شدند' : `\n❌ ${failures} تست شکست خورد`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('خطای اجرای تست:', e)
  process.exit(1)
})
