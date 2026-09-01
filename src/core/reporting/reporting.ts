import 'server-only'
import { db } from '@/core/shared/db'

/**
 * هسته Reporting Metadata — سرویس ۱۶ از ۱۸ سرویس هسته سند منبع (بخش ۵.۱: Reporting Metadata)
 * کاتالوگ متمرکز گزارش‌های پلتفرم: هر گزارش با شناسه پایدار، ماژول مالک، دسته، موتور (ساخته‌شده/AI)
 * و فاز تحقق ثبت می‌شود. اهداف:
 *   - فهرست واحد گزارش‌ها برای نقشه راه و رابط کاربری (تنظیمات → گزارش‌ها)
 *   - جای‌گذاری گزارش‌های عملیاتی در ماژول مالک و گزارش‌های مدیریتی در BI (P6)
 *   - پوشش گزارش‌های انطباقی (مالیاتی/حسابرسی) با ردیابی فاز
 */

export const REPORT_CATEGORY_FA: Record<string, string> = {
  OPERATIONAL: 'عملیاتی',
  MANAGEMENT: 'مدیریتی',
  COMPLIANCE: 'انطباقی',
}

export async function listReportDefinitions() {
  return db.reportDefinition.findMany({ orderBy: [{ moduleCode: 'asc' }, { code: 'asc' }] })
}
