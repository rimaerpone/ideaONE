// درج کار زمان‌بند «deadline-reminder» در دیتابیس جاری (idempotent) — P2-T11
// اجرا: bun scripts/add-deadline-reminder-job.ts
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const existing = await db.scheduledJob.findUnique({ where: { key: 'deadline-reminder' } })
  if (existing) {
    console.log('کار از قبل موجود است:', existing.id)
    return
  }
  const j = await db.scheduledJob.create({
    data: {
      key: 'deadline-reminder',
      name: 'یادآور مهلت اقدام نامه',
      intervalSec: 3600, // ساعتی — طبق دستور پخت RECOVERY-PLAN R5
      note: '۳ روز قبل و روز موعد → اعلان دارنده (dedupKey یکتا، بدون اسپم) — بسته P2-T11',
    },
  })
  console.log('کار درج شد:', j.id)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
