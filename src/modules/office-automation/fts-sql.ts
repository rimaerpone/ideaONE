/**
 * SQL مشترک جستجوی تمام‌متن نامه‌ها (P2-T5 / R8 → پورت Postgres در بسته «لایه سوم ماندگاری Neon»)
 *
 * جدول `letter_fts` **خارج Prisma** است:
 *  - Prisma آن را در introspection می‌بیند و `prisma migrate/db push` آن را DROP می‌کند — عمداً پذیرفته‌شده:
 *    داده مشتق‌شده است؛ پس از db push طبق رأی‌العمل (احیای سرور) قلاب بوت ensureLetterFts بازمی‌سازد و
 *    هر جستجو هم ensure دارد؛ چک CH-25 این جدول/ایندکس را از دریفت مستثنا کرده (scripts/check.ts).
 *  - روی Postgres: جدول معمولی + ستون tsvector تولیدی (GENERATED ALWAYS … STORED) از پنج ستون متنی
 *    + ایندکس GIN — `to_tsvector('simple', …)` بدون ریشه‌یابی؛ نرمال‌سازی واریانت‌ها (ك/ي، ارقام، ZWNJ)
 *    خود ما در normalizeFaText انجام می‌شود و «هر دو طرف» (ایندکس و پرس‌وجو) یکسان‌اند.
 *
 * سینک = سطح اپلیکیشن + خودترمیم (نه تریگر):
 *  - ستون‌های ایندکس‌شده فقط هنگام «ثبت نامه» تغییر می‌کنند → قلاب upsert در createLetter کافی است.
 *  - drift با ensure شمارشی خودترمیم می‌شود: count(letter_fts) ≠ count(Letter) → rebuild.
 *  - ensure با کش ۶۰ث (RTT شبکه): جستجوهای پیاپی هزینه دو COUNT نمی‌پردازند؛ اولین جستجو/بوت تازه می‌کند.
 *
 * پرس‌وجو (هم‌ارز معنایی نسخه FTS5):
 *  - توکن حرفی ≥۲ نویسه → پیشوند `توکن:*` · توکن تمام‌رقم → دقیق بدون `:*` (۴۲ ≠ ۴۲۴)
 *  - «شماره نمایشی سال/شماره»: در numText جداکننده «/» به فاصله تبدیل می‌شود — توکنایز PG
 *    «1405/2655» را یک تک‌واژه می‌بیند (برخلاف FTS5)؛ با فاصله، دو تک‌واژه ۱۴۰۵ و ۲۶۵۵ شکل می‌گیرد
 *    و پرس‌وجوی «۱۴۰۵/۲۶۵۵» (که خودش به توکن‌های ۱۴۰۵ و ۲۶۵۵ تجزیه می‌شود) همان ردیف را می‌یابد.
 *  - تزریق‌ناپذیری: توکن‌های faSearchTokens فقط الفبایی/رقمی‌اند؛ رشته tsquery تولیدی فقط شامل
 *    واژه‌ها، `:*` و جداکننده « & » است — `to_tsquery` هرگز عملگر/نقل‌قول/پرانتز نمی‌بیند
 *    (واژه‌های and/or هم در tsquery «معنادار» نیستند — مثل FTS5 فقط واژه‌اند؛ در پروب اثبات شد).
 *  - prepared statement: همه مقادیر با پارامتر $n — بدون الحاق رشته.
 *
 * «مشترک»: هم سرور (fts.ts با db سرور) هم اسکریپت‌ها (seed/seed-big با PrismaClient خودشان) import می‌کنند
 * — وابستگی‌ها client-safe‌اند و 'server-only' ندارد.
 */
import { faSearchTokens, normalizeFaText } from '@/core/shared/normalize'
import { faDocNumber } from '@/core/shared/jalali'

/**
 * نمای حداقلی کلاینت دیتابیس برای این ماژول مشترک — بدون ایمپورت مستقیم بسته Prisma:
 * قاعده CH-02 فایلِ لمس‌کننده Prisma را 'server-only' می‌خواهد، اما این فایل باید از
 * seedهای مستقل bun هم import شود. PrismaClient سرور (fts.ts) و نمونه seed هر دو ساختار این را ارضا می‌کنند.
 */
export type FtsDbClient = {
  $queryRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>
  letter: {
    findMany(args?: unknown): Promise<LetterFtsRow[]>
    findUnique(args?: unknown): Promise<LetterFtsRow | null>
  }
}

// ---------- DDL (خودترمیم: IF NOT EXISTS) ----------

export const FTS_TABLE = 'letter_fts'

/** DDL جدول — ستون fts از پنج ستون متنی «تولید» می‌شود (setweight: موضوع A · متن B · طرف‌ها C · شماره D) */
export const LETTER_FTS_DDL = `CREATE TABLE IF NOT EXISTS letter_fts (
  "letterId" TEXT PRIMARY KEY,
  subject TEXT,
  body TEXT,
  sender TEXT,
  receiver TEXT,
  "numText" TEXT,
  fts tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(subject, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(body, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(sender, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(receiver, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce("numText", '')), 'D')
  ) STORED
)`

/** ایندکس GIN — عمداً statement جدا (پروتکل Prisma: هر فراخوانی یک statement) */
export const LETTER_FTS_GIN_DDL = 'CREATE INDEX IF NOT EXISTS letter_fts_gin ON letter_fts USING GIN (fts)'

/** ستون‌های انتخابی Letter که ایندکس از آن‌ها ساخته می‌شود */
export const LETTER_FTS_SELECT = {
  id: true, subject: true, body: true, senderTitle: true, receiverTitle: true, number: true, createdAt: true,
} as const

export type LetterFtsRow = {
  id: string
  subject: string
  body: string
  senderTitle: string | null
  receiverTitle: string | null
  number: number
  createdAt: Date
}

/** ردیف ایندکس از رکورد Letter — numText = شماره نمایشی «سال/شماره» نرمال‌شده با ارقام لاتین و «/»→فاصله (توکن‌پذیر) */
export function letterFtsValues(l: LetterFtsRow): (string | number)[] {
  return [
    l.id,
    normalizeFaText(l.subject ?? ''),
    normalizeFaText(l.body ?? ''),
    normalizeFaText(l.senderTitle ?? ''),
    normalizeFaText(l.receiverTitle ?? ''),
    normalizeFaText(faDocNumber(l.number, l.createdAt)).replace(/\//g, ' '),
  ]
}

// ---------- پرس‌وجو tsquery (واژه ≥۲ نویسه · حرف پیشوند :* · رقم دقیق) ----------

/**
 * رشته tsquery از پرس‌وجوی کاربر — null یعنی «توکن معتبر نیست» (تک‌نویسه/نماد) → عقب‌گرد contains.
 * توکن‌ها پس از normalizeFaText فقط نویسه‌های الفبایی/رقمی‌اند → رشته tsquery تولیدی‌مان
 * فقط واژه + «:*» + « & » دارد (تزریق نحوی to_tsquery ناممکن؛ and/or واژه‌اند نه عملگر — پروب‌شده).
 */
export function buildLetterFtsMatch(q: string): string | null {
  const tokens = faSearchTokens(q)
  if (tokens.length === 0) return null
  return tokens.map((t) => (/^[0-9]+$/.test(t) ? t : `${t}:*`)).join(' & ')
}

// ---------- فیلترهای فهرست (آینه where فهرست نامه‌ها — listLetters/exportLettersCsv) ----------

export type LetterFtsFilter = {
  companyIds: string[]
  /** box=inbox */
  currentHolderId?: string
  /** box=sent */
  creatorId?: string
  type?: string
  status?: string
  urgency?: string
}

/** ستون‌های مرتب‌سازی مجاز SQL — همان نقشه sort مسیر /api/letters (دفاع در عمق: نامعتبر → createdAt) */
const LETTER_FTS_SORT_COLUMNS = new Set(['createdAt', 'number', 'type', 'status', 'subject'])

/**
 * شرط‌های فیلتر با پارامترهای شماره‌دار Postgres — startIdx = شماره اولین پارامتر این شرط.
 * خروجی sql با « AND …» شروع می‌شود (الحاق پس از زیرکوئری MATCH که $1 را مصرف می‌کند).
 */
function letterFtsWhere(f: LetterFtsFilter, startIdx: number): { sql: string; params: string[] } {
  const clauses: string[] = []
  const params: string[] = []
  let n = startIdx
  const ph = () => `$${++n}`
  if (f.companyIds.length === 0) {
    clauses.push('1 = 0') // دامنه خالی (شرکت GROUP بدون فرزند) — هیچ نامه‌ای نباید بیاید
  } else {
    clauses.push(`l."companyId" IN (${f.companyIds.map(() => ph()).join(', ')})`)
    params.push(...f.companyIds)
  }
  if (f.currentHolderId) { clauses.push(`l."currentHolderId" = ${ph()}`); params.push(f.currentHolderId) }
  if (f.creatorId) { clauses.push(`l."creatorId" = ${ph()}`); params.push(f.creatorId) }
  if (f.type) { clauses.push(`l."type" = ${ph()}`); params.push(f.type) }
  if (f.status) { clauses.push(`l."status" = ${ph()}`); params.push(f.status) }
  if (f.urgency) { clauses.push(`l."urgency" = ${ph()}`); params.push(f.urgency) }
  return { sql: ` AND ${clauses.join(' AND ')}`, params }
}

/** زیرکوئری MATCH — tsquery پارامتری $1 (ایندکس‌پذیر GIN در زمان اجرا) */
const MATCH_SUBQUERY = 'l."id" IN (SELECT "letterId" FROM letter_fts WHERE fts @@ to_tsquery(\'simple\', $1))'

// ---------- جستجو: صفحه (id + total) — hydration با Prisma در مصرف‌کننده ----------

/**
 * صفحه جستجو: idهای صفحه جاری + مجموع کل — «یک رفت‌وبرگشت» (COUNT(*) OVER() — بهینه WAN: ادغام شمارش با صفحه)
 * (خروجی id ≤ pageSize → hydration با IN کوچک و بدون orderBy — درس ۲۴: IN بزرگ + orderBy = RustPanic).
 */
export async function ftsLetterPageWith(
  db: FtsDbClient,
  match: string,
  f: LetterFtsFilter,
  sortField: string | undefined,
  sortDir: 'asc' | 'desc',
  page: number,
  pageSize: number,
): Promise<{ ids: string[]; total: number }> {
  const w = letterFtsWhere(f, 1)
  const col = LETTER_FTS_SORT_COLUMNS.has(sortField ?? '') ? (sortField as string) : 'createdAt'
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC'
  const limitPh = `$${2 + w.params.length}`
  const offsetPh = `$${3 + w.params.length}`
  const idRows = await db.$queryRawUnsafe(
    `SELECT l."id" AS id, COUNT(*) OVER() AS "total" FROM "Letter" l WHERE ${MATCH_SUBQUERY}${w.sql} ORDER BY l."${col}" ${dir} LIMIT ${limitPh} OFFSET ${offsetPh}`,
    match, ...w.params, pageSize, Math.max(0, (page - 1) * pageSize),
  ) as { id: string; total: number | bigint }[]
  const total = idRows.length > 0 ? Number(idRows[0].total) : 0
  return { ids: idRows.map((r) => r.id), total }
}

/** idهای خروجی CSV — مرتب‌شده، سقف cap+1 ردیف (ردیف اضافه = پرچم capped برای buildCsvDocument) */
export async function ftsLetterExportIdsWith(
  db: FtsDbClient,
  match: string,
  f: LetterFtsFilter,
  sortField: string | undefined,
  sortDir: 'asc' | 'desc',
  cap: number,
): Promise<string[]> {
  const w = letterFtsWhere(f, 1)
  const col = LETTER_FTS_SORT_COLUMNS.has(sortField ?? '') ? (sortField as string) : 'createdAt'
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC'
  const limitPh = `$${2 + w.params.length}`
  const idRows = await db.$queryRawUnsafe(
    `SELECT l."id" AS id FROM "Letter" l WHERE ${MATCH_SUBQUERY}${w.sql} ORDER BY l."${col}" ${dir} LIMIT ${limitPh}`,
    match, ...w.params, cap + 1,
  ) as { id: string }[]
  return idRows.map((r) => r.id)
}

// ---------- خودترمیم: ensure / rebuild / upsert ----------

/**
 * خودترمیم: جدول+ایندکس را در صورت نبود می‌سازد؛ ناهماهنگی شمارش (seed بی‌قلاب/ریست/کم‌کاری upsert)
 * → rebuild کامل. هر جستجو پیش از MATCH صدا زده می‌شود — «یک SELECT ترکیبی دو COUNT = یک رفت‌وبرگشت»
 * (ادغام WAN بهینه؛ کش زمانی عمداً نیست: قرارداد خودترمیم B3/B5 — تخریب باید در همان جستجوی بعدی
 * گرفته شود، پنجره کور قابل قبول نیست).
 * شکست = ok:false → مصرف‌کننده به مسیر contains عقب‌گرد می‌کند (جستجو هرگز نمی‌شکند).
 */
export async function ensureLetterFtsWith(db: FtsDbClient): Promise<{ ok: boolean; rebuilt: boolean; indexed: number }> {
  try {
    await db.$executeRawUnsafe(LETTER_FTS_DDL)
    await db.$executeRawUnsafe(LETTER_FTS_GIN_DDL)
    const rows = await db.$queryRawUnsafe(
      // نام‌های مستعار «کوتیشن‌دار»: Postgres نام بدون‌کوتیشن را تا‌کست lowercase می‌کند (درس این بسته)
      'SELECT (SELECT COUNT(*) FROM letter_fts) AS "ftsC", (SELECT COUNT(*) FROM "Letter") AS "letterC"',
    ) as { ftsC: number | bigint; letterC: number | bigint }[]
    const indexed = Number(rows[0]?.ftsC ?? 0)
    const letters = Number(rows[0]?.letterC ?? 0)
    if (indexed !== letters) {
      const rebuilt = await rebuildLetterFtsWith(db)
      return { ok: true, rebuilt: true, indexed: rebuilt }
    }
    return { ok: true, rebuilt: false, indexed }
  } catch {
    return { ok: false, rebuilt: false, indexed: 0 }
  }
}

/**
 * بازسازی کامل ایندکس — «rebuild پس از seed»: پاک‌سازی + درج دسته‌ای ۵۰۰تایی
 * (۵۰۰×۶=۳۰۰۰ پارامتر ≪ سقف ۶۵۵۳۵ پارامتر Postgres — با FTS5 سقف ۹۹۹ متغیرSQLite تطبیق‌یافته).
 * ۱۰هزار نامه ≈ ۲۱ statement ≈ چند ثانیه روی WAN.
 */
export async function rebuildLetterFtsWith(db: FtsDbClient): Promise<number> {
  await db.$executeRawUnsafe(LETTER_FTS_DDL)
  await db.$executeRawUnsafe(LETTER_FTS_GIN_DDL)
  await db.$executeRawUnsafe('DELETE FROM letter_fts')
  const BATCH = 500
  let cursor: string | undefined
  let total = 0
  for (;;) {
    const rows = await db.letter.findMany({
      select: LETTER_FTS_SELECT,
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: BATCH,
    }) as LetterFtsRow[]
    if (rows.length === 0) break
    const ph = rows.map((_, i) => `(${[0, 1, 2, 3, 4, 5].map((c) => `$${i * 6 + c + 1}`).join(', ')})`).join(', ')
    await db.$executeRawUnsafe(
      `INSERT INTO letter_fts ("letterId", subject, body, sender, receiver, "numText") VALUES ${ph}`,
      ...rows.flatMap((r) => letterFtsValues(r)),
    )
    total += rows.length
    cursor = rows[rows.length - 1].id
    if (rows.length < BATCH) break
  }
  return total
}

/**
 * سینک تک‌نامه پس از ثبت (قلاب createLetter). شکست بی‌صدا (false) — نامه ثبتشده هرگز
 * به‌خاطر ایندکس نمی‌شکند؛ خودترمیم ensure شمارش را جبران می‌کند.
 */
export async function upsertLetterFtsWith(db: FtsDbClient, letterId: string): Promise<boolean> {
  try {
    const l = await db.letter.findUnique({ where: { id: letterId }, select: LETTER_FTS_SELECT }) as LetterFtsRow | null
    await db.$executeRawUnsafe(LETTER_FTS_DDL)
    await db.$executeRawUnsafe('DELETE FROM letter_fts WHERE "letterId" = $1', letterId)
    if (l) {
      await db.$executeRawUnsafe(
        'INSERT INTO letter_fts ("letterId", subject, body, sender, receiver, "numText") VALUES ($1, $2, $3, $4, $5, $6)',
        ...letterFtsValues(l),
      )
    }
    return true
  } catch {
    return false
  }
}
