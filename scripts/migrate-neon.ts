// مهاجرت داده SQLite → Neon Postgres — بسته «لایه سوم ماندگاری»
// اجرا: bun scripts/migrate-neon.ts [--force]
//   --force: اگر مقصد پر باشد، اول TRUNCATE ... CASCADE همه جدول‌ها را خالی می‌کند
// منبع: db/custom.db فقط‌خواندنی (bun:sqlite) — فقط جدول‌های مدل Prisma (letter_fts و سایه‌هایش رد می‌شوند؛ ایندکس جستجو پس از مهاجرت «بازسازی» می‌شود)
// مقصد: PrismaClient فعلی (postgresql از .env)
// روش: مرتب‌سازی توپولوژیک مدل‌ها بر اساس FK از DMMF؛ خود-ارجاع‌ها (FK به همان جدول) NULL در درج + UPDATE پس‌گذر
// تبدیل نوع: DateTime (SQLite=INTEGER ms) → Date · Boolean (0/1) → true/false
// راستی‌آزمایی: شمارش هر جدول مقصد == منبع + شمارش کل
// ماژول بومی Bun؛ فقط با `bun` اجرا می‌شود (مستندات سربرگ db-snapshot) — تایپ‌ها از bun-types (مرجعِ مرجع‌شده در تست واحد P0.5-T1)
import { Database } from 'bun:sqlite'
import { Prisma, PrismaClient } from '@prisma/client'

const FORCE = process.argv.includes('--force')
const SRC = 'db/custom.db'

type Model = { name: string; fields: { kind: string; name: string; type: string; relationFromFields?: string[]; relationToFields?: string[] }[] }

function scalarFields(m: Model) {
  return m.fields.filter((f) => f.kind === 'scalar')
}

/** لبه‌های FK: مدل → مدل‌هایی که باید «قبل» از آن درج شوند (از relationFromFields پر) */
function dependencies(models: Model[]) {
  const byName = new Map(models.map((m) => [m.name, m]))
  const deps = new Map<string, Set<string>>()
  const selfFks = new Map<string, string[]>() // model → ستون‌های خود-ارجاع
  for (const m of models) {
    const d = new Set<string>()
    for (const f of m.fields) {
      if (f.kind === 'object' && f.relationFromFields && f.relationFromFields.length > 0) {
        const target = byName.get(f.type)
        if (!target) continue
        if (target.name === m.name) {
          const cur = selfFks.get(m.name) ?? []
          cur.push(...f.relationFromFields)
          selfFks.set(m.name, cur)
        } else {
          d.add(target.name)
        }
      }
    }
    deps.set(m.name, d)
  }
  return { deps, selfFks }
}

/** مرتب‌سازی توپولوژیک (Kahn) — مدل‌های بی‌وابسته اول؛ حلقه‌ها با گسست امن */
function topoSort(models: Model[], deps: Map<string, Set<string>>): string[] {
  const remaining = new Map(models.map((m) => [m.name, new Set(deps.get(m.name) ?? [])]))
  const order: string[] = []
  let guard = models.length + 5
  while (order.length < models.length && guard-- > 0) {
    let progressed = false
    for (const name of [...remaining.keys()]) {
      const d = remaining.get(name)!
      for (const dep of [...d]) if (order.includes(dep)) d.delete(dep)
      if (d.size === 0) {
        order.push(name)
        remaining.delete(name)
        progressed = true
      }
    }
    if (!progressed) { // حلقه — گسست امن: کم‌وابسته‌ترین را آزاد کن (FK ناقص → خطای واضح‌تر از بن‌بست)
      let minName = ''
      let min = Infinity
      for (const [name, d] of remaining) if (d.size < min) { min = d.size; minName = name }
      order.push(minName)
      remaining.delete(minName)
    }
  }
  return order
}

const convert = (v: unknown, type: string): unknown => {
  if (v === null || v === undefined) return null
  switch (type) {
    case 'DateTime': return new Date(v as number) // SQLite Prisma = INTEGER ms-epoch
    case 'Boolean': return v === 1 || v === true
    case 'Int': case 'Float': return typeof v === 'number' ? v : Number(v)
    default: return v // String و مشابه
  }
}

async function main() {
  const sqlite = new Database(SRC, { readonly: true })
  const pg = new PrismaClient({ log: ['error'] })
  try {
    const models = (Prisma.dmmf.datamodel.models as unknown as Model[]).filter((m) => !m.name.startsWith('_'))
    console.log(`مدل‌ها: ${models.length} · منبع: ${SRC} · مقصد: Postgres (Neon)`)

    // ── گارد: مقصد باید خالی باشد (مگر --force) ──
    const nonEmpty: string[] = []
    for (const m of models) {
      const c = await pg.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "${m.name}"`) as { c: bigint }[]
      if (Number(c[0].c) > 0) nonEmpty.push(`${m.name}=${c[0].c}`)
    }
    if (nonEmpty.length > 0) {
      if (!FORCE) {
        console.error(`مقصد پر است: ${nonEmpty.join(' · ')}\nبرای بازنویسی: bun scripts/migrate-neon.ts --force`)
        process.exit(1)
      }
      const all = models.map((m) => `"${m.name}"`).join(', ')
      await pg.$executeRawUnsafe(`TRUNCATE ${all} RESTART IDENTITY CASCADE`)
      console.log(`--force: ${models.length} جدول TRUNCATE شد`)
    }

    // ── ترتیب درج ──
    const { deps, selfFks } = dependencies(models)
    const order = topoSort(models, deps)
    const byName = new Map(models.map((m) => [m.name, m]))
    const selfFkModels = [...selfFks.keys()]
    if (selfFkModels.length > 0) console.log(`خود-ارجاع‌ها (NULL + UPDATE پس‌گذر): ${selfFkModels.map((n) => `${n}[${selfFks.get(n)!.join(',')}]`).join(' · ')}`)
    console.log(`ترتیب درج:\n  ${order.join(' → ')}`)

    // ── کپی جدول‌ها ──
    let totalRows = 0
    const t0 = performance.now()
    for (const name of order) {
      const m = byName.get(name)!
      const cols = scalarFields(m).map((f) => f.name)
      if (cols.length === 0) continue
      const selfCols = new Set(selfFks.get(name) ?? [])
      const insertCols = cols.filter((c) => !selfCols.has(c))
      const srcRows = sqlite.query(`SELECT ${cols.map((c) => `"${c}"`).join(', ')} FROM "${name}"`).all() as Record<string, unknown>[]
      if (srcRows.length === 0) { console.log(`  ${name}: ۰ ردیف — رد شد`); continue }
      const chunk = Math.max(1, Math.min(200, Math.floor(2000 / insertCols.length)))
      for (let i = 0; i < srcRows.length; i += chunk) {
        const part = srcRows.slice(i, i + chunk)
        const ph = part.map((_, r) => `(${insertCols.map((_, c) => `$${r * insertCols.length + c + 1}`).join(', ')})`).join(', ')
        const values = part.flatMap((row) => insertCols.map((c) => {
          const f = scalarFields(m).find((x) => x.name === c)!
          return convert(row[c], f.type)
        }))
        await pg.$executeRawUnsafe(
          `INSERT INTO "${name}" (${insertCols.map((c) => `"${c}"`).join(', ')}) VALUES ${ph}`,
          ...values,
        )
      }
      totalRows += srcRows.length
      console.log(`  ${name}: ${srcRows.length.toLocaleString('fa-IR')} ردیف ✓ (${Math.round(performance.now() - t0)}ms)`)
    }

    // ── پس‌گذر: خود-ارجاع‌ها ──
    for (const [name, cols] of selfFks) {
      const m = byName.get(name)!
      const srcRows = sqlite.query(`SELECT "id", ${cols.map((c) => `"${c}"`).join(', ')} FROM "${name}" WHERE ${cols.map((c) => `"${c}" IS NOT NULL`).join(' OR ')}`).all() as Record<string, unknown>[]
      for (const row of srcRows) {
        for (const c of cols) {
          if (row[c] !== null) {
            await pg.$executeRawUnsafe(`UPDATE "${name}" SET "${c}" = $2 WHERE "id" = $1`, row.id, convert(row[c], m.fields.find((f) => f.name === c)?.type ?? 'String'))
          }
        }
      }
      console.log(`  خود-ارجاع ${name}: ${srcRows.length} ردیف UPDATE شد`)
    }

    // ── راستی‌آزمایی شمارش ──
    let mismatch = 0
    for (const m of models) {
      const src = (sqlite.query(`SELECT COUNT(*) AS c FROM "${m.name}"`).get() as { c: number }).c
      const dst = Number(((await pg.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "${m.name}"`) as { c: bigint }[])[0].c))
      if (src !== dst) { mismatch++; console.error(`  ✗ ${m.name}: منبع ${src} ≠ مقصد ${dst}`) }
    }
    const dur = Math.round((performance.now() - t0) / 1000)
    if (mismatch > 0) { console.error(`مهاجرت ناقص: ${mismatch} جدول ناهماهنگ`); process.exit(1) }
    console.log(`\n✓ مهاجرت کامل: ${totalRows.toLocaleString('fa-IR')} ردیف در ${models.length} جدول · ${dur} ثانیه — همه شمارش‌ها هماهنگ`)
  } finally {
    sqlite.close()
    await pg.$disconnect()
  }
}

main().catch((e) => { console.error('مهاجرت شکست خورد:', e); process.exit(1) })
