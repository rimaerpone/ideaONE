import 'server-only'

/**
 * سازنده مشترک CSV فارسی (P2.5-U6 / R2 — خروجی داده per-view)
 *
 * تعمیم الگوی تثبیت‌شده «خروجی CSV حسابرسی» (P1-T15) به همه نماهای فهرست:
 *   - BOM UTF-8 (بدون آن اکسل فارسی را مربع‌مربع باز می‌کند)
 *   - CRLF (خط جدید ویندوزی/اکسل)
 *   - نقل‌قول فقط وقتی لازم است (کاما/نقل‌قول/خط جدید)
 *   - سقف دفاعی CSV_ROW_CAP = ۵٬۰۰۰ + پرچم capped برای بازخورد کاربر
 *   - نام فایل با مهر زمانی + هدرهای X-Csv-Rows/X-Csv-Capped
 *
 * مصرف‌کننده سرویس: rows → buildCsvDocument → csvFileResponse (در route).
 * تست با بایت خام: سه بایت اول باید EF BB BF باشد (BOM).
 */

export const CSV_ROW_CAP = 5000

/** سلول CSV — نقل‌قول فقط در صورت لزوم؛ درون نقل‌قول، " دوباره می‌شود */
export function csvCell(v: string | null | undefined): string {
  const s = v ?? ''
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export type CsvDocument = { csv: string; filename: string; rows: number; capped: boolean }

/**
 * ساخت سند CSV از ردیف‌های آماده رشته‌ای.
 * header فارسی، rows آرایه‌ای از آرایه رشته (هر سلول از قبل به رشته تبدیل شده باشد).
 */
export function buildCsvDocument(
  prefix: string,
  header: string[],
  rows: (string | number | null | undefined)[][],
  now = new Date(),
): CsvDocument {
  const capped = rows.length > CSV_ROW_CAP
  const limited = capped ? rows.slice(0, CSV_ROW_CAP) : rows
  const lines = [
    header.map(csvCell).join(','),
    ...limited.map((r) => r.map((c) => csvCell(c == null ? '' : String(c))).join(',')),
  ]
  // BOM — بدون آن اکسل فارسی CSV را با کدپیج ویندوز باز می‌کند
  const csv = `\uFEFF${lines.join('\r\n')}`
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  return { csv, filename: `${prefix}-${stamp}.csv`, rows: limited.length, capped }
}
