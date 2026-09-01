import 'server-only'
import { db } from '@/core/shared/db'
import { emitEvent } from '@/core/events/outbox'

// P0.5-T1 — خطای دامنه‌ای: پیام فارسی برای کاربر + rollback قطعی تراکنش (بدون 500)
class DomainError extends Error {}

// اعمال سند انبار روی موجودی (قطعی‌سازی) — P0.5-T1: «اتمیک یا هیچ»
// رسید: افزایش | حواله و شمارش: مقدار منفی ثبت می‌شود | انتقال: کسر از مبدأ و افزودن به مقصد
// P3-T1 — قرارداد علامت انتقال (آینه seed پایلوت): مقدار قلم انتقال همیشه مثبت است؛
// پیش از P3 باگ نهفته داشتیم: مقدار به «هر دو» انبار مبدأ و مقصد اضافه می‌شد (تست قطعی‌سازی
// انتقال نداشتیم و seed پایلوت موجودی را مستقیم می‌نوشت) — اکنون مبدأ کسر و مقصد افزوده می‌شود.
export async function applyDocToStock(docId: string): Promise<string | null> {
  try {
    const doc = await db.$transaction(async (tx) => {
      // گارد idempotency + رفع رقابت دوبار POST: claim اتمیکِ فقط سند DRAFT.
      // دو POST هم‌زمان ⇒ فقط updateMany اول برنده می‌شود؛ دومی rollback خالی می‌گیرد.
      const claimed = await tx.warehouseDoc.updateMany({ where: { id: docId, status: 'DRAFT' }, data: { status: 'POSTED' } })
      if (claimed.count === 0) {
        const exists = await tx.warehouseDoc.findUnique({ where: { id: docId }, select: { status: true } })
        throw new DomainError(exists ? 'سند قبلاً قطعی شده است' : 'سند یافت نشد')
      }
      const d = await tx.warehouseDoc.findUnique({ where: { id: docId }, include: { items: true } })
      if (!d) throw new DomainError('سند یافت نشد')

      for (const it of d.items) {
        // اثر قلم روی انبار مبدأ: انتقال = کسر (مقدار مثبت)، بقیه = علامت خود قلم
        const sourceDelta = d.type === 'TRANSFER' ? -it.qtyM2 : it.qtyM2
        const key = {
          warehouseId_productId_tone_caliber_grade: {
            warehouseId: d.warehouseId,
            productId: it.productId,
            tone: it.tone,
            caliber: it.caliber,
            grade: it.grade,
          },
        }
        const existing = await tx.stockItem.findUnique({ where: key })
        const qty = (existing?.qtyM2 ?? 0) + sourceDelta
        if (qty < 0) {
          // پرتاب (نه return) ⇒ rollback اقلام قبلی + بازگشت status به DRAFT — یافته C1 ممیزی عمیق
          const prod = await tx.product.findUnique({ where: { id: it.productId }, select: { code: true } })
          throw new DomainError(`موجودی کافی نیست: ${prod?.code ?? it.productId} (موجودی فعلی ${existing?.qtyM2 ?? 0} مترمربع)`)
        }
        if (existing) await tx.stockItem.update({ where: { id: existing.id }, data: { qtyM2: qty } })
        else await tx.stockItem.create({ data: { warehouseId: d.warehouseId, productId: it.productId, tone: it.tone, caliber: it.caliber, grade: it.grade, qtyM2: qty } })

        if (d.type === 'TRANSFER' && d.toWarehouseId) {
          const key2 = {
            warehouseId_productId_tone_caliber_grade: {
              warehouseId: d.toWarehouseId,
              productId: it.productId,
              tone: it.tone,
              caliber: it.caliber,
              grade: it.grade,
            },
          }
          const ex2 = await tx.stockItem.findUnique({ where: key2 })
          const qty2 = (ex2?.qtyM2 ?? 0) + it.qtyM2
          if (ex2) await tx.stockItem.update({ where: { id: ex2.id }, data: { qtyM2: qty2 } })
          else await tx.stockItem.create({ data: { warehouseId: d.toWarehouseId, productId: it.productId, tone: it.tone, caliber: it.caliber, grade: it.grade, qtyM2: qty2 } })
        }
      }
      return d
    })
    // رویداد Outbox فقط پس از commit موفق — شکست ثبت رویداد نباید موجودیِ قطعی‌شده را برگرداند
    await emitEvent('doc.posted', { docId: doc.id, docNumber: doc.docNumber, type: doc.type, companyId: doc.companyId })
    return null
  } catch (e) {
    if (e instanceof DomainError) return e.message
    throw e // خطای غیرمنتظره (اتصال و…) عمداً propagate تا route آن را 500 کند
  }
}
