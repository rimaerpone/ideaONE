import 'server-only'
import { db } from '@/core/shared/db'
import type { SessionContext } from '@/core/auth/auth'
import { nextDocNumber } from '@/core/shared/server-helpers'
import { scopeCompanyIds, roleInCompany, requireWriteRole } from '@/core/tenancy/tenancy'
import { audit } from '@/core/audit/audit'
import { parseJalaliInput, formatJalali } from '@/core/shared/jalali'
import { parseNumericInput } from '@/core/shared/normalize'
import { applyDocToStock } from './warehouse'
import { listEnvelope, listSkip, type ParsedListQuery } from '@/core/shared/list-query'
import { buildCsvDocument, type CsvDocument } from '@/core/shared/csv'
import type { ListEnvelope } from '@/types/platform'
import type { ServiceResult } from '@/core/shared/types'

/**
 * ماژول انبار — لایه سرویس
 * سناریو: docs/scenarios/SC-002-warehouse-posting.md
 */
const fail = (error: string, status?: number) => ({ ok: false, error, status }) as ServiceResult<never>

// ---------- اسناد انبار ----------
// P1-T3/T12 — قرارداد فهرست استاندارد: q (شماره سند فارسی‌پذیر/طرف‌حساب/انبار) + فیلتر نوع/وضعیت + مرتب‌سازی + صفحه‌بندی
export async function listWhDocs(ctx: SessionContext, lq: ParsedListQuery): Promise<ServiceResult<ListEnvelope<unknown>>> {
  const scopeIds = await scopeCompanyIds(ctx)
  // جستجوی شماره سند با ارقام فارسی هم کار می‌کند (۱۲ → 12)
  const qNumber = lq.q ? parseNumericInput(lq.q) : null
  const where = {
    companyId: { in: scopeIds },
    ...(lq.filters.type ? { type: lq.filters.type } : {}),
    ...(lq.filters.status ? { status: lq.filters.status } : {}),
    ...(lq.filters.warehouseId ? { OR: [{ warehouseId: lq.filters.warehouseId }, { toWarehouseId: lq.filters.warehouseId }] } : {}),
    ...(lq.q ? {
      OR: [
        { partnerName: { contains: lq.q } },
        { warehouse: { name: { contains: lq.q } } },
        ...(qNumber !== null ? [{ docNumber: qNumber }] : []),
      ],
    } : {}),
  }
  const orderBy = lq.sortField
    ? [{ [lq.sortField]: lq.sortDir }, { docNumber: 'desc' as const }]
    : [{ docDate: 'desc' as const }, { docNumber: 'desc' as const }]

  const [docs, total] = await Promise.all([
    db.warehouseDoc.findMany({
      where,
      orderBy,
      skip: listSkip(lq.page, lq.pageSize),
      take: lq.pageSize,
      include: {
        warehouse: { select: { name: true } },
        toWarehouse: { select: { name: true } },
        items: { include: { product: { select: { code: true, name: true } } } },
        company: { select: { name: true, code: true } },
      },
    }),
    db.warehouseDoc.count({ where }),
  ])
  return {
    ok: true,
    data: listEnvelope(docs.map((d) => ({
      id: d.id,
      docNumber: d.docNumber,
      type: d.type,
      status: d.status,
      docDate: d.docDate,
      note: d.note,
      partnerName: d.partnerName,
      warehouseName: d.warehouse.name,
      toWarehouseName: d.toWarehouse?.name ?? null,
      companyName: d.company.name,
      companyCode: d.company.code,
      items: d.items.map((i) => ({
        id: i.id,
        productCode: i.product.code,
        productName: i.product.name,
        tone: i.tone,
        caliber: i.caliber,
        grade: i.grade,
        qtyM2: i.qtyM2,
        note: i.note,
      })),
    })), total, lq.page, lq.pageSize),
  }
}

/** برچسب فارسی نوع سند برای CSV سرور — آینه DOC_TYPE_LABELS در ui-bits (کلاینت)؛ اگر تغییری کرد هر دو را به‌روز کنید */
const DOC_TYPE_FA: Record<string, string> = { RECEIPT: 'رسید', ISSUE: 'حواله', TRANSFER: 'انتقال', COUNT: 'شمارش' }

/**
 * خروجی CSV اسناد انبار (P2.5-U6 / R2 — خروجی per-view)
 * همان where/orderBy فهرست (فیلترهای فعال نمای کاربر اعمال می‌شود) بدون صفحه‌بندی، تا سقف CSV_ROW_CAP.
 * هر سطر = یک سند؛ اقلام به‌صورت متن تجمیعی (کد × مقدار) می‌آیند تا کاربر اکسل‌پسند باشد.
 */
export async function exportWhDocsCsv(ctx: SessionContext, lq: ParsedListQuery): Promise<ServiceResult<CsvDocument>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const qNumber = lq.q ? parseNumericInput(lq.q) : null
  const where = {
    companyId: { in: scopeIds },
    ...(lq.filters.type ? { type: lq.filters.type } : {}),
    ...(lq.filters.status ? { status: lq.filters.status } : {}),
    ...(lq.filters.warehouseId ? { OR: [{ warehouseId: lq.filters.warehouseId }, { toWarehouseId: lq.filters.warehouseId }] } : {}),
    ...(lq.q ? {
      OR: [
        { partnerName: { contains: lq.q } },
        { warehouse: { name: { contains: lq.q } } },
        ...(qNumber !== null ? [{ docNumber: qNumber }] : []),
      ],
    } : {}),
  }
  const orderBy = lq.sortField
    ? [{ [lq.sortField]: lq.sortDir }, { docNumber: 'desc' as const }]
    : [{ docDate: 'desc' as const }, { docNumber: 'desc' as const }]
  const docs = await db.warehouseDoc.findMany({
    where,
    orderBy,
    include: {
      warehouse: { select: { name: true } },
      toWarehouse: { select: { name: true } },
      items: { include: { product: { select: { code: true, name: true } } } },
      company: { select: { name: true } },
    },
  })
  const header = ['شماره سند', 'نوع سند', 'وضعیت', 'تاریخ سند', 'انبار', 'انبار مقصد', 'طرف حساب', 'شرکت', 'جمع م²', 'شمار اقلام', 'اقلام', 'یادداشت']
  const rows = docs.map((d) => [
    d.docNumber,
    DOC_TYPE_FA[d.type] ?? d.type,
    d.status === 'POSTED' ? 'قطعی' : d.status === 'DRAFT' ? 'پیش‌نویس' : 'ابطال‌شده',
    formatJalali(d.docDate),
    d.warehouse.name,
    d.toWarehouse?.name ?? '',
    d.partnerName ?? '',
    d.company.name,
    d.items.reduce((s, i) => s + i.qtyM2, 0),
    d.items.length,
    d.items.map((i) => `${i.product.code} × ${i.qtyM2}`).join(' | '),
    d.note ?? '',
  ])
  return { ok: true, data: buildCsvDocument('whdocs', header, rows) }
}

export async function createWhDoc(
  ctx: SessionContext,
  b: Record<string, unknown>,
): Promise<ServiceResult<{ id: string; docNumber: number }>> {
  // P1-T18 — VIEWER هیچ نوشتنی ندارد (ماتریس 04-security §۳)
  const denied = await requireWriteRole(ctx)
  if (denied) return fail(denied, 403)
  if (!ctx.companyId) return fail('شرکت فعال انتخاب نشده است')
  const company = await db.company.findUnique({ where: { id: ctx.companyId } })
  if (company?.type === 'GROUP') return fail('برای ثبت سند، ابتدا به یک شرکت عملیاتی سوئیچ کنید')

  const { type, warehouseId, toWarehouseId, partnerName, note, items, post, docDate } = b as Record<string, unknown> & { post?: boolean; docDate?: string }
  if (!['RECEIPT', 'ISSUE', 'TRANSFER', 'COUNT'].includes(type as string)) return fail('نوع سند نامعتبر است')
  if (!warehouseId) return fail('انبار الزامی است')
  if (type === 'TRANSFER' && !toWarehouseId) return fail('برای انتقال، انبار مقصد الزامی است')
  // P3-T1 — انتقال به خود انبار بی‌معناست (فرم مقصد≠مبدأ را فیلتر می‌کند؛ سرور حاکم است)
  if (type === 'TRANSFER' && toWarehouseId === warehouseId) return fail('انبار مبدأ و مقصد انتقال نباید یکسان باشند')
  if (!Array.isArray(items) || items.length === 0) return fail('حداقل یک قلم کالا الزامی است')

  // تاریخ سند (جلالی) — اگر نامعتبر باشد خطا می‌دهیم؛ خالی = امروز
  let docDateValue: Date | null = null
  if (docDate) {
    docDateValue = parseJalaliInput(String(docDate))
    if (!docDateValue) return fail('تاریخ سند نامعتبر است (نمونه درست: ۱۴۰۵/۰۶/۰۵)')
  }

  // مالکیت انبار در شرکت فعال
  const wh = await db.warehouse.findUnique({ where: { id: warehouseId as string } })
  if (!wh || wh.companyId !== ctx.companyId) return fail('انبار در شرکت فعال شما یافت نشد')

  for (const it of items as Record<string, unknown>[]) {
    const prod = await db.product.findUnique({ where: { id: it.productId as string } })
    if (!prod || prod.companyId !== ctx.companyId) return fail(`کالای انتخابی (${it.productId}) متعلق به شرکت فعال نیست`)
    // P1-T16 — نرمال‌سازی عددی کامل سمت سرور (آینه کلاینت): ارقام فارسی/عربی،
    // جداکننده اعشار ٫/، هزارگان ٬/، و منفی یونیکد
    const qty = parseNumericInput(String(it.qtyM2 ?? ''))
    if (qty === null || qty === 0) return fail('مقدار هر قلم باید عددی غیرصفر باشد')
    // P3-T1 — قرارداد علامت انتقال: مقدار مثبت (از مبدأ کسر/به مقصد افزوده می‌شود)
    if (type === 'TRANSFER' && qty < 0) return fail('مقدار قلم انتقال باید عددی مثبت باشد')
    it.qtyM2 = qty
  }

  const docNumber = await nextDocNumber(ctx.companyId, 'WHDOC')
  const doc = await db.warehouseDoc.create({
    data: {
      companyId: ctx.companyId,
      docNumber,
      type: type as string,
      warehouseId: warehouseId as string,
      toWarehouseId: type === 'TRANSFER' ? (toWarehouseId as string) : null,
      partnerName: (partnerName as string) || null,
      note: (note as string) || null,
      docDate: docDateValue ?? undefined,
      status: 'DRAFT',
      createdById: ctx.userId,
      items: { create: (items as Record<string, unknown>[]).map((i) => ({ productId: i.productId as string, tone: (i.tone as string) || '', caliber: (i.caliber as string) || '', grade: (i.grade as string) || '1', qtyM2: i.qtyM2 as number, note: (i.note as string) || null })) },
    },
  })

  if (post) {
    const err = await applyDocToStock(doc.id)
    if (err) return fail(err)
  }
  await audit({ ctx, action: post ? 'CREATE+POST' : 'CREATE', entity: 'warehouseDoc', entityId: doc.id, details: { docNumber, type, count: (items as unknown[]).length } })
  return { ok: true, data: { id: doc.id, docNumber } }
}

// P1.5-T8 — جزئیات یک سند انبار (صفحه رکورد) با گارد دامنه دید
export async function getWhDoc(ctx: SessionContext, id: string): Promise<ServiceResult<{ doc: unknown }>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const d = await db.warehouseDoc.findFirst({
    where: { id, companyId: { in: scopeIds } },
    include: {
      warehouse: { select: { name: true } },
      toWarehouse: { select: { name: true } },
      company: { select: { name: true, code: true } },
      items: { orderBy: { id: 'asc' }, include: { product: { select: { code: true, name: true, size: true } } } },
    },
  })
  if (!d) return fail('سند یافت نشد', 404)
  return {
    ok: true,
    data: {
      doc: {
        id: d.id,
        docNumber: d.docNumber,
        type: d.type,
        status: d.status,
        docDate: d.docDate,
        note: d.note,
        partnerName: d.partnerName,
        warehouseName: d.warehouse.name,
        toWarehouseName: d.toWarehouse?.name ?? null,
        companyName: d.company.name,
        companyCode: d.company.code,
        items: d.items.map((i) => ({
          id: i.id,
          productCode: i.product.code,
          productName: i.product.name,
          size: i.product.size,
          tone: i.tone,
          caliber: i.caliber,
          grade: i.grade,
          qtyM2: i.qtyM2,
          note: i.note,
        })),
      },
    },
  }
}

export async function decideWhDoc(
  ctx: SessionContext,
  b: { docId: string; action: string },
): Promise<ServiceResult<{ ok: true }>> {
  const { docId, action } = b

  const doc = await db.warehouseDoc.findUnique({ where: { id: docId }, include: { warehouse: true } })
  if (!doc) return fail('سند یافت نشد')
  if (doc.companyId !== ctx.companyId) return fail('این سند متعلق به شرکت فعال شما نیست')

  const role = await roleInCompany(ctx.userId, ctx.companyId)
  const canPost = role === 'ADMIN' || role === 'MANAGER' || role === 'OPERATOR'

  if (action === 'POST') {
    if (!canPost) return fail('اجازه قطعی‌سازی ندارید', 403)
    const err = await applyDocToStock(doc.id)
    if (err) return fail(err)
    await audit({ ctx, action: 'POST', entity: 'warehouseDoc', entityId: doc.id, details: { docNumber: doc.docNumber, type: doc.type } })
    return { ok: true, data: { ok: true } }
  }
  if (action === 'CANCEL') {
    if (!canPost) return fail('اجازه ابطال سند ندارید', 403) // P1-T18 — ابطال هم «نوشتن» است: VIEWER رد
    if (doc.status === 'POSTED') return fail('سند قطعی‌شده قابل ابطال نیست (در پایلوت)')
    await db.warehouseDoc.update({ where: { id: doc.id }, data: { status: 'CANCELLED' } })
    await audit({ ctx, action: 'CANCEL', entity: 'warehouseDoc', entityId: doc.id, details: { docNumber: doc.docNumber } })
    return { ok: true, data: { ok: true } }
  }
  return fail('عملیات نامعتبر است')
}

// ---------- P3-T11 — ویرایش اقلام سند DRAFT (ویرایش درون‌خطی گرید — G6) ----------
// تعویض کامل اقلام (put semantics): سرور آرایه جدید را اعتبارسنجی و در یک تراکنش
// جایگزین اقلام قبلی می‌کند؛ فقط DRAFT و فقط نقش نوشتن (VIEWER 403).
export async function updateWhDocItems(
  ctx: SessionContext,
  docId: string,
  items: unknown,
): Promise<ServiceResult<{ docNumber: number; count: number }>> {
  const denied = await requireWriteRole(ctx)
  if (denied) return fail(denied, 403)
  if (!ctx.companyId) return fail('شرکت فعال انتخاب نشده است')

  const doc = await db.warehouseDoc.findUnique({ where: { id: docId } })
  if (!doc) return fail('سند یافت نشد', 404)
  if (doc.companyId !== ctx.companyId) return fail('این سند متعلق به شرکت فعال شما نیست')
  if (doc.status !== 'DRAFT') return fail('فقط پیش‌نویس قابل ویرایش اقلام است — سند قطعی یا ابطال‌شده است')

  if (!Array.isArray(items) || items.length === 0) return fail('حداقل یک قلم کالا الزامی است')

  const rows: { productId: string; tone: string; caliber: string; grade: string; qtyM2: number; note: string | null }[] = []
  for (const it of items as Record<string, unknown>[]) {
    const prod = await db.product.findUnique({ where: { id: it.productId as string } })
    if (!prod || prod.companyId !== ctx.companyId) return fail(`کالای انتخابی (${it.productId}) متعلق به شرکت فعال نیست`)
    const qty = parseNumericInput(String(it.qtyM2 ?? ''))
    if (qty === null || qty === 0) return fail('مقدار هر قلم باید عددی غیرصفر باشد')
    // P3-T1 — قرارداد علامت انتقال (آینه createWhDoc)
    if (doc.type === 'TRANSFER' && qty < 0) return fail('مقدار قلم انتقال باید عددی مثبت باشد')
    rows.push({
      productId: it.productId as string,
      tone: (it.tone as string) || '',
      caliber: (it.caliber as string) || '',
      grade: (it.grade as string) || '1',
      qtyM2: qty,
      note: (it.note as string) || null,
    })
  }

  await db.$transaction([
    db.docItem.deleteMany({ where: { docId: doc.id } }),
    db.docItem.createMany({ data: rows.map((r) => ({ ...r, docId: doc.id })) }),
  ])
  await audit({ ctx, action: 'DOC_ITEMS_EDIT', entity: 'warehouseDoc', entityId: doc.id, details: { docNumber: doc.docNumber, count: rows.length } })
  return { ok: true, data: { docNumber: doc.docNumber, count: rows.length } }
}

// ---------- موجودی ----------
// P1-T3 — همان قرارداد فهرست (پاکت ListEnvelope)؛ فیلترها همان فیلدهای قبل + جستجو + مرتب‌سازی
export async function listStock(
  ctx: SessionContext,
  lq: ParsedListQuery,
): Promise<ServiceResult<ListEnvelope<unknown>>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const f = lq.filters
  const where = {
    qtyM2: { not: 0 },
    warehouse: { companyId: { in: scopeIds }, ...(f.warehouseId ? { id: f.warehouseId } : {}) },
    ...(f.productId ? { productId: f.productId } : {}),
    ...(f.grade ? { grade: f.grade } : {}),
    ...(lq.q ? {
      OR: [
        { product: { name: { contains: lq.q } } },
        { product: { code: { contains: lq.q } } },
        { warehouse: { name: { contains: lq.q } } },
      ],
    } : {}),
  }
  const orderBy = { [lq.sortField ?? 'updatedAt']: lq.sortDir }
  const [items, total] = await Promise.all([
    db.stockItem.findMany({
      where,
      orderBy,
      skip: listSkip(lq.page, lq.pageSize),
      take: lq.pageSize,
      include: {
        product: { select: { code: true, name: true, size: true, color: true, productLine: true, cartonArea: true } },
        warehouse: { include: { company: { select: { name: true, code: true } } } },
      },
    }),
    db.stockItem.count({ where }),
  ])
  return {
    ok: true,
    data: listEnvelope(items.map((i) => ({
      id: i.id,
      qtyM2: i.qtyM2,
      tone: i.tone,
      caliber: i.caliber,
      grade: i.grade,
      updatedAt: i.updatedAt,
      product: i.product,
      warehouse: {
        id: i.warehouse.id,
        name: i.warehouse.name,
        kind: i.warehouse.kind,
        companyName: i.warehouse.company.name,
        companyCode: i.warehouse.company.code,
      },
    })), total, lq.page, lq.pageSize),
  }
}

/** برچسب فارسی درجه برای CSV — آینه GRADE_LABELS در ui-bits (کلاینت) */
const GRADE_FA: Record<string, string> = { '1': 'درجه ۱', '2': 'درجه ۲', w: 'درجه ضایعات (W)' }

/**
 * خروجی CSV موجودی انبار (P2.5-U6 / R2 — خروجی per-view)
 * همان where فهرست موجودی (انبار/درجه/جستجو فعال) — ردیف = واریانت (کالا × تون/کالیبر/درجه × انبار).
 */
export async function exportStockCsv(ctx: SessionContext, lq: ParsedListQuery): Promise<ServiceResult<CsvDocument>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const f = lq.filters
  const where = {
    qtyM2: { not: 0 },
    warehouse: { companyId: { in: scopeIds }, ...(f.warehouseId ? { id: f.warehouseId } : {}) },
    ...(f.productId ? { productId: f.productId } : {}),
    ...(f.grade ? { grade: f.grade } : {}),
    ...(lq.q ? {
      OR: [
        { product: { name: { contains: lq.q } } },
        { product: { code: { contains: lq.q } } },
        { warehouse: { name: { contains: lq.q } } },
      ],
    } : {}),
  }
  const orderBy = { [lq.sortField ?? 'updatedAt']: lq.sortDir }
  const items = await db.stockItem.findMany({
    where,
    orderBy,
    include: {
      product: { select: { code: true, name: true, size: true, color: true, productLine: true, cartonArea: true } },
      warehouse: { include: { company: { select: { name: true } } } },
    },
  })
  const header = ['کد کالا', 'نام کالا', 'خط محصول', 'ابعاد', 'رنگ', 'انبار', 'شرکت', 'تون', 'کالیبر', 'درجه', 'موجودی م²', 'معادل کارتن', 'به‌روزرسانی']
  const rows = items.map((i) => [
    i.product.code,
    i.product.name,
    i.product.productLine,
    i.product.size,
    i.product.color,
    i.warehouse.name,
    i.warehouse.company.name,
    i.tone || '',
    i.caliber || '',
    GRADE_FA[i.grade] ?? i.grade,
    i.qtyM2,
    i.product.cartonArea ? Math.round((i.qtyM2 / i.product.cartonArea) * 100) / 100 : '',
    formatJalali(i.updatedAt, true),
  ])
  return { ok: true, data: buildCsvDocument('stock', header, rows) }
}

// ---------- انبارها ----------
export async function listWarehouses(ctx: SessionContext): Promise<ServiceResult<{ warehouses: unknown[] }>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const warehouses = await db.warehouse.findMany({
    where: { companyId: { in: scopeIds }, isActive: true },
    orderBy: { code: 'asc' },
    include: { company: { select: { name: true, code: true } } },
  })
  return {
    ok: true,
    data: {
      warehouses: warehouses.map((w) => ({
        id: w.id,
        code: w.code,
        name: w.name,
        kind: w.kind,
        companyName: w.company.name,
        companyCode: w.company.code,
      })),
    },
  }
}

// ---------- P3-T1/T3 — کارت حساب کالا (گردش یک واریانت روی یک انبار) ----------
// قرارداد ریاضی: افتتاحیه + Σ(گردش بازه) = مانده پایان = موجودی فعلی سیستم.
// «افتتاحیه» به تعریف حسابداری = موجودی فعلی منهای جمع گردش بازه است؛ روی داده‌ای که
// کامل از مسیر اپ ساخته شده صفر است و روی داده تاریخی/seed حجمی، تراز را حفظ می‌کند.
export async function getStockCard(
  ctx: SessionContext,
  id: string,
  range: { from?: string; to?: string } = {},
): Promise<ServiceResult<{ card: unknown }>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const item = await db.stockItem.findFirst({
    where: { id, warehouse: { companyId: { in: scopeIds } } },
    include: {
      product: { select: { code: true, name: true, size: true, color: true, productLine: true, cartonArea: true } },
      warehouse: { include: { company: { select: { name: true, code: true } } } },
    },
  })
  if (!item) return fail('قلم موجودی یافت نشد', 404)

  // بازه جلالی اختیاری — نامعتبر = خطای دقیق (آینه فرم)
  let fromDate: Date | null = null
  let toDate: Date | null = null
  if (range.from) {
    fromDate = parseJalaliInput(range.from)
    if (!fromDate) return fail('تاریخ آغاز بازه نامعتبر است (نمونه درست: ۱۴۰۵/۰۶/۰۱)')
  }
  if (range.to) {
    const t = parseJalaliInput(range.to)
    if (!t) return fail('تاریخ پایان بازه نامعتبر است (نمونه درست: ۱۴۰۵/۰۶/۳۱)')
    toDate = new Date(t.getTime() + 86400000 - 1) // تا پایان همان روز
  }

  // همه گردش‌های POST شده این واریانت روی همین انبار (مبدأ یا مقصد انتقال)
  const moves = await db.docItem.findMany({
    where: {
      productId: item.productId,
      tone: item.tone,
      caliber: item.caliber,
      grade: item.grade,
      doc: {
        status: 'POSTED',
        OR: [{ warehouseId: item.warehouseId }, { type: 'TRANSFER', toWarehouseId: item.warehouseId }],
      },
    },
    orderBy: [{ doc: { docDate: 'asc' } }, { doc: { docNumber: 'asc' } }, { id: 'asc' }],
    include: {
      doc: {
        select: {
          id: true, docNumber: true, type: true, docDate: true, partnerName: true, note: true, warehouseId: true,
          warehouse: { select: { name: true } },
        },
      },
    },
  })

  // علامت از دید همین انبار: انتقالِ مقصد = ورود(+مقدار)، انتقالِ مبدأ = خروج(−مقدار)، بقیه = علامت خود قلم
  const all = moves.map((m) => ({
    docId: m.doc.id,
    docNumber: m.doc.docNumber,
    type: m.doc.type,
    docDate: m.doc.docDate.toISOString(),
    partnerName: m.doc.partnerName,
    docNote: m.doc.note,
    itemNote: m.note,
    fromWarehouse: m.doc.type === 'TRANSFER' && m.doc.warehouseId !== item.warehouseId ? m.doc.warehouse.name : null,
    qty: m.doc.type === 'TRANSFER' ? (m.doc.warehouseId !== item.warehouseId ? m.qtyM2 : -m.qtyM2) : m.qtyM2,
  }))

  const inRange = all.filter((mv) => (!fromDate || mv.docDate >= fromDate.toISOString()) && (!toDate || mv.docDate <= toDate.toISOString()))
  const sumRange = inRange.reduce((s, mv) => s + mv.qty, 0)
  const totalIn = inRange.filter((mv) => mv.qty > 0).reduce((s, mv) => s + mv.qty, 0)
  const totalOut = inRange.filter((mv) => mv.qty < 0).reduce((s, mv) => s + mv.qty, 0)

  return {
    ok: true,
    data: {
      card: {
        item: {
          id: item.id,
          qtyM2: item.qtyM2,
          tone: item.tone,
          caliber: item.caliber,
          grade: item.grade,
          updatedAt: item.updatedAt,
          product: item.product,
          warehouse: {
            id: item.warehouse.id,
            name: item.warehouse.name,
            kind: item.warehouse.kind,
            companyName: item.warehouse.company.name,
            companyCode: item.warehouse.company.code,
          },
        },
        ledger: {
          opening: item.qtyM2 - sumRange,
          closing: item.qtyM2,
          totalIn,
          totalOut,
          net: sumRange,
          movements: inRange,
        },
        recent: [...all].slice(-5).reverse(),
      },
    },
  }
}

// ---------- P3-T2 — گردش انبار (همه اسناد یک انبار در بازه + جمع ورود/خروج) ----------
// علامت هر سند از دید انبارِ انتخابی — جمع‌ها از کل ردیف‌های منطبق، نه صفحه جاری.
function flowDeltas(type: string, docWarehouseId: string, warehouseId: string, qty: number) {
  if (type === 'TRANSFER') return docWarehouseId === warehouseId ? -qty : qty
  return qty
}

export async function listWhFlow(ctx: SessionContext, lq: ParsedListQuery): Promise<ServiceResult<unknown>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const warehouseId = lq.filters.warehouseId
  if (!warehouseId) return fail('انبار الزامی است')
  const wh = await db.warehouse.findFirst({ where: { id: warehouseId, companyId: { in: scopeIds } } })
  if (!wh) return fail('انبار در دامنه دسترسی شما یافت نشد', 404)

  // بازه جلالی اختیاری
  let fromDate: Date | null = null
  let toDate: Date | null = null
  if (lq.filters.from) {
    fromDate = parseJalaliInput(lq.filters.from)
    if (!fromDate) return fail('تاریخ آغاز بازه نامعتبر است (نمونه درست: ۱۴۰۵/۰۶/۰۱)')
  }
  if (lq.filters.to) {
    const t = parseJalaliInput(lq.filters.to)
    if (!t) return fail('تاریخ پایان بازه نامعتبر است (نمونه درست: ۱۴۰۵/۰۶/۳۱)')
    toDate = new Date(t.getTime() + 86400000 - 1)
  }

  const where = {
    status: 'POSTED' as const,
    OR: [{ warehouseId }, { type: 'TRANSFER', toWarehouseId: warehouseId }],
    ...(fromDate || toDate ? {
      docDate: {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      },
    } : {}),
  }

  const [docs, total, allDocs] = await Promise.all([
    db.warehouseDoc.findMany({
      where,
      orderBy: lq.sortField === 'docNumber'
        ? [{ docNumber: lq.sortDir }]
        : [{ docDate: lq.sortDir }, { docNumber: 'desc' as const }],
      skip: listSkip(lq.page, lq.pageSize),
      take: lq.pageSize,
      include: { items: { select: { qtyM2: true } }, company: { select: { name: true, code: true } } },
    }),
    db.warehouseDoc.count({ where }),
    db.warehouseDoc.findMany({
      where,
      select: { type: true, warehouseId: true, items: { select: { qtyM2: true } } },
    }),
  ])

  // جمع کل ورود/خروج (کل ردیف‌های منطبق)
  let totalIn = 0
  let totalOut = 0
  for (const d of allDocs) for (const it of d.items) {
    const delta = flowDeltas(d.type, d.warehouseId, warehouseId, it.qtyM2)
    if (delta > 0) totalIn += delta
    else totalOut += delta
  }

  return {
    ok: true,
    data: {
      ...listEnvelope(docs.map((d) => {
        let inM2 = 0
        let outM2 = 0
        for (const it of d.items) {
          const delta = flowDeltas(d.type, d.warehouseId, warehouseId, it.qtyM2)
          if (delta > 0) inM2 += delta
          else outM2 += delta
        }
        return {
          id: d.id,
          docNumber: d.docNumber,
          type: d.type,
          docDate: d.docDate,
          partnerName: d.partnerName,
          note: d.note,
          itemsCount: d.items.length,
          inM2,
          outM2,
          companyName: d.company.name,
          companyCode: d.company.code,
        }
      }), total, lq.page, lq.pageSize),
      totalIn: Math.round(totalIn * 100) / 100,
      totalOut: Math.round(totalOut * 100) / 100,
    },
  }
}
