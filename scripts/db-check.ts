// بررسی وضعیت نشست‌ها و تلاش‌های ورود برای عیب‌یابی مشکل لاگین
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  console.log('=== آخرین رویدادهای ورود (AuditLog) ===')
  const logs = await db.auditLog.findMany({
    where: { action: { contains: 'LOGIN' } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  for (const l of logs) {
    console.log(
      `[${l.createdAt.toISOString()}] ${l.action} — ${l.details ?? ''}`
    )
  }

  console.log('\n=== نشست‌های فعال ===')
  const sessions = await db.session.findMany({
    orderBy: { expiresAt: 'desc' },
    take: 10,
    include: { user: { select: { username: true } } },
  })
  for (const s of sessions) {
    console.log(
      `${s.id} | user=${s.user.username} | expires=${s.expiresAt.toISOString()} | company=${s.companyId ?? '—'}`
    )
  }

  console.log('\n=== کاربران ===')
  const users = await db.user.findMany({
    select: { username: true, isActive: true, isAdmin: true },
    orderBy: { username: 'asc' },
  })
  for (const u of users) {
    console.log(`${u.username} | active=${u.isActive} | admin=${u.isAdmin}`)
  }

  // آمار کلی اعلان‌های خوانده‌نشده برای ادمین
  console.log('\n=== تعداد کل نشست‌ها ===', await db.session.count())
}

main()
  .catch((e) => {
    console.error('ERROR:', e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
