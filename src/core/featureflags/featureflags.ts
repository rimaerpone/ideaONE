import 'server-only'
import { db } from '@/core/shared/db'

/**
 * هسته Feature Flags — سرویس ۱۳ از ۱۸ سرویس هسته سند منبع (بخش ۵.۱: Configuration & Feature Flags)
 * الگوی استفاده: isFeatureEnabled('ai.letter-assist') قبل از مسیرهای حساس/تدریجی.
 * کش کوتاه‌عمر درون‌فرایندی برای پرهیز از کوئری تکراری در هر درخواست.
 */
const TTL_MS = 15_000
const cache = new Map<string, { value: boolean; at: number }>()

export async function isFeatureEnabled(key: string, fallback = false): Promise<boolean> {
  try {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value
    const flag = await db.featureFlag.findUnique({ where: { key } })
    const value = flag ? flag.enabled : fallback
    cache.set(key, { value, at: Date.now() })
    return value
  } catch {
    // خطای زیرساخت هرگز نباید مسیر اصلی کسب‌وکار را بندازد — مقدار پیش‌فرض
    return fallback
  }
}

export function invalidateFeatureFlags(): void {
  cache.clear()
}

export async function listFeatureFlags() {
  return db.featureFlag.findMany({ orderBy: { key: 'asc' } })
}

export async function setFeatureEnabled(key: string, enabled: boolean) {
  const flag = await db.featureFlag.update({ where: { key }, data: { enabled } })
  invalidateFeatureFlags()
  return flag
}
