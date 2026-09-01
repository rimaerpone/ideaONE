// scripts/jobs-status.ts — وضعیت کارهای زمان‌بند، پردازش Outbox و پرچم‌های ویژگی (پشتیبان RB-01)
// اجرا: bun scripts/jobs-status.ts
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const jobs = await db.scheduledJob.findMany({ orderBy: { key: 'asc' } })
  console.log('— کارهای زمان‌بند —')
  for (const j of jobs) {
    console.log(`  ${j.key} | ${j.lastStatus ?? 'در انتظار اولین اجرا'} | آخرین اجرا: ${j.lastRunAt?.toISOString() ?? '—'} | ${j.note ?? ''}`)
    if (j.lastError) console.log(`    خطا: ${j.lastError}`)
  }
  const [total, processed] = await Promise.all([
    db.outboxEvent.count(),
    db.outboxEvent.count({ where: { processedAt: { not: null } } }),
  ])
  console.log(`— Outbox: ${processed}/${total} رویداد تحویل‌شده`)
  const flags = await db.featureFlag.findMany({ orderBy: { key: 'asc' } })
  console.log(`— پرچم‌ها: ${flags.map((f) => `${f.key}=${f.enabled ? 'روشن' : 'خاموش'}`).join(' · ')}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
