// آزمون پشتیبانی FTS5 در موتور SQLite خود Prisma (P2-T5 — تصمیم معماری R8)
// اجرا: bun scripts/probe-prisma-fts5.ts   (روی کپی DB — فایل اصلی دست‌نخورده)
// چرا: سرور Next روی Node اجرا می‌شود → bun:sqlite در src قابل استفاده نیست؛
// فقط اگر موتور Prisma FTS5 داشته باشد، لایه FTS از مسیر $queryRawUnsafe ممکن است.
import { PrismaClient } from '@prisma/client'
import { copyFileSync } from 'node:fs'

const SRC = 'db/custom.db'
const COPY = '/tmp/fts-prisma-test.db'

async function main() {
  copyFileSync(SRC, COPY)
  const db = new PrismaClient({ datasources: { db: { url: `file:${COPY}` } } })
  try {
    // ۱) ساخت جدول مجازی FTS5
    await db.$executeRawUnsafe('CREATE VIRTUAL TABLE IF NOT EXISTS fts_probe USING fts5(a)')
    console.log('CREATE_FTS5: OK')

    // ۲) درج + جستجوی پیشوندی فارسی
    await db.$executeRawUnsafe("INSERT INTO fts_probe(a) VALUES ('سلام مهر ۱۴۰۵')")
    const r = await db.$queryRawUnsafe("SELECT a FROM fts_probe WHERE fts_probe MATCH 'مهر*'")
    console.log('MATCH_PREFIX:', JSON.stringify(r))

    // ۳) پارامتر bounded (فرم امن در برابر نویسه‌های خاص)
    const r2 = await db.$queryRawUnsafe('SELECT a FROM fts_probe WHERE fts_probe MATCH ?', 'مهر*')
    console.log('MATCH_PARAM:', JSON.stringify(r2))

    // ۴) تریگر روی Letter + درج واقعی از مسیر Prisma → آیا تریگر می‌پزد؟
    await db.$executeRawUnsafe(
      "CREATE TRIGGER IF NOT EXISTS probe_ai AFTER INSERT ON Letter BEGIN INSERT INTO fts_probe(a) VALUES (NEW.'subject'); END",
    )
    console.log('TRIGGER_CREATE: OK')
    const co = (await db.$queryRawUnsafe('SELECT id FROM Company LIMIT 1')) as { id: string }[]
    const us = (await db.$queryRawUnsafe('SELECT id FROM User LIMIT 1')) as { id: string }[]
    await db.$executeRawUnsafe(
      `INSERT INTO Letter (id, companyId, number, type, subject, body, confidentiality, urgency, status, creatorId, createdAt, updatedAt)
       VALUES ('probe1', ?, 99999, 'INTERNAL', 'تست تریگر مهر', 'بدنه', 'NORMAL', 'NORMAL', 'IN_PROGRESS', ?, datetime('now'), datetime('now'))`,
      co[0].id, us[0].id,
    )
    const t = (await db.$queryRawUnsafe("SELECT COUNT(*) AS c FROM fts_probe WHERE fts_probe MATCH 'تریگر*'")) as { c: number }[]
    console.log('TRIGGER_FIRED:', String(t[0] === null ? null : Number(t[0].c)))

    // ۵) پاکسازی رد آزمایش
    await db.$executeRawUnsafe("DELETE FROM Letter WHERE id = 'probe1'")
    const after = (await db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM Letter')) as { c: number }[]
    console.log('CLEANUP: letters =', Number(after[0].c))
  } catch (e) {
    console.log('PROBE_FAIL:', String(e).slice(0, 600))
  } finally {
    await db.$disconnect()
  }
}

main()
