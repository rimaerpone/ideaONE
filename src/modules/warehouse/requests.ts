import 'server-only'
import { db } from '@/core/shared/db'
import type { SessionContext } from '@/core/auth/auth'
import { nextDocNumber } from '@/core/shared/server-helpers'
import { scopeCompanyIds, roleInCompany, requireWriteRole } from '@/core/tenancy/tenancy'
import { getRequestsVisibility, getRequestsCeilingM2 } from '@/core/tenancy/company-settings'
import { emitEvent } from '@/core/events/outbox'
import { notify } from '@/core/notifications/notify'
import { audit } from '@/core/audit/audit'
import { parseNumericInput } from '@/core/shared/normalize'
import { listEnvelope, listSkip, type ParsedListQuery } from '@/core/shared/list-query'
import type { ListEnvelope } from '@/types/platform'
import type { ServiceResult } from '@/core/shared/types'

/**
 * گردشکار درخواست کالا — زیرسرویس ماژول انبار (warehouse)
 * سناریو: docs/scenarios/SC-003-goods-request.md
 * طبق سند منبع (۷.۷): درخواست کالا جزئ از دامنه انبار است (درخواست → بررسی موجودی → حواله → خروج)
 */
const fail = (error: string, status?: number) => ({ ok: false, error, status }) as ServiceResult<never>

/**
 * P1-T29 — قید دید درخواست کالا برای کاربر فعلی.
 * حالت SELF_MANAGERS: کارشناس/بازدیدکننده فقط درخواست‌های خودش؛ مدیران همه.
 * خروجی true = کاربر محدود به درخواست‌های خودش است.
 */
async function restrictedToOwnRequests(ctx: SessionContext): Promise<boolean> {
  if (ctx.isAdmin) return false
  const visibility = await getRequestsVisibility(ctx.companyId)
  if (visibility === 'ALL') return false
  const role = await roleInCompany(ctx.userId, ctx.companyId)
  return !(role === 'ADMIN' || role === 'MANAGER')
}

// P1-T3/T12 — قرارداد فهرست استاندارد (q شماره درخواست فارسی‌پذیر / فیلتر وضعیت / مرتب‌سازی / صفحه‌بندی)
export async function listRequests(ctx: SessionContext, lq: ParsedListQuery): Promise<ServiceResult<ListEnvelope<unknown>>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const ownOnly = await restrictedToOwnRequests(ctx)
  const qNumber = lq.q ? parseNumericInput(lq.q) : null
  const where = {
    companyId: { in: scopeIds },
    // P1-T29 — دید محدود: فقط درخواست‌های خودِ کاربر (تنظیم per-company)
    ...(ownOnly ? { requesterId: ctx.userId } : {}),
    ...(lq.filters.status ? { status: lq.filters.status } : {}),
    ...(lq.filters.warehouseId ? { warehouseId: lq.filters.warehouseId } : {}),
    ...(lq.q ? {
      OR: [
        { note: { contains: lq.q } },
        { neededFor: { contains: lq.q } },
        { requester: { fullName: { contains: lq.q } } },
        ...(qNumber !== null ? [{ reqNumber: qNumber }] : []),
      ],
    } : {}),
  }
  const orderBy = { [lq.sortField ?? 'createdAt']: lq.sortDir }
  const [reqs, total] = await Promise.all([
    db.goodsRequest.findMany({
      where,
      orderBy,
      skip: listSkip(lq.page, lq.pageSize),
      take: lq.pageSize,
      include: {
        requester: { select: { fullName: true, jobTitle: true } },
        warehouse: { select: { name: true } },
        company: { select: { name: true, code: true } },
        items: { include: { product: { select: { code: true, name: true, size: true } } } },
      },
    }),
    db.goodsRequest.count({ where }),
  ])
  return {
    ok: true,
    data: listEnvelope(reqs.map((g) => ({
      id: g.id,
      reqNumber: g.reqNumber,
      status: g.status,
      neededFor: g.neededFor,
      note: g.note,
      createdAt: g.createdAt,
      decidedAt: g.decidedAt,
      requesterName: g.requester.fullName,
      requesterTitle: g.requester.jobTitle,
      warehouseName: g.warehouse.name,
      companyName: g.company.name,
      companyCode: g.company.code,
      items: g.items.map((i) => ({
        id: i.id,
        productCode: i.product.code,
        productName: i.product.name,
        size: i.product.size,
        qtyM2: i.qtyM2,
      })),
    })), total, lq.page, lq.pageSize),
  }
}

export async function createRequest(
  ctx: SessionContext,
  b: Record<string, unknown>,
): Promise<ServiceResult<{ id: string; reqNumber: number }>> {
  // P1-T18 — VIEWER هیچ نوشتنی ندارد (ماتریس 04-security §۳)
  const denied = await requireWriteRole(ctx)
  if (denied) return fail(denied, 403)
  if (!ctx.companyId) return fail('شرکت فعال انتخاب نشده است')
  const company = await db.company.findUnique({ where: { id: ctx.companyId } })
  if (company?.type === 'GROUP') return fail('برای ثبت درخواست، ابتدا به یک شرکت عملیاتی سوئیچ کنید')

  const { warehouseId, neededFor, note, items } = b as { warehouseId: string; neededFor?: string; note?: string; items: unknown[] }
  if (!warehouseId) return fail('انبار الزامی است')
  if (!Array.isArray(items) || items.length === 0) return fail('حداقل یک قلم کالا الزامی است')

  const wh = await db.warehouse.findUnique({ where: { id: warehouseId } })
  if (!wh || wh.companyId !== ctx.companyId) return fail('انبار در شرکت فعال شما یافت نشد')

  // P1-T16 — اعتبارسنجی اقلام + نرمال‌سازی عددی کامل سمت سرور (آینه کلاینت)
  const normalizedItems: { productId: string; qtyM2: number }[] = []
  for (const i of items as Record<string, unknown>[]) {
    const qty = parseNumericInput(String(i.qtyM2 ?? ''))
    if (qty === null || qty <= 0) return fail('مقدار هر قلم باید عددی مثبت باشد')
    normalizedItems.push({ productId: String(i.productId), qtyM2: qty })
  }

  const reqNumber = await nextDocNumber(ctx.companyId, 'GOODSREQ')
  const totalM2 = normalizedItems.reduce((s, i) => s + i.qtyM2, 0)
  const g = await db.goodsRequest.create({
    data: {
      companyId: ctx.companyId,
      reqNumber,
      requesterId: ctx.userId,
      warehouseId,
      neededFor: neededFor || null,
      note: note || null,
      status: 'PENDING',
      items: { create: normalizedItems.map((i) => ({ productId: i.productId, qtyM2: i.qtyM2 })) },
    },
  })
  // P1-T30 — اعلان گزینشی مدیران: با سقف مثبت، فقط درخواست‌های بالای سقف اعلان می‌شوند
  // (درخواست‌های کوچک روتین‌اند و مدیر در فهرست می‌بیند؛ سقف ۰ = اعلان همه)
  const ceiling = await getRequestsCeilingM2(ctx.companyId)
  const notifyManagers = ceiling <= 0 || totalM2 >= ceiling
  if (notifyManagers) {
    const admins = await db.membership.findMany({
      where: { companyId: ctx.companyId, role: { in: ['ADMIN', 'MANAGER'] } },
      select: { userId: true },
    })
    for (const a of admins) {
      await notify({
        userId: a.userId,
        title: 'درخواست کالای جدید',
        body: ceiling > 0
          ? `درخواست شماره ${reqNumber} با ${totalM2.toLocaleString('fa-IR')} مترمربع (بالای سقف اعلان) در انتظار تأیید است`
          : `درخواست شماره ${reqNumber} در انتظار تأیید است`,
        kind: 'REQUEST',
        targetView: 'requests',
      })
    }
  }
  await emitEvent('request.created', { requestId: g.id, reqNumber, companyId: ctx.companyId })
  await audit({ ctx, action: 'CREATE', entity: 'goodsRequest', entityId: g.id, details: { reqNumber, count: normalizedItems.length } })
  return { ok: true, data: { id: g.id, reqNumber } }
}

// P1.5-T8 — جزئیات یک درخواست کالا (صفحه رکورد) با گارد دامنه دید + قید دید P1-T29
export async function getRequest(ctx: SessionContext, id: string): Promise<ServiceResult<{ request: unknown }>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const ownOnly = await restrictedToOwnRequests(ctx)
  const g = await db.goodsRequest.findFirst({
    where: { id, companyId: { in: scopeIds }, ...(ownOnly ? { requesterId: ctx.userId } : {}) },
    include: {
      requester: { select: { fullName: true, jobTitle: true } },
      warehouse: { select: { name: true } },
      company: { select: { name: true, code: true } },
      items: { orderBy: { id: 'asc' }, include: { product: { select: { code: true, name: true, size: true } } } },
    },
  })
  if (!g) return fail('درخواست یافت نشد', 404)
  return {
    ok: true,
    data: {
      request: {
        id: g.id,
        reqNumber: g.reqNumber,
        status: g.status,
        neededFor: g.neededFor,
        note: g.note,
        createdAt: g.createdAt,
        decidedAt: g.decidedAt,
        requesterName: g.requester.fullName,
        requesterTitle: g.requester.jobTitle,
        warehouseName: g.warehouse.name,
        companyName: g.company.name,
        companyCode: g.company.code,
        items: g.items.map((i) => ({
          id: i.id,
          productCode: i.product.code,
          productName: i.product.name,
          size: i.product.size,
          qtyM2: i.qtyM2,
        })),
      },
    },
  }
}

export async function decideRequest(
  ctx: SessionContext,
  b: { id: string; action: string },
): Promise<ServiceResult<{ ok: true }>> {
  const { id, action } = b

  const g = await db.goodsRequest.findUnique({ where: { id }, include: { items: true } })
  if (!g) return fail('درخواست یافت نشد')
  if (g.companyId !== ctx.companyId) return fail('این درخواست متعلق به شرکت فعال شما نیست')

  const role = await roleInCompany(ctx.userId, ctx.companyId)
  const canDecide = role === 'ADMIN' || role === 'MANAGER'
  if (!canDecide) return fail('تصمیم‌گیری روی درخواست فقط توسط مدیران مجاز است', 403)

  if (g.status !== 'PENDING' && action !== 'FULFILLED' && action !== 'FULFILL') return fail('این درخواست قبلاً تعیین تکلیف شده است')

  let status: string
  if (action === 'APPROVE') status = 'APPROVED'
  else if (action === 'REJECT') status = 'REJECTED'
  // هر دو نام پذیرفته‌اند: UI «FULFILL» می‌فرستد؛ «FULFILLED» برای سازگاری قبلی
  else if (action === 'FULFILLED' || action === 'FULFILL') status = 'FULFILLED'
  else return fail('عملیات نامعتبر است')

  await db.goodsRequest.update({ where: { id }, data: { status, decidedAt: new Date() } })
  await notify({
    userId: g.requesterId,
    title: status === 'APPROVED' ? 'درخواست کالای شما تأیید شد' : status === 'REJECTED' ? 'درخواست کالای شما رد شد' : 'درخواست کالای شما تأمین شد',
    body: `شماره درخواست ${g.reqNumber}`,
    kind: 'REQUEST',
    targetView: 'requests',
  })
  await emitEvent(`request.${status.toLowerCase()}`, { requestId: g.id, reqNumber: g.reqNumber })
  // برچسب حسابرسی یکدست: REQUEST_FULFILL در ACTION_FA است (نام «FULFILLED» برچسب ندارد)
  await audit({ ctx, action: status === 'FULFILLED' ? 'REQUEST_FULFILL' : `REQUEST_${action}`, entity: 'goodsRequest', entityId: g.id, details: { reqNumber: g.reqNumber, status } })
  return { ok: true, data: { ok: true } }
}

// ---------- تصمیم گروهی روی درخواست‌ها (P2.5-U2 — شکاف G3) ----------
export type BulkRequestResult = { id: string; number: number | null; ok: boolean; error?: string }

/**
 * تأیید/رد گروهی درخواست‌های کالا. گارد و اثر دقیقاً همان decideRequest تک‌درخواست
 * است — رکورد به رکورد (تصمیم §۳ نقشه راه P2.5): نقش مدیر در شرکت فعال، فقط
 * وضعیت در انتظار، اعلان به متقاضی و سجل حسابرسی برای هر درخواست.
 */
export async function bulkDecideRequests(
  ctx: SessionContext,
  ids: unknown,
  action: string,
): Promise<ServiceResult<{ affected: number; results: BulkRequestResult[] }>> {
  if (action !== 'APPROVE' && action !== 'REJECT') return fail('عملیات گروهی نامعتبر است')
  if (!ctx.companyId) return fail('شرکت فعال انتخاب نشده است')
  // گارد نقش پیشگیرانه (همان decideRequest — یک بار به‌جای N بار): تصمیم فقط مدیران
  const role = await roleInCompany(ctx.userId, ctx.companyId)
  if (!(role === 'ADMIN' || role === 'MANAGER')) return fail('تصمیم‌گیری روی درخواست فقط توسط مدیران مجاز است', 403)
  if (!Array.isArray(ids) || ids.length === 0) return fail('هیچ درخواستی انتخاب نشده است')
  const unique = [...new Set(ids.map((v) => String(v)))]
  if (unique.length > 100) return fail('حداکثر ۱۰۰ درخواست در هر اقدام گروهی مجاز است')

  // شماره‌ها فقط برای برچسب نتیجه — شرکت فعال همین‌جا اعمال می‌شود
  const reqs = await db.goodsRequest.findMany({
    where: { id: { in: unique }, companyId: ctx.companyId },
    select: { id: true, reqNumber: true },
  })
  const numberById = new Map(reqs.map((g) => [g.id, g.reqNumber]))

  const results: BulkRequestResult[] = []
  let affected = 0
  for (const id of unique) {
    const number = numberById.get(id) ?? null
    if (!numberById.has(id)) {
      results.push({ id, number, ok: false, error: 'درخواست یافت نشد (یا متعلق به شرکت فعال نیست)' })
      continue
    }
    const res = await decideRequest(ctx, { id, action })
    if (res.ok) {
      affected += 1
      results.push({ id, number, ok: true })
    } else {
      results.push({ id, number, ok: false, error: res.error })
    }
  }
  return { ok: true, data: { affected, results } }
}
