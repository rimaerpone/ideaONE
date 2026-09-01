// گرم‌کردن/بازسازی ایندکس FTS روی Neon + دود-تست جستجوی تمام‌متن — بسته «لایه سوم ماندگاری»
// اجرا: bun scripts/warm-neon-fts.ts
import { PrismaClient } from '@prisma/client'
import { ensureLetterFtsWith, ftsLetterPageWith, buildLetterFtsMatch, type LetterFtsFilter } from '../src/modules/office-automation/fts-sql'

const db = new PrismaClient({ log: ['error'] })

async function main() {
  const t = performance.now()
  const ensure = await ensureLetterFtsWith(db)
  console.log(`ensure: ok=${ensure.ok} rebuilt=${ensure.rebuilt} indexed=${ensure.indexed} (${Math.round(performance.now() - t)}ms)`)
  if (!ensure.ok) process.exit(1)

  const companies = await db.company.findMany({ select: { id: true } })
  const filter: LetterFtsFilter = { companyIds: companies.map((c) => c.id) }
  const queries = ['استعلام', 'مهر', 'مكاتبات', '42', 'ذی‌ربط']
  for (const q of queries) {
    const match = buildLetterFtsMatch(q)
    if (!match) { console.log(`  «${q}» → توکن نامعتبر (عقب‌گرد contains)`); continue }
    const t1 = performance.now()
    const page = await ftsLetterPageWith(db, match, filter, 'createdAt', 'desc', 1, 20)
    const ids = await db.letter.findMany({ where: { id: { in: page.ids } }, select: { subject: true } })
    console.log(`  «${q}» (tsquery=${match}) → total=${page.total} (${Math.round(performance.now() - t1)}ms) · نمونه: ${ids.slice(0, 2).map((r) => (r.subject ?? '').slice(0, 40)).join(' | ')}`)
  }
  console.log('✓ ایندکس FTS روی Neon آماده است')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
