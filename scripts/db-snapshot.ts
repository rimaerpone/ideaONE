// Snapshot دیتابیس (P0-T16) — بکاپ یک‌خطی سازگار (consistent) حتی هنگام اجرای سرویس
// اجرا: bun scripts/db-snapshot.ts   (یا: bun run db:snapshot)
// روش: VACUUM INTO — اسنپ‌شات فشرده و سالم از SQLite بدون توقف اپ (بدون نیاز به CLI sqlite3)
// بازگردانی: cp db/snapshots/<فایل> db/custom.db && rm -f db/custom.db-wal db/custom.db-shm  (سرویس متوقف باشد — RB-02)
//
// لایه سوم ماندگاری (Neon): دیتابیس زنده = Postgres ابری؛ اسنپ‌شات معادل = خود Neon
// (بکاپ پیوسته + Point-in-Time Restore سرویس ابری). این ابزار فقط فایل آرشیوی SQLite
// را از فایل موجود می‌سازد — برای بازیافت «بازگردانی snapshot → مهاجرت مجدد» کاربرد دارد.
// ماژول بومی Bun؛ فقط با `bun` اجرا می‌شود — تایپ‌ها از bun-types (مرجعِ مرجع‌شده در تست واحد P0.5-T1)
import { Database } from 'bun:sqlite'
import { mkdirSync, existsSync } from 'node:fs'

const SRC = 'db/custom.db'
const DIR = 'db/snapshots'

function main() {
  if (process.env.DATABASE_URL?.startsWith('postgres')) {
    console.log('دیتابیس زنده = Neon Postgres (لایه سوم) — بکاپ معادل: Point-in-Time Restore سرویس Neon؛')
    console.log('این ابزار فقط فایل آرشیوی SQLite موجود روی دیسک را اسنپ‌شات می‌کند (برای بازیافت).')
  }
  if (!existsSync(SRC)) {
    console.log(`فایل ${SRC} موجود نیست — چیزی برای اسنپ‌شات نیست. خروج.`)
    process.exit(0)
  }
  mkdirSync(DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 17)
  const out = `${DIR}/snapshot-${ts}.db`

  // اتصال readonly: هیچ تغییر روی دیتابیس زنده نمی‌دهد
  const db = new Database(SRC, { readonly: true })
  try {
    db.exec(`VACUUM INTO '${out}'`)
  } finally {
    db.close()
  }

  // راستی‌آزمایی: اسنپ‌شات باید سالم باشد و همان تعداد ردیف کاربر را داشته باشد
  const verify = new Database(out, { readonly: true })
  try {
    const integrity = verify.query('PRAGMA integrity_check').get() as { integrity_check: string } | null
    const users = verify.query('SELECT COUNT(*) AS c FROM User').get() as { c: number } | null
    const ok = integrity?.integrity_check === 'ok'
    if (!ok) throw new Error(`integrity_check = ${JSON.stringify(integrity)}`)
    console.log(`snapshot: ${out}`)
    console.log(`راستی‌آزمایی: integrity_check=ok · ${users?.c ?? 0} کاربر`)
    // بهداشت: فقط ۱۰ اسنپ‌شات اخیر نگه داشته شود
    const { readdirSync, unlinkSync, statSync } = require('node:fs') as typeof import('node:fs')
    const files = readdirSync(DIR).filter((f) => f.endsWith('.db')).map((f) => ({ f, t: statSync(`${DIR}/${f}`).mtimeMs })).sort((a, b) => b.t - a.t)
    for (const old of files.slice(10)) unlinkSync(`${DIR}/${old.f}`)
  } finally {
    verify.close()
  }
}

main()
