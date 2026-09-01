import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const stockDates = await db.$queryRaw`SELECT date_trunc('week', "docDate") AS w, count(*) AS c FROM "WarehouseDoc" GROUP BY 1 ORDER BY 1 DESC LIMIT 6`
console.log('WHDOCS BY WEEK (docDate):', stockDates.map(r => `${r.w ? new Date(r.w).toISOString().slice(0,10) : 'null'}:${r.c}`).join(' | '))
const ai = await db.aiInvocation.groupBy({ by: ['action'], _count: { _all: true } })
console.log('AI INVOCATIONS:', ai.map(a => `${a.action}:${a._count._all}`).join(' | '))
const audits = await db.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { _count: { action: 'desc' } } })
console.log('AUDIT top12:', audits.slice(0, 12).map(a => `${a.action}:${a._count._all}`).join(' | '))
const jobs = await db.scheduledJob.findMany({ select: { code: true, status: true } })
console.log('JOBS:', jobs.map(j => `${j.code}/${j.status}`).join(', '))
const aiRecent = await db.$queryRaw`SELECT action, count(*) c FROM "AiInvocation" WHERE "createdAt" > now() - interval '7 days' GROUP BY 1`
console.log('AI last 7d:', JSON.stringify(aiRecent))
const sessions = await db.$queryRaw`SELECT count(*)::int c FROM "Session" WHERE "expiresAt" > now()`
console.log('LIVE SESSIONS:', sessions[0].c)
await db.$disconnect()
