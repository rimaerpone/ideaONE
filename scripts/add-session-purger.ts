// درج کار زمان‌بند «session-purger» در دیتابیس جاری (idempotent) — P1-T9
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const existing = await db.scheduledJob.findUnique({ where: { key: 'session-purger' } })
  if (existing) {
    console.log('کار از قبل موجود است:', existing.id)
    return
  }
  const j = await db.scheduledJob.create({
    data: {
      key: 'session-purger',
      name: 'پاکسازی نشست‌های منقضی',
      intervalSec: 3600,
      note: 'بهداشت جدول نشست — بسته P1-T9',
    },
  })
  console.log('کار درج شد:', j.id)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
