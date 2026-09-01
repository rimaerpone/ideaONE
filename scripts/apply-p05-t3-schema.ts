#!/usr/bin/env tsx
/**
 * P0.5-T3 — اعمال شِمای LoginAttempt با CREATE مستقیم (بدون prisma db push)
 *
 * چرا مستقیم: db push جدول‌های FTS دستی (letter_fts*) را DROP می‌کند (درس T2).
 * این اسکریپت فقط «افزودنی» است: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
 *
 * اجرا (لازم: unset متغیر تزریقی محیط طبق AGENTS لایه ۳):
 *   ( unset DATABASE_URL; cd /home/z/my-project && bunx tsx scripts/apply-p05-t3-schema.ts )
 * سپس: PRISMA_GEN در db.ts بامپ + bun run db:generate + احیای سرور dev (double-fork)
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  if (process.env.DATABASE_URL?.startsWith('file:')) {
    throw new Error('DATABASE_URL محیط file:… است — داخل subshell با unset اجرا کنید (AGENTS لایه ۳)')
  }

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LoginAttempt" (
      "id" TEXT NOT NULL,
      "username" TEXT NOT NULL,
      "ip" TEXT NOT NULL,
      "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
    )
  `)
  console.log('✓ جدول LoginAttempt ایجاد شد (یا از قبل موجود بود)')

  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "LoginAttempt_username_ip_at_idx" ON "LoginAttempt"("username", "ip", "at")`,
  )
  console.log('✓ ایندکس (username, ip, at) ایجاد شد (یا از قبل موجود بود)')

  // راستی‌آزمایی: شمار ستون‌ها + ایندکس‌ها
  const cols = await db.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'LoginAttempt' ORDER BY ordinal_position
  `)
  console.log(`✓ ستون‌ها: ${cols.map((c) => `${c.column_name}:${c.data_type}`).join(' · ')}`)
  if (cols.length !== 4) throw new Error(`انتظار ۴ ستون بود، ${cols.length} یافت شد`)

  const rows = await db.$queryRawUnsafe<{ count: number }[]>(`
    SELECT COUNT(*)::int AS count FROM "LoginAttempt"
  `)
  console.log(`✓ ردیف‌های موجود: ${rows[0].count}`)
}

main()
  .catch((e) => { console.error('✗ خطا:', e); process.exit(1) })
  .finally(() => db.$disconnect())
