import 'server-only'
import { db } from '@/core/shared/db'
import type { SessionContext } from '@/core/auth/auth'
import { audit } from '@/core/audit/audit'
import { roleInCompany, scopeCompanyIds } from '@/core/tenancy/tenancy'
import type { ServiceResult } from '@/core/shared/types'

/**
 * P1-T5: CRUD انبارها از UI — کد/نام/kind/غیرفعال
 *
 * قواعد (SPEC warehouse):
 *  - مجوز: مدیر پلتفرم یا ADMIN شرکت (دامنه دید)
 *  - کد یکتا per-company (قید DB @@unique([companyId, code]))
 *  - جلوگیری از غیرفعال‌سازی انبارِ دارای موجودی > 0 (پذیرش T5)
 *  - انبار جدید بلافاصله در فهرست فرم سند ظاهر می‌شود (بدون کش سمت سرور)
 */
const fail = (error: string, status?: number) => ({ ok: false, error, status }) as ServiceResult<never>

const KINDS = ['PHYSICAL', 'VIRTUAL', 'WORKSTATION'] as const // حکم نشست ۱۰ — فیزیکی/مجازی/پای‌کار

async function requireWhAdmin(ctx: SessionContext): Promise<string | null> {
  if (ctx.isAdmin) return null
  const role = await roleInCompany(ctx.userId, ctx.companyId)
  return role === 'ADMIN' ? null : 'فقط مدیر سامانه می‌تواند انبارها را مدیریت کند'
}

/** شرکت مقصد برای انبار جدید: شرکت فعال نشست (یا اجباری در بدنه) باید در دامنه دید باشد */
async function resolveCompany(ctx: SessionContext, companyId?: unknown): Promise<string | ServiceResult<never>> {
  let target: string | null = null
  if (typeof companyId === 'string' && companyId) target = companyId
  else if (ctx.companyId) target = ctx.companyId
  if (!target) return fail('شرکت مقصد مشخص نیست — ابتدا شرکت فعال را انتخاب کنید', 400)
  if (!ctx.isAdmin) {
    const scope = await scopeCompanyIds(ctx)
    if (!scope.includes(target)) return fail('این شرکت خارج از دامنه دسترسی شماست', 403)
  }
  return target
}

// ---------- فهرست کامل برای مدیریت (شامل غیرفعال‌ها + جمع موجودی) ----------

export async function listWarehousesForAdmin(ctx: SessionContext): Promise<ServiceResult<{ warehouses: unknown[] }>> {
  const err = await requireWhAdmin(ctx)
  if (err) return fail(err, 403)
  const scopeIds = await scopeCompanyIds(ctx)
  const warehouses = await db.warehouse.findMany({
    where: { companyId: { in: scopeIds } },
    orderBy: [{ company: { sortOrder: 'asc' } }, { code: 'asc' }],
    include: {
      company: { select: { name: true, code: true } },
      stockItems: { select: { qtyM2: true } },
    },
  })
  return {
    ok: true,
    data: {
      warehouses: warehouses.map((w) => ({
        id: w.id,
        code: w.code,
        name: w.name,
        kind: w.kind,
        isActive: w.isActive,
        companyName: w.company.name,
        companyCode: w.company.code,
        companyId: w.companyId,
        stockM2: w.stockItems.reduce((s, i) => s + i.qtyM2, 0),
        stockCount: w.stockItems.length,
      })),
    },
  }
}

// ---------- ایجاد ----------

export async function createWarehouse(
  ctx: SessionContext,
  b: { companyId?: unknown; code: unknown; name: unknown; kind?: unknown },
): Promise<ServiceResult<{ id: string }>> {
  const err = await requireWhAdmin(ctx)
  if (err) return fail(err, 403)

  const company = await resolveCompany(ctx, b.companyId)
  if (typeof company !== 'string') return company as ServiceResult<never>

  if (typeof b.code !== 'string' || !/^[A-Za-z0-9._-]{1,16}$/.test(b.code.trim())) {
    return fail('کد انبار باید ۱ تا ۱۶ نویسه لاتین/رقم/نقطه/خط تیره باشد')
  }
  if (typeof b.name !== 'string' || b.name.trim().length < 2 || b.name.trim().length > 60) {
    return fail('نام انبار باید ۲ تا ۶۰ نویسه باشد')
  }
  const kind = typeof b.kind === 'string' && b.kind ? b.kind : 'PHYSICAL'
  if (!KINDS.includes(kind as (typeof KINDS)[number])) return fail('نوع انبار نامعتبر است')

  const code = b.code.trim()
  const dup = await db.warehouse.findUnique({ where: { companyId_code: { companyId: company, code } } })
  if (dup) return fail('این کد انبار قبلاً در همین شرکت ثبت شده است')

  const wh = await db.warehouse.create({ data: { companyId: company, code, name: b.name.trim(), kind } })
  await audit({
    ctx,
    action: 'WH_CREATE',
    entity: 'warehouse',
    entityId: wh.id,
    details: { code, name: wh.name, kind, companyId: company },
  })
  return { ok: true, data: { id: wh.id } }
}

// ---------- ویرایش (نام/kind/غیرفعال — کد تغییرناپذیر: کلید بیرونی اسناد) ----------

export async function updateWarehouse(
  ctx: SessionContext,
  id: string,
  b: { name?: unknown; kind?: unknown; isActive?: unknown },
): Promise<ServiceResult<null>> {
  const err = await requireWhAdmin(ctx)
  if (err) return fail(err, 403)

  const wh = await db.warehouse.findUnique({ where: { id }, include: { company: { select: { id: true } } } })
  if (!wh) return fail('انبار یافت نشد', 404)

  if (!ctx.isAdmin) {
    const scope = await scopeCompanyIds(ctx)
    if (!scope.includes(wh.companyId)) return fail('این انبار خارج از دامنه دسترسی شماست', 403)
  }

  const data: { name?: string; kind?: string; isActive?: boolean } = {}
  if (b.name !== undefined) {
    if (typeof b.name !== 'string' || b.name.trim().length < 2 || b.name.trim().length > 60) {
      return fail('نام انبار باید ۲ تا ۶۰ نویسه باشد')
    }
    data.name = b.name.trim()
  }
  if (b.kind !== undefined) {
    if (typeof b.kind !== 'string' || !KINDS.includes(b.kind as (typeof KINDS)[number])) {
      return fail('نوع انبار نامعتبر است')
    }
    data.kind = b.kind
  }
  if (b.isActive !== undefined) {
    const nextActive = b.isActive === true
    if (!nextActive) {
      // محافظ پذیرش T5: انبار دارای موجودی > 0 غیرفعال نمی‌شود
      const agg = await db.stockItem.aggregate({
        where: { warehouseId: id },
        _sum: { qtyM2: true },
      })
      if ((agg._sum.qtyM2 ?? 0) > 0) {
        return fail('این انبار دارای موجودی است — ابتدا موجودی را تخلیه (انتقال/حواله) کنید', 400)
      }
    }
    data.isActive = nextActive
  }
  if (!Object.keys(data).length) return fail('تغییری ارسال نشده است')

  await db.warehouse.update({ where: { id }, data })
  await audit({
    ctx,
    action: 'WH_UPDATE',
    entity: 'warehouse',
    entityId: id,
    details: { code: wh.code, changes: data },
  })
  return { ok: true, data: null }
}
