// پاک‌سازی همهٔ داده‌های آزمونی P0.5-T1 (رسید/حواله) + بازگردانی موجودی به مقدار پیش از آزمون‌ها
// اجرا: ( unset DATABASE_URL; bun scripts/cleanup-p05-t1-test.ts )
// قرارداد: اثر موجودیِ هر سند POSTED = آینهٔ applyDocToStock (انتقال در آزمون ما وجود ندارد)
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const testDocs = await db.warehouseDoc.findMany({
    where: { OR: [{ partnerName: { contains: 'آزمون P0.5-T1' } }, { partnerName: { contains: 'آزمون کمبود' } }] },
    include: { items: true },
    orderBy: { docNumber: 'asc' },
  })
  if (testDocs.length === 0) {
    console.log('سند آزمونی یافت نشد — تمیز')
    return
  }

  // اثر خالص روی موجودی: فقط اسناد POSTED
  let delta = 0
  for (const d of testDocs) {
    if (d.status !== 'POSTED') continue
    for (const it of d.items) delta += d.type === 'TRANSFER' ? -it.qtyM2 : it.qtyM2
  }

  // کلید موجودی از اقلام اولین سند (همهٔ آزمون‌ها روی یک انبار/کالا بوده‌اند)
  const first = testDocs[0].items[0]
  const key = { warehouseId: testDocs[0].warehouseId, productId: first.productId, tone: first.tone, caliber: first.caliber, grade: first.grade }
  const stock = await db.stockItem.findUnique({ where: { warehouseId_productId_tone_caliber_grade: key } })
  if (stock) {
    const restored = (stock.qtyM2 ?? 0) - delta
    await db.stockItem.update({ where: { id: stock.id }, data: { qtyM2: restored } })
    console.log(`موجودی: ${stock.qtyM2} → ${restored} (اثر خالص حذف‌شده: ${delta > 0 ? '+' : ''}${delta})`)
  }

  for (const d of testDocs) {
    await db.docItem.deleteMany({ where: { docId: d.id } })
    await db.outboxEvent.deleteMany({ where: { type: 'doc.posted', payload: { contains: d.id } } })
    await db.warehouseDoc.delete({ where: { id: d.id } })
  }
  console.log(`${testDocs.length} سند آزمونی حذف شد: ${testDocs.map((d) => `${d.docNumber}(${d.status})`).join(' · ')}`)
}

main().finally(() => db.$disconnect())
