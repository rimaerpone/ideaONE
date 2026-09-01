// تست واحد نرمال‌سازی عددی (P1-T16 — ماتریس SC-007)
// اجرا: bunx tsx scripts/test-normalize.ts
import { parseNumericInput, normalizeNumericString } from '../src/core/shared/normalize'

let failures = 0
function check(input: string, expected: number | null, name: string) {
  const got = parseNumericInput(input)
  const mark = got === expected ? 'PASS' : 'FAIL'
  if (got !== expected) failures += 1
  console.log(`[${mark}] ${name}: «${input}» → ${got} (انتظار ${expected})`)
}

console.log('--- ارقام و جداکننده‌ها ---')
check('۱۲۳', 123, 'ارقام فارسی')
check('١٢٣', 123, 'ارقام عربی')
check('123', 123, 'ارقام لاتین')
check('۱٫۵', 1.5, 'اعشار فارسی ٫')
check('1.5', 1.5, 'اعشار لاتین')
check('1/5', 1.5, 'ممیز به‌جای نقطه')
check('۱٬۲۰۰', 1200, 'هزارگان فارسی ٬')
check('1,200', 1200, 'هزارگان ویرگول')
check('۱ ۲۳۴', 1234, 'فاصله هزارگان')
check('12 34', 1234, 'فاصله میانی')

console.log('--- علامت منفی ---')
check('−۵', -5, 'منفی یونیکد U+2212')
check('-5', -5, 'منفی استاندارد')
check('–2.5', -2.5, 'خط تیره en-dash')
check('−۱۲٫۷۵', -12.75, 'منفی فارسی + اعشار فارسی')

console.log('--- ورودی‌های نامعتبر ---')
check('', null, 'خالی')
check('abc', null, 'حروف')
check('12a3', null, 'عدد+حرف')
check('1..5', null, 'دو ممیز')
check('5.', null, 'ممیز پایانی')
check('-', null, 'فقط منفی')
check('1-2', null, 'منفی وسط')

console.log('--- ترکیب‌های واقعی کاربر ---')
check('۱۲٬۵۰۰٫۲۵', 12500.25, 'هزارگان+اعشار فارسی کامل')
check('  ۱٫۵  ', 1.5, 'فاصله دور')
check('0', 0, 'صفر مجاز (سند انبار)')
check('۰', 0, 'صفر فارسی')

// رشته نرمال‌شده
const ns = normalizeNumericString('۱٬۲۰۰٫۵')
if (ns === '1200.5') console.log('[PASS] normalizeNumericString: ۱٬۲۰۰٫۵ → 1200.5')
else { console.log(`[FAIL] normalizeNumericString → ${ns}`); failures += 1 }

console.log(failures === 0 ? '\nنتیجه: همه تست‌های نرمال‌سازی عددی پاس شدند ✅' : `\nنتیجه: ${failures} تست رد شد ❌`)
process.exit(failures === 0 ? 0 : 1)
