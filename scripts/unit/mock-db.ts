// شبیه‌ساز Prisma درون‌حافظه‌ای — فقط برای تست واحد مسیرهای بحرانی (P0.5-T1)
// قرارداد:
//  - فقط متدهای واقعاً استفاده‌شده توسط applyDocToStock/actOnLetter پیاده شده‌اند (یادداشت ADR-007: هر فایل هدف دارد)
//  - $transaction با rollback واقعی: «undo-log» نوشته‌های خودِ تراکنش را برمی‌گرداند؛
//    نوشته‌های بیرونی (hooks = شبیه‌سازی اقدام هم‌زمانِ کاربر دیگر) دست‌نخورده می‌مانند —
//    این همان semantics واقعی دیتابیس است که snapshot ساده نمی‌تواند بازتولید کند.
//  - خوانده‌ها همیشه deep-clone برمی‌گردند تا نشت مرجع ردیف‌های زنده به تست‌ها نباشد.
type Row = Record<string, unknown>
export type { Row }

export interface MockHooks {
  /** شبیه‌سازی اقدام هم‌زمان: بلافاصله پس از create هر مدل فراخوانی می‌شود (داخل تراکنش) */
  onCreate?: (model: string, row: Row) => void
}

// روابط include مورد استفادهٔ مسیرهای زیر تست — بقیه عمداً پشتیبانی نمی‌شوند (خطای واضح)
const INCLUDES: Record<string, Record<string, { table: string; fk: string }>> = {
  warehouseDoc: { items: { table: 'docItem', fk: 'docId' } },
  user: { memberships: { table: 'membership', fk: 'userId' } },
}

function matches(row: Row, where: Row): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (v !== null && typeof v === 'object') {
      if (Array.isArray((v as { in?: unknown[] }).in)) {
        if (!(v as { in: unknown[] }).in.includes(row[k])) return false
      } else {
        // کلید یکتای مرکب Prisma (مثل warehouseId_productId_tone_caliber_grade)
        for (const [ck, cv] of Object.entries(v as Row)) if (row[ck] !== cv) return false
      }
    } else if (row[k] !== v) return false
  }
  return true
}

export function createMockDb(seed: Record<string, Row[]>, hooks: MockHooks = {}) {
  const state: Record<string, Row[]> = structuredClone(seed)
  const seq: Record<string, number> = {}
  let undoLog: Array<() => void> = []
  let inTx = false

  const track = (undo: () => void) => {
    if (inTx) undoLog.push(undo)
  }

  function decorate(name: string, row: Row, include?: Row): Row {
    const out = structuredClone(row)
    if (include) {
      for (const rel of Object.keys(include)) {
        const spec = INCLUDES[name]?.[rel]
        if (!spec) throw new Error(`mock-db: include پشتیبانی‌نشده ${name}.${rel}`)
        out[rel] = (state[spec.table] ?? []).filter((r) => r[spec.fk] === row.id)
      }
    }
    return out
  }

  function model(name: string) {
    const rows = (): Row[] => (state[name] ??= [])
    return {
      async findUnique({ where, include }: { where: Row; include?: Row }) {
        const row = rows().find((r) => matches(r, where))
        return row ? decorate(name, row, include) : null
      },
      async findFirst({ where, include }: { where: Row; include?: Row }) {
        const row = rows().find((r) => matches(r, where))
        return row ? decorate(name, row, include) : null
      },
      async create({ data }: { data: Row }) {
        seq[name] = (seq[name] ?? 0) + 1
        const row: Row = { id: `mock-${name}-${seq[name]}`, ...structuredClone(data) }
        rows().push(row)
        track(() => {
          const arr = state[name] ?? []
          const i = arr.indexOf(row)
          if (i >= 0) arr.splice(i, 1)
        })
        hooks.onCreate?.(name, row)
        return structuredClone(row)
      },
      async update({ where, data }: { where: Row; data: Row }) {
        const row = rows().find((r) => matches(r, where))
        if (!row) throw new Error(`mock-db ${name}: ردیف به‌روزرسانی یافت نشد ${JSON.stringify(where)}`)
        const before: Row = {}
        for (const k of Object.keys(data)) before[k] = row[k]
        Object.assign(row, structuredClone(data))
        track(() => Object.assign(row, before))
        return decorate(name, row)
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        const hit = rows().filter((r) => matches(r, where))
        for (const row of hit) {
          const before: Row = {}
          for (const k of Object.keys(data)) before[k] = row[k]
          Object.assign(row, structuredClone(data))
          track(() => Object.assign(row, before))
        }
        return { count: hit.length }
      },
    }
  }

  const models: Record<string, ReturnType<typeof model>> = {}
  for (const m of ['warehouseDoc', 'docItem', 'stockItem', 'product', 'letter', 'letterReferral', 'user', 'membership', 'outboxEvent', 'docCounter', 'notification', 'auditLog']) models[m] = model(m)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {
    ...models,
    $transaction: async (fn: (tx: typeof db) => Promise<unknown>) => {
      if (inTx) return fn(db) // تراکنش تودرتو: در همان تراکنش بیرونی ادامه بده
      const outer = undoLog
      inTx = true
      undoLog = []
      try {
        return await fn(db)
      } catch (e) {
        for (const undo of undoLog.reverse()) undo()
        throw e
      } finally {
        undoLog = outer
        inTx = false
      }
    },
  }

  return { db, state, hooks }
}
