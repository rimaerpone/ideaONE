#!/usr/bin/env tsx
/**
 * P1-T36 — رگرسیون خودکار مسیرهای طلایی G1..G8 (یک‌فرمانی)
 *
 *   bunx tsx scripts/e2e-golden.ts
 *
 * پیش‌نیاز: سرویس‌ها بالا (Next 3000 + گیت‌وی 81 + ریل‌تایم 3003)
 * خروجی: download/qa-e2e-golden/report.md + اسکرین‌شات هر گام
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { g1, g2, g3, g4, results, prisma } from './e2e-golden-paths1'
import { g5, g6, g7, g8 } from './e2e-golden-paths2'
import { ab, OUT } from './e2e-golden-helpers'

mkdirSync(OUT, { recursive: true })

/**
 * ری‌استارت سرویس بلادرنگ — سوکت‌های مرده (kill مکرر مرورگر در طول جلسه)
 * در اتاق‌ها می‌مانند و رویداد به سوکت مرده می‌رسد (درس کشف‌شده در G5).
 * سرویس پاک + صبر بر پورت = حالت قطعی برای سنجه اعلان زنده.
 */
function restartRealtimeService(): void {
  try {
    execSync(`pkill -f "bun --hot index.ts" || true`, { timeout: 10000 })
  } catch { /* شاید پروسه نبود */ }
  try {
    execSync(`sleep 1`, { timeout: 5000 })
    execSync(`cd /home/z/my-project/mini-services/realtime && setsid bun --hot index.ts >> /tmp/realtime-golden.log 2>&1 < /dev/null &`, { timeout: 10000 })
    execSync(`sleep 3`, { timeout: 10000 })
    const health = execSync(`curl -s http://127.0.0.1:3004/healthz`, { encoding: 'utf-8', timeout: 10000 }).trim()
    console.log(`سرویس بلادرنگ ری‌استارت شد: ${health}`)
  } catch (e) {
    console.log(`هشدار: ری‌استارت سرویس بلادرنگ ناموفق (${String(e).slice(0, 80)}) — ادامه با سرویس موجود`)
  }
}

const PATHS: Array<[string, () => Promise<void>]> = [
  ['G1', g1], ['G2', g2], ['G3', g3], ['G4', g4],
  ['G5', g5], ['G6', g6], ['G7', g7], ['G8', g8],
]

async function main() {
  console.log('━'.repeat(64))
  console.log('رگرسیون مسیرهای طلایی G1..G8 — ' + new Date().toISOString().slice(0, 19))
  console.log('━'.repeat(64))

  // P1-T36 — سرویس بلادرنگ با حالت پاک شروع می‌شود (درس G5: سوکت مرده = اعلان گم‌شده)
  restartRealtimeService()

  for (const [id, fn] of PATHS) {
    const t0 = Date.now()
    try {
      await fn()
    } catch (e) {
      results.push({
        id, title: 'خطای اجرا', pass: false,
        checks: [`✗ استثنا: ${e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160)}`],
        notes: [],
      })
      console.log(`⛔ ${id} — استثنا: ${e instanceof Error ? e.message.slice(0, 160) : '?'}`)
    }
    console.log(`   ⏱ ${Math.round((Date.now() - t0) / 1000)}s`)
  }

  // ─── گزارش نهایی
  const pass = results.filter((r) => r.pass).length
  const lines: string[] = []
  lines.push('# گزارش رگرسیون مسیرهای طلایی G1..G8 (P1-T36)')
  lines.push('')
  lines.push(`تاریخ: ${new Date().toISOString().slice(0, 19)} · گیت‌وی ۸۱ · کاربران seed`)
  lines.push('')
  lines.push(`## نتیجه کل: **${pass}/${results.length} سبز** ${pass === results.length ? '✅' : '⛔'}`)
  lines.push('')
  lines.push('| مسیر | شرح | نتیجه | جزئیات |')
  lines.push('|---|---|---|---|')
  for (const r of results) {
    const ok = r.checks.filter((c) => c.startsWith('✓')).length
    lines.push(`| ${r.id} | ${r.title} | ${r.pass ? '✅ سبز' : '⛔ قرمز'} | ${ok}/${r.checks.length} سنجه |`)
  }
  lines.push('')
  for (const r of results) {
    lines.push(`### ${r.id} — ${r.title} ${r.pass ? '✅' : '⛔'}`)
    lines.push('')
    for (const c of r.checks) lines.push(`- ${c.startsWith('✓') || c.startsWith('✗') ? c : '• ' + c}`)
    for (const n of r.notes) lines.push(`- ℹ ${n}`)
    lines.push('')
  }
  writeFileSync(`${OUT}/report.md`, lines.join('\n'), 'utf-8')

  console.log('━'.repeat(64))
  console.log(`نتیجه: ${pass}/${results.length} سبز — گزارش: ${OUT}/report.md`)
  console.log('━'.repeat(64))

  // بستن مرورگر + قطع Prisma
  try { ab('close', 15000) } catch { /* noop */ }
  await prisma.$disconnect()

  process.exit(pass === results.length ? 0 : 1)
}

main().catch(async (e) => {
  console.error('خطای مهلک:', e)
  try { ab('close', 15000) } catch { /* noop */ }
  await prisma.$disconnect()
  process.exit(1)
})
