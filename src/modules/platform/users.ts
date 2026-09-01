import 'server-only'
import { db } from '@/core/shared/db'
import type { SessionContext } from '@/core/auth/auth'
import { hashPassword } from '@/core/auth/auth'
import { audit } from '@/core/audit/audit'
import { roleInCompany, scopeCompanyIds } from '@/core/tenancy/tenancy'
import { validatePasswordPolicy } from '@/core/auth/password-policy'
import type { ServiceResult } from '@/core/shared/types'

/**
 * P1-T4: مدیریت کاربران و عضویت‌ها — CRUD از UI (فرم ایجاد/ویرایش/غیرفعال + ماتریس عضویت چندشرکتی)
 * P1-T7: بازنشانی گذرواژه توسط مدیر (سیاست ۸ نویسه در core/auth/password-policy)
 *
 * مجوزها (04-security §3):
 *  - مدیر پلتفرم (isAdmin): همه عملیات روی همه کاربران
 *  - ADMIN شرکت: فقط کاربران دامنه دید خود (عضو شرکت‌های مجاز خودش)
 *  - تغییر isAdmin (مدیر پلتفرم بودن) فقط در اختیار مدیر پلتفرم است
 */
const fail = (error: string, status?: number) => ({ ok: false, error, status }) as ServiceResult<never>

const ROLES = ['ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'] as const
type Role = (typeof ROLES)[number]

export type MembershipInput = { companyId: unknown; role: unknown }

async function requireUserAdmin(ctx: SessionContext): Promise<string | null> {
  if (ctx.isAdmin) return null
  const role = await roleInCompany(ctx.userId, ctx.companyId)
  return role === 'ADMIN' ? null : 'فقط مدیر سامانه می‌تواند کاربران را مدیریت کند'
}

function validateUsername(username: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof username !== 'string') return { ok: false, error: 'نام کاربری الزامی است' }
  const u = username.trim()
  if (u.length < 3 || u.length > 32) return { ok: false, error: 'نام کاربری باید ۳ تا ۳۲ نویسه باشد' }
  if (!/^[a-zA-Z0-9._-]+$/.test(u)) {
    return { ok: false, error: 'نام کاربری فقط می‌تواند شامل حروف لاتین، رقم، نقطه، خط تیره و زیرخط باشد' }
  }
  return { ok: true, value: u }
}

/** اعتبارسنجی بدنه عضویت‌ها — شرکت‌ها باید موجود و بدون تکرار باشند */
async function validateMemberships(
  memberships: unknown,
): Promise<{ ok: true; value: { companyId: string; role: Role }[] } | { ok: false; error: string }> {
  if (!Array.isArray(memberships) || memberships.length === 0) {
    return { ok: false, error: 'حداقل یک عضویت شرکتی الزامی است' }
  }
  const seen = new Set<string>()
  const out: { companyId: string; role: Role }[] = []
  for (const m of memberships) {
    const item = m as MembershipInput
    const companyId = typeof item?.companyId === 'string' ? item.companyId : ''
    const role = typeof item?.role === 'string' ? item.role : ''
    if (!companyId) return { ok: false, error: 'شرکت عضویت نامعتبر است' }
    if (!ROLES.includes(role as Role)) return { ok: false, error: 'نقش عضویت نامعتبر است' }
    if (seen.has(companyId)) return { ok: false, error: 'هر شرکت فقط یک بار قابل انتخاب است' }
    seen.add(companyId)
    out.push({ companyId, role: role as Role })
  }
  const companies = await db.company.findMany({ where: { id: { in: [...seen] } }, select: { id: true } })
  if (companies.length !== seen.size) return { ok: false, error: 'شرکتی از عضویت‌ها یافت نشد' }
  return { ok: true, value: out }
}

// ---------- P1-T4: فهرست شرکت‌ها برای ماتریس عضویت (مدیران) ----------

export async function listCompaniesForAdmin(ctx: SessionContext): Promise<ServiceResult<{ companies: unknown[] }>> {
  const err = await requireUserAdmin(ctx)
  if (err) return fail(err, 403)
  const companies = await db.company.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, code: true, name: true, type: true, sortOrder: true },
  })
  return { ok: true, data: { companies } }
}

// ---------- P1-T4: ایجاد کاربر ----------

export async function createUser(
  ctx: SessionContext,
  b: {
    username: unknown
    fullName: unknown
    jobTitle?: unknown
    isAdmin?: unknown
    password: unknown
    memberships: unknown
  },
): Promise<ServiceResult<{ id: string }>> {
  const err = await requireUserAdmin(ctx)
  if (err) return fail(err, 403)

  const uname = validateUsername(b.username)
  if (!uname.ok) return fail(uname.error)

  if (typeof b.fullName !== 'string' || b.fullName.trim().length < 3 || b.fullName.trim().length > 100) {
    return fail('نام کامل باید ۳ تا ۱۰۰ نویسه باشد')
  }
  const jobTitle =
    typeof b.jobTitle === 'string' && b.jobTitle.trim() ? b.jobTitle.trim().slice(0, 100) : null

  // تغییر «مدیر پلتفرم» فقط توسط مدیر پلتفرم
  const makeAdmin = b.isAdmin === true
  if (makeAdmin && !ctx.isAdmin) return fail('تفاوت سطح دسترسی مدیر پلتفرم فقط توسط مدیر پلتفرم تعیین می‌شود', 403)

  const pwError = validatePasswordPolicy(b.password, uname.value)
  if (pwError) return fail(pwError)

  const mem = await validateMemberships(b.memberships)
  if (!mem.ok) return fail(mem.error)

  const exists = await db.user.findUnique({ where: { username: uname.value }, select: { id: true } })
  if (exists) return fail('این نام کاربری قبلاً ثبت شده است')

  // P0.5-T3: scrypt async — هش گذرواژه پیش از create (غیرمسدودکننده event-loop)
  const passwordHash = await hashPassword(String(b.password))
  const user = await db.user.create({
    data: {
      username: uname.value,
      fullName: b.fullName.trim(),
      jobTitle,
      isAdmin: makeAdmin,
      passwordHash,
      memberships: { create: mem.value },
    },
  })
  await audit({
    ctx,
    action: 'USER_CREATE',
    entity: 'user',
    entityId: user.id,
    details: {
      username: user.username,
      fullName: user.fullName,
      isAdmin: user.isAdmin,
      memberships: mem.value,
    },
  })
  return { ok: true, data: { id: user.id } }
}

// ---------- P1-T4: ویرایش کاربر (نام/عنوان/نقش‌ها/غیرفعال) ----------

export async function updateUser(
  ctx: SessionContext,
  userId: string,
  b: {
    fullName?: unknown
    jobTitle?: unknown
    isAdmin?: unknown
    isActive?: unknown
    memberships?: unknown
  },
): Promise<ServiceResult<null>> {
  const err = await requireUserAdmin(ctx)
  if (err) return fail(err, 403)

  const user = await db.user.findUnique({ where: { id: userId }, include: { memberships: true } })
  if (!user) return fail('کاربر یافت نشد', 404)

  // مدیر شرکت فقط کاربران دامنه دید خود را ویرایش می‌کند
  if (!ctx.isAdmin) {
    const myScope = await scopeCompanyIds(ctx)
    const inScope = user.memberships.some((m) => myScope.includes(m.companyId))
    if (!inScope) return fail('این کاربر خارج از دامنه دسترسی شماست', 403)
  }

  const data: { fullName?: string; jobTitle?: string | null; isAdmin?: boolean; isActive?: boolean } = {}

  if (b.fullName !== undefined) {
    if (typeof b.fullName !== 'string' || b.fullName.trim().length < 3 || b.fullName.trim().length > 100) {
      return fail('نام کامل باید ۳ تا ۱۰۰ نویسه باشد')
    }
    data.fullName = b.fullName.trim()
  }
  if (b.jobTitle !== undefined) {
    data.jobTitle = typeof b.jobTitle === 'string' && b.jobTitle.trim() ? b.jobTitle.trim().slice(0, 100) : null
  }
  if (b.isAdmin !== undefined) {
    // تفاوت سطح مدیر پلتفرم فقط توسط مدیر پلتفرم
    if (!ctx.isAdmin) return fail('تغییر سطح «مدیر پلتفرم» فقط توسط مدیر پلتفرم ممکن است', 403)
    // محافظ خودکار: مدیر پلتفرم نمی‌تواند سطح خود را بردارد (قفل‌شدن سامانه)
    if (user.id === ctx.userId && b.isAdmin !== true) {
      return fail('نمی‌توانید سطح «مدیر پلتفرم» خود را بردارید', 400)
    }
    data.isAdmin = b.isAdmin === true
  }
  if (b.isActive !== undefined) {
    const nextActive = b.isActive === true
    // محافظ خودکار: غیرفعال‌سازی خود ممنوع
    if (!nextActive && user.id === ctx.userId) return fail('غیرفعال‌سازی حساب خودتان مجاز نیست', 400)
    data.isActive = nextActive
  }

  let membershipsNext: { companyId: string; role: Role }[] | null = null
  if (b.memberships !== undefined) {
    const mem = await validateMemberships(b.memberships)
    if (!mem.ok) return fail(mem.error)
    membershipsNext = mem.value
  }

  await db.$transaction(async (tx) => {
    if (Object.keys(data).length) {
      await tx.user.update({ where: { id: userId }, data })
    }
    if (membershipsNext) {
      await tx.membership.deleteMany({ where: { userId } })
      await tx.membership.createMany({ data: membershipsNext.map((m) => ({ userId, ...m })) })
    }
  })

  // غیرفعال‌سازی → ابطال فوری همه نشست‌های او
  if (data.isActive === false) {
    await db.session.deleteMany({ where: { userId } })
  }

  await audit({
    ctx,
    action: 'USER_UPDATE',
    entity: 'user',
    entityId: userId,
    details: {
      username: user.username,
      changes: data,
      memberships: membershipsNext,
    },
  })
  return { ok: true, data: null }
}

// ---------- P1-T7: بازنشانی گذرواژه توسط مدیر ----------

export async function resetUserPassword(
  ctx: SessionContext,
  userId: string,
  newPassword: unknown,
): Promise<ServiceResult<null>> {
  const err = await requireUserAdmin(ctx)
  if (err) return fail(err, 403)

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return fail('کاربر یافت نشد', 404)

  const pwError = validatePasswordPolicy(newPassword, user.username)
  if (pwError) return fail(pwError)

  // P0.5-T3: scrypt async — هش گذرواژه پیش از update
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(String(newPassword)) } })
  // همه نشست‌های کاربر ابطال می‌شود — ورود دوباره با گذرواژه جدید الزامی است
  await db.session.deleteMany({ where: { userId } })
  await audit({
    ctx,
    action: 'PASSWORD_RESET_ADMIN',
    entity: 'user',
    entityId: userId,
    details: { username: user.username, revokedSessions: true },
  })
  return { ok: true, data: null }
}

// ---------- P1-T6: پروفایل کاربر (نام و عنوان شغلی — توسط خود کاربر) ----------

export async function updateMyProfile(
  ctx: SessionContext,
  b: { fullName?: unknown; jobTitle?: unknown },
): Promise<ServiceResult<null>> {
  const data: { fullName?: string; jobTitle?: string | null } = {}
  if (b.fullName !== undefined) {
    if (typeof b.fullName !== 'string' || b.fullName.trim().length < 3 || b.fullName.trim().length > 100) {
      return fail('نام کامل باید ۳ تا ۱۰۰ نویسه باشد')
    }
    data.fullName = b.fullName.trim()
  }
  if (b.jobTitle !== undefined) {
    data.jobTitle = typeof b.jobTitle === 'string' && b.jobTitle.trim() ? b.jobTitle.trim().slice(0, 100) : null
  }
  if (!Object.keys(data).length) return fail('تغییری ارسال نشده است')

  await db.user.update({ where: { id: ctx.userId }, data })
  await audit({ ctx, action: 'PROFILE_UPDATE', entity: 'user', entityId: ctx.userId, details: data })
  return { ok: true, data: null }
}
