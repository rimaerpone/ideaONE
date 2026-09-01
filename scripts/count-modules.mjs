import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const total = await db.platformModule.count()
const layers = await db.platformModule.findMany({ select: { layer: true, code: true, status: true } })
const byLayer = layers.reduce((acc, m) => { acc[m.layer] = (acc[m.layer] || 0) + 1; return acc }, {})
const active = layers.filter(m => m.status === 'ACTIVE').map(m => m.code)
const menus = await db.moduleMenu.findMany({ select: { viewKey: true } })
console.log('TOTAL:', total, '| BY LAYER:', JSON.stringify(byLayer))
console.log('ACTIVE (' + active.length + '):', active.join(', '))
console.log('MENUS (' + menus.length + '):', menus.map(m => m.viewKey).join(', '))
console.log('DB ROWS:', JSON.stringify({
  users: await db.user.count(),
  companies: await db.company.count(),
  partners: await db.partner.count(),
  partnerKinds: (await db.partner.groupBy({ by: ['kind'], _count: { _all: true } })).map(g => g.kind + ':' + g._count._all).join(','),
  products: await db.product.count(),
  warehouses: await db.warehouse.count(),
  letters: await db.letter.count(),
  whdocs: await db.warehouseDoc.count(),
  requests: await db.goodsRequest.count(),
  audit: await db.auditLog.count(),
  codeSchemes: await db.codeScheme.count(),
  codeSegments: await db.codeSegment.count(),
  codeEnumValues: await db.codeEnumValue.count(),
}))
await db.$disconnect()
