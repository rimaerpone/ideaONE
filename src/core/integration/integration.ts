import 'server-only'
import { db } from '@/core/shared/db'

/**
 * هسته Integration Bus — سرویس ۱۸ از ۱۸ سرویس هسته سند منبع (بخش ۵.۱ + پوشه integration بخش ۱۰)
 * فاز صفر: کاتالوگ حاکمیت‌شده کانکتورها (ثبت، وضعیت، جهت) — هر اتصال بیرونی باید
 * «اول در این رجیستری ثبت و سپس پیاده‌سازی» شود؛ اتصال ناشناس به سیستم بیرونی ممنوع.
 * اجرای واقعی کانکتورها در فاز P2+ (خرید/فروش/مؤدیان) طبق نقشه راه.
 */

export const CONNECTOR_KIND_FA: Record<string, string> = {
  TAX: 'مالیات',
  BANK: 'بانک',
  ATTENDANCE: 'حضور و غیاب',
  E_INVOICE: 'صورتحساب الکترونیکی',
  LEGACY: 'سیستم‌های موجود',
  GENERIC: 'عمومی',
}

export const CONNECTOR_STATUS_FA: Record<string, string> = {
  PLANNED: 'برنامه‌ریزی‌شده',
  CONFIGURED: 'پیکربندی‌شده',
  LIVE: 'فعال',
}

export async function listConnectors() {
  return db.integrationConnector.findMany({ orderBy: { code: 'asc' } })
}
