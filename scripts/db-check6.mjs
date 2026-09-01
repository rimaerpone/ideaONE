import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const ai = await db.$queryRaw`SELECT action, count(*)::int c FROM "AiInvocation" GROUP BY 1 ORDER BY 2 DESC`
console.log('AI INVOCATIONS:', ai.map(a => `${a.action}:${a.c}`).join(' | '))
const audits = await db.$queryRaw`SELECT action, count(*)::int c FROM "AuditLog" GROUP BY 1 ORDER BY 2 DESC LIMIT 14`
console.log('AUDIT top14:', audits.map(a => `${a.action}:${a.c}`).join(' | '))
const jobs = await db.scheduledJob.findMany({ select: { code: true, status: true } })
console.log('JOBS:', jobs.map(j => `${j.code}/${j.status}`).join(', '))
const aiRecent = await db.$queryRaw`SELECT action, count(*)::int c FROM "AiInvocation" WHERE "createdAt" > now() - interval '7 days' GROUP BY 1`
console.log('AI last 7d:', aiRecent.map(a => `${a.action}:${a.c}`).join(' | ') || 'none')
const sessions = await db.$queryRaw`SELECT count(*)::int c FROM "Session" WHERE "expiresAt" > now()`
console.log('LIVE SESSIONS:', sessions[0].c)
const aiSample = await db.aiInvocation.findMany({ take: 3, orderBy: { createdAt: 'desc' }, select: { action: true, ok: true, durationMs: true, createdAt: true } })
console.log('AI SAMPLE:', JSON.stringify(aiSample))
await db.$disconnect()
