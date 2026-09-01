// فشرده‌سازی دیتابیس — ابزار دوره SQLite (درس ۳۵)
// اجرا: bun scripts/vacuum-db.ts   ⚠️ با سرور روشن = مرگ سرور (VACUUM inode را بازنویسی می‌کند)؛
// بعدش احیای double-fork طبق RB-01 لازم است. با سرور خاموش امن‌تر است.
//
// لایه سوم ماندگاری (Neon): دیتابیس زنده دیگر SQLite محلی نیست — VACUUM فایل محلی
// منسوخ شده؛ نگهداری Postgres بر عهده Neon است (VACUUM خودکار). این ابزار فقط برای
// بازگردانی/بازیافت آرشیو SQLite (بازگردانی snapshot → فشرده‌سازی → مهاجرت مجدد) کاربرد دارد.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
try {
  if (process.env.DATABASE_URL?.startsWith('postgres')) {
    console.log('منبع فعلی Postgres/Neon است — VACUUM محلی منسوخ (نگهداری خودکار Neon). خروج.')
    process.exit(0)
  }
  await db.$executeRawUnsafe('VACUUM')
  console.log('VACUUM OK')
} catch (e) { console.log('VACUUM FAIL:', String(e).slice(0, 150)) }
finally { await db.$disconnect() }
