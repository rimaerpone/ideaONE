// پروب تأخیر Neon — تفکیک: RTT شبکه vs هزینه اتصال vs هزینه هر statement
// اجرا: bun scripts/probe-neon-latency.ts
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient({ log: ['error'] })
const ms = async (label: string, fn: () => Promise<unknown>, n = 1) => {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const t = performance.now()
    await fn()
    out.push(performance.now() - t)
  }
  console.log(`  ${label}: ${out.map((x) => Math.round(x)).join(', ')}ms (میانه ≈ ${Math.round(out[Math.floor(out.length / 2)])}ms)`)
}

async function main() {
  console.log('── ۱) پرس‌وجوی آزاد (احتمالاً اتصال تازه از pool) ──')
  await ms('SELECT 1 ×۵', () => db.$queryRawUnsafe('SELECT 1'), 5)

  console.log('── ۲) داخل $transaction تعاملی (اتصال پین‌شده تضمینی) ──')
  await db.$transaction(async (tx) => {
    await ms('SELECT 1 داخل tx ×۱۰', () => tx.$queryRawUnsafe('SELECT 1'), 10)
    await ms('pg_sleep(0.2) داخل tx ×۳', () => tx.$queryRawUnsafe('SELECT pg_sleep(0.2) AS z'), 3)
  })

  console.log('── ۳) تأخیر سرور خالص (pg_sleep 0.5 → اگر کل ≈ 0.5+RTT باشد) ──')
  await ms('pg_sleep(0.5) آزاد ×۳', () => db.$queryRawUnsafe('SELECT pg_sleep(0.5) AS z'), 3)

  console.log('── ۴) اتصال تازه PrismaClient (هزینه setup کامل) ──')
  {
    const t = performance.now()
    const c = new PrismaClient({ log: ['error'] })
    await c.$queryRawUnsafe('SELECT 1')
    console.log(`  کلاینت تازه → اولین SELECT 1: ${Math.round(performance.now() - t)}ms`)
    await c.$disconnect()
  }

  console.log('── ۵) ۵۰ پرس‌وجوی پیاپی آزاد (رفتار واقعی اپ) ──')
  {
    const t = performance.now()
    for (let i = 0; i < 50; i++) await db.$queryRawUnsafe('SELECT 1')
    console.log(`  ۵۰ SELECT 1 آزاد: مجموع ${Math.round(performance.now() - t)}ms (میانگین ${Math.round((performance.now() - t) / 50)}ms)`)
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
