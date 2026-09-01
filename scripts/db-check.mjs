import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const counts = {}
for (const m of ['company','user','membership','session','pluginModule','companyPlugin','codeScheme','codeSegment','codeEnumValue','product','partner','warehouse','stockItem','stockMove','letter','letterAttachment','letterAction','requestDoc','requestItem','auditLog','notification','docCounter','knownDevice','aiInvocation','jobRun']) {
  try { counts[m] = await db[m].count() } catch { counts[m] = 'ERR' }
}
console.log(JSON.stringify(counts, null, 2))
const companies = await db.company.findMany({ select: { code: true, name: true, type: true, isActive: true }, orderBy: { sortOrder: 1 } })
console.log('COMPANIES:', JSON.stringify(companies))
const users = await db.user.findMany({ select: { username: true, fullName: true, isAdmin: true, isActive: true } })
console.log('USERS:', JSON.stringify(users))
const plugins = await db.pluginModule.findMany({ select: { code: true, name: true, status: true, tier: true }, orderBy: { tier: 1 } })
console.log('PLUGINS:', plugins.length, 'total;', plugins.filter(p=>p.status==='ACTIVE').length, 'active')
console.log(plugins.map(p => `${p.tier}:${p.code}:${p.status}`).join('\n'))
await db.$disconnect()
