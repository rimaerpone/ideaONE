import 'server-only'
import { db } from '@/core/shared/db'

/**
 * P1-T28 — گارد API در سطح ماژول (SC-008 شاخه API)
 *
 * منطق دوکلیدیِ منو باید در API هم حاکم باشد (آینه view-registry):
 *   فعال = PlatformModule.status==='ACTIVE' (کلید سراسری)
 *          AND (activation ندارد OR enabled)  (کلید شرکتی)
 *
 * ماژول خاموش (سراسری یا شرکتی) → API آن ماژول 404 فارسی برمی‌گرداند.
 *
 * نکته حیاتی (درس اولین اجرای تست): در حالت dev هر route نمونه‌ی جداگانه‌ای از
 * ماژول‌های مشترک می‌گیرد — Map درون‌ماژولی بین routeها مشترک نیست و
 * invalidateModuleAccess فقط کشِ route فراخوان را پاک می‌کرد. سینگلتون globalThis
 * (همان الگوی PrismaClient در core/shared/db) کش را بین همه routeها به اشتراک می‌گذارد.
 */
const TTL_MS = 15_000

type AccessCache = Map<string, { value: boolean; at: number }>

const g = globalThis as unknown as { __ioModuleAccessCache?: AccessCache }
const cache: AccessCache = (g.__ioModuleAccessCache ??= new Map())

export async function isModuleEnabled(code: string, companyId: string | null): Promise<boolean> {
  const key = `${code}|${companyId ?? '-'}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  try {
    const mod = await db.platformModule.findUnique({ where: { code }, select: { id: true, status: true } })
    let value = false
    if (mod && mod.status === 'ACTIVE') {
      if (companyId) {
        const act = await db.moduleActivation.findUnique({
          where: { moduleId_companyId: { moduleId: mod.id, companyId } },
          select: { enabled: true },
        })
        value = !act || act.enabled
      } else {
        // بدون شرکت فعال — رفتار محافظه‌کارانه: گارد منو در UI حاکم است
        value = true
      }
    }
    cache.set(key, { value, at: Date.now() })
    return value
  } catch {
    // خطای زیرساخت مسیر اصلی را نمی‌بندد — گارد منو در UI حاکم باقی می‌ماند
    return true
  }
}

export function invalidateModuleAccess(): void {
  cache.clear()
}
