/**
 * P2-T16 — تولید ۵ نمونه نامه فارسی برای تست OCR (مشترک بین تست API و E2E)
 * روش: رندر HTML با متن فارسی واقعی (شکل‌دهی RTL درست توسط مرورگر) → اسکرین‌شات PNG.
 * این روش بازتولید «اسکن» است: تصویر پیکسلی که tesseract باید بخواند.
 * اجرا: از داخل تست‌ها import می‌شود (نه مستقیم).
 */
import { writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { ab, wait } from './e2e-golden-helpers'

export const SAMPLES_DIR = '/home/z/my-project/download/qa-p2-t16/samples'

export type T16Sample = {
  n: number
  file: string
  /** نوع موردانتظار طبقه‌بندی ساختاردهی (LLM) — null یعنی انتظار پیش‌نویس نداریم */
  expectType: 'INCOMING' | 'OUTGOING' | 'INTERNAL' | null
  /** توکن‌های کلیدی که باید در متن خام OCR پیدا شوند (سنجه دقت) */
  tokens: string[]
  html: string
}

const PAPER = (body: string) => `<!DOCTYPE html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>
body { margin: 0; padding: 24px; background: #fff; }
.paper { width: 700px; background: #fff; color: #000; line-height: 2.2; font-size: 20px; text-align: right; direction: rtl; font-family: serif; }
h2 { text-align: center; margin: 0 0 6px; font-size: 22px; font-weight: bold; }
.meta { display: flex; justify-content: space-between; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 6px 0; margin-bottom: 12px; font-size: 17px; }
p { margin: 4px 0; }
b { font-weight: bold; }
</style></head><body><div class="paper">${body}</div></body></html>`

export const T16_SAMPLES: T16Sample[] = [
  {
    n: 1,
    file: 'sample1.png',
    expectType: 'INCOMING',
    tokens: ['یادآوری تسویه', 'صورت‌حساب', '۵۱۲۳', 'ابنیه مسکن', '۴۸۰', 'تسویه'],
    html: PAPER(`
<h2>به نام خدا</h2>
<div class="meta"><span>شماره: ۷۸۲۱</span><span>تاریخ: ۱۴۰۵/۰۶/۱۰</span></div>
<p><b>گیرنده:</b> شرکت صنایع کاشی آراد سرام پیشرو</p>
<p><b>فرستنده:</b> بازرگانی ابنیه مسکن تهران</p>
<p><b>موضوع: یادآوری تسویه صورت‌حساب شماره ۵۱۲۳</b></p>
<p>با سلام و احترام، به استحضار می‌رساند صورت‌حساب شماره ۵۱۲۳ مورخ ۱۴۰۵/۰۵/۲۰ مربوط به خرید کاشی کف هنوز تسویه نشده است. خواهشمند است حداکثر تا پایان هفته جاری نسبت به واریز مبلغ ۴۸۰ میلیون ریال اقدام فرمایید. در صورت عدم تسویه، ارسال سفارش‌های بعدی متوقف خواهد شد.</p>`),
  },
  {
    n: 2,
    file: 'sample2.png',
    expectType: 'OUTGOING',
    tokens: ['تغییر ساعت بارگیری', 'رنگ و لعاب', '۱۴۰۵/۰۷/۰۱', 'خودروها', 'هماهنگ'],
    html: PAPER(`
<h2>به نام خدا</h2>
<div class="meta"><span>شماره: ۲۴۳</span><span>تاریخ: ۱۴۰۵/۰۶/۱۲</span></div>
<p><b>فرستنده:</b> واحد فروش صنایع کاشی آراد سرام</p>
<p><b>گیرنده:</b> شرکت رنگ و لعاب اصفهان</p>
<p><b>موضوع: اعلام تغییر ساعت بارگیری محصولات</b></p>
<p>با احترام، بدین‌وسیله به اطلاع می‌رساند از تاریخ ۱۴۰۵/۰۷/۰۱ ساعت بارگیری محصولات از دفتر مرکزی به ساعت ۷:۳۰ تا ۱۴:۰۰ تغییر می‌یابد. خواهشمند است برنامه ارسال خودروهای خود را متناسب با ساعت جدید هماهنگ فرمایید.</p>`),
  },
  {
    n: 3,
    file: 'sample3.png',
    expectType: 'INTERNAL',
    tokens: ['خرابی', 'رولواره', 'خط ۲', 'تعمیر اضطراری', 'ظرفیت', 'فوری'],
    html: PAPER(`
<h2>به نام خدا</h2>
<div class="meta"><span>شماره: ۱۲۰۴</span><span>تاریخ: ۱۴۰۵/۰۶/۱۴</span></div>
<p><b>گیرنده:</b> ریاست کارخانه</p>
<p><b>فرستنده:</b> واحد فنی و نگهداری</p>
<p><b>موضوع: گزارش خرابی ناگهانی کوره رولواره خط ۲ (فوری)</b></p>
<p>با سلام، در پی بازدید امروز، ترک شفت اصلی رولواره شماره ۲ خط پخت مشاهده شد. به دلیل ریسک توقف تولید، درخواست تعمیر اضطراری و سفارش قطعه یدکی با کد تجهیزات را داریم. تا رفع خرابی، خط ۲ با نصف ظرفیت کار می‌کند.</p>`),
  },
  {
    n: 4,
    file: 'sample4.png',
    expectType: 'INCOMING',
    tokens: ['قانون کار', 'ایمنی', 'جریمه', 'تابستان', 'رفاه اجتماعی'],
    html: PAPER(`
<h2>به نام خدا</h2>
<div class="meta"><span>شماره: ۹۱۰۲</span><span>تاریخ: ۱۴۰۵/۰۶/۰۸</span></div>
<p><b>گیرنده:</b> مدیریت منابع انسانی هلدینگ</p>
<p><b>فرستنده:</b> اداره کل تعاون، کار و رفاه اجتماعی استان اصفهان</p>
<p><b>موضوع: اعلام نظارت فصلی و الزامات ایمنی کارگاه‌ها</b></p>
<p>با احترام، در اجرای ماده ۹۱ قانون کار و آیین‌نامه ایمنی، کلیه واحدهای تولیدی موظفند تا پایان فصل تابستان ناظر ایمنی معرفی کنند و گزارش آموزش پرسنل را ارسال دارند. عدم اجرای این الزام مشمول جریمه خواهد شد. گواهی دوره آموزشی جدید در سایت اداره کل قابل دریافت است.</p>`),
  },
  {
    n: 5,
    file: 'sample5.png',
    expectType: null, // «سری» → سیاست داده: ساختاردهی LLM انجام نمی‌شود (پیش‌نویس null)
    tokens: ['قرارداد مشترک', 'سرمایه‌گذاری', 'بند ۷', 'تکثیر', 'سری'],
    html: PAPER(`
<h2>به نام خدا</h2>
<div class="meta"><span>شماره: ۴۴۱</span><span>تاریخ: ۱۴۰۵/۰۶/۱۳</span></div>
<p><b>گیرنده:</b> مدیرعامل</p>
<p><b>فرستنده:</b> واحد حقوقی</p>
<p><b>موضوع: قرارداد مشترک سرمایه‌گذاری — سری</b></p>
<p>با احترام، پیش‌نویس قرارداد مشترک با بانک سرمایه‌گذاری جهت بررسی ارسال می‌شود. با توجه به حساسیت اطلاعات، این نامه سری است و تکثیر آن ممنوع می‌باشد. نظر حقوقی ما پس از بررسی بند ۷ اعلام خواهد شد.</p>`),
  },
]

/** PNG یک‌پیکسلی — برای سنجه «تصویر بدون متن» (۴۲۲) */
export const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

/** رندر همه نمونه‌ها با مرورگر — فقط اگر فایل‌ها هنوز وجود ندارند (idempotent) */
export function generateSamples(force = false): { ok: boolean; generated: number } {
  if (!existsSync(SAMPLES_DIR)) mkdirSync(SAMPLES_DIR, { recursive: true })
  let generated = 0
  for (const s of T16_SAMPLES) {
    const png = `${SAMPLES_DIR}/${s.file}`
    if (!force && existsValidSample(png)) continue
    const htmlPath = `/tmp/t16-sample${s.n}.html`
    writeFileSync(htmlPath, s.html)
    ab('set viewport 820 1100')
    ab(`open file://${htmlPath}`)
    // فرصت رندر + بارگذاری فونت فارسی (درس این تست: اسکرین‌شات فوری = صفحه سفید)
    wait(600)
    // ⚠ فلگ --full در این نسخه agent-browser تصویر خالی می‌دهد — اسکرین‌شات viewport با ارتفاع کافی (۱۱۰۰)
    const r = ab(`screenshot ${png}`)
    if (!r.includes('✓') || !existsValidSample(png)) {
      console.error(`  ✗ تولید نمونه ${s.n} ناموفق: ${r.slice(0, 80)}`)
      return { ok: false, generated }
    }
    generated++
  }
  return { ok: true, generated }
}

/** نمونه معتبر = وجود فایل + داشتن محتوای تصویری (سایز > ۶KB؛ صفحه سفید ~۵KB است) */
function existsValidSample(png: string): boolean {
  if (!existsSync(png)) return false
  return statSync(png).size > 6000
}
