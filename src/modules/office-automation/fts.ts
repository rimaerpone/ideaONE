import 'server-only'

/**
 * لایه جستجوی تمام‌متن نامه‌ها (P2-T5 / R8) — پوشش سروری fts-sql مشترک
 *
 * کاربرد:
 *  - service.ts: جستجوی فهرست/CSV از این‌جا (با عقب‌گرد contains در نبود توکن/خطا)
 *  - createLetter: قلاب upsert پس از ثبت
 *  - instrumentation.ts: ensure در بوت (گرم‌کردن ایندکس)
 *  - seed/seed-big: مستقیم از fts-sql می‌گیرند (PrismaClient خودشان) — نه از این فایل
 *    (چون 'server-only' در اسکریپت‌های مستقل bun قابل import نیست).
 */
import { db } from '@/core/shared/db'
import {
  ensureLetterFtsWith,
  rebuildLetterFtsWith,
  upsertLetterFtsWith,
  ftsLetterPageWith,
  ftsLetterExportIdsWith,
  type LetterFtsFilter,
} from '@/modules/office-automation/fts-sql'

export { buildLetterFtsMatch } from '@/modules/office-automation/fts-sql'
export type { LetterFtsFilter } from '@/modules/office-automation/fts-sql'

/** خودترمیم — پیش از هر جستجو (دو COUNT ارزان) و در بوت سرور */
export function ensureLetterFts() {
  return ensureLetterFtsWith(db)
}

/** بازسازی کامل — پس از seed (اسکریپت‌ها) یا ترمیم drift */
export function rebuildLetterFts() {
  return rebuildLetterFtsWith(db)
}

/** سینک تک‌نامه — قلاب createLetter؛ شکست بی‌صدا */
export function upsertLetterFts(letterId: string) {
  return upsertLetterFtsWith(db, letterId)
}

/** صفحه جستجو (id + total) — ترتیب/صفحه/فیلتر در SQL؛ hydration با Prisma در سرویس */
export function ftsLetterPage(
  match: string,
  f: LetterFtsFilter,
  sortField: string | undefined,
  sortDir: 'asc' | 'desc',
  page: number,
  pageSize: number,
) {
  return ftsLetterPageWith(db, match, f, sortField, sortDir, page, pageSize)
}

/** idهای خروجی CSV (مرتب، سقف cap+1) */
export function ftsLetterExportIds(
  match: string,
  f: LetterFtsFilter,
  sortField: string | undefined,
  sortDir: 'asc' | 'desc',
  cap: number,
) {
  return ftsLetterExportIdsWith(db, match, f, sortField, sortDir, cap)
}
