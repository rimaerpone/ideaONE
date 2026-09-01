import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const companies = await db.company.findMany({ select: { code: true, name: true, type: true }, orderBy: { sortOrder: 'asc' } })
console.log('COMPANIES:', companies.map(c => `${c.code}(${c.type})`).join(' | '))
const users = await db.user.findMany({ select: { username: true, isAdmin: true }, orderBy: { username: 'asc' } })
console.log('USERS:', users.map(u => `${u.username}${u.isAdmin ? '*' : ''}`).join(', '))
const plugins = await db.platformModule.findMany({ orderBy: [{ tier: 'asc' }, { code: 'asc' }], select: { code: true, name: true, status: true, tier: true } })
console.log(`\nPLUGIN REGISTRY: ${plugins.length} total, ${plugins.filter(p => p.status === 'ACTIVE').length} ACTIVE, ${plugins.filter(p => p.status !== 'ACTIVE').length} off`)
for (const p of plugins) console.log(`  ${p.tier.padEnd(13)} ${p.code.padEnd(24)} ${p.status.padEnd(8)} ${p.name}`)
// seed vs real: check date distribution of letters
const letterDates = await db.$queryRaw`SELECT date_trunc('day', "createdAt") AS d, count(*) AS c FROM "Letter" GROUP BY 1 ORDER BY 1 DESC LIMIT 8`
console.log('\nLETTERS BY DAY (recent):', JSON.stringify(letterDates))
const ai = await db.aiInvocation.groupBy({ by: ['action'], _count: true })
console.log('AI INVOCATIONS BY ACTION:', JSON.stringify(ai))
const audits = await db.auditLog.groupBy({ by: ['action'], _count: true, orderBy: { _count: { action: 'desc' } } })
console.log('AUDIT ACTIONS (top 15):', JSON.stringify(audits.slice(0, 15)))
await db.$disconnect()
