import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const plugins = await db.platformModule.findMany({ orderBy: [{ layer: 'asc' }, { code: 'asc' }], select: { code: true, name: true, status: true, layer: true, domain: true, targetPhase: true } })
console.log(`PLUGIN REGISTRY: ${plugins.length} total, ${plugins.filter(p => p.status === 'ACTIVE').length} ACTIVE`)
for (const p of plugins) console.log(`  ${p.layer.padEnd(13)} ${p.code.padEnd(24)} ${p.status.padEnd(9)} P:${p.targetPhase.padEnd(5)} ${p.name}`)
const letterDates = await db.$queryRaw`SELECT date_trunc('day', "createdAt") AS d, count(*) AS c FROM "Letter" GROUP BY 1 ORDER BY 1 DESC LIMIT 6`
console.log('\nLETTERS BY DAY (newest):', letterDates.map(r => `${new Date(r.d).toISOString().slice(0,10)}:${r.c}`).join(' | '))
const stockDates = await db.$queryRaw`SELECT date_trunc('week', "createdAt") AS w, count(*) AS c FROM "WarehouseDoc" GROUP BY 1 ORDER BY 1 DESC LIMIT 6`
console.log('WHDOCS BY WEEK (newest):', stockDates.map(r => `${new Date(r.w).toISOString().slice(0,10)}:${r.c}`).join(' | '))
const ai = await db.aiInvocation.groupBy({ by: ['action'], _count: { _all: true } })
console.log('\nAI INVOCATIONS:', ai.map(a => `${a.action}:${a._count._all}`).join(' | '))
const audits = await db.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { _count: { action: 'desc' } } })
console.log('AUDIT (top 12):', audits.slice(0, 12).map(a => `${a.action}:${a._count._all}`).join(' | '))
const jobs = await db.scheduledJob.findMany({ select: { code: true, status: true, cron: true } })
console.log('\nSCHEDULED JOBS:', JSON.stringify(jobs))
await db.$disconnect()
