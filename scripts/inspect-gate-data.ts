// بررسی داده واقعی برای طراحی سنجه‌های گیت ۱ (P0-T23)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  const letters = await db.letter.findMany({
    select: {
      id: true, status: true, urgency: true, deadlineAt: true, createdAt: true,
      referrals: { select: { createdAt: true, action: true } },
    },
  })
  const withReferral = letters.filter((l) => l.referrals.length > 0).length
  const withDeadline = letters.filter((l) => l.deadlineAt)
  const deadlinePast = withDeadline.filter((l) => l.deadlineAt!.getTime() < Date.now())
  const archived = letters.filter((l) => l.status === 'ARCHIVED').length
  console.log('letters:', letters.length, '| withReferral:', withReferral, '| archived:', archived)
  console.log('withDeadline:', withDeadline.length, '| deadlinePast:', deadlinePast.length)
  for (const l of withDeadline.slice(0, 8)) {
    const acts = l.referrals.map((r) => `${r.action}@${r.createdAt.toISOString().slice(0, 10)}`)
    console.log(`  letter status=${l.status} deadline=${l.deadlineAt!.toISOString().slice(0, 10)} acts=[${acts.join(', ')}]`)
  }

  const docs = await db.warehouseDoc.findMany({ select: { status: true, type: true } })
  console.log('docs:', docs.length, docs.reduce((a, d) => ({ ...a, [d.status]: (a[d.status] ?? 0) + 1 }), {} as Record<string, number>))

  const reqs = await db.goodsRequest.findMany({ select: { status: true, createdAt: true, decidedAt: true } })
  const decided = reqs.filter((r) => r.decidedAt)
  const under24 = decided.filter((r) => r.decidedAt!.getTime() - r.createdAt.getTime() < 24 * 3600 * 1000)
  console.log('requests:', reqs.length, '| decided:', decided.length, '| under24h:', under24.length)
  for (const r of decided.slice(0, 6)) {
    console.log(`  req status=${r.status} created=${r.createdAt.toISOString().slice(0, 16)} decided=${r.decidedAt!.toISOString().slice(0, 16)} diffH=${((r.decidedAt!.getTime() - r.createdAt.getTime()) / 3600000).toFixed(1)}`)
  }

  const users = await db.user.findMany({ select: { id: true, isActive: true } })
  const activeUsers = users.filter((u) => u.isActive)
  const weekAgo = new Date(Date.now() - 7 * 86400000)
  const logs = await db.auditLog.findMany({ where: { createdAt: { gte: weekAgo } }, select: { userId: true, action: true } })
  const activeLast7d = new Set(logs.filter((l) => l.userId).map((l) => l.userId!))
  console.log('users:', users.length, '| active:', activeUsers.length, '| activeLast7d:', activeLast7d.size)

  const sessions = await db.session.findMany({ select: { userId: true, createdAt: true } })
  const recentSessions = new Set(sessions.filter((s) => s.createdAt.getTime() > weekAgo.getTime()).map((s) => s.userId))
  console.log('sessions recent 7d users:', recentSessions.size)

  const jobs = await db.scheduledJob.findMany()
  console.log('jobs:', jobs.map((j) => `${j.key}=${j.lastStatus}`))

  // رمزهای ضعیف شناخته‌شده
  const { timingSafeEqual } = await import('node:crypto')
  const scryptSync = (await import('node:crypto')).scryptSync
  const DEMO = ['admin123', '12345678', '123456', 'password']
  const allUsers = await db.user.findMany({ select: { username: true, passwordHash: true } })
  const weak: string[] = []
  for (const u of allUsers) {
    const [salt, hash] = u.passwordHash.split(':')
    if (!salt || !hash) continue
    const target = Buffer.from(hash, 'hex')
    for (const pw of DEMO) {
      const cand = scryptSync(pw, salt, 64)
      if (cand.length === target.length && timingSafeEqual(cand, target)) { weak.push(`${u.username}:${pw}`); break }
    }
  }
  console.log('weak demo passwords:', weak.length, weak.slice(0, 10))
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
