/**
 * برچسب‌های فارسی اقدامات حسابرسی (P1-T15) — مشترک سرور و کلاینت
 *
 * چرا این فایل جدا است: CSV خروجی حسابرسی (سرور) و تب حسابرسی (کلاینت)
 * باید همان برچسب‌ها را نشان دهند؛ نبود وابستگی 'server-only' در این فایل
 * عمدی است تا هر دو سمت از یک منبع حقیقت تغذیه شوند.
 */

export const ACTION_FA: Record<string, string> = {
  LOGIN: 'ورود', LOGIN_FAILED: 'تلاش ورود ناموفق', LOGIN_NEW_DEVICE: 'ورود از دستگاه جدید', LOGOUT: 'خروج', CREATE: 'ثبت', POST: 'قطعی‌سازی', 'CREATE+POST': 'ثبت و قطعی‌سازی',
  REFER: 'ارجاع', APPROVE: 'تأیید', ANSWER: 'پاسخ', ARCHIVE: 'بایگانی', CANCEL: 'ابطال',
  MODULE_TOGGLE: 'تغییر پلاگین', AI_SUGGEST: 'پیشنهاد AI', AI_APPLY: 'اعمال AI', ATTACH: 'پیوست',
  FLAG_TOGGLE: 'تغییر پرچم ویژگی', COMPANY_SETTING: 'تنظیم شرکت',
  SWITCH_COMPANY: 'تغییر شرکت', REQUEST_APPROVE: 'تأیید درخواست', REQUEST_REJECT: 'رد درخواست',
  REQUEST_FULFILL: 'تأمین درخواست',
  USER_CREATE: 'ایجاد کاربر', USER_UPDATE: 'ویرایش کاربر', PASSWORD_RESET_ADMIN: 'بازنشانی گذرواژه (مدیر)',
  PASSWORD_CHANGE_SELF: 'تغییر گذرواژه (خودکار)', SESSIONS_REVOKED: 'پایان نشست‌ها', PROFILE_UPDATE: 'ویرایش پروفایل',
  // P2.5-U5 / P3 — برچسب سجل‌های نسل ۲ (قبلاً خام نمایش داده می‌شدند)
  DOC_ITEMS_EDIT: 'ویرایش اقلام سند', CODE_COMPOSE: 'صدور کد ساختارمند',
  PRINT: 'چاپ', // P2.5-U7 / P2-T7 — سجل حاکمیتی چاپ نامه (مخصوصاً برای نامه‌های محرمانه)
  OCR: 'استخراج متن اسکن', // P2-T16 — OCR نامه اسکن‌شده (پیش‌پرکردن فرم ثبت، HITL)
  JOB_RUN: 'اجرای کار زمان‌بند', // P2-T11 — اجرای دستی از حاکمیت
}

/** برچسب نمایشی اقدام — برای CSV: «ثبت (CREATE)» و برای UI فقط فارسی */
export function actionLabelFa(action: string, withCode = false): string {
  const fa = ACTION_FA[action]
  if (!fa) return action
  return withCode ? `${fa} (${action})` : fa
}
