import 'server-only'

/**
 * P1-T7: سیاست گذرواژه سازمانی — تنها مرجع اعتبارسنجی رمز در کل پلتفرم.
 *
 * قواعد (به‌روزرسانی SPEC پلتفرم §امنیت):
 *  - دست‌کم ۸ نویسه و حداکثر ۱۲۸ نویسه
 *  - حداقل یک حرف و حداقل یک رقم (تعریف «رمز ضعیف» در معیار پذیرش)
 *  - نباید شامل نام کاربری باشد (حساس به بزرگی/کوچکی نیست)
 *  - کاراکترهای کنترلی و فاصله ابتدا/انتها مجاز نیستند
 *
 * این تابع هم در فرم‌های UI (پیام زیر فیلد) و هم سمت سرور (آینه) استفاده می‌شود؛
 * پاسخ null یعنی قبول، در غیر این صورت پیام فارسی خطا.
 */
export function validatePasswordPolicy(
  password: unknown,
  username?: string,
): string | null {
  if (typeof password !== 'string') return 'گذرواژه الزامی است'
  const pw = password
  if (pw.length < 8) return 'گذرواژه باید دست‌کم ۸ نویسه باشد'
  if (pw.length > 128) return 'گذرواژه نباید بیش از ۱۲۸ نویسه باشد'
  if (pw !== pw.trim()) return 'گذرواژه نباید با فاصله شروع یا پایان یابد'
  if (/[\u0000-\u001f\u007f]/.test(pw)) return 'گذرواژه شامل نویسه‌های کنترلی مجاز نیست'
  if (!/\p{L}/u.test(pw) || !/\p{Nd}/u.test(pw)) {
    return 'گذرواژه باید ترکیبی از حروف و اعداد باشد'
  }
  if (username) {
    const u = username.trim().toLowerCase()
    if (u.length >= 3 && pw.toLowerCase().includes(u)) {
      return 'گذرواژه نباید شامل نام کاربری باشد'
    }
  }
  return null
}
