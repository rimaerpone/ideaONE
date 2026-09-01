import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const jobs = await db.scheduledJob.findMany({ select: { key: true, name: true, enabled: true, intervalSec: true, lastStatus: true } })
console.log('JOBS:', jobs.map(j => `${j.key}(${j.name},${j.enabled ? 'on' : 'off'},${j.intervalSec}s,${j.lastStatus ?? '-'}).join(' | ')`)
const aiRecent = await db.$queryRaw`SELECT task, count(*)::int c FROM "AiInvocation" WHERE "createdAt" > now() - interval '3 days' GROUP BY 1`
console.log('AI last 3d:', aiRecent.map(a => `${a.task}:${a.c}`).join(' | ') || 'none')
const sessions = await db.$queryRaw`SELECT count(*)::int c FROM "Session" WHERE "expiresAt" > now()`
console.log('LIVE SESSIONS:', sessions[0].c)
const letRecent = await db.$queryRaw`SELECT "createdById", count(*)::int c FROM "Letter" WHERE "createdAt" > now() - interval '2 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 5`
console.log('LETTER AUTHORS last 2d:', letRecent.map(r => `${r.createdById}:${r.c}`).join(' | '))
const modulesView = await db.moduleActivation.groupBy({ by: ['companyId'], _count: { _all: true } })
console.log('ACTIVATIONS per company:', JSON.stringify(modulesView))
await db.$disconnect()
