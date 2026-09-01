// دامپ کامل رجیستری ماژول‌ها برای ماتریس traceability (فقط-خواندن)
// مصرف: unset DATABASE_URL; set -a; source .env; set +a; node scripts/db-registry-dump.mjs
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const rows = await db.platformModule.findMany({
  select: { code: true, name: true, status: true, layer: true, domain: true, targetPhase: true },
  orderBy: [{ layer: 'asc' }, { code: 'asc' }],
})
for (const r of rows) {
  console.log([
    r.layer.padEnd(13),
    r.code.padEnd(24),
    (r.name || '-').padEnd(28),
    r.status.padEnd(10),
    (r.domain || '-').padEnd(14),
    r.targetPhase || '-',
  ].join(' | '))
}
console.log('TOTAL:', rows.length)
await db.$disconnect()
