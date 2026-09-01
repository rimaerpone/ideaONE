#!/usr/bin/env tsx
/** پاک‌سازی داده تست P1-T37 — نامه آزمایشی + پیوست و فایل آن */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const letter = await prisma.letter.findFirst({
    where: { number: 3608, subject: { contains: 'تست پیوست' } },
    include: { referrals: true },
  })
  if (!letter) {
    console.log('نامه تستی یافت نشد (شاید قبلاً پاک شده)')
    return
  }
  // پیوست‌های پلی‌مورف + فایل‌های مربوطه
  const attachments = await prisma.attachment.findMany({
    where: { entityType: 'letter', entityId: letter.id },
  })
  for (const a of attachments) {
    await prisma.attachment.delete({ where: { id: a.id } })
    await prisma.fileObject.deleteMany({ where: { id: a.fileObjectId } })
  }
  await prisma.letterReferral.deleteMany({ where: { letterId: letter.id } })
  // Notification مدل entityType ندارد (فقط kind/targetView) — نامه بدون ارجاع اعلانی نساخته
  await prisma.auditLog.deleteMany({ where: { entity: 'letter', entityId: letter.id } })
  await prisma.letter.delete({ where: { id: letter.id } })
  console.log(`حذف شد: نامه ${letter.number} (شناسه ${letter.id.slice(0, 8)}) + ${attachments.length} پیوست`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
