import 'server-only'
import { db } from '@/core/shared/db'
import type { SessionContext } from '@/core/auth/auth'
import { scopeCompanyIds, roleInCompany, requireSettingsAdmin } from '@/core/tenancy/tenancy'
import { audit } from '@/core/audit/audit'
import { listFeatureFlags, setFeatureEnabled } from '@/core/featureflags/featureflags'
import { invalidateModuleAccess } from '@/core/tenancy/module-access'
import { getCompanySettings, setCompanySetting } from '@/core/tenancy/company-settings'
import { listConnectors } from '@/core/integration/integration'
import { listReportDefinitions } from '@/core/reporting/reporting'
import { listScheduledJobs, runJobOnce } from '@/core/scheduler/scheduler'
import { listRecentInvocations } from '@/core/ai/gateway'
import { verifyPassword } from '@/core/auth/auth'
import { LOGIN_RATE_LIMIT_DESC } from '@/core/auth/login-rate-limit'
import { listEnvelope, listSkip, type ParsedListQuery } from '@/core/shared/list-query'
import { parseJalaliInput, formatJalali } from '@/core/shared/jalali'
import { actionLabelFa } from '@/core/shared/audit-labels'
import { validateLetterNumberingValue } from '@/core/shared/numbering'
import type { ServiceResult } from '@/core/shared/types'

/**
 * ماژول پلتفرم — رجیستری پلاگین‌ها (تاکسونومی سه‌لایه ADR-008)، حاکمیت بستر و حسابرسی
 * این ماژول «خودِ پلتفرم» است (ADR-001: جایگزین Module Federation).
 */
const fail = (error: string, status?: number) => ({ ok: false, error, status }) as ServiceResult<never>

async function requireAdmin(ctx: SessionContext): Promise<string | null> {
  if (ctx.isAdmin) return null
  const role = await roleInCompany(ctx.userId, ctx.companyId)
  return role === 'ADMIN' ? null : 'فقط مدیر سامانه می‌تواند این تغییر را انجام دهد'
}

// ---------- رجیستری پلاگین‌ها (سه‌لایه: FOUNDATION | OPERATIONS | INTELLIGENCE) ----------
export async function listModules(ctx: SessionContext): Promise<ServiceResult<{ modules: unknown[] }>> {
  const modules = await db.platformModule.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      menus: { orderBy: { sortOrder: 'asc' } },
      activations: ctx.companyId ? { where: { companyId: ctx.companyId } } : false,
    },
  })
  return {
    ok: true,
    data: {
      modules: modules.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        description: m.description,
        icon: m.icon,
        layer: m.layer,
        domain: m.domain,
        targetPhase: m.targetPhase,
        dependsOn: m.dependsOn,
        version: m.version,
        status: m.status,
        sortOrder: m.sortOrder,
        menus: m.menus.map((mi) => ({ viewKey: mi.viewKey, label: mi.label, icon: mi.icon })),
        companyEnabled: ctx.companyId ? m.activations[0]?.enabled ?? false : null,
      })),
    },
  }
}

export async function toggleModule(
  ctx: SessionContext,
  b: { moduleId: string; scope: string; enabled: boolean },
): Promise<ServiceResult<{ ok: true }>> {
  const { moduleId, scope, enabled } = b
  // مجوز: مدیر پلتفرم یا ADMIN شرکت
  if (!ctx.isAdmin) {
    const role = await roleInCompany(ctx.userId, ctx.companyId)
    if (role !== 'ADMIN') return fail('فقط مدیر سامانه می‌تواند پلاگین‌ها را فعال/غیرفعال کند', 403)
  }
  const mod = await db.platformModule.findUnique({ where: { id: moduleId } })
  if (!mod) return fail('ماژول یافت نشد', 404)
  if (mod.layer === 'FOUNDATION' && mod.code !== 'modules' && mod.code !== 'settings' && scope === 'global' && !enabled) {
    // محافظت: زیرساخت پایه (داشبورد/مستر دیتا) سراسرا غیرفعال نمی‌شود
    if (['dashboard', 'products', 'partners'].includes(mod.code)) {
      return fail('پلاگین‌های بستر (داشبورد و مستر دیتا) قابل غیرفعال‌سازی سراسری نیستند', 400)
    }
  }
  if (!ctx.companyId) return fail('شرکت فعال انتخاب نشده است')

  if (scope === 'company') {
    // فعال‌سازی به تفکیک شرکت
    await db.moduleActivation.upsert({
      where: { moduleId_companyId: { moduleId, companyId: ctx.companyId } },
      create: { moduleId, companyId: ctx.companyId, enabled: !!enabled },
      update: { enabled: !!enabled },
    })
  } else {
    // وضعیت سراسری (فقط مدیر پلتفرم)
    if (!ctx.isAdmin) return fail('تغییر سراسری فقط توسط مدیر سامانه', 403)
    await db.platformModule.update({ where: { id: moduleId }, data: { status: enabled ? 'ACTIVE' : 'INACTIVE' } })
  }
  // P1-T28 — کش گارد API ماژول بلافاصله بی‌اعتبار شود (سنجه SC-008: ≤ ۲s)
  invalidateModuleAccess()
  await audit({
    ctx, action: 'MODULE_TOGGLE', entity: 'platformModule', entityId: moduleId,
    details: { scope, enabled, companyCode: ctx.companyId },
  })
  return { ok: true, data: { ok: true } }
}

// ---------- حاکمیت بستر (ADR-009): فلگ‌ها، کانکتورها، گزارش‌ها، زمان‌بند، مصرف AI ----------

export async function listPlatformGovernance(ctx: SessionContext): Promise<ServiceResult<Record<string, unknown>>> {
  // P1-T14 — حاکمیت بستر (پرچم‌ها/کانکتورها/زمان‌بند/مصرف AI) فقط برای مدیران
  const denied = await requireSettingsAdmin(ctx)
  if (denied) return fail(denied, 403)
  const [flags, connectors, reports, jobs, aiInvocations] = await Promise.all([
    listFeatureFlags(),
    listConnectors(),
    listReportDefinitions(),
    listScheduledJobs(),
    listRecentInvocations(30),
  ])
  return {
    ok: true,
    data: {
      flags: flags.map((f) => ({ key: f.key, description: f.description, enabled: f.enabled, updatedAt: f.updatedAt })),
      connectors: connectors.map((c) => ({
        code: c.code, name: c.name, kind: c.kind, status: c.status, direction: c.direction, endpoint: c.endpoint, note: c.note,
      })),
      reports: reports.map((r) => ({
        code: r.code, name: r.name, moduleCode: r.moduleCode, category: r.category, engine: r.engine, targetPhase: r.targetPhase,
      })),
      jobs: jobs.map((j) => ({
        key: j.key, name: j.name, intervalSec: j.intervalSec, enabled: j.enabled,
        lastRunAt: j.lastRunAt, lastStatus: j.lastStatus, lastError: j.lastError, note: j.note,
      })),
      aiInvocations: aiInvocations.map((i) => ({
        task: i.task, provider: i.provider, ok: i.ok, error: i.error, latencyMs: i.latencyMs, createdAt: i.createdAt,
      })),
    },
  }
}

export async function toggleFeatureFlag(
  ctx: SessionContext,
  b: { key: string; enabled: boolean },
): Promise<ServiceResult<{ ok: true }>> {
  const denied = await requireAdmin(ctx)
  if (denied) return fail(denied, 403)
  try {
    await setFeatureEnabled(b.key, !!b.enabled)
  } catch {
    return fail('پرچم ویژگی یافت نشد', 404)
  }
  await audit({ ctx, action: 'FLAG_TOGGLE', entity: 'featureFlag', entityId: b.key, details: { enabled: !!b.enabled } })
  return { ok: true, data: { ok: true } }
}

// ---------- اجرای دستی کار زمان‌بند (P2-T11 — حاکمیت + تست) ----------
// همان قرارداد حلقه دوره‌ای: runner اجرا و lastRunAt/lastStatus/note به‌روز می‌شود.
// کاربردها: تست تاریخ‌ساختگی یادآور مهلت، اجرای فوری توسط ادمین بدون انتظار برای دور بعدی.
export async function runScheduledJob(ctx: SessionContext, b: { key: string }): Promise<ServiceResult<{ note: string }>> {
  const denied = await requireAdmin(ctx)
  if (denied) return fail(denied, 403)
  const key = typeof b?.key === 'string' ? b.key.trim() : ''
  if (!key) return fail('کلید کار زمان‌بندی الزامی است')
  const res = await runJobOnce(key)
  if (!res.ok) return fail(res.error, res.status)
  await audit({ ctx, action: 'JOB_RUN', entity: 'scheduledJob', entityId: key, details: { note: res.note } })
  return { ok: true, data: { note: res.note } }
}

// ---------- کاربران دامنه دید ----------
// P1-T14 — دو سطح پاسخ: مدیر (isAdmin/ADMIN شرکت فعال) → پروفایل کامل با ماتریس عضویت؛
// سایر نقش‌ها → «دایرکتوری حداقلی» (id/fullName/jobTitle فقط کاربران فعال) برای انتخاب گیرنده ارجاع.
// نام کاربری، وضعیت فعال و ماتریس عضویت داده حساس مدیریتی است و به دایرکتوری نمی‌رود.
export async function listUsers(ctx: SessionContext): Promise<ServiceResult<{ users: unknown[] }>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const denied = await requireSettingsAdmin(ctx)

  const memberships = await db.membership.findMany({
    where: { companyId: { in: scopeIds } },
    include: {
      user: { select: { id: true, fullName: true, jobTitle: true, username: true, isAdmin: true, isActive: true } },
      company: { select: { id: true, name: true, code: true } },
    },
    orderBy: { userId: 'asc' },
  })

  // یکتاسازی کاربران
  const seen = new Set<string>()
  const users: Record<string, unknown>[] = []
  for (const m of memberships) {
    if (seen.has(m.user.id)) continue
    seen.add(m.user.id)
    if (denied) {
      if (m.user.isActive) users.push({ id: m.user.id, fullName: m.user.fullName, jobTitle: m.user.jobTitle })
      continue
    }
    users.push({
      id: m.user.id,
      fullName: m.user.fullName,
      jobTitle: m.user.jobTitle,
      username: m.user.username,
      isAdmin: m.user.isAdmin,
      isActive: m.user.isActive,
      companies: memberships
        .filter((x) => x.userId === m.user.id)
        .map((x) => ({ code: x.company.code, name: x.company.name, role: x.role })),
    })
  }
  return { ok: true, data: { users } }
}

// ---------- حسابرسی + جریان Outbox (P1-T14 گارد + P1-T15 فیلتر غنی و CSV) ----------

/** پرس‌شرط مشترک حسابرسی — فیلترها: اقدام/موجودیت/شرکت/بازه جلالی + جستجوی متنی */
async function auditWhere(
  ctx: SessionContext,
  lq: ParsedListQuery,
): Promise<ServiceResult<{ where: Record<string, unknown> }>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const f = lq.filters

  // فیلتر شرکت — باید در دامنه دید باشد (دستکاری URL نمی‌تواند از ایزولاسیون بگذرد)
  let companyId: string | undefined
  if (f.companyId) {
    if (!scopeIds.includes(f.companyId)) return { ok: false, error: 'شرکت انتخابی در دامنه دید شما نیست', status: 400 }
    companyId = f.companyId
  }

  // بازه جلالی — از/تا (نمونه: ۱۴۰۵/۰۶/۰۵)؛ نامعتبر = خطای فارسی، نه بی‌صدا نادیده
  let createdAt: { gte?: Date; lt?: Date } | undefined
  const from = f.from ? parseJalaliInput(f.from) : null
  const to = f.to ? parseJalaliInput(f.to) : null
  if (f.from && !from) return { ok: false, error: 'تاریخ «از» نامعتبر است (نمونه درست: ۱۴۰۵/۰۶/۰۵)', status: 400 }
  if (f.to && !to) return { ok: false, error: 'تاریخ «تا» نامعتبر است (نمونه درست: ۱۴۰۵/۰۶/۰۵)', status: 400 }
  if (from && to && from > to) return { ok: false, error: 'تاریخ «از» باید قبل از «تا» باشد', status: 400 }
  if (from || to) {
    createdAt = {}
    if (from) createdAt.gte = from
    if (to) createdAt.lt = new Date(to.getTime() + 24 * 3600 * 1000) // پایان روز «تا»
  }

  const where = {
    companyId: companyId ?? { in: scopeIds },
    ...(f.action ? { action: f.action } : {}),
    ...(f.entity ? { entity: f.entity } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(lq.q ? {
      OR: [
        { action: { contains: lq.q } },
        { entity: { contains: lq.q } },
        // بررسی عمیق فرم‌ها — جستجو باید ستون‌های نمای grid را هم پوشش دهد: username کاربر و جزئیات JSON
        { details: { contains: lq.q } },
        { user: { fullName: { contains: lq.q } } },
        { user: { username: { contains: lq.q } } },
        { company: { name: { contains: lq.q } } },
      ],
    } : {}),
  }
  return { ok: true, data: { where } }
}

export async function listAudit(ctx: SessionContext, lq: ParsedListQuery): Promise<ServiceResult<Record<string, unknown>>> {
  // P1-T14 — سجل حسابرسی و رویدادهای Outbox فقط برای مدیران (isAdmin یا ADMIN شرکت فعال)
  const denied = await requireSettingsAdmin(ctx)
  if (denied) return fail(denied, 403)

  const w = await auditWhere(ctx, lq)
  if (!w.ok) return fail(w.error, w.status)
  const where = w.data.where

  const [logs, total, events] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { [lq.sortField ?? 'createdAt']: lq.sortDir },
      skip: listSkip(lq.page, lq.pageSize),
      take: lq.pageSize,
      include: {
        user: { select: { fullName: true } },
        company: { select: { name: true } },
      },
    }),
    db.auditLog.count({ where }),
    db.outboxEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 40 }),
  ])

  return {
    ok: true,
    data: {
      logs: listEnvelope(logs.map((a) => ({
        id: a.id,
        action: a.action,
        entity: a.entity,
        entityId: a.entityId,
        details: a.details,
        userName: a.user?.fullName ?? '—',
        companyName: a.company?.name ?? '—',
        createdAt: a.createdAt,
      })), total, lq.page, lq.pageSize),
      events: events.map((e) => ({ id: e.id, type: e.type, payload: e.payload, createdAt: e.createdAt, processedAt: e.processedAt })),
    },
  }
}

// ---------- خروجی CSV حسابرسی (P1-T15 — اکسل فارسی) ----------
// سقف ۵۰۰۰ سطر برای جلوگیری از فشار حافظه؛ همیشه همان فیلترهای فعال تب حسابرسی
const CSV_ROW_CAP = 5000

function csvCell(v: string | null | undefined): string {
  const s = v ?? ''
  // نقل‌قول فقط وقتی لازم است: کاما/نقل‌قول/خط جدید؛ درون نقل‌قول، " دوباره می‌شود
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function exportAuditCsv(
  ctx: SessionContext,
  lq: ParsedListQuery,
): Promise<ServiceResult<{ csv: string; filename: string; rows: number; capped: boolean }>> {
  const denied = await requireSettingsAdmin(ctx)
  if (denied) return fail(denied, 403)

  const w = await auditWhere(ctx, lq)
  if (!w.ok) return fail(w.error, w.status)

  const logs = await db.auditLog.findMany({
    where: w.data.where,
    orderBy: { [lq.sortField ?? 'createdAt']: lq.sortDir },
    take: CSV_ROW_CAP + 1,
    include: {
      user: { select: { fullName: true } },
      company: { select: { name: true } },
    },
  })
  const capped = logs.length > CSV_ROW_CAP
  const rows = capped ? logs.slice(0, CSV_ROW_CAP) : logs

  const header = ['زمان', 'کاربر', 'شرکت', 'اقدام', 'موجودیت', 'شناسه', 'جزئیات']
  const lines = [
    header.map(csvCell).join(','),
    ...rows.map((a) => [
      formatJalali(a.createdAt, true),
      a.user?.fullName ?? '—',
      a.company?.name ?? '—',
      actionLabelFa(a.action, true),
      a.entity,
      a.entityId ?? '',
      a.details ?? '',
    ].map(csvCell).join(',')),
  ]

  // BOM — بدون آن اکسل فارسی CSV را با کدپیج ویندوز (مربع‌مربع) باز می‌کند
  const csv = `\uFEFF${lines.join('\r\n')}`
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  return { ok: true, data: { csv, filename: `audit-${stamp}.csv`, rows: rows.length, capped } }
}

// ---------- نمای امنیت (P0-T22): گذرواژه‌های نمایشی + تلاش‌های ورود ناموفق ----------

// فهرست گذرواژه‌های نمایشی شناخته‌شده seed — پیش از استقرار واقعی همه باید تغییر کنند
const DEMO_PASSWORDS = ['admin123', '12345678', '123456', 'password']

export async function getSecurityOverview(ctx: SessionContext): Promise<ServiceResult<Record<string, unknown>>> {
  const denied = await requireAdmin(ctx)
  if (denied) return fail(denied, 403)

  const scopeIds = await scopeCompanyIds(ctx)
  const [memberships, failedLogs, sessionCount] = await Promise.all([
    db.membership.findMany({
      where: { companyId: { in: scopeIds } },
      include: { user: { select: { id: true, username: true, fullName: true, jobTitle: true, isActive: true, passwordHash: true } } },
    }),
    db.auditLog.findMany({
      where: { action: 'LOGIN_FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    db.session.count({ where: { expiresAt: { gt: new Date() } } }),
  ])

  // یکتاسازی کاربران دامنه + آشکارسازی گذرواژه نمایشی (تطبیق واقعی هش، نه حدس)
  const seen = new Set<string>()
  const weakUsers: { username: string; fullName: string; jobTitle: string | null; demoPassword: string }[] = []
  let activeUserCount = 0
  for (const m of memberships) {
    if (seen.has(m.user.id)) continue
    seen.add(m.user.id)
    if (m.user.isActive) activeUserCount += 1
    // P0.5-T3: scrypt async — این حلقه (کاربران × گذرواژه‌های نمایشی) قبلاً با
    // scryptSync تا صدها ms event-loop را قفل می‌کرد؛ اکنون در threadpool اجرا می‌شود.
    for (const pw of DEMO_PASSWORDS) {
      if (await verifyPassword(pw, m.user.passwordHash)) {
        weakUsers.push({ username: m.user.username, fullName: m.user.fullName, jobTitle: m.user.jobTitle, demoPassword: pw })
        break
      }
    }
  }

  const dayMs = 24 * 3600 * 1000
  const now = Date.now()
  const failed24h = failedLogs.filter((l) => now - l.createdAt.getTime() < dayMs).length

  return {
    ok: true,
    data: {
      weakUsers,
      activeUserCount,
      sessionCount,
      rateLimitDesc: LOGIN_RATE_LIMIT_DESC,
      failed24h,
      failedLogins: failedLogs.map((l) => {
        let details: { username?: string; ip?: string; reason?: string } = {}
        try { details = JSON.parse(l.details ?? '{}') } catch { /* جزئیات قدیمی/نامعتبر */ }
        return {
          id: l.id,
          username: details.username ?? '—',
          ip: details.ip ?? '—',
          reason: details.reason ?? '—',
          createdAt: l.createdAt,
        }
      }),
    },
  }
}

// ---------- اعلان‌ها (انتقال از route — قانون route نازک) ----------

// اعلان‌های ۳۰ مورد اخیر کاربر + شمار نخوانده (پوشش polling در کنار push بلادرنگ)
// قرارداد پاسخ = NotificationItem در types/platform (kind + targetView برای ناوبری)
// ---------- تنظیمات شرکت فعال (P1-T29/T30 — دید درخواست کالا + سقف اعلان مدیران) ----------

/** کلیدهای مجاز و اعتبارسنج — خروجی null = معتبر؛ رشته = پیام خطای فارسی */
const COMPANY_SETTING_VALIDATORS: Record<string, (v: string) => string | null> = {
  'requests.visibility': (v) => (v === 'ALL' || v === 'SELF_MANAGERS' ? null : 'مقدار دید درخواست باید ALL یا SELF_MANAGERS باشد'),
  'requests.notifyCeilingM2': (v) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? null : 'سقف اعلان باید عددی بین ۰ تا ۱۰٬۰۰۰٬۰۰۰ باشد'
  },
  // P2.5-U7 / P2-T7 — سربرگ چاپ نامه (متن اختیاری؛ خالی = پیش‌فرض بدون سطر اضافی)
  'letterhead.subtitle': (v) => (v.length <= 120 ? null : 'سطر سربرگ حداکثر ۱۲۰ نویسه است'),
  'letterhead.footer': (v) => (v.length <= 200 ? null : 'پاورقی چاپ حداکثر ۲۰۰ نویسه است'),
  // P2-T8 (R9) — شماره‌گذاری نامه per-type (JSON؛ خالی = پیش‌فرض سری مشترک)
  'letters.numbering': validateLetterNumberingValue,
}

export async function listCompanySettings(ctx: SessionContext): Promise<ServiceResult<Record<string, unknown>>> {
  const denied = await requireSettingsAdmin(ctx)
  if (denied) return fail(denied, 403)
  const raw = await getCompanySettings(ctx.companyId)
  const company = ctx.companyId
    ? await db.company.findUnique({ where: { id: ctx.companyId }, select: { name: true } })
    : null
  return {
    ok: true,
    data: {
      settings: {
        'requests.visibility': raw['requests.visibility'] ?? 'ALL',
        'requests.notifyCeilingM2': raw['requests.notifyCeilingM2'] ?? '0',
        'letterhead.subtitle': raw['letterhead.subtitle'] ?? '',
        'letterhead.footer': raw['letterhead.footer'] ?? '',
        'letters.numbering': raw['letters.numbering'] ?? '',
      },
      companyName: company?.name ?? null,
    },
  }
}

export async function changeCompanySetting(
  ctx: SessionContext,
  b: { key?: string; value?: string },
): Promise<ServiceResult<{ ok: true }>> {
  const denied = await requireSettingsAdmin(ctx)
  if (denied) return fail(denied, 403)
  if (!ctx.companyId) return fail('شرکت فعال انتخاب نشده است')
  const { key, value } = b
  if (!key || !(key in COMPANY_SETTING_VALIDATORS)) return fail('کلید تنظیم ناشناخته است')
  const invalid = COMPANY_SETTING_VALIDATORS[key]!(String(value ?? ''))
  if (invalid) return fail(invalid)
  await setCompanySetting(ctx.companyId, key, String(value))
  await audit({
    ctx,
    action: 'COMPANY_SETTING',
    entity: 'companySetting',
    entityId: `${ctx.companyId}:${key}`,
    details: { key, value: String(value) },
  })
  return { ok: true, data: { ok: true } }
}

// ---------- اعلان‌ها (انتقال از route — قانون route نازک) ----------

// اعلان‌های ۳۰ مورد اخیر کاربر + شمار نخوانده (پوشش polling در کنار push بلادرنگ)
// قرارداد پاسخ = NotificationItem در types/platform (kind + targetView برای ناوبری)
export async function listNotifications(ctx: SessionContext): Promise<ServiceResult<{ notifications: unknown[]; unreadCount: number }>> {
  const items = await db.notification.findMany({
    where: { userId: ctx.userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  // شمار دقیق نخوانده از DB — نه از فهرست ۳۰تایی (باگ G5: با انبوه اعلان، سقف take:30
  // نشان زنگ را قفل می‌کرد و اعلان جدید هرگز دیده نمی‌شد — مدیر با ۳۰+ نخوانده کور می‌شد)
  const unreadCount = await db.notification.count({ where: { userId: ctx.userId, isRead: false } })
  return {
    ok: true,
    data: {
      notifications: items,
      unreadCount,
    },
  }
}

// علامت‌گذاری خوانده‌شده: یکی با id یا همه با all
export async function markNotificationsRead(ctx: SessionContext, body: { id?: string; all?: boolean }): Promise<ServiceResult<null>> {
  if (body.all) {
    await db.notification.updateMany({ where: { userId: ctx.userId, isRead: false }, data: { isRead: true } })
  } else if (body.id) {
    await db.notification.updateMany({ where: { id: body.id, userId: ctx.userId }, data: { isRead: true } })
  }
  return { ok: true, data: null }
}
