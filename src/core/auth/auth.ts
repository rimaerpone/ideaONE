import 'server-only'
import { cookies, headers } from 'next/headers'
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { db } from '@/core/shared/db'
import { audit } from '@/core/audit/audit'
import { notify } from '@/core/notifications/notify'
import { checkLoginAllowed, recordLoginFailure, clearLoginFailures } from '@/core/auth/login-rate-limit'
import { validatePasswordPolicy } from '@/core/auth/password-policy'
import type { ServiceResult } from '@/core/shared/types'

export const SESSION_COOKIE = 'pos_sid'
export const SESSION_TOKEN_HEADER = 'x-session-token'
const SESSION_DAYS = 7

/**
 * P0.5-T3: scrypt غیرمسدودکننده — نسخهٔ promise شده در threadpool libuv اجرا می‌شود
 * تا event-loop در اوج ورودهای هم‌زمان قفل نشود (سنجه پذیرش: تأخیر endpoint سبک
 * تحت بار ورود پایدار بماند). scryptSync حدود ۱۰۰ms CPU به‌ازای هر فراخوانی می‌بندد.
 */
const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>

/**
 * انتخاب سازنده‌کار کوکی نشست بر اساس بستر درخواست.
 *
 * چرا: دسترسی از دامنه پیش‌نمایش HTTPS (پشت گیت‌وی) در بافت تعبیه‌شده (iframe)
 * سیاست‌های SameSite/کوکی third-party مرورگر را فعال می‌کند؛ کوکی Lax در آن
 * بافت ذخیره/ارسال نمی‌شود. اگر بستر HTTPS باشد (پروتکل فوروارد‌شده یا میزبان
 * دامنه پیش‌نمایش)، کوکی با SameSite=None + Secure صادر می‌شود تا در iframe هم
 * پذیرفته شود؛ در HTTP محلی همان Lax امن و سازگار می‌ماند.
 */
async function sessionCookieAttrs(): Promise<{
  httpOnly: true
  sameSite: 'lax' | 'none'
  secure: boolean
  expires: Date
  path: '/'
}> {
  const h = await headers()
  const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const host = h.get('host')?.toLowerCase() ?? ''
  const isHttps = proto === 'https' || host.endsWith('.space-z.ai') || host === 'space-z.ai'
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000)
  if (isHttps) return { httpOnly: true, sameSite: 'none', secure: true, expires, path: '/' }
  return { httpOnly: true, sameSite: 'lax', secure: false, expires, path: '/' }
}

export async function hashPassword(password: string): Promise<string> {
  // ⚠ سازگاری بایت‌به‌بایت با هش‌های موجود: نمک به‌صورت «رشتهٔ hex» به scrypt
  // داده می‌شود (همان قرارداد scryptSync قدیمی) — اگر Buffer خام شود، همهٔ
  // گذرواژه‌های ذخیره‌شدهٔ قبلی نامعتبر می‌شوند (درس P0.5-T3).
  const salt = randomBytes(16).toString('hex')
  const hash = await scrypt(password, salt, 64)
  return `${salt}:${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const target = Buffer.from(hash, 'hex')
  if (target.length === 0) return false
  // نمک همین رشتهٔ hex است — بدون decode (سازگاری با هش‌های موجود)
  const candidate = await scrypt(password, salt, target.length)
  return candidate.length === target.length && timingSafeEqual(candidate, target)
}

export async function createSession(
  userId: string,
  companyId?: string | null,
  meta?: { ip?: string; userAgent?: string; deviceKey?: string },
) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000)
  const session = await db.session.create({
    data: {
      userId,
      companyId: companyId ?? null,
      expiresAt,
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
      deviceKey: meta?.deviceKey ?? null,
      lastSeenAt: new Date(),
    },
  })
  const jar = await cookies()
  jar.set(SESSION_COOKIE, session.id, await sessionCookieAttrs())
  return session
}

export type SessionContext = {
  sessionId: string
  userId: string
  username: string
  fullName: string
  isAdmin: boolean
  companyId: string | null
}

export async function getSessionCtx(): Promise<SessionContext | null> {
  const jar = await cookies()
  let sid: string | null | undefined = jar.get(SESSION_COOKIE)?.value
  // جایگزین نشست در بافت‌های تعبیه‌شده (iframe پیش‌نمایش) که کوکی third-party
  // را مسدود می‌کنند — کلاینت توکن نشست را در sessionStorage نگه می‌دارد و با
  // هدر اختصاصی می‌فرستد؛ اولویت همچنان با کوکی httpOnly است.
  if (!sid) {
    const h = await headers()
    sid = h.get(SESSION_TOKEN_HEADER)?.trim() || null
  }
  if (!sid) return null
  const session = await db.session.findUnique({
    where: { id: sid },
    include: { user: true },
  })
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null
  // P1-T8: به‌روزرسانی «آخرین فعالیت» با گلوگاه ۶۰ ثانیه‌ای — یک نوشتار در دقیقه
  // حداکثر، نه در هر درخواست؛ خطای نوشتار هرگز پاسخ را نمی‌شکند.
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    void db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {})
  }
  return {
    sessionId: session.id,
    userId: session.user.id,
    username: session.user.username,
    fullName: session.user.fullName,
    isAdmin: session.user.isAdmin,
    companyId: session.companyId,
  }
}

export async function setSessionCompany(sessionId: string, companyId: string) {
  await db.session.update({ where: { id: sessionId }, data: { companyId } })
}

export async function destroySession() {
  const jar = await cookies()
  const sid = jar.get(SESSION_COOKIE)?.value
  if (sid) {
    await db.session.deleteMany({ where: { id: sid } })
    jar.delete(SESSION_COOKIE)
  }
}

// ---------- عملیات ورود/خروج (منطق از route به هسته منتقل شد — قانون route نازک) ----------

// P0-T21: رکورد امنیتی تلاش ناموفق — حتی وقتی کاربر شناخته نشده باشد (بدون ctx نشست)
async function logFailedLogin(
  user: { id: string; username: string } | null,
  username: string,
  ip: string,
  reason: 'unknown_user' | 'inactive' | 'bad_password' | 'rate_limited',
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: user?.id ?? null,
        companyId: null, // شرکت در تلاش ناموفق معتبر نیست — نشانی IP ملاک استخراج است
        action: 'LOGIN_FAILED',
        entity: 'auth',
        details: JSON.stringify({ username, ip, reason }),
      },
    })
  } catch {
    // خطای حسابرسی هرگز مانع پاسخ ورود نمی‌شود
  }
}

export async function login(
  username: unknown,
  password: unknown,
  ip = 'local',
  userAgent = '',
): Promise<ServiceResult<{ token: string }>> {
  try {
    if (!username || !password) return { ok: false, error: 'نام کاربری و گذرواژه الزامی است', status: 400 }
    const uname = String(username).trim()

    // P0-T20: محدودسازی نرخ — قبل از هر کار روی دیتابیس (P0.5-T3: ماندگار در DB)
    const verdict = await checkLoginAllowed(uname, ip)
    if (!verdict.allowed) {
      // تلاش مسدودشده هم در سجل امنیتی می‌نشیند (الگوی حمله قابل ردیابی باشد)
      await logFailedLogin(null, uname, ip, 'rate_limited')
      return {
        ok: false,
        error: `تلاش‌های ورود بیش از حد مجاز است — حدود ${verdict.retryAfterSec} ثانیه دیگر دوباره امتحان کنید`,
        status: 429,
      }
    }

    const user = await db.user.findUnique({
      where: { username: uname },
      include: { memberships: true },
    })
    const passwordOk = user
      ? await verifyPassword(String(password), user.passwordHash)
      : false
    if (!user || !user.isActive || !passwordOk) {
      await recordLoginFailure(uname, ip)
      const reason = !user ? 'unknown_user' : !user.isActive ? 'inactive' : 'bad_password'
      await logFailedLogin(user && user.isActive ? user : null, uname, ip, reason)
      return { ok: false, error: 'نام کاربری یا گذرواژه نادرست است', status: 401 }
    }

    // ورود موفق — شمارنده نرخ همان کلید صفر می‌شود
    await clearLoginFailures(uname, ip)

    // P1-T19: تشخیص دستگاه جدید — اثر انگشت عامل کاربر نرمال‌شده (شماره نسخه‌های
    // جزئی حذف می‌شود تا ارتقای مرورگر، «دستگاه جدید» تلقی نشود)
    const deviceKey = deviceFingerprint(userAgent)
    const known = await db.knownDevice.findUnique({
      where: { userId_deviceKey: { userId: user.id, deviceKey } },
    })
    const isNewDevice = !known
    if (known) {
      void db.knownDevice.update({
        where: { id: known.id },
        data: { lastSeen: new Date(), ip, userAgent: userAgent || known.userAgent },
      }).catch(() => {})
    } else {
      await db.knownDevice.create({
        data: { userId: user.id, deviceKey, userAgent: userAgent || null, ip },
      }).catch(() => {})
    }

    // شرکت پیش‌فرض: اولین عضویت
    const first = user.memberships[0]
    const session = await createSession(user.id, first?.companyId ?? null, { ip, userAgent, deviceKey })
    await audit({
      ctx: { sessionId: '', userId: user.id, username: user.username, fullName: user.fullName, isAdmin: user.isAdmin, companyId: first?.companyId ?? null },
      action: 'LOGIN',
      entity: 'auth',
      details: { username: user.username, ip, deviceKey: deviceKey.slice(0, 12), isNewDevice },
    })

    // P1-T19: ورود از دستگاه جدید → اعلان به خود کاربر + رکورد امنیتی مستقل
    if (isNewDevice) {
      await audit({
        ctx: { sessionId: '', userId: user.id, username: user.username, fullName: user.fullName, isAdmin: user.isAdmin, companyId: first?.companyId ?? null },
        action: 'LOGIN_NEW_DEVICE',
        entity: 'auth',
        details: {
          username: user.username,
          ip,
          userAgent: describeUserAgent(userAgent),
          deviceKey: deviceKey.slice(0, 12),
        },
      })
      await notify({
        userId: user.id,
        title: 'ورود از دستگاه جدید به حساب شما',
        body: `یک ورود موفق از دستگاه ناشناخته (${describeUserAgent(userAgent)}) با نشانی ${ip} ثبت شد. اگر این ورود توسط شما نبوده، فوراً گذرواژه خود را تغییر دهید و از «حساب من» همه نشست‌ها را پایان دهید.`,
        kind: 'SECURITY',
        targetView: 'my-account',
      }).catch(() => {})
    }

    // توکن نشست در پاسخ — برای کلاینت در بافت‌های تعبیه‌شده (کوکی مسدود)
    return { ok: true, data: { token: session.id } }
  } catch {
    return { ok: false, error: 'خطای سرور در ورود', status: 500 }
  }
}

/** P1-T19: اثر انگشت دستگاه — هش UA با حذف شماره‌های نسخه (ارتقای مرورگر = همان دستگاه) */
function deviceFingerprint(userAgent: string): string {
  const normalized = userAgent
    .replace(/\b\d+\.\d+(?:\.\d+)?\b/g, '#') // نسخه‌ها → #
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return createHash('sha256').update(normalized || 'unknown').digest('hex')
}

/** توضیح کوتاه فارسی از عامل کاربر برای اعلان/سجل */
function describeUserAgent(userAgent: string): string {
  const ua = userAgent.toLowerCase()
  if (!ua) return 'نامشخص'
  const os = ua.includes('windows') ? 'ویندوز'
    : ua.includes('android') ? 'اندروید'
    : ua.includes('iphone') || ua.includes('ipad') ? 'iOS'
    : ua.includes('mac os') || ua.includes('macintosh') ? 'مک'
    : ua.includes('linux') ? 'لینوکس'
    : 'سیستم نامشخص'
  const browser = ua.includes('edg/') ? 'اج'
    : ua.includes('chrome') && !ua.includes('chromium') ? 'کروم'
    : ua.includes('firefox') ? 'فایرفاکس'
    : ua.includes('safari') ? 'سافاری'
    : ua.includes('headless') || ua.includes('puppeteer') || ua.includes('playwright') ? 'مرورگر خودکار'
    : 'مرورگر نامشخص'
  return `${os} · ${browser}`
}

export { describeUserAgent }

export type MePayload = {
  user: { id: string; username: string; fullName: string; jobTitle: string | null; isAdmin: boolean }
  companies: { id: string; code: string; name: string; type: string; role: string; sortOrder: number }[]
  activeCompanyId: string | null
  unreadCount: number
}

export async function mePayload(ctx: SessionContext): Promise<ServiceResult<MePayload>> {
  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    include: { memberships: { include: { company: true } } },
  })
  if (!user) return { ok: false, error: 'unauthorized', status: 401 }
  const companies = user.memberships
    .map((m) => ({
      id: m.company.id,
      code: m.company.code,
      name: m.company.name,
      type: m.company.type,
      role: m.role,
      sortOrder: m.company.sortOrder,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const unread = await db.notification.count({ where: { userId: user.id, isRead: false } })
  return {
    ok: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        jobTitle: user.jobTitle,
        isAdmin: user.isAdmin,
      },
      companies,
      activeCompanyId: ctx.companyId,
      unreadCount: unread,
    },
  }
}

export async function switchCompany(ctx: SessionContext, companyId: unknown): Promise<ServiceResult<null>> {
  // فقط شرکت‌هایی که کاربر عضو آن‌هاست
  const m = await db.membership.findUnique({
    where: { userId_companyId: { userId: ctx.userId, companyId: String(companyId) } },
  })
  if (!m) return { ok: false, error: 'شما به این شرکت دسترسی ندارید', status: 403 }
  await setSessionCompany(ctx.sessionId, String(companyId))
  await audit({ ctx, action: 'SWITCH_COMPANY', entity: 'auth', details: { companyId: String(companyId) } })
  return { ok: true, data: null }
}

export async function logout(ctx: SessionContext | null): Promise<void> {
  if (ctx) {
    await db.session.deleteMany({ where: { id: ctx.sessionId } })
    await audit({ ctx, action: 'LOGOUT', entity: 'auth' })
  }
  await destroySession()
}

// ---------- P1-T7: تغییر گذرواژه توسط خود کاربر ----------

export async function changeMyPassword(
  ctx: SessionContext,
  currentPassword: unknown,
  nextPassword: unknown,
): Promise<ServiceResult<null>> {
  try {
    if (typeof currentPassword !== 'string' || !currentPassword) {
      return { ok: false, error: 'گذرواژه فعلی الزامی است', status: 400 }
    }
    const user = await db.user.findUnique({ where: { id: ctx.userId } })
    if (!user) return { ok: false, error: 'کاربر یافت نشد', status: 404 }
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      return { ok: false, error: 'گذرواژه فعلی نادرست است', status: 400 }
    }
    const policyError = validatePasswordPolicy(nextPassword, user.username)
    if (policyError) return { ok: false, error: policyError, status: 400 }
    if (await verifyPassword(String(nextPassword), user.passwordHash)) {
      return { ok: false, error: 'گذرواژه جدید نباید با گذرواژه فعلی یکسان باشد', status: 400 }
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(String(nextPassword)) },
    })
    // ابطال همه نشست‌های دیگر — فقط نشست جاری (که تغییر را انجام داده) می‌ماند
    await db.session.deleteMany({ where: { userId: user.id, NOT: { id: ctx.sessionId } } })
    await audit({
      ctx,
      action: 'PASSWORD_CHANGE_SELF',
      entity: 'auth',
      details: { username: user.username, revokedOtherSessions: true },
    })
    return { ok: true, data: null }
  } catch {
    return { ok: false, error: 'خطای سرور در تغییر گذرواژه', status: 500 }
  }
}

// ---------- P1-T8: مدیریت نشست‌ها (دستگاه‌های فعال) ----------

export type SessionItem = {
  id: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  ip: string | null
  userAgent: string | null
  device: string
  isCurrent: boolean
  companyCode: string | null
}

export async function listMySessions(ctx: SessionContext): Promise<ServiceResult<{ sessions: SessionItem[] }>> {
  const rows = await db.session.findMany({
    where: { userId: ctx.userId, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
  })
  // شرکتِ فعال هر نشست (برای نمایش)
  const companyIds = [...new Set(rows.map((r) => r.companyId).filter((x): x is string => !!x))]
  const companies = companyIds.length
    ? await db.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, code: true } })
    : []
  const codeById = new Map(companies.map((c) => [c.id, c.code]))
  return {
    ok: true,
    data: {
      sessions: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        lastSeenAt: r.lastSeenAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
        ip: r.ip,
        userAgent: r.userAgent,
        device: describeUserAgent(r.userAgent ?? ''),
        isCurrent: r.id === ctx.sessionId,
        companyCode: r.companyId ? codeById.get(r.companyId) ?? null : null,
      })),
    },
  }
}

export async function revokeMySessions(
  ctx: SessionContext,
  exceptCurrent: boolean,
): Promise<ServiceResult<{ revoked: number }>> {
  try {
    const where = exceptCurrent
      ? { userId: ctx.userId, NOT: { id: ctx.sessionId } }
      : { userId: ctx.userId }
    const res = await db.session.deleteMany({ where })
    if (!exceptCurrent) {
      // خروج از همه دستگاه‌ها شامل نشست جاری — کوکی/توکن کلاینت هم پاک شود
      const jar = await cookies()
      jar.delete(SESSION_COOKIE)
    }
    await audit({
      ctx,
      action: 'SESSIONS_REVOKED',
      entity: 'auth',
      details: { revoked: res.count, exceptCurrent },
    })
    return { ok: true, data: { revoked: res.count } }
  } catch {
    return { ok: false, error: 'خطای سرور در پایان نشست‌ها', status: 500 }
  }
}
