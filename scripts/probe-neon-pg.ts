// پروب رفتار Prisma + Postgres روی Neon — پیش از پورت fts-sql (بسته لایه سوم ماندگاری)
// اجرا: bun scripts/probe-neon-pg.ts
// پاسخ‌گوی: DDL خام · INSERT پارامتری $n · دسته بزرگ (pgbouncer) · $transaction ·
// tsvector/tsquery فارسی · رفتار «شماره/سال» · توکن‌های or/and · DDL واقعی letter_fts + GIN + MATCH
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient({ log: ['error'] })
let pass = 0
let fail = 0
const check = (name: string, ok: boolean, extra = '') => {
  ok ? pass++ : fail++
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`)
}

async function main() {
  console.log('── A) اتصال/نسخه/موتور ──')
  const ver = (await db.$queryRawUnsafe('SELECT version() AS v, current_database() AS d')) as { v: string; d: string }[]
  check('نسخه Postgres', ver.length === 1, `${ver[0].v.split(',')[0]} · db=${ver[0].d}`)

  console.log('── B) DDL خام از مسیر کلاینت (بدون پارامتر) ──')
  await db.$executeRawUnsafe('DROP TABLE IF EXISTS _probe_raw')
  await db.$executeRawUnsafe('CREATE TABLE _probe_raw (id INT, t TEXT, b BOOLEAN, ts TIMESTAMPTZ)')
  check('CREATE/DROP TABLE خام', true)

  console.log('── C) پارامتر $n + PgBouncer (transaction pooling) ──')
  let t = performance.now()
  await db.$executeRawUnsafe('INSERT INTO _probe_raw (id, t, b, ts) VALUES ($1, $2, $3, $4)', 1, 'سلام', true, new Date())
  check('INSERT پارامتری $n', true, `${Math.round(performance.now() - t)}ms`)
  const rows = Array.from({ length: 500 }, (_, i) => [1000 + i, `ردیف ${i}`, i % 2 === 0, new Date()])
  const ph = rows.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(', ')
  t = performance.now()
  await db.$executeRawUnsafe(`INSERT INTO _probe_raw (id, t, b, ts) VALUES ${ph}`, ...rows.flat())
  check('دسته ۵۰۰×۴=۲۰۰۰ پارامتر', true, `${Math.round(performance.now() - t)}ms`)
  const got = (await db.$queryRawUnsafe('SELECT id, t, b, ts FROM _probe_raw WHERE id = $1', 1)) as { id: number; t: string; b: boolean; ts: Date }[]
  check('SELECT پارامتری + نگاشت نوع (Boolean/Date)', got.length === 1 && got[0].b === true && got[0].ts instanceof Date, `ts=${got[0]?.ts?.toISOString?.()}`)
  await db.$transaction([
    db.$executeRawUnsafe('INSERT INTO _probe_raw (id, t) VALUES ($1, $2)', 5000, 'tx'),
    db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM _probe_raw'),
  ])
  check('$transaction آرایه‌ای روی pooler', true)
  const cnt = (await db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM _probe_raw')) as { c: bigint }[]
  check('COUNT → bigint', typeof cnt[0].c === 'bigint', `${cnt[0].c}`)

  console.log('── C2) تأخیر پایدار (۵ SELECT پیاپی از یک اتصال pool) ──')
  for (let i = 0; i < 5; i++) {
    t = performance.now()
    await db.$queryRawUnsafe('SELECT 1')
    console.log(`  SELECT 1 → ${Math.round(performance.now() - t)}ms`)
  }

  console.log('── D) توکنایز متن فارسی (config=simple) ──')
  const tv = (p: string) => db.$queryRawUnsafe(`SELECT to_tsvector('simple', $1)::TEXT AS v`, p) as Promise<{ v: string }[]>
  const show = async (s: string) => console.log(`  to_tsvector(${JSON.stringify(s)}) = ${(await tv(s))[0].v}`)
  await show('سلام دنیا استعلام')
  await show('نامه‌ی مکاتبات ذی‌ربط')
  await show('1405/2655')
  await show('قيمت كاشي ي')

  console.log('── E) tsquery: پیشوند، رقم دقیق، توکن or/and ──')
  const tq = (q: string) => db.$queryRawUnsafe(`SELECT to_tsquery('simple', $1)::TEXT AS q`, q) as Promise<{ q: string }[]>
  const tryTq = async (q: string) => {
    try { return (await tq(q))[0].q } catch (e) { return `خطا: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}` }
  }
  console.log(`  to_tsquery('مهر:* & استعلام:*') = ${await tryTq('مهر:* & استعلام:*')}`)
  console.log(`  to_tsquery('42') = ${await tryTq('42')}`)
  console.log(`  to_tsquery('1405 & 2655') = ${await tryTq('1405 & 2655')}`)
  console.log(`  to_tsquery('or:*') = ${await tryTq('or:*')}`)
  console.log(`  to_tsquery('and:*') = ${await tryTq('and:*')}`)
  console.log(`  to_tsquery('or') = ${await tryTq('or')}`)
  const m = (await db.$queryRawUnsafe(
    `SELECT to_tsvector('simple', $1) @@ to_tsquery('simple', $2) AS m, to_tsvector('simple', $3) @@ to_tsquery('simple', $2) AS m2`,
    'نامه مهر registry', 'مهر:*', 'مهرداد امهری',
  )) as { m: boolean; m2: boolean }[]
  check('@@ پیشوند (مهر:* ↔ مهر✓ / مهرداد✓ / امهری؟)', m[0].m === true, `m=${m[0].m} m2(پیشوند=درون‌واژه)=${m[0].m2}`)
  const ex = (await db.$queryRawUnsafe(
    `SELECT to_tsvector('simple', $1) @@ to_tsquery('simple', $2) AS a, to_tsvector('simple', $1) @@ to_tsquery('simple', $3) AS b`,
    'شماره 42 و 424', '42', '424',
  )) as { a: boolean; b: boolean }[]
  check('رقم دقیق: 42≠424', ex[0].a === true && ex[0].b === true, `42→${ex[0].a} 424→${ex[0].b} (هر دو واژه موجودند)`)

  console.log('── F) DDL واقعی letter_fts (tsvector STORED + GIN) + MATCH ──')
  await db.$executeRawUnsafe('DROP TABLE IF EXISTS letter_fts')
  await db.$executeRawUnsafe(`CREATE TABLE letter_fts (
  "letterId" TEXT PRIMARY KEY,
  subject TEXT, body TEXT, sender TEXT, receiver TEXT, "numText" TEXT,
  fts tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(subject, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(body, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(sender, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(receiver, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce("numText", '')), 'D')
  ) STORED)`)
  await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS letter_fts_gin ON letter_fts USING GIN (fts)')
  check('CREATE TABLE + GIN index', true)
  const ins = [
    ['L1', 'استعلام قیمت کاشی', 'متن نامه درباره قیمت', 'پارس سرامیک', 'مرکزی', '1405 42'],
    ['L2', 'مکاتبات اداری', 'نامه مرجع', 'دفتر مرکزی', 'نیلو', '1405 2655'],
  ]
  await db.$executeRawUnsafe('INSERT INTO letter_fts ("letterId", subject, body, sender, receiver, "numText") VALUES ($1,$2,$3,$4,$5,$6), ($7,$8,$9,$10,$11,$12)', ...ins.flat())
  const hits = (q: string) => db.$queryRawUnsafe(
    `SELECT "letterId" FROM letter_fts WHERE fts @@ to_tsquery('simple', $1) ORDER BY "letterId"`, q,
  ) as Promise<{ letterId: string }[]>
  check('MATCH «استعلام:* & قیمت:*»', (await hits('استعلام:* & قیمت:*')).map((r) => r.letterId).join(',') === 'L1')
  check('MATCH «مکاتبات:*»', (await hits('مکاتبات:*')).map((r) => r.letterId).join(',') === 'L2')
  check('MATCH رقم «2655» (فقط L2)', (await hits('2655')).map((r) => r.letterId).join(',') === 'L2')
  check('MATCH «42» (فقط L1 — نه 424/142)', (await hits('42')).map((r) => r.letterId).join(',') === 'L1')
  const plan = (await db.$queryRawUnsafe(
    `EXPLAIN (COSTS OFF) SELECT "letterId" FROM letter_fts WHERE fts @@ to_tsquery('simple', $1)`, 'مهر:*',
  )) as { 'QUERY PLAN': string }[]
  const planText = plan.map((r) => r['QUERY PLAN']).join(' | ')
  check('EXPLAIN: استفاده از GIN', /Bitmap Index Scan|letter_fts_gin/.test(planText), planText.slice(0, 120))
  for (let i = 0; i < 3; i++) {
    t = performance.now()
    await hits('استعلام:* & قیمت:*')
    console.log(`  MATCH گرم #${i + 1}: ${Math.round(performance.now() - t)}ms`)
  }

  await db.$executeRawUnsafe('DELETE FROM letter_fts')
  await db.$executeRawUnsafe('DROP TABLE letter_fts')
  await db.$executeRawUnsafe('DROP TABLE _probe_raw')
  console.log('── پاک‌سازی پروب انجام شد ──')

  console.log(`\nنتیجه: ${pass} پاس · ${fail} خطا`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('پروب شکست خورد:', e); process.exit(1) }).finally(() => db.$disconnect())
