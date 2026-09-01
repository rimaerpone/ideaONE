import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
for (const [label, fn] of [
  ['PlatformModule', () => db.platformModule.count()],
  ['ModuleActivation', () => db.moduleActivation.count()],
  ['WarehouseDoc', () => db.warehouseDoc.count()],
  ['DocItem', () => db.docItem.count()],
  ['GoodsRequest', () => db.goodsRequest.count()],
  ['GoodsRequestItem', () => db.goodsRequestItem.count()],
  ['LetterReferral', () => db.letterReferral.count()],
  ['Attachment', () => db.attachment.count()],
  ['OutboxEvent', () => db.outboxEvent.count()],
  ['ScheduledJob', () => db.scheduledJob.count()],
]) {
  try { console.log(`${label}: ${await fn()}`) } catch (e) { console.log(`${label}: ERR ${e.message.slice(0,80)}`) }
}
const companies = await db.company.findMany({ select: { code: true, name: true, type: true, isActive: true }, orderBy: { sortOrder: 'asc' } })
console.log('COMPANIES:', companies.map(c => `${c.code}(${c.type},${c.isActive ? 'on' : 'off'})`).join(' | '))
const users = await db.user.findMany({ select: { username: true, isAdmin: true, isActive: true } })
console.log('USERS:', users.map(u => `${u.username}${u.isAdmin ? '*admin' : ''}${u.isActive ? '' : '(off)'}`).join(', '))
const plugins = await db.platformModule.findMany({ orderBy: [{ tier: 'asc' }, { code: 'asc' }], select: { code: true, name: true, status: true, tier: true, isCore: true } })
console.log(`\nPLUGINS: ${plugins.length} total, ${plugins.filter(p => p.status === 'ACTIVE').length} ACTIVE`)
for (const p of plugins) console.log(`${p.tier.padEnd(13)} ${p.code.padEnd(22)} ${p.status.padEnd(8)} ${p.name}`)
await db.$disconnect()
