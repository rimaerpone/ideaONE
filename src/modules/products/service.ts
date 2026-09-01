import 'server-only'
import { db } from '@/core/shared/db'
import type { SessionContext } from '@/core/auth/auth'
import { scopeCompanyIds, requireWriteRole } from '@/core/tenancy/tenancy'
import { audit } from '@/core/audit/audit'
import type { ServiceResult } from '@/core/shared/types'

/**
 * ماژول مستردیتا محصول — لایه سرویس
 */
const fail = (error: string, status?: number) => ({ ok: false, error, status }) as ServiceResult<never>

export async function listProducts(ctx: SessionContext): Promise<ServiceResult<{ products: unknown[] }>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const products = await db.product.findMany({
    where: { companyId: { in: scopeIds } },
    orderBy: { code: 'asc' },
    include: {
      company: { select: { name: true, code: true } },
      stockItems: { select: { qtyM2: true } },
    },
  })
  return {
    ok: true,
    data: {
      products: products.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        productLine: p.productLine,
        size: p.size,
        color: p.color,
        surface: p.surface,
        cartonArea: p.cartonArea,
        cartonsPerPallet: p.cartonsPerPallet,
        status: p.status,
        companyName: p.company.name,
        companyCode: p.company.code,
        totalStockM2: p.stockItems.reduce((s, i) => s + i.qtyM2, 0),
      })),
    },
  }
}

export async function createProduct(
  ctx: SessionContext,
  b: Record<string, unknown>,
): Promise<ServiceResult<{ id: string }>> {
  // P1-T18 — VIEWER هیچ نوشتنی ندارد؛ قبلاً فقط UI مهار می‌کرد (ماتریس 04-security §۳)
  const denied = await requireWriteRole(ctx)
  if (denied) return fail(denied, 403)
  if (!ctx.companyId) return fail('شرکت فعال انتخاب نشده است')

  if (!b.code || !b.name || !b.productLine || !b.size || !b.color) {
    return fail('کد، نام، خط محصول، ابعاد و رنگ الزامی است')
  }
  const dup = await db.product.findUnique({ where: { code: String(b.code).trim() } })
  if (dup) return fail('این کد کالا قبلاً ثبت شده است')

  const product = await db.product.create({
    data: {
      companyId: ctx.companyId,
      code: String(b.code).trim(),
      name: String(b.name).trim(),
      productLine: String(b.productLine).trim(),
      size: String(b.size).trim(),
      color: String(b.color).trim(),
      surface: b.surface ? String(b.surface).trim() : null,
      cartonArea: Number(b.cartonArea) || 0,
      cartonsPerPallet: Number(b.cartonsPerPallet) || 0,
    },
  })
  await audit({ ctx, action: 'CREATE', entity: 'product', entityId: product.id, details: { code: product.code, name: product.name } })
  return { ok: true, data: { id: product.id } }
}
