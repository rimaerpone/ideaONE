// scripts/check.ts — دروازه کیفیت ساختار و مستندات (اجرای ماشینی قواعد AGENTS.md)
// اجرا: bun run check   |   خروج: هر خطا = exit 1
// مرجع قواعد: AGENTS.md · docs/architecture/02-folder-structure.md · ADR-007
// اصل: «هر قاعده مستندِ قابل‌اتوماسیون، باید اینجا بیاید» — سند صادق است اگر ماشین آن را تأیید کند.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname, resolve, relative } from 'node:path'

// P0.5-T3: قابلیت حمل CI — در سندباکس همان مسیر ثابت؛ در GitHub Actions با IO_ROOT
// قابل بازنویسی است تا دروازه کیفیت بیرون از سندباکس هم اجرا شود.
const ROOT = process.env.IO_ROOT ?? '/home/z/my-project'
const SRC = join(ROOT, 'src')

// ───────────────────────── ابزارهای پایه ─────────────────────────
const faDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
let fails = 0
let warns = 0
const failMsgs: string[] = []
const warnMsgs: string[] = []
const okMsgs: string[] = []
const fail = (id: string, msg: string) => { fails++; failMsgs.push(`  ✗ ${id}: ${msg}`) }
const warn = (id: string, msg: string) => { warns++; warnMsgs.push(`  ⚠ ${id}: ${msg}`) }
const ok = (id: string, msg: string) => { okMsgs.push(`  ✓ ${id}: ${msg}`) }
const section = (t: string) => console.log(`\n\x1b[1m■ ${t}\x1b[0m`)

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { if (!e.includes('node_modules')) walk(p, exts, out) }
    else if (exts.some((x) => e.endsWith(x))) out.push(p)
  }
  return out
}
const read = (p: string) => readFileSync(p, 'utf8')

// فایل‌های ts/tsx پروژه + importهای هرکدام
type SrcFile = { path: string; rel: string; text: string; imports: string[] }
const srcFiles: SrcFile[] = walk(SRC, ['.ts', '.tsx']).map((p) => {
  const text = read(p)
  const imports: string[] = []
  for (const m of text.matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g)) imports.push(m[1])
  return { path: p, rel: relative(ROOT, p), text, imports }
})
const srcByPath = new Map(srcFiles.map((f) => [f.path, f]))

function resolveImport(fromFile: string, spec: string): string | null {
  if (spec.startsWith('@/')) {
    const t = join(SRC, spec.slice(2))
    for (const e of ['', '.ts', '.tsx', '/index.ts']) if (existsSync(t + e) && statSync(t + e).isFile()) return t + e
    return null
  }
  if (spec.startsWith('.')) {
    const t = resolve(dirname(fromFile), spec)
    for (const e of ['', '.ts', '.tsx', '/index.ts']) if (existsSync(t + e) && statSync(t + e).isFile()) return t + e
  }
  return null
}

// ───────────────────────── A. ساختار ─────────────────────────
section('الف — ساختار پوشه‌ها و آناتومی ماژول‌ها')

// CH-01: آناتومی ماژول
{
  const modDir = join(SRC, 'modules')
  const mods = readdirSync(modDir).filter((d) => statSync(join(modDir, d)).isDirectory())
  const bad = mods.filter((m) => !existsSync(join(modDir, m, 'service.ts')) || !existsSync(join(modDir, m, 'README.md')))
  bad.length ? fail('CH-01', `ماژول بدون service.ts یا README.md: ${bad.join(', ')}`) : ok('CH-01', `${mods.length} ماژول، همگی با service.ts + README.md`)
}

// CH-02: فایل سمت سرورِ لمس‌کننده Prisma/SDK باید 'server-only' داشته باشد (شامل import نسبی './db')
{
  const dbPath = join(SRC, 'core/shared/db.ts')
  const importers = srcFiles.filter((f) => !f.rel.startsWith('src/app/') && f.imports.some((i) => i === '@prisma/client' || i === 'z-ai-web-dev-sdk' || i === '@/core/shared/db' || resolveImport(f.path, i) === dbPath))
  const missing = importers.filter((f) => !f.imports.includes('server-only'))
  missing.length ? fail('CH-02', `فایل سرور بدون 'server-only': ${missing.map((f) => f.rel).join(', ')}`) : ok('CH-02', `${importers.length} فایل سرور لمس‌کننده Prisma/SDK، همگی با 'server-only'`)
}

// CH-03: نام‌گذاری kebab-case فایل‌های src
{
  const bad = srcFiles.filter((f) => !/^[a-z0-9][a-z0-9.-]*\.(ts|tsx)$/.test(f.path.split('/').pop()!))
  bad.length ? fail('CH-03', `نام فایل خارج از kebab-case: ${bad.map((f) => f.rel).join(', ')}`) : ok('CH-03', 'همه فایل‌های src با kebab-case')
}

// CH-04: هر متد HTTP در route حداکثر ۱۴ خط
{
  const routes = walk(join(SRC, 'app', 'api'), ['.ts'])
  const fat: string[] = []
  for (const r of routes) {
    const lines = read(r).split('\n')
    const starts = lines.map((l, i) => (/^export (async )?function/.test(l) ? i : -1)).filter((i) => i >= 0)
    starts.push(lines.length)
    for (let i = 0; i < starts.length - 1; i++) {
      const body = lines.slice(starts[i], starts[i + 1]).filter((l) => l.trim() !== '' && !l.trim().startsWith('//')).length
      if (body > 14) fat.push(`${relative(ROOT, r)} (${lines[starts[i]].replace(/^export (async )?function/, '').split('(')[0].trim()} = ${body} خط)`)
    }
  }
  fat.length ? fail('CH-04', `متد HTTP سنگین‌تر از ۱۴ خط: ${fat.join(' · ')}`) : ok('CH-04', `${routes.length} route — همه متدها ≤ ۱۴ خط`)
}

// ───────────────────────── B. مرزهای معماری ─────────────────────────
section('ب — مرزهای معماری (جهت وابستگی)')

// CH-05: route نباید مستقیم Prisma/SDK را لمس کند
{
  const routes = srcFiles.filter((f) => f.rel.startsWith('src/app/api/') && f.rel.endsWith('route.ts'))
  const bad = routes.filter((f) => f.imports.some((i) => i === '@prisma/client' || i === '@/core/shared/db' || i === 'z-ai-web-dev-sdk'))
  bad.length ? fail('CH-05', `route با Prisma/SDK مستقیم (منطق باید در service باشد): ${bad.map((f) => f.rel).join(', ')}`) : ok('CH-05', `${routes.length} route — هیچ لمس مستقیم Prisma/SDK`)
}

// CH-06: ماژول از ماژول دیگر import نمی‌کند
{
  const bad: string[] = []
  for (const f of srcFiles.filter((f) => f.rel.startsWith('src/modules/'))) {
    const own = f.rel.split('/')[2]
    for (const i of f.imports) {
      const m = i.match(/^@\/modules\/([^/]+)/)
      if (m && m[1] !== own) bad.push(`${f.rel} → ${i}`)
    }
  }
  bad.length ? fail('CH-06', `import بین‌ماژولی ممنوع: ${bad.join(' · ')}`) : ok('CH-06', 'ایزولاسیون ماژول‌ها کامل')
}

// CH-07: core از modules/components import نمی‌کند
{
  const bad = srcFiles.filter((f) => f.rel.startsWith('src/core/')).flatMap((f) => f.imports.filter((i) => i.startsWith('@/modules/') || i.startsWith('@/components/')).map((i) => `${f.rel} → ${i}`))
  bad.length ? fail('CH-07', `core به لایه بالاتر وابسته است: ${bad.join(' · ')}`) : ok('CH-07', 'core کاملاً بی‌طرف')
}

// ───────────────────────── C. وابستگی‌های npm ─────────────────────────
section('ج — وابستگی‌ها (بدون بدهی پنهان)')

const pkg = JSON.parse(read(join(ROOT, 'package.json')))
const deps = Object.keys(pkg.dependencies ?? {})
const devDeps = Object.keys(pkg.devDependencies ?? {})
// مجازِ مستند: استفاده‌ای ندارند اما با پیوند نقشه راه/ADR توجیه شده‌اند
const DEP_ALLOWLIST: Record<string, string> = {
  '@tanstack/react-query': 'P1 (جدول‌ها/دیتافچ)',
  '@tanstack/react-table': 'P1 (DataGrid)',
  'react-hook-form': 'P1-T20 (استاندارد فرم)',
  'zod': 'P1-T20 (اعتبارسنجی آینه سرور)',
  'prisma': 'CLI — اسکریپت‌های db:* در package.json',
  'react-dom': 'peer — مورد نیاز رندر Next.js',
}

// CH-08: هر dependency باید استفاده شود یا در allowlist مستند باشد
{
  const scanTexts = [
    ...srcFiles.map((f) => f.text),
    read(join(ROOT, 'postcss.config.mjs')), read(join(ROOT, 'eslint.config.mjs')),
    read(join(ROOT, 'next.config.ts')), read(join(ROOT, 'components.json')),
    read(join(ROOT, 'src/app/globals.css')),
    ...walk(join(ROOT, 'scripts'), ['.ts']).map(read),
    read(join(ROOT, 'mini-services/realtime/index.ts')),
  ].join('\n')
  const usedRe = (d: string) => new RegExp(`['"]${d.replace('/', '\\/')}([/'"]|$)`)
  const unused = deps.filter((d) => !DEP_ALLOWLIST[d] && !usedRe(d).test(scanTexts))
  const allowed = deps.filter((d) => DEP_ALLOWLIST[d] && !usedRe(d).test(scanTexts))
  unused.length ? fail('CH-08', `وابستگی بلااستفاده بدون مجوز مستند: ${unused.join(', ')} → حذف یا پیوند roadmap بیفزایید`) : ok('CH-08', `${deps.length} dependency — همه در استفاده یا مستنداً مجاز${allowed.length ? ` (مجاز: ${allowed.map((a) => `${a}←${DEP_ALLOWLIST[a]}`).join('، ')})` : ''}`)
}

// CH-09: وابستگی شبح (import بدون اعلام در package.json)
{
  const scanned = [...srcFiles, ...walk(join(ROOT, 'scripts'), ['.ts']).map((p) => ({ rel: relative(ROOT, p), imports: [...read(p).matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g)].map((m) => m[1]) } as SrcFile))]
  const roots = new Set<string>()
  for (const f of scanned) for (const i of f.imports) {
    if (i.startsWith('.') || i.startsWith('@/') || i.startsWith('node:') || i.startsWith('bun:')) continue
    roots.add(i.startsWith('@') ? i.split('/').slice(0, 2).join('/') : i.split('/')[0])
  }
  const phantom = [...roots].filter((r) => !deps.includes(r) && !devDeps.includes(r))
  phantom.length ? fail('CH-09', `import بدون اعلام در package.json: ${phantom.join(', ')} → bun add کنید`) : ok('CH-09', 'هیچ وابستگی شبحی وجود ندارد')
}

// ───────────────────────── D. کامپوننت‌ها و فایل‌های مرده ─────────────────────────
section('د — فایل‌های مرده (سیاست «هر فایل هدف دارد»)')

// گراف دسترسی: ریشه‌ها = src/app/** (ورودی‌های فریم‌ورک) + src/instrumentation.ts (قلاب بوت سرور)
// + src/proxy.ts (ورودی فریم‌ورک Next 16 — گارد CSRF/درخواست‌ها، P0.5-T3) — بقیه باید reachable باشند
const reachable = new Set<string>()
{
  const roots = srcFiles.filter((f) => f.rel.startsWith('src/app/') || f.rel === 'src/instrumentation.ts' || f.rel === 'src/proxy.ts').map((f) => f.path)
  const stack = [...roots]
  while (stack.length) {
    const p = stack.pop()!
    if (reachable.has(p)) continue
    reachable.add(p)
    const f = srcByPath.get(p)
    if (!f) continue
    for (const i of f.imports) { const t = resolveImport(p, i); if (t && !reachable.has(t)) stack.push(t) }
  }
}
// CH-10: هر کامپوننت ui در استفاده باشد
{
  const uiAll = srcFiles.filter((f) => f.rel.startsWith('src/components/ui/'))
  const dead = uiAll.filter((f) => !reachable.has(f.path))
  dead.length ? fail('CH-10', `کامپوننت ui بلااستفاده (حذف یا استفاده): ${dead.map((f) => f.path.split('/').pop()).join(', ')}`) : ok('CH-10', `${uiAll.length} کامپوننت ui — همگی در استفاده`)
}
// CH-11: هیچ فایل src یتیم (غیرقابل‌دسترس) نباشد
{
  const orphans = srcFiles.filter((f) => !reachable.has(f.path) && !f.rel.startsWith('src/app/'))
  orphans.length ? fail('CH-11', `فایل یتیم از نقاط ورود: ${orphans.map((f) => f.rel).join(', ')}`) : ok('CH-11', `${srcFiles.length} فایل src — همه قابل دسترس از ورودی‌های app`)
}

// ───────────────────────── E. مستندات ─────────────────────────
section('هـ — مستندات (سند صادق با واقعیت)')

const docFiles = walk(join(ROOT, 'docs'), ['.md'])
// CH-12: پیوندهای نسبی markdown سالم‌اند (worklog مستثنی است — سند تاریخی است)
{
  const broken: string[] = []
  const mdFiles = [...docFiles, join(ROOT, 'AGENTS.md'), join(ROOT, 'README.md'), ...walk(join(SRC, 'modules'), ['.md'])]
  for (const f of mdFiles) {
    const text = read(f)
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      let link = m[1].split('#')[0].trim()
      if (!link || /^(https?:|mailto:|#)/.test(link)) continue
      const target = resolve(dirname(f), decodeURIComponent(link))
      if (!existsSync(target)) broken.push(`${relative(ROOT, f)} → ${link}`)
    }
  }
  broken.length ? fail('CH-12', `پیوند شکسته: ${broken.join(' · ')}`) : ok('CH-12', `${mdFiles.length} سند — همه پیوندها سالم`)
}
// CH-13: الگوی نام‌گذاری اسناد
{
  const rules: [string, RegExp][] = [
    ['docs/architecture', /^\d{2}-[a-z-]+\.md$/], ['docs/product', /^\d{2}-[a-z-]+\.md$/],
    ['docs/adr', /^ADR-\d{3}-[a-z-]+\.md$/], ['docs/scenarios', /^SC-\d{3}-[a-z-]+\.md$/],
    ['docs/runbook', /^RB-\d{2}-[a-z-]+\.md$/], ['docs/roadmap', /^(00-master|P\d{1,2}(\.\d)?-[a-z0-9-]+)\.md$/],
    ['docs/modules', /^(SPEC|_TEMPLATE)\.md$/], ['docs/persian', /^[a-z-]+\.md$/],
  ]
  const bad: string[] = []
  for (const [dir, re] of rules) for (const f of walk(join(ROOT, dir), ['.md'])) if (!re.test(f.split('/').pop()!)) bad.push(relative(ROOT, f))
  bad.length ? fail('CH-13', `نام سند خارج از الگو: ${bad.join(', ')}`) : ok('CH-13', 'نام‌گذاری همه اسناد منطبق بر الگو')
}
// CH-14: شمار مدل Prisma == ادعای مستندات
{
  const actual = (read(join(ROOT, 'prisma/schema.prisma')).match(/^model /gm) ?? []).length
  const claimFiles = ['AGENTS.md', 'docs/README.md', 'docs/architecture/03-data-model.md'].map((p) => join(ROOT, p))
  const claims = new Set<number>()
  for (const f of claimFiles) for (const m of faDigits(read(f)).matchAll(/(\d{2}) مدل/g)) claims.add(Number(m[1]))
  const wrong = [...claims].filter((c) => c !== actual)
  wrong.length || claims.size === 0
    ? fail('CH-14', `شمار مدل=${actual} ولی مستندات می‌گویند: ${[...claims].join('، ')}`)
    : ok('CH-14', `شمار مدل (${actual}) در همه اسناد یکسان`)
}
// CH-15: شمار وظایف نقشه راه == جدول master
{
  const master = faDigits(read(join(ROOT, 'docs/roadmap/00-master.md')))
  const rows = [...master.matchAll(/\| \[P(\d{1,2}(?:\.\d)?)\]\([^)]+\) \|[^|]+\|[^|]+\| (\d{1,3}) \|/g)]
  const totalClaim = Number((master.match(/(\d{3}) وظیفه اصلی/) ?? [])[1] ?? 0)
  const mismatch: string[] = []
  let sum = 0
  for (const [, n, cnt] of rows) {
    const file = walk(join(ROOT, 'docs/roadmap'), ['.md']).find((f) => f.split('/').pop()!.startsWith(`P${n}-`))
    if (!file) { mismatch.push(`P${n}: فایل فاز یافت نشد`); continue }
    const esc = n.split('.').join('\\.')
    const ids = new Set([...read(file).matchAll(new RegExp(`\\bP${esc}-[TU]\\d{1,2}\\b`, 'g'))].map((m) => m[0]))
    sum += ids.size
    if (ids.size !== Number(cnt)) mismatch.push(`P${n}: جدول=${cnt} ولی فایل=${ids.size}`)
  }
  if (totalClaim && sum !== totalClaim) mismatch.push(`جمع واقعی=${sum} ولی ادعا=${totalClaim}`)
  mismatch.length ? fail('CH-15', `شمار وظایف ناسازگار: ${mismatch.join(' · ')}`) : ok('CH-15', `${rows.length} فاز، جمع ${sum} وظیفه — هم‌خوان با master`)
}
// CH-16: هر ماژول کد، SPEC دارد
{
  const mods = readdirSync(join(SRC, 'modules'))
  const missing = mods.filter((m) => !existsSync(join(ROOT, 'docs', 'modules', m, 'SPEC.md')))
  missing.length ? fail('CH-16', `ماژول بدون SPEC: ${missing.join(', ')}`) : ok('CH-16', `${mods.length} ماژول — همه با SPEC`)
}
// CH-17: مسیرهای backtick در فایل‌های ایندکس وجود دارند
{
  const broken: string[] = []
  for (const f of [join(ROOT, 'AGENTS.md'), join(ROOT, 'README.md'), join(ROOT, 'docs/README.md')]) {
    for (const m of read(f).matchAll(/`([^`\n]+)`/g)) {
      const p = m[1].trim()
      if (!/^(docs|scripts|src|upload|download|archive|mini-services|prisma|public|db)\//.test(p) || p.includes('<') || p.includes('*')) continue
      if (!existsSync(join(ROOT, p)) && !existsSync(resolve(dirname(f), p))) broken.push(`${relative(ROOT, f)} → ${p}`)
    }
  }
  broken.length ? fail('CH-17', `مسیر ارجاع‌شده وجود ندارد: ${broken.join(' · ')}`) : ok('CH-17', 'همه مسیرهای ارجاع‌شده در ایندکس‌ها موجود')
}

// ───────────────────────── F. رجیستری ↔ کد ─────────────────────────
section('و — رجیستری پلاگین‌ها ↔ کد (P0-T17، ADR-008)')

// CH-18: منوهای seed ↔ رجیستری نماها — پیوند دوسویه (P1.5-T3: رندر نماها از view-registry، نه switch پوسته)
// نماهای شخصی (حساب من) خارج از رجیستری پلاگین‌ها هستند: ورودی ثابت سایدبار،
// همیشه فعال — P1-T6/T7/T8 (تغییر رمز/نشست‌ها حتی با خاموشی همه پلاگین‌ها لازم است)
{
  const PERSONAL_VIEWS = ['my-account']
  const seed = read(join(ROOT, 'scripts/seed.ts'))
  const seedViewKeys = [...new Set([...seed.matchAll(/viewKey: '([a-z-]+)'/g)].map((m) => m[1]))]
  const registry = read(join(SRC, 'components/shell/view-registry.tsx'))
  // کلیدهای LIST_VIEWS و RECORD_VIEWS — هر خط «دو فاصله + نام: کامپوننت»
  const cases = new Set([...registry.matchAll(/^  ([a-z-]+): \w+,$/gm)].map((m) => m[1]))
  const noView = seedViewKeys.filter((k) => !cases.has(k))
  const ghostView = [...cases].filter((c) => !seedViewKeys.includes(c) && !PERSONAL_VIEWS.includes(c))
  if (noView.length || ghostView.length) fail('CH-18', `منو بدون نما: ${noView.join(', ') || '—'} · نمای شبح (رجیستری بدون منو در seed): ${ghostView.join(', ') || '—'}`)
  else ok('CH-18', `${seedViewKeys.length} منوی فعال همگی نما دارند؛ ${cases.size} نما (${PERSONAL_VIEWS.length} شخصی) — پیوند دوسویه سالم`)
}

// CH-19: آیکون‌های seed ⊆ ICONS سایدبار — جلوگیری از آیکون افتاده بی‌صدا
{
  const seed = read(join(ROOT, 'scripts/seed.ts'))
  const sidebarPath = join(SRC, 'components/shell/sidebar.tsx')
  const block = read(sidebarPath).match(/const ICONS[^=]*=\s*\{([^}]*)\}/)?.[1] ?? ''
  const iconNames = new Set(block.split(/[^A-Za-z0-9]+/).filter((s) => /^[A-Z][A-Za-z0-9]*$/.test(s)))
  const seedIcons = [...new Set([...seed.matchAll(/icon: '([A-Za-z0-9]+)'/g)].map((m) => m[1]))]
  const missing = seedIcons.filter((i) => !iconNames.has(i))
  missing.length ? fail('CH-19', `آیکون seed بدون تعریف در ICONS سایدبار: ${missing.join(', ')}`) : ok('CH-19', `${seedIcons.length} آیکون رجیستری — همگی در ICONS سایدبار`)
}

// CH-20: تاکسونومی — مقادیر layer/domain در seed معتبر و هر پلاگین ACTIVE دارای منو
{
  const seed = read(join(ROOT, 'scripts/seed.ts'))
  const modStart = seed.indexOf('const modDefs')
  const modEnd = seed.indexOf('const modules:', modStart)
  const defBlock = seed.slice(modStart, modEnd > 0 ? modEnd : undefined)
  const entries = defBlock.split(/(?=\{ code: ')/).filter((s) => s.trimStart().startsWith("{ code: '"))
  const validLayers = new Set(['FOUNDATION', 'OPERATIONS', 'INTELLIGENCE'])
  const validDomains = new Set(['general', 'master-data', 'office', 'warehouse', 'manufacturing', 'finance', 'commercial', 'hr', 'ai'])
  const badLayer = [...new Set(entries.filter((e) => !validLayers.has(e.match(/layer: '([A-Z]+)'/)?.[1] ?? '')).map((e) => e.match(/layer: '([A-Z]+)'/)?.[1] ?? '—'))]
  const badDomain = [...new Set(entries.filter((e) => !validDomains.has(e.match(/domain: '([a-z-]+)'/)?.[1] ?? '')).map((e) => e.match(/domain: '([a-z-]+)'/)?.[1] ?? '—'))]
  const activeNoMenu = entries.filter((e) => /status: 'ACTIVE'/.test(e) && !/menus: \[/.test(e)).map((e) => e.match(/code: '([a-z-]+)'/)?.[1] ?? '?')
  const activeCount = entries.filter((e) => /status: 'ACTIVE'/.test(e)).length
  if (badLayer.length || badDomain.length || activeNoMenu.length || entries.length === 0) {
    fail('CH-20', `layer نامعتبر: ${badLayer.join(', ') || '—'} · domain نامعتبر: ${badDomain.join(', ') || '—'} · ACTIVE بدون منو: ${activeNoMenu.join(', ') || '—'}`)
  } else {
    ok('CH-20', `تاکسونومی سه‌لایه سالم — ${entries.length} پلاگین (${activeCount} فعال)، هر ACTIVE با منو`)
  }
}

// ───────────────────────── F2. RTL سیستمیک (docs/persian/persian-stack.md §استاندارد RTL) ─────────────────────────
section('و۲ — راست‌چینی سیستمیک (استاندارد RTL پلتفرم)')

// CH-24: کلاس‌های فیزیکی LTR ممنوع — فقط ویژگی منطقی (ms/ps/text-start/start-…) مجاز است
// استثناهای مستندشده: محتوای لاتین (dir="ltr")، مرکزسازی ریاضی دیالوگ، انیمیشن‌های side-bound،
// لنگر فیزیکی عمدی (سایدبار راست/توست چپ/دات سبز هدر)
{
  const offenders: string[] = []
  const patterns: Array<[RegExp, string]> = [
    [/\b(ml|mr|pl|pr)-\d/, 'مارجین/پدینگ فیزیکی'],
    [/\btext-(left|right)\b/, 'تراز فیزیکی متن'],
    [/\bspace-x-\d/, 'space-x (به‌جای gap)'],
    [/\bborder-[lr]-\d/, 'خط فیزیکی'],
    [/\b(ml|mr)-auto\b/, 'هل‌دادن فیزیکی (ms-auto)'],
  ]
  const anchorAllow = [
    { rel: 'src/components/shell/sidebar.tsx', re: /right-0|translate-x-full|lg:translate-x-0/ },
    { rel: 'src/components/ui/toast.tsx', re: /sm:left-0/ },
    { rel: 'src/components/shell/header.tsx', re: /right-2\.5/ },
  ]
  for (const f of srcFiles.filter((x) => x.rel.endsWith('.tsx'))) {
    const lines = f.text.split('\n')
    lines.forEach((line, i) => {
      const clean = line.replace(/rtl:\S+/g, '').replace(/ltr:\S+/g, '')
      // محتوای لاتین: dir="ltr" روی خود خط، در بافت ±۳ خط، یا شرط dir === 'ltr'
      const ctx = lines.slice(Math.max(0, i - 3), i + 4).join('\n')
      if (/dir="ltr"|dir=\{|'ltr'/.test(line) || /dir="ltr"/.test(ctx)) return
      if (/slide-in-from|slide-out-to/.test(line)) return // انیمیشن side-bound رادیکس
      for (const [re, label] of patterns) {
        if (re.test(clean)) offenders.push(`${f.rel}:${i + 1} ${label} → «${line.trim().slice(0, 70)}»`)
      }
      const anchor = /(?:^|[\s"'`])((?:sm:|md:|lg:)?-?(?:left|right)-[\d.]+)/.exec(clean)
      if (anchor && !/translate|origin-|slide-|dir="ltr"/.test(ctx)) {
        const allowed = anchorAllow.find((a) => a.rel === f.rel && a.re.test(line))
        if (!allowed) offenders.push(`${f.rel}:${i + 1} لنگر فیزیکی جایگذاری → «${line.trim().slice(0, 70)}»`)
      }
    })
  }
  const layout = read(join(SRC, 'app/layout.tsx'))
  const hasRtlRoot = /<html[^>]*dir="rtl"/.test(layout)
  const hasProvider = /RtlProvider/.test(layout)
  const rtlProvider = existsSync(join(SRC, 'components/shell/rtl-provider.tsx'))
  const dashFlat = read(join(SRC, 'modules/dashboard/components/dashboard-view.tsx')).replace(/\n/g, ' ')
  const chartRtl = /reversed/.test(dashFlat) && /orientation="right"/.test(dashFlat) && /direction: 'rtl'/.test(dashFlat)
  if (!hasRtlRoot || !hasProvider || !rtlProvider) fail('CH-24', `ریشه RTL ناقص: html dir=rtl=${hasRtlRoot} · RtlProvider=${hasProvider} · فایل provider=${rtlProvider}`)
  else if (!chartRtl) fail('CH-24', 'چارت داشبورد RTL کامل نیست (XAxis reversed / YAxis right / Legend direction rtl)')
  else if (offenders.length) fail('CH-24', `${offenders.length} کلاس فیزیکی LTR — فقط ویژگی منطقی مجاز است (persian-stack.md §RTL):\n${offenders.slice(0, 12).join('\n')}${offenders.length > 12 ? `\n  … و ${offenders.length - 12} مورد دیگر` : ''}`)
  else ok('CH-24', `RTL سیستمیک سالم — ریشه/Provider/چارت درست و صفر کلاس فیزیکی LTR در ${srcFiles.filter((x) => x.rel.endsWith('.tsx')).length} فایل tsx`)
}

// ───────────────────────── G. هشدارها ─────────────────────────
section('ز — هشدارها (مانع کامیت نیستند)')

// CH-25: دریفت نمایه‌ها — شما و دیتابیس باید هم‌گام باشند (P1-T11)
{
  let drift = ''
  let diffOk = false
  try {
    const out = execSync(
      'bunx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script 2>/dev/null',
      { cwd: ROOT, encoding: 'utf8', timeout: 60_000 },
    )
    diffOk = true
    const meaningful = out.split('\n').filter((l) => l.trim() && !l.startsWith('--'))
    // P2-T5 — letter_fts (جدول مجازی FTS5 + جداول سایه‌اش letter_fts_*) عمداً «خارج Prisma» است:
    // شِما صاحب جداول خودش؛ prisma migrate/db push این جدول مشتق‌شده را می‌اندازد و
    // ensureLetterFts در بوت (instrumentation) و اولین جستجو بازمی‌سازد (rebuild از جدول Letter) —
    // بنابراین DROP آن‌ها دریفت نیست؛ هر خط DROP دیگر دریفت واقعی است.
    const isFtsOwned = (l: string) => /^DROP TABLE "letter_fts(_[a-z]+)?"?\s*;?$/i.test(l.trim())
    const isPragmaWrap = (l: string) => /^PRAGMA foreign_keys=(off|on)\s*;?$/i.test(l.trim()) || l.trim() === ';'
    drift = meaningful.filter((l) => !isFtsOwned(l)).filter((l) => !isPragmaWrap(l)).join(' ; ')
  } catch { /* ابزار در دسترس نیست */ }
  const schemaIdx = (readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8').match(/@@index/g) ?? []).length
  const loopFiles = ['scripts/seed-big.ts', 'scripts/test-indexes.ts', 'scripts/test-perf.ts'].map((f) => join(ROOT, f))
  const loopOk = loopFiles.every((f) => existsSync(f))
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const scriptsOk = ['seed:big', 'test:perf', 'test:indexes'].every((s) => pkg.scripts?.[s])
  if (!diffOk) warn('CH-25', 'prisma migrate diff اجرا نشد — همگامی شما/دیتابیس را دستی بررسی کنید (bun scripts/test-indexes.ts)')
  else if (drift) fail('CH-25', `دریفت شمای داده: دیتابیس با prisma/schema.prisma هم‌گام نیست — prisma db push فراموش شده؟ موارد: ${drift.slice(0, 300)}`)
  else if (!loopOk || !scriptsOk) fail('CH-25', `چرخه کارایی P1-T10/T11 ناقص — فایل‌ها: ${loopOk} · اسکریپت‌های package: ${scriptsOk}`)
  else ok('CH-25', `شما و دیتابیس هم‌گام (${schemaIdx} ایندکس در شما) + چرخه کارایی کامل (seed:big / test-indexes / test-perf)`)
}

{
  const rtRoot = join(ROOT, 'realtime.log')
  existsSync(rtRoot) ? warn('W-01', 'realtime.log در ریشه است — طبق RB-01 باید mini-services/realtime/realtime.log باشد') : ok('W-01', 'لاگ realtime در جای درست')
  for (const l of ['mini-services/realtime/realtime.log']) {
    const p = join(ROOT, l)
    if (existsSync(p) && statSync(p).size > 2 * 1024 * 1024) warn('W-02', `${l} بزرگ‌تر از ۲MB است — طبق RB-02 trunc کنید`)
  }
  existsSync(join(ROOT, 'mini-services/.gitkeep')) ? warn('W-03', 'mini-services/.gitkeep زائد است (پوشه محتوا دارد)') : ok('W-03', 'بدون .gitkeep زائد')
  const allowedRoot = new Set(['AGENTS.md', 'README.md', 'package.json', 'bun.lock', 'next.config.ts', 'tsconfig.json', 'eslint.config.mjs', 'postcss.config.mjs', 'components.json', 'Caddyfile', 'worklog.md', 'dev.log', 'realtime.log', 'next-env.d.ts', '.env', '.env.example', '.gitignore'])
  const strays = readdirSync(ROOT).filter((e) => statSync(join(ROOT, e)).isFile() && !allowedRoot.has(e))
  strays.length ? warn('W-04', `فایل غیرمجاز در ریشه: ${strays.join(', ')} (طبق 02-folder-structure فقط پیکربندی + AGENTS/README)`) : ok('W-04', 'ریشه فقط فایل‌های مجاز')
}

// ───────────────────────── گزارش نهایی ─────────────────────────
console.log('\n' + '─'.repeat(60))
if (failMsgs.length) { console.log('\x1b[31m✗ خطاها:\x1b[0m'); console.log(failMsgs.join('\n')) }
if (warnMsgs.length) { console.log('\x1b[33m⚠ هشدارها:\x1b[0m'); console.log(warnMsgs.join('\n')) }
console.log(`\n${okMsgs.length} بررسی سبز · ${fails} خطا · ${warns} هشدار`)
if (fails) { console.log('\x1b[31m❌ دروازه کیفیت: رد — مخزن با مستندات/قواعد ناهم‌خوان است\x1b[0m'); process.exit(1) }
console.log('\x1b[32m✅ دروازه کیفیت: قبول — ساختار، وابستگی‌ها، مستندات و رجیستری هم‌خوان‌اند\x1b[0m')
