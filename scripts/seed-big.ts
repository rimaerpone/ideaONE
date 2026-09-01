// ============================================================
// P1-T10 — ژنراتور داده حجمی برای تست کارایی (seed:big)
// اجرا: bun scripts/seed-big.ts
//   [--letters=10000] [--docs=5000] [--products=500] [--requests=2000] [--audit=3000] [--partners=120]
//
// اصول:
//  - شماره اسناد/نامه‌ها/درخواست‌ها از DocCounter هر شرکت «ادامه» می‌یابد (برخورد یکتایی ندارد)
//  - ارجاع‌های خارجی فقط به موجودیت‌های واقعی (کاربر عضو شرکت / انبار همان شرکت / کالای همان شرکت)
//  - توزیع زمانی: ~۵۵٪ در ۴۵ روز اخیر (روند داشبورد پر شود) + بقیه در ۱۸ ماه گذشته
//  - درج دسته‌ای createMany (۵۰۰ ردیف) — هدف: ~۴۰هزار ردیف در کمتر از یک دقیقه
//  - تکرار اجرا = افزودن مجدد (ایده‌امپوتنت نیست؛ برای بازتنظیم کامل، seed اصلی + این اسکریپت)
// ============================================================
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'

const db = new PrismaClient()

// عنصر آرایه‌ای createMany — data می‌تواند تکی یا آرایه باشد؛ ما فقط آرایه می‌دهیم
type ElOf<T> = T extends (infer E)[] ? E : T

// ---------- آرگومان‌ها ----------
const args = new Map(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([a-zA-Z]+)=(\d+)$/)
  return m ? [m[1], Number(m[2])] : [a.replace(/^--/, ''), 1]
}))
const OPT = {
  letters: args.get('letters') ?? 10000,
  docs: args.get('docs') ?? 5000,
  products: args.get('products') ?? 500,
  requests: args.get('requests') ?? 2000,
  audit: args.get('audit') ?? 3000,
  partners: args.get('partners') ?? 120,
}

// ---------- ابزار ----------
const now = Date.now()
const DAY = 86400000
const rnd = (n: number) => Math.floor(Math.random() * n)
const pick = <T>(arr: readonly T[]): T => arr[rnd(arr.length)]
/** تاریخ گذشته با توزیع وزن‌دار به سمت روزهای اخیر (روند داشبورد پر بماند) */
function pastDate(maxDays = 540): Date {
  // ۵۵٪ در بازه ۴۵ روز اخیر، ۴۵٪ باقیمانده در maxDays
  const span = Math.random() < 0.55 ? 45 : maxDays
  return new Date(now - Math.random() * span * DAY)
}
const id = () => randomUUID()
const chunk = <T>(arr: T[], size = 500): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ---------- استخرهای محتوای فارسی واقع‌گرایانه (کاشی و سرامیک) ----------
const LINES = ['پرسلان کریستال', 'پرسلان مات', 'کاشی دیوار کریستال', 'کاشی دیوار مات', 'گرانیتی روستیک', 'پرسلان لپه‌ای', 'کاشی کف ضد لغزش', 'پرسلان بوک‌مچ'] as const
const SIZES = ['۴۰×۴۰', '۵۰×۵۰', '۶۰×۶۰', '۳۰×۹۰', '۶۰×۱۲۰', '۸۰×۸۰', '۲۵×۷۵', '۱۵×۹۰'] as const
const COLORS = ['سفید', 'کرم', 'طوسی', 'بژ', 'قهوه‌ای روشن', 'سرمه‌ای', 'دوست گرم', 'نگین سیاه', 'صدفی', 'بادمجانی'] as const
const SURFACES = ['پولیش', 'مات', 'روستیک', 'LT', 'اسلب'] as const
const GRADES = ['1', '2', 'ضایعات'] as const
const TONES = ['', 'A', 'B', 'C'] as const
const CALIBERS = ['', 'کالیبر ۱', 'کالیبر ۲'] as const

const LETTER_SUBJECTS = [
  'استعلام قیمت مواد اولیه فصل تیر', 'اعلام بهره‌برداری خط پرس جدید', 'پاسخ استعلام مالیاتی دوره قبل',
  'قرارداد فروش پروژه‌ای مجتمع تجاری آرمان', 'دعوت به جلسه کمیته کیفیت هفتگی', 'گزارش مغایرت موجودی انبار محصول',
  'درخواست ارزیابی فنی ماشین چاپ روتاری', 'ابلاغ سیاست فروش سه‌ماهه آینده', 'پیگیری گواهی استاندارد ملی محصورات',
  'اطلاع‌رسانی تغییر ساعات کاری شیفت شب', 'پاسخ به ایرادات حسابرسی داخلی', 'درخواست مرخصی تجمیعی پرسنل تولید',
  'صورت‌جلسه کمیته ایمنی و بهداشت', 'ابلاغ بودجه نگهداری و تعمیرات فوری', 'استعلام نرخ کرایه حمل بین‌شهری',
  'اعلام تخفیف دوره‌ای نمایندگی‌های فروش', 'درخواست صدور پیش‌فاکتور صادراتی', 'پیگیری ترخیص کالا از گمرک بندرعباس',
  'گزارش عملکرد ماهانه خط لعاب', 'هماهنگی بازدید مشتری از سالن نمایش', 'درخواست ترمیم پالت‌بند اتوماتیک',
  'ابلاغ دستورالعمل انبارش کالای درجه ۲', 'پاسخ به نامه رسمی اداره کار', 'دعوت به نمایشگاه صنعت ساختمان تهران',
  'استعلام بیمه حمل‌ونقل باربری', 'گزارش تحلیل شکست خزشی در کوره رولری', 'درخواست خرید قطعات یدکی پرس ۲۰۰۰ تنی',
  'اطلاع‌رسانی قطعی برنامه‌ریزی‌شده برق کارخانه', 'پاسخ به نقد و بررسی حسابرس مستقل', 'ابلاغ فهرست قیمت مصوب جدید',
] as const
const LETTER_SENDERS = [
  'شرکت بازرگانی پارس سنگ', 'اداره کل امور مالیاتی استان اصفهان', 'اداره کار و امور اجتماعی',
  'شرکت حمل‌ونقل سریع آسمان', 'نمایندگی کاشی صدرا شیراز', 'مهندسین مشاور بنا گستر',
  'شرکت بیمه اتکایی امید', 'گمرک جمهوری اسلامی بندرعباس', 'انجمن صنفی تولیدکنندگان کاشی',
  'شرکت پخش البرز', 'مدیریت پروژه مجتمع آرمان', 'شرکت فنی و مهندسی رولر تک',
] as const
const LETTER_RECEIVERS = [
  'شرکت ساختمانی آرمان تدبیر', 'اداره استاندارد و تحقیقات صنعتی', 'شرکت پروژه‌سازی هفت سنگ',
  'بیمه ایران شعبه مرکزی', 'نمایندگی کاشی الماس شرق', 'شرکت عمرانی سپهر کاوش',
] as const
const LETTER_BODY = (subject: string) =>
  `با سلام و احترام؛\n\nبه استحضار می‌رساند در پی نامه شماره قبل و با موضوع «${subject}»، موارد خواسته‌شده پس از بررسی کارشناسی واحد مربوطه تنظیم و جهت تصمیم‌گیری نهایی تقدیم می‌گردد. ضمناً یادآور می‌شود رعایت مهلت مقرر در پاسخ‌گویی، بابت پرهیز از توقف فرایند جاری، الزامی است.\n\nدر صورت نیاز به توضیحات تکمیلی، کارشناس ذی‌ربط در ساعات اداری پاسخگوی همکاران محترم خواهد بود.\n\nاین ننامه در قالب مکاتبات رسمی سازمان صادر شده و کلیه اصول مکاتبات اداری شامل اختصار، وضوح، رعایت سلسله‌مراتب و لحن رسمی در آن رعایت شده است.`

const DOC_NOTES = ['تحویل در شیفت صبح', 'مغایرت جزئی در شمارش', 'بارگیری از اسکله ۲', 'مرجوعی پروژه‌ای', 'انتقال برای بسته‌بندی', 'نمونه‌برداری آزمایشگاه', 'خسارت حمل', 'تسویه با نمایندگی', null] as const
const PARTNER_NAMES = [
  'کاشی الماس شرق', 'سرامیک صدرا', 'بازرگانی پارس سنگ', 'ساختمانی آرمان تدبیر', 'پخش البرز کاشی',
  'نمایندگی اطلس سرام', 'مجتمع تجاری کوروش', 'عمرانی سپهر کاوش', 'سنگ و سرامیک رز غرب',
  'صنایع ساختمانی دلتا', 'بازرگانی خاورمیانه', 'سرامیک جوان', 'کاشی بهاران', 'نور سرام اصفهان',
  'فروشگاه زنجیره‌ای ساختمان', 'پیمانکاری هفت سنگ', 'سرامیک کویر', 'آرتا سرام تبریز', 'مهندسین بنا گستر',
  'پارس فایبر سمنت', 'ایلیا سرام', 'تاساراتی نوین', 'دکوراسیون داخلی نگین', 'سنگ‌بری صنعتی زاگرس',
] as const
const AUDIT_ACTIONS = ['LOGIN', 'LOGOUT', 'CREATE', 'POST', 'REFER', 'ARCHIVE', 'MODULE_TOGGLE', 'PROFILE_UPDATE', 'CREATE+POST', 'CANCEL', 'REJECT', 'APPROVE'] as const
const REQUEST_NEEDS = ['واحد تولید خط لعاب', 'کارخانه شماره ۲', 'واحد بسته‌بندی', 'اداره فروش', 'کارگاه سورتینگ', 'واحد فنی و نگهداری', 'شیفت شب خط پرس'] as const
const REQUEST_NOTES = ['برای سفارش فوری مشتری', 'مصرف دوره‌ای معمول', 'تأمین موجودی حداقلی', 'پروژه خاص با تاریخ تحویل', 'جبران کسری شمارش قبل', 'خرابی غیرمنتظره پالت', null] as const

// ---------- توزیع‌ها ----------
const STATUS = {
  letter: ['DRAFT', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'ANSWERED', 'ANSWERED', 'ANSWERED', 'ARCHIVED', 'ARCHIVED'] as const,
  doc: ['POSTED', 'POSTED', 'POSTED', 'POSTED', 'POSTED', 'POSTED', 'POSTED', 'DRAFT', 'DRAFT', 'CANCELLED'] as const,
  req: ['PENDING', 'PENDING', 'APPROVED', 'APPROVED', 'APPROVED', 'APPROVED', 'REJECTED', 'FULFILLED', 'FULFILLED'] as const,
}
const DOC_TYPES = ['RECEIPT', 'RECEIPT', 'ISSUE', 'ISSUE', 'ISSUE', 'TRANSFER', 'COUNT'] as const

async function main() {
  const t0 = Date.now()
  console.log('── seed:big (P1-T10) ──')
  console.log(`هدف: ${OPT.letters.toLocaleString('fa-IR')} نامه · ${OPT.docs.toLocaleString('fa-IR')} سند · ${OPT.products.toLocaleString('fa-IR')} کالا · ${OPT.requests.toLocaleString('fa-IR')} درخواست · ${OPT.audit.toLocaleString('fa-IR')} سجل · ${OPT.partners.toLocaleString('fa-IR')} شریک`)

  // ---------- بستر موجود ----------
  const companies = await db.company.findMany({ where: { type: 'COMPANY' }, orderBy: { sortOrder: 'asc' } })
  if (companies.length === 0) throw new Error('هیچ شرکتی یافت نشد — ابتدا seed اصلی را اجرا کنید')
  // وزن واقع‌گرایانه حجم فعالیت شرکت‌ها (آراد > اصفهان > نیلو > لیان)
  const WEIGHTS = [0.35, 0.25, 0.22, 0.18]
  const weights = companies.map((_, i) => WEIGHTS[i] ?? (1 / companies.length))

  const memberships = await db.membership.findMany({ select: { companyId: true, userId: true, user: { select: { isActive: true } } } })
  const membersOf = new Map<string, string[]>()
  for (const m of memberships) {
    if (!m.user.isActive) continue
    const list = membersOf.get(m.companyId) ?? []
    list.push(m.userId)
    membersOf.set(m.companyId, list)
  }
  const warehouses = await db.warehouse.findMany({ where: { isActive: true } })
  const whOf = new Map<string, typeof warehouses>()
  for (const w of warehouses) {
    const list = whOf.get(w.companyId) ?? []
    list.push(w)
    whOf.set(w.companyId, list)
  }
  // تکمیل انبارهای مفقود شرکت‌ها (شکاف داده seed اصلی — مثل لیان کاوش فراز)
  const WH_TEMPLATE = [
    { suffix: 'F01', kind: 'FINISHED', label: 'انبار محصول' },
    { suffix: 'R01', kind: 'RAW', label: 'انبار مواد اولیه' },
  ]
  for (const c of companies) {
    if (whOf.get(c.id)?.length) continue
    const created: typeof warehouses = []
    for (const t of WH_TEMPLATE) {
      const w = await db.warehouse.create({
        data: {
          companyId: c.id,
          code: `${c.code.slice(0, 2)}-${t.suffix}`,
          name: `${t.label} ${c.name}`,
          kind: t.kind,
        },
      })
      created.push(w)
    }
    whOf.set(c.id, created)
    console.log(`+ انبار مفقود شرکت ${c.code} تکمیل شد: ${created.map((w) => w.code).join('، ')}`)
  }
  for (const c of companies) {
    if (!membersOf.get(c.id)?.length) throw new Error(`شرکت ${c.code} عضو فعال ندارد`)
  }

  // شماره‌گذاری: ادامه از DocCounter سال جاری جلالی
  const year = 1405
  const counters = await db.docCounter.findMany({ where: { year } })
  const counterKey = (companyId: string, scope: string) => `${companyId}:${scope}`
  const nextNum = new Map<string, number>()
  for (const c of counters) nextNum.set(counterKey(c.companyId, c.scope), c.value)
  const takeNum = (companyId: string, scope: string) => {
    const k = counterKey(companyId, scope)
    const v = (nextNum.get(k) ?? 0) + 1
    nextNum.set(k, v)
    return v
  }

  /** انتخاب شرکت با وزن */
  const companyIds = companies.map((c) => c.id)
  const weightedCompany = () => {
    const r = Math.random()
    let acc = 0
    for (let i = 0; i < companies.length; i++) {
      acc += weights[i]
      if (r < acc) return companies[i]
    }
    return companies[companies.length - 1]
  }

  // ---------- ۱) شرکای تجاری ----------
  const tP = Date.now()
  const partnerRows = Array.from({ length: OPT.partners }, (_, i) => {
    const isCustomer = Math.random() < 0.65
    const base = PARTNER_NAMES[i % PARTNER_NAMES.length]
    const suffix = i >= PARTNER_NAMES.length ? ` شعبه ${Math.floor(i / PARTNER_NAMES.length) + 1}` : ''
    return {
      id: id(),
      kind: isCustomer ? 'CUSTOMER' : 'SUPPLIER',
      goldenName: `${base}${suffix}`,
      nationalId: String(10100000000 + i * 7777),
      isActive: Math.random() < 0.92,
    }
  })
  await chunk(partnerRows).reduce(async (p, c) => { await p; await db.partner.createMany({ data: c }) }, Promise.resolve())
  const partnerInstances = partnerRows.flatMap((p) => {
    // هر شریک در ۱ تا ۳ شرکت نمونه عملیاتی دارد
    const n = 1 + rnd(3)
    const chosen = new Set<string>()
    for (let i = 0; i < n; i++) chosen.add(pick(companyIds))
    return [...chosen].map((cid) => ({
      id: id(),
      partnerId: p.id,
      companyId: cid,
      accountCode: `ACC-${10000 + rnd(90000)}`,
      creditLimit: pick([0, 0, 500000000, 1000000000, 2500000000, 5000000000]),
      terms: pick(['نقد', '۳۰ روزه', '۴۵ روزه', 'چک سه‌ماهه', 'اعتباری تا سقف']),
    }))
  })
  await chunk(partnerInstances).reduce(async (p, c) => { await p; await db.partnerInstance.createMany({ data: c }) }, Promise.resolve())
  console.log(`✓ شرکا: ${partnerRows.length} رکورد طلایی + ${partnerInstances.length} نمونه عملیاتی (${Date.now() - tP}ms)`)

  // ---------- ۲) محصولات ----------
  const tPr = Date.now()
  const existingProducts = await db.product.findMany({ select: { id: true, companyId: true } })
  const prodsOf = new Map<string, { id: string; code: string }[]>()
  for (const p of existingProducts) {
    const list = prodsOf.get(p.companyId) ?? []
    list.push({ id: p.id, code: '' })
    prodsOf.set(p.companyId, list)
  }
  const productRows: { id: string; companyId: string; code: string; name: string; productLine: string; size: string; color: string; surface: string; cartonArea: number; cartonsPerPallet: number }[] = []
  let pSeq = existingProducts.length
  for (let i = 0; i < OPT.products; i++) {
    const c = weightedCompany()
    const line = pick(LINES), size = pick(SIZES), color = pick(COLORS), surface = pick(SURFACES)
    pSeq++
    productRows.push({
      id: id(),
      companyId: c.id,
      code: `BULK-${String(pSeq).padStart(5, '0')}`,
      name: `${line} ${size} ${color}`,
      productLine: line,
      size,
      color,
      surface,
      cartonArea: pick([1.44, 1.5, 1.92, 2.16, 2.88, 0.72]),
      cartonsPerPallet: pick([24, 30, 36, 40, 48]),
    })
  }
  await chunk(productRows).reduce(async (p, c) => { await p; await db.product.createMany({ data: c }) }, Promise.resolve())
  for (const p of productRows) {
    const list = prodsOf.get(p.companyId) ?? []
    list.push({ id: p.id, code: p.code })
    prodsOf.set(p.companyId, list)
  }
  console.log(`✓ کالاها: ${productRows.length} کالای جدید (${Date.now() - tPr}ms)`)

  // ---------- ۳) موجودی انبار ----------
  const tS = Date.now()
  const existingStock = await db.stockItem.findMany({ select: { warehouseId: true, productId: true, tone: true, caliber: true, grade: true } })
  const stockSeen = new Set(existingStock.map((s) => `${s.warehouseId}|${s.productId}|${s.tone}|${s.caliber}|${s.grade}`))
  const stockRows: { id: string; warehouseId: string; productId: string; tone: string; caliber: string; grade: string; qtyM2: number }[] = []
  const targetStock = Math.max(2000, OPT.products * 6)
  let guard = 0
  while (stockRows.length < targetStock && guard < targetStock * 4) {
    guard++
    const c = weightedCompany()
    const wh = pick(whOf.get(c.id)!)
    const prod = pick(prodsOf.get(c.id)!)
    const tone = pick(TONES), caliber = pick(CALIBERS), grade = pick(GRADES)
    const key = `${wh.id}|${prod.id}|${tone}|${caliber}|${grade}`
    if (stockSeen.has(key)) continue
    stockSeen.add(key)
    stockRows.push({
      id: id(),
      warehouseId: wh.id,
      productId: prod.id,
      tone, caliber, grade,
      qtyM2: Math.round(Math.random() * 4800 * 100) / 100,
    })
  }
  await chunk(stockRows).reduce(async (p, c) => { await p; await db.stockItem.createMany({ data: c }) }, Promise.resolve())
  console.log(`✓ موجودی: ${stockRows.length} ردیف واریانت (${Date.now() - tS}ms)`)

  // ---------- ۴) نامه‌ها + ارجاع‌ها ----------
  const tL = Date.now()
  type LetterRow = ElOf<NonNullable<NonNullable<Parameters<typeof db.letter.createMany>[0]>['data']>>
  const letterRows: LetterRow[] = []
  const letterMeta: { id: string; companyId: string; creatorId: string; createdAt: Date }[] = []
  for (let i = 0; i < OPT.letters; i++) {
    const c = weightedCompany()
    const members = membersOf.get(c.id)!
    const creator = pick(members)
    const type = pick(['INCOMING', 'INCOMING', 'OUTGOING', 'OUTGOING', 'INTERNAL', 'INTERNAL'] as const)
    const status = pick(STATUS.letter)
    const urgency = Math.random() < 0.15 ? 'URGENT' : 'NORMAL'
    const confidentiality = Math.random() < 0.08 ? (Math.random() < 0.3 ? 'SECRET' : 'CONFIDENTIAL') : 'NORMAL'
    const createdAt = pastDate(540)
    const subject = pick(LETTER_SUBJECTS)
    // نگه‌دارنده: نامه باز = یکی از اعضا؛ بایگانی/پاسخ‌داده = بی‌نگه‌دار
    const holder = status === 'IN_PROGRESS' ? pick(members) : null
    const lid = id()
    letterRows.push({
      id: lid,
      companyId: c.id,
      number: takeNum(c.id, 'LETTER'),
      type,
      subject,
      body: LETTER_BODY(subject),
      senderTitle: type === 'INCOMING' ? pick(LETTER_SENDERS) : null,
      receiverTitle: type === 'OUTGOING' ? pick(LETTER_RECEIVERS) : null,
      confidentiality,
      urgency,
      deadlineAt: Math.random() < 0.3 ? new Date(createdAt.getTime() + (3 + rnd(25)) * DAY) : null,
      status,
      currentHolderId: holder,
      creatorId: creator,
      aiCategory: Math.random() < 0.12 ? pick(['مالی', 'فنی', 'اداری', 'فروش', 'خرید', 'منابع انسانی']) : null,
      aiSummary: null,
      createdAt,
      updatedAt: createdAt,
    })
    letterMeta.push({ id: lid, companyId: c.id, creatorId: creator, createdAt })
  }
  await chunk(letterRows, 1000).reduce(async (p, c) => { await p; await db.letter.createMany({ data: c }) }, Promise.resolve())
  // ارجاع‌ها: ~۳۰٪ نامه‌ها ۱-۲ ارجاع دارند (زنجیره‌ای: from = نگه‌دارنده قبلی)
  type RefRow = ElOf<NonNullable<NonNullable<Parameters<typeof db.letterReferral.createMany>[0]>['data']>>
  const refRows: RefRow[] = []
  for (const lm of letterMeta) {
    if (Math.random() > 0.3) continue
    const members = membersOf.get(lm.companyId)!.filter((u) => u !== lm.creatorId)
    if (members.length === 0) continue
    const hops = 1 + (Math.random() < 0.35 ? 1 : 0)
    let from = lm.creatorId
    let ts = lm.createdAt.getTime()
    for (let h = 0; h < hops && h < members.length; h++) {
      const to = pick(members.filter((m) => m !== from))
      if (!to) break
      ts += (2 + rnd(96)) * 3600000
      if (ts > now) ts = now
      refRows.push({
        id: id(),
        letterId: lm.id,
        fromUserId: from,
        toUserId: to,
        action: pick(['REFER', 'REFER', 'REFER', 'ANSWER', 'APPROVE', 'ARCHIVE']),
        note: Math.random() < 0.25 ? pick(['جهت اطلاع و اقدام لازم', 'لطفاً نظر فنی را اعلام فرمایید', 'پیگیری شود', 'در جلسه بعدی مطرح گردد']) : null,
        deadlineAt: Math.random() < 0.2 ? new Date(ts + 7 * DAY) : null,
        createdAt: new Date(ts),
      })
      from = to
    }
  }
  await chunk(refRows, 1000).reduce(async (p, c) => { await p; await db.letterReferral.createMany({ data: c }) }, Promise.resolve())
  console.log(`✓ نامه‌ها: ${letterRows.length.toLocaleString('fa-IR')} نامه + ${refRows.length.toLocaleString('fa-IR')} ارجاع (${Date.now() - tL}ms)`)

  // ---------- ۵) اسناد انبار + اقلام ----------
  const tD = Date.now()
  type DocRow = ElOf<NonNullable<NonNullable<Parameters<typeof db.warehouseDoc.createMany>[0]>['data']>>
  const docRows: DocRow[] = []
  const docMeta: { id: string; companyId: string; createdAt: Date }[] = []
  for (let i = 0; i < OPT.docs; i++) {
    const c = weightedCompany()
    const whs = whOf.get(c.id)!
    const wh = pick(whs)
    const type = pick(DOC_TYPES)
    const createdAt = pastDate(540)
    const toWh = type === 'TRANSFER' ? pick(whs.filter((w) => w.id !== wh.id)) : undefined
    docRows.push({
      id: id(),
      companyId: c.id,
      docNumber: takeNum(c.id, 'WHDOC'),
      type,
      warehouseId: wh.id,
      toWarehouseId: toWh?.id ?? null,
      partnerName: null, // پس از ساخت، از شرکای همان شرکت پر می‌شود
      status: pick(STATUS.doc),
      docDate: createdAt,
      note: pick(DOC_NOTES) as string | null,
      createdById: pick(membersOf.get(c.id)!),
    })
    docMeta.push({ id: docRows[docRows.length - 1].id!, companyId: c.id, createdAt })
  }
  // partnerName پس از ساخت (نام طلایی شرکای همان شرکت)
  const partnerNameByCompany = new Map<string, string[]>()
  for (const pi of partnerInstances) {
    const list = partnerNameByCompany.get(pi.companyId) ?? []
    const golden = partnerRows.find((p) => p.id === pi.partnerId)
    if (golden) list.push(golden.goldenName)
    partnerNameByCompany.set(pi.companyId, list)
  }
  for (let i = 0; i < docRows.length; i++) {
    const d = docRows[i] as { partnerName: string | null; type: string; companyId: string }
    if (d.type === 'RECEIPT' || d.type === 'ISSUE') {
      const names = partnerNameByCompany.get(d.companyId)
      d.partnerName = names && names.length ? pick(names) : pick([...LETTER_SENDERS])
    }
  }
  await chunk(docRows, 1000).reduce(async (p, c) => { await p; await db.warehouseDoc.createMany({ data: c }) }, Promise.resolve())
  // اقلام سند: ۱ تا ۵ قلم
  type ItemRow = ElOf<NonNullable<NonNullable<Parameters<typeof db.docItem.createMany>[0]>['data']>>
  const itemRows: ItemRow[] = []
  for (const dm of docMeta) {
    const prods = prodsOf.get(dm.companyId)!
    const n = 1 + rnd(5)
    for (let k = 0; k < n; k++) {
      const prod = pick(prods)
      itemRows.push({
        id: id(),
        docId: dm.id,
        productId: prod.id,
        tone: pick(TONES),
        caliber: pick(CALIBERS),
        grade: pick(GRADES),
        qtyM2: Math.round((10 + Math.random() * 1900) * 100) / 100,
        note: null,
      })
    }
  }
  await chunk(itemRows, 1000).reduce(async (p, c) => { await p; await db.docItem.createMany({ data: c }) }, Promise.resolve())
  console.log(`✓ اسناد انبار: ${docRows.length.toLocaleString('fa-IR')} سند + ${itemRows.length.toLocaleString('fa-IR')} قلم (${Date.now() - tD}ms)`)

  // ---------- ۶) درخواست‌های کالا ----------
  const tR = Date.now()
  type ReqRow = ElOf<NonNullable<NonNullable<Parameters<typeof db.goodsRequest.createMany>[0]>['data']>>
  const reqRows: ReqRow[] = []
  const reqMeta: { id: string; companyId: string }[] = []
  for (let i = 0; i < OPT.requests; i++) {
    const c = weightedCompany()
    const status = pick(STATUS.req)
    const createdAt = pastDate(365)
    const decided = status !== 'PENDING'
    reqRows.push({
      id: id(),
      companyId: c.id,
      reqNumber: takeNum(c.id, 'GOODSREQ'),
      requesterId: pick(membersOf.get(c.id)!),
      warehouseId: pick(whOf.get(c.id)!).id,
      status,
      neededFor: pick(REQUEST_NEEDS),
      note: pick(REQUEST_NOTES) as string | null,
      createdAt,
      decidedAt: decided ? new Date(createdAt.getTime() + (1 + rnd(96)) * 3600000) : null,
    })
    reqMeta.push({ id: reqRows[reqRows.length - 1].id!, companyId: c.id })
  }
  await chunk(reqRows, 1000).reduce(async (p, c) => { await p; await db.goodsRequest.createMany({ data: c }) }, Promise.resolve())
  type ReqItemRow = ElOf<NonNullable<NonNullable<Parameters<typeof db.goodsRequestItem.createMany>[0]>['data']>>
  const reqItemRows: ReqItemRow[] = []
  for (const rm of reqMeta) {
    const prods = prodsOf.get(rm.companyId)!
    const n = 1 + rnd(3)
    for (let k = 0; k < n; k++) {
      reqItemRows.push({
        id: id(),
        requestId: rm.id,
        productId: pick(prods).id,
        qtyM2: Math.round((5 + Math.random() * 800) * 100) / 100,
      })
    }
  }
  await chunk(reqItemRows, 1000).reduce(async (p, c) => { await p; await db.goodsRequestItem.createMany({ data: c }) }, Promise.resolve())
  console.log(`✓ درخواست‌ها: ${reqRows.length.toLocaleString('fa-IR')} درخواست + ${reqItemRows.length.toLocaleString('fa-IR')} قلم (${Date.now() - tR}ms)`)

  // ---------- ۷) سجل حسابرسی ----------
  const tA = Date.now()
  type AuditRow = ElOf<NonNullable<NonNullable<Parameters<typeof db.auditLog.createMany>[0]>['data']>>
  const allUsers = await db.user.findMany({ select: { id: true }, where: { isActive: true } })
  const auditRows: AuditRow[] = []
  for (let i = 0; i < OPT.audit; i++) {
    const c = weightedCompany()
    const createdAt = pastDate(180)
    auditRows.push({
      id: id(),
      userId: Math.random() < 0.95 ? pick(allUsers).id : null,
      companyId: Math.random() < 0.9 ? c.id : null,
      action: pick(AUDIT_ACTIONS),
      entity: pick(['letter', 'warehouseDoc', 'goodsRequest', 'user', 'warehouse', 'module', 'session']),
      entityId: null,
      details: null,
      createdAt,
    })
  }
  await chunk(auditRows, 1000).reduce(async (p, c) => { await p; await db.auditLog.createMany({ data: c }) }, Promise.resolve())
  console.log(`✓ سجل حسابرسی: ${auditRows.length.toLocaleString('fa-IR')} رکورد (${Date.now() - tA}ms)`)

  // ---------- ۸) به‌روزرسانی شمارنده‌ها ----------
  for (const [k, v] of nextNum) {
    const [companyId, scope] = k.split(':')
    await db.docCounter.upsert({
      where: { companyId_scope_year: { companyId, scope, year } },
      create: { companyId, scope, year, value: v },
      update: { value: v },
    })
  }

  // ---------- گزارش نهایی ----------
  const [lc, dc, pr, rq, st, au, ri, di, gr] = await Promise.all([
    db.letter.count(), db.warehouseDoc.count(), db.product.count(), db.goodsRequest.count(),
    db.stockItem.count(), db.auditLog.count(), db.letterReferral.count(), db.docItem.count(), db.goodsRequestItem.count(),
  ])
  // P2-T5 — بازسازی ایندکس جستجوی تمام‌متن نامه‌ها پس از درج حجمی (دستور پخت R8)
  const { rebuildLetterFtsWith } = await import('../src/modules/office-automation/fts-sql')
  const ftsRows = await rebuildLetterFtsWith(db)

  console.log('── وضعیت نهایی دیتابیس ──')
  console.log(`ایندکس FTS نامه‌ها: ${ftsRows.toLocaleString('fa-IR')} ردیف`)
  console.log(`نامه: ${lc.toLocaleString('fa-IR')} · سند: ${dc.toLocaleString('fa-IR')} (${di.toLocaleString('fa-IR')} قلم) · کالا: ${pr.toLocaleString('fa-IR')} · موجودی: ${st.toLocaleString('fa-IR')} · درخواست: ${rq.toLocaleString('fa-IR')} (${gr.toLocaleString('fa-IR')} قلم) · ارجاع: ${ri.toLocaleString('fa-IR')} · سجل: ${au.toLocaleString('fa-IR')}`)
  console.log(`⏱ کل: ${((Date.now() - t0) / 1000).toFixed(1)} ثانیه`)
}

main()
  .catch((e) => { console.error('خطای seed:big:', e); process.exit(1) })
  .finally(() => db.$disconnect())
