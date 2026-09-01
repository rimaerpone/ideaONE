// ============================================================
// P1-T11 — راستی‌آزمایی نمایه‌ها با EXPLAIN (پورت Postgres/Neon — لایه سوم ماندگاری)
// اجرا: bun scripts/test-indexes.ts  (پس از seed:big یا مهاجرت + ANALYZE)
//
// معیار پذیرش: هیچ‌یک از مسیرهای طلایی «Seq Scan» نیست (جستجوی ایندکسی).
//  - ⚠ تفاوت مدل بهینه‌ساز: PG برای فیلتر «پرانتخابی» (مثلاً companyId IN ۴ از ۵ شرکت) + LIMIT عمداً
//    Seq Scan + Sort می‌زند — تصمیم صحیح است؛ برای سنجش «قابلیت ایندکس» آزمون با
//    SET enable_seqscan=off (داخل همان transaction — الزام PgBouncer transaction-mode)
//    اجرا می‌شود: این می‌سنجد ایندکس موجود/قابل استفاده است، نه انتخاب واقعی planner را.
//  - Bitmap Heap/Index Scan و Index Scan (Backward) = جستجوی ایندکسی ✓
//  - استثنای مستند: جمع‌های کامل StockItem — طبیعتاً پیمایش کامل؛ بودجه WAN دارد
// ============================================================
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL'
  if (!cond) failures += 1
  console.log(`[${mark}] ${name}${extra ? ` — ${extra}` : ''}`)
}

type PlanRow = { 'QUERY PLAN': string }

async function explain(sql: string): Promise<string[]> {
  // SET باید با EXPLAIN در «همان» transaction باشد — زیر PgBouncer transaction-mode اتصال بین statement ها عوض می‌شود
  const rows = await db.$transaction([
    db.$executeRawUnsafe('SET LOCAL enable_seqscan = off'),
    db.$queryRawUnsafe<PlanRow[]>(`EXPLAIN (COSTS OFF) ${sql}`),
  ])
  const planRows = rows[1] as PlanRow[]
  return planRows.map((r) => r['QUERY PLAN'])
}

/** آیا مسیر، پیمایش کامل جدول هدف است؟ (Postgres: «Seq Scan on "Table"») */
function isFullScan(details: string[], table: string): boolean {
  return details.some((d) => new RegExp(`Seq Scan on "${table}"`).test(d))
}

async function main() {
  console.log('── P1-T11: راستی‌آزمایی EXPLAIN روی مسیرهای طلایی (Postgres/Neon) ──\n')

  // داده واقعی برای پارامترها
  const companies = await db.company.findMany({ where: { type: 'COMPANY' }, select: { id: true } })
  const ids = companies.map((c) => `'${c.id}'`).join(', ')
  const admin = await db.user.findUnique({ where: { username: 'admin' } })
  const aUser = await db.user.findFirst({ where: { isActive: true } })
  const aLetter = await db.letter.findFirst({ select: { id: true, creatorId: true } })
  const aDoc = await db.warehouseDoc.findFirst({ select: { id: true } })
  const sampleDocIds = (await db.warehouseDoc.findMany({ select: { id: true }, take: 15 })).map((d) => `'${d.id}'`).join(', ')
  if (!admin || !aUser || !aLetter || !aDoc) throw new Error('داده seed موجود نیست — seed + seed:big یا migrate-neon اجرا کنید')

  // جدول‌های کوچک: planner عمداً Seq Scan می‌زند (بهینه) — مستند و مجاز
  const SMALL = new Set(['Membership', 'Session', 'KnownDevice', 'Partner', 'OutboxEvent', 'FeatureFlag', 'Company'])

  type Case = { name: string; table: string; sql: string }
  const CASES: Case[] = [
    {
      name: 'نامه — فهرست صفحه ۱ (شرکت‌ها + جدیدترین)',
      table: 'Letter',
      sql: `SELECT id FROM "Letter" WHERE "companyId" IN (${ids}) ORDER BY "createdAt" DESC LIMIT 15 OFFSET 0`,
    },
    {
      name: 'نامه — فیلتر نوع+وضعیت',
      table: 'Letter',
      sql: `SELECT id FROM "Letter" WHERE "companyId" IN (${ids}) AND type='INCOMING' AND status='IN_PROGRESS' ORDER BY "createdAt" DESC LIMIT 15`,
    },
    {
      name: 'نامه — کارتابل من (نگه‌دارنده)',
      table: 'Letter',
      sql: `SELECT id FROM "Letter" WHERE "companyId" IN (${ids}) AND "currentHolderId"='${aUser!.id}' ORDER BY "createdAt" DESC LIMIT 15`,
    },
    {
      name: 'نامه — شمارش داشبورد (نگه‌دارنده+وضعیت)',
      table: 'Letter',
      sql: `SELECT COUNT(*) FROM "Letter" WHERE "companyId" IN (${ids}) AND "currentHolderId"='${aUser!.id}' AND status='IN_PROGRESS'`,
    },
    {
      name: 'نامه — صادره‌های من',
      table: 'Letter',
      sql: `SELECT id FROM "Letter" WHERE "companyId" IN (${ids}) AND "creatorId"='${aUser!.id}' ORDER BY "createdAt" DESC LIMIT 15`,
    },
    {
      name: 'سند — فهرست صفحه ۱ (شرکت + تاریخ/شماره)',
      table: 'WarehouseDoc',
      sql: `SELECT id FROM "WarehouseDoc" WHERE "companyId" IN (${ids}) ORDER BY "docDate" DESC, "docNumber" DESC LIMIT 15 OFFSET 0`,
    },
    {
      name: 'سند — فیلتر نوع+وضعیت',
      table: 'WarehouseDoc',
      sql: `SELECT id FROM "WarehouseDoc" WHERE "companyId" IN (${ids}) AND type='ISSUE' AND status='POSTED' ORDER BY "docDate" DESC, "docNumber" DESC LIMIT 15`,
    },
    {
      name: 'سند — فیلتر انبار',
      table: 'WarehouseDoc',
      sql: `SELECT id FROM "WarehouseDoc" WHERE "warehouseId"='${aDoc!.id}' ORDER BY "docDate" DESC LIMIT 15`,
    },
    {
      name: 'قلم سند — include فهرست (docId IN)',
      table: 'DocItem',
      sql: `SELECT id, "docId" FROM "DocItem" WHERE "docId" IN (${sampleDocIds})`,
    },
    {
      name: 'درخواست — فهرست (شرکت + جدیدترین)',
      table: 'GoodsRequest',
      sql: `SELECT id FROM "GoodsRequest" WHERE "companyId" IN (${ids}) ORDER BY "createdAt" DESC LIMIT 30 OFFSET 0`,
    },
    {
      name: 'درخواست — شمارش در انتظار داشبورد',
      table: 'GoodsRequest',
      sql: `SELECT COUNT(*) FROM "GoodsRequest" WHERE "companyId" IN (${ids}) AND status='PENDING'`,
    },
    {
      name: 'اعلان — ۳۰ اعلان آخر کاربر',
      table: 'Notification',
      sql: `SELECT id FROM "Notification" WHERE "userId"='${admin.id}' ORDER BY "createdAt" DESC LIMIT 30`,
    },
    {
      name: 'سجل — فهرست حسابرسی (شرکت + جدیدترین)',
      table: 'AuditLog',
      sql: `SELECT id FROM "AuditLog" WHERE "companyId" IN (${ids}) ORDER BY "createdAt" DESC LIMIT 60 OFFSET 0`,
    },
    {
      name: 'سجل — ورودهای ناموفق (action+جدیدترین)',
      table: 'AuditLog',
      sql: `SELECT id FROM "AuditLog" WHERE action='LOGIN_FAILED' ORDER BY "createdAt" DESC LIMIT 20`,
    },
    {
      name: 'سجل — فعالیت کاربر',
      table: 'AuditLog',
      sql: `SELECT id FROM "AuditLog" WHERE "userId"='${admin.id}' ORDER BY "createdAt" DESC LIMIT 60`,
    },
    {
      name: 'ارجاع — سلسله ارجاع‌های نامه',
      table: 'LetterReferral',
      sql: `SELECT id FROM "LetterReferral" WHERE "letterId"='${aLetter!.id}' ORDER BY "createdAt" ASC`,
    },
    {
      name: 'نشست — دستگاه‌های فعال کاربر',
      table: 'Session',
      sql: `SELECT id FROM "Session" WHERE "userId"='${admin.id}' AND "expiresAt" > now() ORDER BY "lastSeenAt" DESC`,
    },
    {
      name: 'عضویت — کاربران یک شرکت',
      table: 'Membership',
      sql: `SELECT id FROM "Membership" WHERE "companyId"='${companies[0].id}'`,
    },
    {
      name: 'رویداد — برداشت پردازشگر outbox',
      table: 'OutboxEvent',
      sql: `SELECT id FROM "OutboxEvent" WHERE "processedAt" IS NULL ORDER BY "createdAt" ASC LIMIT 100`,
    },
  ]

  for (const c of CASES) {
    const details = await explain(c.sql)
    const scan = isFullScan(details, c.table)
    const plan = details.join(' | ')
    check(c.name, !scan || SMALL.has(c.table), (!scan || SMALL.has(c.table)) ? plan : `پیمایش کامل! ${plan}`)
  }

  // استثنای مستند: جمع کامل StockItem (طبیعتاً پیمایش کامل) — بودجه WAN Neon (~RTT ۲۲۰ms)
  const t0 = performance.now()
  await db.$queryRawUnsafe(`SELECT grade, SUM("qtyM2") FROM "StockItem" WHERE "qtyM2" != 0 GROUP BY grade`)
  const aggMs = Math.round(performance.now() - t0)
  check('موجودی — جمع کامل درجه‌ها (استثنای مستند: پیمایش کامل با بودجه WAN < ۲۰۰۰ms)', aggMs < 2000, `${aggMs}ms`)

  // شمارش ایندکس‌های ایجادشده (Postgres)
  const idxCount = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) as n FROM pg_indexes WHERE schemaname='public'`)
  console.log(`\nایندکس‌های فعال دیتابیس: ${idxCount[0].n}`)

  if (failures > 0) {
    console.error(`\n${failures} مسیر رد شد`)
    process.exit(1)
  }
  console.log('\nهمه مسیرهای طلایی ایندکسی‌اند ✔')
}

main()
  .catch((e) => { console.error('خطای تست ایندکس:', e); process.exit(1) })
  .finally(() => db.$disconnect())
