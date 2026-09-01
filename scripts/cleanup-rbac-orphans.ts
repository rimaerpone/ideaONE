// پاک‌سازی یک‌باره کاربران/داده‌های یتیم اجراهای قبلی تست RBAC
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  const users = await db.user.findMany({ where: { username: { contains: 't.rbac.' } }, select: { id: true, username: true } })
  console.log(`پاک‌سازی ${users.length} کاربر یتیم...`)
  for (const u of users) {
    await db.goodsRequestItem.deleteMany({ where: { request: { requesterId: u.id } } })
    await db.goodsRequest.deleteMany({ where: { requesterId: u.id } })
    await db.knownDevice.deleteMany({ where: { userId: u.id } })
    await db.notification.deleteMany({ where: { userId: u.id } })
    await db.session.deleteMany({ where: { userId: u.id } })
    await db.membership.deleteMany({ where: { userId: u.id } })
    await db.auditLog.deleteMany({ where: { userId: u.id } })
    await db.user.delete({ where: { id: u.id } })
  }
  // تنظیمات آزمایشی باقی‌مانده
  const settings = await db.companySetting.deleteMany({ where: { key: { startsWith: 'requests.' } } })
  console.log(`تنظیمات آزمایشی حذف‌شده: ${settings.count}`)
  // اطمینان: همه ماژول‌های عملیاتی فعال
  await db.platformModule.updateMany({ where: { code: { in: ['office-automation', 'warehouse', 'products', 'partners'] } }, data: { status: 'ACTIVE' } })
  const leftover = await db.user.count({ where: { username: { contains: 't.rbac.' } } })
  console.log(`باقی‌مانده: ${leftover} کاربر`)
  await db.$disconnect()
}

main()
