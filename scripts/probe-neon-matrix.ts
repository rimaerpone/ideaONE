// ماتریس تأخیر — کدام پیکربندی اتصال Prisma→Neon pooler واقعاً اتصال را بازاستفاده می‌کند؟
// اجرا: ( unset DATABASE_URL; bun scripts/probe-neon-matrix.ts )  — URL از .env خوانده می‌شود (راز هرگز در کد نمی‌نشیند)
import { PrismaClient } from '@prisma/client'

const RAW = process.env.DATABASE_URL ?? ''
if (!RAW.startsWith('postgresql://')) {
  console.error('DATABASE_URL باید postgresql باشد (از .env) — متغیر تزریقی محیط را unset کنید (AGENTS.md)')
  process.exit(1)
}
const BASE = RAW.replace(/\?pgbouncer=true&?/, '?').replace(/\?$/, '').replace(/&$/, '')

const variant = async (label: string, url: string, extra?: (db: PrismaClient) => Promise<void>) => {
  const db = new PrismaClient({ log: ['error'], datasources: { db: { url } } })
  try {
    const times: number[] = []
    for (let i = 0; i < 6; i++) {
      const t = performance.now()
      await db.$queryRawUnsafe('SELECT $1::INT AS i', i)
      times.push(performance.now() - t)
    }
    console.log(`  ${label}: ${times.map((x) => Math.round(x)).join(', ')}ms`)
    // پایداری: ۱۵ پرس‌وجوی تکراری هم‌شکل با پارامتر متفاوت (آزمون prepared statement زیر transaction pooling)
    let err = ''
    try {
      for (let i = 0; i < 15; i++) await db.$queryRawUnsafe('SELECT $1::INT AS i, $2::TEXT AS t', i, `x${i}`)
    } catch (e) { err = e instanceof Error ? e.message.slice(0, 100) : String(e) }
    console.log(`    ۱۵ تکرار هم‌شکل: ${err ? 'شکست — ' + err : 'پایدار ✓'}`)
    await extra?.(db)
  } catch (e) {
    console.log(`  ${label}: شکست — ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`)
  } finally { await db.$disconnect() }
}

async function main() {
  console.log('── A) pgbouncer=true (وضع فعلی) ──')
  await variant('A', `${BASE}&pgbouncer=true`)
  console.log('── B) بدون pgbouncer ──')
  await variant('B', BASE)
  console.log('── C) pgbouncer=true&connection_limit=1 ──')
  await variant('C', `${BASE}&pgbouncer=true&connection_limit=1`)
  console.log('── D) کنترل: $transaction پین‌شده ──')
  await variant('D', `${BASE}&pgbouncer=true`, async (db) => {
    await db.$transaction(async (tx) => {
      const times: number[] = []
      for (let i = 0; i < 5; i++) {
        const t = performance.now()
        await tx.$queryRawUnsafe('SELECT 1')
        times.push(performance.now() - t)
      }
      console.log(`    داخل tx: ${times.map((x) => Math.round(x)).join(', ')}ms`)
    })
  })
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
