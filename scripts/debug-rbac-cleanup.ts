// ادامه اشکال‌زدایی — درخواست‌های یتیم و جزئیات
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  const users = await db.user.findMany({ where: { username: { contains: 't.rbac.' } }, select: { id: true, username: true } })
  const uids = users.map((u) => u.id)
  const reqs = await db.goodsRequest.findMany({
    where: { requesterId: { in: uids } },
    select: { id: true, reqNumber: true, neededFor: true, requesterId: true, createdAt: true },
  })
  console.log('درخواست‌های یتیم:', reqs.length)
  for (const r of reqs) {
    const owner = users.find((u) => u.id === r.requesterId)?.username
    const itemCount = await db.goodsRequestItem.count({ where: { requestId: r.id } })
    console.log(`  #${r.reqNumber} «${r.neededFor}» توسط ${owner} — ${itemCount} قلم — ${r.createdAt.toISOString()}`)
  }
  await db.$disconnect()
}

main()
