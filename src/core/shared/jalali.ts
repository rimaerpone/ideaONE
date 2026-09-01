// تبدیل تاریخ میلادی ↔ جلالی و قالب‌بندی فارسی
// الگوریتم استاندارد jalaali-js (بدون وابستگی خارجی)

// توجه: مطابق jalaali-js، تقسیم گریز به صفر است (نه floor)
function div(a: number, b: number) {
  return Math.trunc(a / b)
}

function jalCal(jy: number) {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097,
    2192, 2262, 2324, 2394, 2456, 3178,
  ]
  const bl = breaks.length
  const gy = jy + 621
  let leapJ = -14
  let jp = breaks[0]
  let jump = 0
  for (let i = 1; i < bl; i += 1) {
    const jm = breaks[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ += div(jump, 33) * 8 + div(jump % 33, 4)
    jp = jm
  }
  let n = jy - jp
  leapJ += div(n, 33) * 8 + div((n % 33) + 3, 4)
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  let leap = (((n + 1) % 33) - 1) % 4
  if (leap === -1) leap = 4
  return { leap, gy, march }
}

function g2d(gy: number, gm: number, gd: number) {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * ((gm + 9) % 12) + 2, 5) +
    gd -
    34840408
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

function mod(a: number, b: number) {
  return a - b * Math.trunc(a / b)
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(mod(j, 1461), 4) * 5 + 308
  const gd = div(mod(i, 153), 5) + 1
  const gm = mod(div(i, 153), 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return { gy, gm, gd }
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy)
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
}

function d2j(jdn: number) {
  const gy = d2g(jdn).gy
  let jy = gy - 621
  const r = jalCal(jy)
  const jdn1f = g2d(gy, 3, r.march)
  let k = jdn - jdn1f
  if (k >= 0) {
    if (k <= 185) {
      const jm = 1 + div(k, 31)
      const jd = (k % 31) + 1
      return { jy, jm, jd }
    }
    k -= 186
  } else {
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }
  const jm = 7 + div(k, 30)
  const jd = (k % 30) + 1
  return { jy, jm, jd }
}

export function toJalali(date: Date): { jy: number; jm: number; jd: number } {
  return d2j(g2d(date.getFullYear(), date.getMonth() + 1, date.getDate()))
}

// جلالی → میلادی (برای ورودی دیت‌پیکر جلالی در فرم‌ها)
export function toGregorianDate(jy: number, jm: number, jd: number): Date {
  const g = d2g(j2d(jy, jm, jd))
  return new Date(g.gy, g.gm - 1, g.gd)
}

// تجزیه ورودی تاریخ جلالی کاربر: «۱۴۰۵/۰۶/۰۵» یا «1405/6/5» (با ارقام فارسی/عربی/لاتین)
// خروجی: Date میلادی یا null اگر نامعتبر بود
export function parseJalaliInput(input: string): Date | null {
  if (!input) return null
  const normalized = input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[.\-]/g, '/')
  const m = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (!m) return null
  const jy = Number(m[1])
  const jm = Number(m[2])
  const jd = Number(m[3])
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null
  const date = toGregorianDate(jy, jm, jd)
  // اعتبارسنجی رفت‌وبرگشت (مثلاً ۳۱ اردیبهشت وجود ندارد)
  const back = toJalali(date)
  return back.jy === jy && back.jm === jm && back.jd === jd ? date : null
}

// رشته جلالی استاندارد «YYYY/MM/DD» با ارقام لاتین (برای value دیت‌پیکر)
export function toJalaliInputString(date: Date): string {
  const { jy, jm, jd } = toJalali(date)
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`
}

export function jalaliYear(date: Date): number {
  return toJalali(date).jy
}

const JMONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

export function faDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
}

export function faNumber(n: number, digits = 0): string {
  return faDigits(n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }))
}

/**
 * قالب واحد شماره سند/نامه (P2-T6): «۱۴۰۵/۴۲» — سال جلالی از تاریخ ثبت + شماره ترتیبی سالانه.
 * شماره‌گذاری DocCounter سالانه است (unique companyId+scope+year)، پس سالِ سند = سال جلالیِ تاریخ ثبت.
 * date نبود = امروز (مثلاً توستِ بلافاصله پس از ثبت — شماره همان لحظه از سال جاری تخصیص یافته).
 */
export function faDocNumber(num: number, date?: Date | string | null): string {
  const d = date ? new Date(date) : new Date()
  return `${faDigits(jalaliYear(d))}/${faDigits(num)}`
}

export function formatJalali(date: Date | string, withTime = false): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const { jy, jm, jd } = toJalali(d)
  let out = `${faDigits(jy)}/${faDigits(String(jm).padStart(2, '0'))}/${faDigits(String(jd).padStart(2, '0'))}`
  if (withTime) {
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    out += ` - ${faDigits(hh)}:${faDigits(mm)}`
  }
  return out
}

export function formatJalaliLong(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const { jy, jm, jd } = toJalali(d)
  return `${faDigits(jd)} ${JMONTHS[jm - 1]} ${faDigits(jy)}`
}

export function relativeFa(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diffMs = Date.now() - d.getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'همین الان'
  if (mins < 60) return `${faDigits(mins)} دقیقه پیش`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${faDigits(hours)} ساعت پیش`
  const days = Math.round(hours / 24)
  if (days < 7) return `${faDigits(days)} روز پیش`
  return formatJalali(d)
}
