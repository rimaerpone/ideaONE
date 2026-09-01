// راستی‌آزمایی ماشینی انطباق رجیستری زنده با فهرست ۳۳ ماژولی v1.1 (P0.5-T2 — CMD-011 §۵)
// منبع فهرست: upload/module-list.md (پارس §۲ + شمار از خط «جمع») · منبع وضعیت: جدول PlatformModule
// مصرف: unset DATABASE_URL; set -a; source .env; set +a; node scripts/validate-modules.mjs
// خروجی: ۳۳/۳۳ PASS (exit 0) یا گزارش ناهماهنگی (exit 1) — هر ویرایش فهرست/رجیستری باید مجدداً سبز شود
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'

const db = new PrismaClient()

// ——— ۱) پارس فهرست مصوب از module-list.md (بخش §۲ فقط — §۳/§۴/§۷ با الگوی متفاوت‌اند) ———
const md = readFileSync('upload/module-list.md', 'utf8')
const sec2 = md.split(/^##\s/m).find((s) => s.startsWith('۲)')) ?? ''
const ids = [...sec2.matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gm)].map((m) => m[1])
const faToEn = (s) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
const expected = Number(faToEn((md.match(/جمع:\s*([۰-۹0-9]+)\s*ماژول/) ?? [])[1] ?? '0'))

// ——— ۲) نگاشت استثنائات پوشش پلتفرمی (CMD-011 §۳ — ردیف مستقل ندارند) ———
const PLATFORM_COVERED = new Set([
  'users',               // منوی «کاربران» + سرویس نشست/هویت داخل پلتفرم
  'access-control',      // RBAC کامل core/tenancy
  'audit-log',           // core/audit + خط زمان U5
  'notification-center', // Notification + بلادرنگ + ScheduledJob
])
const SHADOW_COVERED = { 'purchase-vendors': 'partners' } // پوشش مستردیتا زیر partners تا P4

// ردیف‌های رجیستری مجاز خارج از ۳۳ (CMD-011 §۲ ردیف‌های ۱۷/۱۸/۱۹)
const ALLOWED_EXTRA = new Set([
  'dashboard', 'products', 'partners', 'modules', 'settings',          // زیرساخت هسته
  'ai-agents', 'smart-studio', 'smart-gallery', 'catalog-builder',     // چشم‌انداز
  'process-builder', 'chat',                                           // چشم‌انداز
  'digital-archive', 'org-chart',                                      // در انتظار ادغام
])

// ——— ۳) خواندن رجیستری زنده ———
const rows = await db.platformModule.findMany({ select: { code: true, status: true, layer: true }, orderBy: { code: 'asc' } })
const registry = new Map(rows.map((r) => [r.code, r]))

// ——— ۴) ارزیابی ———
const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
const problems = []
let pass = 0
for (const id of ids) {
  if (registry.has(id)) { pass++; continue }
  if (PLATFORM_COVERED.has(id)) { pass++; continue }
  const shadow = SHADOW_COVERED[id]
  if (shadow && registry.has(shadow)) { pass++; continue }
  problems.push(`❌ «${id}» نه ردیف رجیستری دارد و نه پوشش پلتفرمی/سایه‌ای ثبت‌شده`)
}
// ردیف‌های رجیستری بی‌نگاشت (خارج ۳۳) — فقط مجازهای CMD-011
const extras = rows.map((r) => r.code).filter((c) => !ids.includes(c) && !ALLOWED_EXTRA.has(c))
for (const c of extras) problems.push(`⚠️ ردیف رجیستری «${c}» خارج از فهرست ۳۳ است و در فهرست مجازهای CMD-011 نیست`)

// ——— ۵) گزارش ———
const counts = { FOUND: 0, PLATFORM: 0, SHADOW: 0 }
for (const id of ids) {
  if (registry.has(id)) counts.FOUND++
  else if (PLATFORM_COVERED.has(id)) counts.PLATFORM++
  else if (SHADOW_COVERED[id]) counts.SHADOW++
}
const active = rows.filter((r) => r.status === 'ACTIVE').length
console.log(`→ ${ids.length} شناسه پارس شد | معتبر: ${pass} | تکراری: ${dup.length} | شمار موردانتظار سند: ${expected}`)
console.log(`→ ردیف‌های رجیستری زنده: ${rows.length} (${active} ACTIVE) | ردیف‌دار: ${counts.FOUND} · پوشش پلتفرمی: ${counts.PLATFORM} · پوشش سایه‌ای: ${counts.SHADOW}`)
if (expected && ids.length !== expected) problems.push(`❌ شمار شناسه‌های §۲ (${ids.length}) با خط «جمع» سند (${expected}) یکی نیست`)
if (ids.length !== 33) problems.push(`❌ فهرست §۲ باید ۳۳ شناسه داشته باشد — ${ids.length} یافت شد`)
if (dup.length) problems.push(`❌ شناسهٔ تکراری: ${dup.join('، ')}`)

if (problems.length) {
  for (const p of problems) console.log(p)
  console.log('→ ⛔ FAIL')
  await db.$disconnect()
  process.exit(1)
}
console.log('→ ✅ PASS — ۳۳/۳۳ (رجیستری ↔ فهرست مصوب v1.1 هم‌راستا)')
await db.$disconnect()
