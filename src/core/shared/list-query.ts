import 'server-only'

/**
 * قرارداد فهرست سرور استاندارد (P1-T3) — امضای یکسان همه APIهای فهرست
 *
 * پارامترهای ورودی (URLSearchParams):
 *  - q        جستجوی متنی (اختیاری)
 *  - filters  کلیدهای مجاز هر endpoint (box/type/status/warehouseId/…) — فقط کلیدهای لیست سفید
 *  - sort     «کلید:جهت» مثل date:desc — کلید از نقشه مجاز endpoint ترجمه می‌شود
 *  - page     صفحه ۱-مبنا (پیش‌فرض ۱)
 *  - pageSize اندازه صفحه (پیش‌فرض ۱۵، سقف ۱۰۰ — سقف‌های قدیمی ۱۰۰/۱۲۰ برداشته شدند: P1-T12)
 *
 * پاکت خروجی یکسان (ListEnvelope در types/platform):
 *  { items, total, page, pageSize, pageCount }
 *
 * قاعده: هر فهرست جدید از این پس همین امضا را دارد — route فقط ترجمه HTTP است.
 */

export type SortDir = 'asc' | 'desc'

export type ParsedListQuery = {
  q: string | undefined
  /** فقط کلیدهای مجاز، trimmed و غیرخالی */
  filters: Record<string, string>
  /** کلید مرتب‌سازی پس از ترجمه به فیلد Prisma (نامعبر = مرتب‌سازی پیش‌فرض endpoint) */
  sortField: string | undefined
  sortDir: SortDir
  page: number
  pageSize: number
}

export type ParseListOptions = {
  /** کلیدهای فیلتر مجاز این endpoint (مقادیر خام trimmed؛ اعتبارسنجی معنایی بر عهده سرویس) */
  filters?: string[]
  /** نقشه کلید مرتب‌سازی سمت کلاینت → فیلد Prisma (مثلاً { date: 'docDate', number: 'docNumber' }) */
  sort?: Record<string, string>
  defaultSort?: [string, SortDir]
  defaultPageSize?: number
}

const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 15

/** تجزیه امن پارامترهای فهرست — هر ورودی خراب به پیش‌فرض برمی‌گردد (بدون خطا) */
export function parseListQuery(sp: URLSearchParams, opts: ParseListOptions = {}): ParsedListQuery {
  const allowed = new Set(opts.filters ?? [])

  const filters: Record<string, string> = {}
  for (const key of allowed) {
    const v = sp.get(key)?.trim()
    if (v) filters[key] = v
  }

  // جستجو — فقط trim؛ نرمال‌سازی فارسی‌آگاه (ارقام/ک‌ی) در متن برنامه کاربرد دارد نه LIKE خام
  const qRaw = sp.get('q')?.trim()
  const q = qRaw || undefined

  // مرتب‌سازی — «field:dir» یا «field»
  let sortField: string | undefined
  let sortDir: SortDir = 'desc'
  const sortRaw = sp.get('sort')
  if (sortRaw) {
    const [rawField, rawDir] = sortRaw.split(':')
    const mapped = opts.sort?.[rawField]
    if (mapped) {
      sortField = mapped
      sortDir = rawDir === 'asc' ? 'asc' : 'desc'
    }
  }
  if (!sortField && opts.defaultSort) {
    sortField = opts.defaultSort[0]
    sortDir = opts.defaultSort[1]
  }

  // صفحه‌بندی — ۱-مبنا، مقاوم به ورودی خراب
  const rawPage = Number.parseInt(sp.get('page') ?? '1', 10)
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1
  const rawSize = Number.parseInt(sp.get('pageSize') ?? String(opts.defaultPageSize ?? DEFAULT_PAGE_SIZE), 10)
  const pageSize = Number.isFinite(rawSize) && rawSize >= 1 ? Math.min(rawSize, MAX_PAGE_SIZE) : (opts.defaultPageSize ?? DEFAULT_PAGE_SIZE)

  return { q, filters, sortField, sortDir, page, pageSize }
}

/** ساخت پاکت خروجی یکسان — total از count همزمان با items */
export function listEnvelope<T>(items: T[], total: number, page: number, pageSize: number) {
  return {
    items,
    total,
    page,
    pageSize,
    pageCount: pageSize > 0 ? Math.ceil(total / pageSize) : 1,
  }
}

/** skip محاسبه‌شده از page/pageSize (۱-مبنا → ۰-مبنا) */
export function listSkip(page: number, pageSize: number): number {
  return (page - 1) * pageSize
}
