// seed پایلوت پلتفرم عملیاتی سازمانی — داده واقعی هلدینگ کاشی و سرامیک
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'node:crypto'

const db = new PrismaClient()

function hash(password: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

const now = Date.now()
const daysAgo = (n: number, h = 10, m = 0) => new Date(now - n * 86400000 + (h - 10) * 3600000 + m * 60000)
const daysAhead = (n: number) => new Date(now + n * 86400000)

async function main() {
  console.log('پاک‌سازی...')
  await db.outboxEvent.deleteMany()
  await db.notification.deleteMany()
  await db.auditLog.deleteMany()
  await db.aiInvocation.deleteMany()
  await db.attachment.deleteMany()
  await db.fileObject.deleteMany()
  await db.scheduledJob.deleteMany()
  await db.integrationConnector.deleteMany()
  await db.reportDefinition.deleteMany()
  await db.featureFlag.deleteMany()
  await db.letterReferral.deleteMany()
  await db.letter.deleteMany()
  await db.goodsRequestItem.deleteMany()
  await db.goodsRequest.deleteMany()
  await db.docItem.deleteMany()
  await db.warehouseDoc.deleteMany()
  await db.stockItem.deleteMany()
  await db.warehouse.deleteMany()
  await db.partnerInstance.deleteMany()
  await db.partner.deleteMany()
  await db.product.deleteMany()
  await db.moduleMenu.deleteMany()
  await db.moduleActivation.deleteMany()
  await db.platformModule.deleteMany()
  await db.session.deleteMany()
  await db.membership.deleteMany()
  await db.docCounter.deleteMany()
  await db.user.deleteMany()
  await db.company.deleteMany()

  console.log('شرکت‌ها...')
  const hold = await db.company.create({ data: { code: 'HOLD', name: 'هلدینگ کاشی و سرامیک', legalName: 'هلدینگ کاشی و سرامیک', type: 'GROUP', sortOrder: 0 } })
  const arad = await db.company.create({ data: { code: 'ARAD', name: 'آراد سرام پیشرو', legalName: 'شرکت آراد سرام پیشرو (سهامی خاص)', type: 'COMPANY', city: 'یزد', sortOrder: 1 } })
  const isf = await db.company.create({ data: { code: 'ISF', name: 'صنایع کاشی اصفهان', legalName: 'شرکت صنایع کاشی اصفهان (سهامی خاص)', type: 'COMPANY', city: 'اصفهان', sortOrder: 2 } })
  const nilo = await db.company.create({ data: { code: 'NLT', name: 'کاشی نیلو', legalName: 'شرکت کاشی نیلو (سهامی خاص)', type: 'COMPANY', city: 'کاشان', sortOrder: 3 } })
  const lian = await db.company.create({ data: { code: 'LKF', name: 'لیان کاوش فراز', legalName: 'شرکت لیان کاوش فراز (سهامی خاص)', type: 'COMPANY', city: 'شیراز', sortOrder: 4 } })

  console.log('کاربران...')
  const mkUser = (username: string, fullName: string, jobTitle: string, password: string, isAdmin: boolean, memberships: { companyId: string; role: string }[]) =>
    db.user.create({
      data: {
        username, fullName, jobTitle, passwordHash: hash(password), isAdmin,
        memberships: { create: memberships },
      },
    })

  const admin = await mkUser('admin', 'سعید محمودی', 'مدیر فناوری اطلاعات هلدینگ', 'admin123', true, [
    { companyId: hold.id, role: 'ADMIN' },
    { companyId: arad.id, role: 'ADMIN' },
    { companyId: isf.id, role: 'ADMIN' },
    { companyId: nilo.id, role: 'ADMIN' },
    { companyId: lian.id, role: 'ADMIN' },
  ])
  const ceo = await mkUser('ceo.arad', 'ناصر رضایی', 'مدیرعامل آراد سرام پیشرو', '12345678', false, [
    { companyId: arad.id, role: 'MANAGER' },
  ])
  const dabir = await mkUser('dabir.arad', 'مریم احمدی', 'کارشناس دبیرخانه آراد سرام', '12345678', false, [
    { companyId: arad.id, role: 'OPERATOR' },
  ])
  const anbar = await mkUser('anbar.arad', 'علی کریمی', 'مسئول انبار محصول آراد سرام', '12345678', false, [
    { companyId: arad.id, role: 'OPERATOR' },
  ])
  await mkUser('mali.isf', 'فرهاد توکلی', 'مدیر مالی صنایع کاشی اصفهان', '12345678', false, [
    { companyId: isf.id, role: 'MANAGER' },
  ])
  await mkUser('anbar.nilo', 'حسین رستمی', 'مسئول انبار کاشی نیلو', '12345678', false, [
    { companyId: nilo.id, role: 'OPERATOR' },
  ])
  await mkUser('ceo.lian', 'زهرا موسوی', 'مدیرعامل لیان کاوش فراز', '12345678', false, [
    { companyId: lian.id, role: 'MANAGER' },
  ])
  const cfo = await mkUser('cfo.hold', 'کامران دلاور', 'معاون مالی هلدینگ', '12345678', false, [
    { companyId: hold.id, role: 'MANAGER' },
    { companyId: arad.id, role: 'VIEWER' },
    { companyId: isf.id, role: 'VIEWER' },
    { companyId: nilo.id, role: 'VIEWER' },
    { companyId: lian.id, role: 'VIEWER' },
  ])

  console.log('رجیستری پلاگین‌ها — تاکسونومی سه‌لایه ADR-008، هم‌راستا با فهرست ۳۳ ماژولی v1.1 (CMD-011)...')
  // منبع حقیقت شناسه‌ها: upload/module-list.md v1.1 (CMD-009/010) — هر Plugin ID مصوبِ ردیف‌دار دقیقاً با شناسهٔ v1.1 ثبت می‌شود
  // حساب ۴۱ ردیف: ۵ زیرساخت هسته (خارج از ۳۳) + ۲۸ مصوبِ ردیف‌دار + ۶ چشم‌انداز + ۲ در انتظار ادغام (CMD-011 §۴)
  // ۵ مصوب بدون ردیف مستقل (پوشش پلتفرمی، مجاز در validate-modules): users · access-control · audit-log · notification-center · purchase-vendors (زیر partners)
  type MenuDef = { viewKey: string; label: string; icon: string }
  const modDefs: { code: string; name: string; description: string; icon: string; layer: string; domain: string; targetPhase: string; dependsOn: string[]; status: string; sortOrder: number; menus?: MenuDef[] }[] = [
    // ——— لایه ۱: بستر و حاکمیت ———
    { code: 'dashboard', name: 'داشبورد مدیریتی', description: 'نمای واحد شاخص‌های کلیدی هلدینگ و شرکت فعال؛ روند اسناد، توزیع موجودی و سنجه‌های گیت پایلوت', icon: 'LayoutDashboard', layer: 'FOUNDATION', domain: 'general', targetPhase: 'P0', dependsOn: [], status: 'ACTIVE', sortOrder: 1, menus: [{ viewKey: 'dashboard', label: 'داشبورد', icon: 'LayoutDashboard' }] },
    { code: 'products', name: 'مستر دیتای محصول', description: 'محصول کاشی با سلسله‌مراتب خط/رنگ/ابعاد و تبدیل واحد مترمربع-کارتن-پالت؛ زیربنای انبار و بازرگانی', icon: 'Package', layer: 'FOUNDATION', domain: 'master-data', targetPhase: 'P0', dependsOn: [], status: 'ACTIVE', sortOrder: 2, menus: [{ viewKey: 'products', label: 'محصولات', icon: 'Package' }] },
    { code: 'partners', name: 'مشتریان و تأمین‌کنندگان', description: 'رکورد طلایی گروهی با نمونه عملیاتی هر شرکت: اعتبار، شرایط پرداخت و کد حساب تفصیلی — پوشش مستردیتای purchase-vendors تا P4', icon: 'Users', layer: 'FOUNDATION', domain: 'master-data', targetPhase: 'P0', dependsOn: [], status: 'ACTIVE', sortOrder: 3, menus: [{ viewKey: 'partners', label: 'شرکا', icon: 'Users' }] },
    { code: 'modules', name: 'کاتالوگ پلاگین‌ها', description: 'معماری پلاگین‌محور: کاتالوگ سه‌لایه با فاز تحقق و وابستگی‌ها؛ فعال‌سازی به تفکیک شرکت از پایگاه‌داده', icon: 'Puzzle', layer: 'FOUNDATION', domain: 'general', targetPhase: 'P0', dependsOn: [], status: 'ACTIVE', sortOrder: 4, menus: [{ viewKey: 'modules', label: 'کاتالوگ پلاگین‌ها', icon: 'Puzzle' }] },
    { code: 'settings', name: 'تنظیمات و حاکمیت بستر', description: 'کاربران و نقش‌ها (پوشش پلتفرمی users)، حسابرسی (audit-log)، پرچم‌های ویژگی، کانکتورهای یکپارچه‌سازی، کاتالوگ گزارش‌ها و مصرف AI', icon: 'Settings', layer: 'FOUNDATION', domain: 'general', targetPhase: 'P0', dependsOn: [], status: 'ACTIVE', sortOrder: 5, menus: [
      { viewKey: 'users', label: 'کاربران', icon: 'Users' },
      { viewKey: 'settings', label: 'تنظیمات', icon: 'Settings' },
    ] },
    { code: 'workflow-engine', name: 'موتور گردش کار', description: 'فرایندهای تأیید چندمرحله‌ای مستقل از پلاگین‌های تجاری — دسته ۱ فهرست مصوب v1.1؛ زیربنای تأییدهای مالی/انبار/حقوقی (P5)', icon: 'Workflow', layer: 'FOUNDATION', domain: 'general', targetPhase: 'P5', dependsOn: [], status: 'INACTIVE', sortOrder: 6 },
    { code: 'integration-moadian', name: 'کانکتور مؤدیان', description: 'تبادل صورتحساب رسمی با سامانه مؤدیان — تنها اتصال بیرونی حوزهٔ مالی/بیمه‌ای (حکم صریح کارفرما) — دسته ۹ فهرست مصوب (P10)', icon: 'Cable', layer: 'FOUNDATION', domain: 'finance', targetPhase: 'P10', dependsOn: ['tax-management'], status: 'INACTIVE', sortOrder: 7 },

    // ——— لایه ۲: عملیات کسب‌وکار ———
    { code: 'office-automation', name: 'اتوماسیون اداری و دبیرخانه', description: 'ثبت نامه وارده/صادره/داخلی با شماره‌گذاری خودکار سالانه، کارتابل، ارجاع با تاریخچه، پیوست فایل و دستیار هوشمند با HITL + بایگانی الکترونیک انواع مستندات سازمانی (اداری/مالی/فنی/حقوقی/پرسنلی — نه فقط مکاتبات؛ حکم نشست ۱۰)، تقویم و جلسات و اطلاع‌رسانی سازمانی', icon: 'Mail', layer: 'OPERATIONS', domain: 'office', targetPhase: 'P0', dependsOn: [], status: 'ACTIVE', sortOrder: 20, menus: [
      { viewKey: 'cartable', label: 'کارتابل', icon: 'Inbox' },
      { viewKey: 'letters', label: 'دفتر مکاتبات', icon: 'Mail' },
    ] },
    { code: 'warehouse-inventory', name: 'موجودی و اسناد انبار', description: 'موجودی به تفکیک تون/کالیبر/درجه، اسناد رسید/حواله/انتقال/شمارش با قطعی‌سازی تراکنشی و گردشکار درخواست کالا + تعریف انبار پویا و نامحدود با سه نوع: فیزیکی، مجازی (حسابی/امانی) و پای کار هر ایستگاه تولیدی (حکم نشست ۱۰)', icon: 'Boxes', layer: 'OPERATIONS', domain: 'warehouse', targetPhase: 'P0', dependsOn: ['products'], status: 'ACTIVE', sortOrder: 21, menus: [
      { viewKey: 'stock', label: 'موجودی انبار', icon: 'Boxes' },
      { viewKey: 'whdocs', label: 'اسناد انبار', icon: 'ClipboardList' },
      { viewKey: 'requests', label: 'درخواست کالا', icon: 'ClipboardCheck' },
      { viewKey: 'warehouses', label: 'انبارها', icon: 'Archive' },
    ] },
    { code: 'warehouse-spare-parts', name: 'قطعات یدکی', description: 'انبار اختصاصی قطعات نگهداشت: کدینگ، موجودی و مصرف قطعات ماشین‌آلات (نمونهٔ رسمی استاندارد نام‌گذاری — دسته ۵ فهرست مصوب)', icon: 'Cog', layer: 'OPERATIONS', domain: 'warehouse', targetPhase: 'P3', dependsOn: ['warehouse-inventory'], status: 'INACTIVE', sortOrder: 22 },
    { code: 'weighbridge', name: 'باسکول', description: 'توزین ورودی/خروجی (بار خام/محصول/ضایعات) و اتصال به تیراژ تولید و حمل — دسته ۵ فهرست مصوب (P7)', icon: 'Weight', layer: 'OPERATIONS', domain: 'warehouse', targetPhase: 'P7', dependsOn: ['warehouse-inventory'], status: 'INACTIVE', sortOrder: 23 },
    { code: 'digital-archive', name: 'بایگانی دیجیتال', description: '[در انتظار ادغام به office-automation پس از تکمیل P2 — حکم نشست ۱۰] بایگانی اسناد با متادیتا، نسخه‌بندی و سیاست نگهداری', icon: 'Archive', layer: 'OPERATIONS', domain: 'office', targetPhase: 'P2', dependsOn: ['office-automation'], status: 'INACTIVE', sortOrder: 24 },
    { code: 'chat', name: 'چت سازمانی', description: '[چشم‌انداز — خارج از فهرست ۳۳ الزامی] چت مبتنی بر موتور بالغ (Mattermost/Rocket.Chat) با SSO؛ کانال تحویل است نه دامنهٔ تجاری (لایه زیر notification-center)', icon: 'MessageSquare', layer: 'OPERATIONS', domain: 'office', targetPhase: 'P2', dependsOn: [], status: 'INACTIVE', sortOrder: 25 },
    { code: 'sales-orders', name: 'سفارش فروش', description: 'چرخهٔ فروش: پیش‌فاکتور تا سفارش، موتور قیمت و تخفیف، سقف اعتبار و مرجوعی — تفکیک‌شده از بازرگانی واحد طبق v1.1 (دسته ۳)', icon: 'Briefcase', layer: 'OPERATIONS', domain: 'commercial', targetPhase: 'P8', dependsOn: ['partners', 'products', 'warehouse-inventory'], status: 'INACTIVE', sortOrder: 26 },
    { code: 'purchase-orders', name: 'سفارش خرید', description: 'چرخهٔ خرید: درخواست تا تأیید و رسید خرید، استعلام و قیمت‌گذاری مشروط — تفکیک‌شده از بازرگانی واحد طبق v1.1 (دسته ۴)', icon: 'ShoppingCart', layer: 'OPERATIONS', domain: 'commercial', targetPhase: 'P8', dependsOn: ['partners', 'products'], status: 'INACTIVE', sortOrder: 27 },
    { code: 'sales-crm', name: 'مدیریت مشتریان (CRM)', description: 'پرونده مشتری، پیگیری فرصت و تماس، سرنخ و پیگیری متصل به مستردیتا — دسته ۳ فهرست مصوب', icon: 'HeartHandshake', layer: 'OPERATIONS', domain: 'commercial', targetPhase: 'P8', dependsOn: ['partners'], status: 'INACTIVE', sortOrder: 28 },
    { code: 'sales-distribution', name: 'توزیع و حمل', description: 'برنامه ارسال، بارگیری و نمایندگی‌ها؛ اتصال به باسکول و موجودی — دسته ۳ فهرست مصوب', icon: 'Truck', layer: 'OPERATIONS', domain: 'commercial', targetPhase: 'P8', dependsOn: ['sales-orders', 'warehouse-inventory'], status: 'INACTIVE', sortOrder: 29 },
    { code: 'after-sales', name: 'خدمات پس از فروش', description: 'ثبت ادعا و شکایت خریداران/نمایندگی‌ها؛ در سرامیک منشأ ادعا عمدتاً ایرادات کنترل کیفیت است → ارجاع به کارشناسی کیفیت، تعیین خسارت و تقلیل درجه، تسویه ادعا (حکم کارفرما — دسته ۳ الزامی)', icon: 'LifeBuoy', layer: 'OPERATIONS', domain: 'commercial', targetPhase: 'P8', dependsOn: ['sales-orders', 'quality-control'], status: 'INACTIVE', sortOrder: 30 },
    { code: 'finance-ledger', name: 'دفتر کل و اسناد', description: 'اسناد حسابداری، دفتر معین و تفصیلی، حساب اشخاص (دریافتنی/پرداختنی ادغام‌شده)، مراکز هزینه و گزارش‌های مالی چندشرکتی — دسته ۲', icon: 'Landmark', layer: 'OPERATIONS', domain: 'finance', targetPhase: 'P8', dependsOn: ['partners'], status: 'INACTIVE', sortOrder: 31 },
    { code: 'finance-treasury', name: 'خزانه', description: 'بانک‌ها، صندوق‌ها، دریافت/پرداخت، چک/سفته/ضمانت‌نامه و پیش‌بینی جریان نقدی — دسته ۲ فهرست مصوب', icon: 'Wallet', layer: 'OPERATIONS', domain: 'finance', targetPhase: 'P8', dependsOn: ['finance-ledger'], status: 'INACTIVE', sortOrder: 32 },
    { code: 'finance-costing', name: 'بهای تمام‌شده', description: 'بهای تمام‌شده صنعتی سرامیک بر پایه دستور تولید: مواد مستقیم، دستمزد، سربار، انرژی، استهلاک و تحلیل انحراف — دسته ۲', icon: 'Calculator', layer: 'OPERATIONS', domain: 'finance', targetPhase: 'P8', dependsOn: ['finance-ledger', 'production-mrp'], status: 'INACTIVE', sortOrder: 33 },
    { code: 'finance-asset', name: 'دارایی ثابت', description: 'اموال و ماشین‌آلات کارخانه، گروه‌های دارایی و استهلاک — دسته ۲ فهرست مصوب (P8)', icon: 'Building2', layer: 'OPERATIONS', domain: 'finance', targetPhase: 'P8', dependsOn: ['finance-ledger'], status: 'INACTIVE', sortOrder: 34 },
    { code: 'tax-management', name: 'مالیات و پرونده مالیاتی', description: 'قواعد نرخ و محاسبه مالیات/عوارض در اسناد + پرونده مالیاتی سازمان: اظهارنامه عملکرد، گزارش معاملات فصلی ماده ۱۶۹ (خروجی برای ارسال دستی)، دفاتر قانونی، مهلت‌ها و سوابق مکاتبات — جایگزین finance-tax طبق نیازمندی صریح کارفرما (دسته ۲)', icon: 'Receipt', layer: 'OPERATIONS', domain: 'finance', targetPhase: 'P8', dependsOn: ['finance-ledger'], status: 'INACTIVE', sortOrder: 35 },
    { code: 'hr-personnel', name: 'پرسنل و پرونده', description: 'اطلاعات پرسنلی، قراردادها و سوابق — دسته ۸ فهرست مصوب', icon: 'UserRound', layer: 'OPERATIONS', domain: 'hr', targetPhase: 'P9', dependsOn: [], status: 'INACTIVE', sortOrder: 36 },
    { code: 'hr-attendance', name: 'حضور و غیاب', description: 'کارکرد، تردد و اتصال به دستگاه‌ها؛ شیفت‌های تولید و تحلیل غیبت — دسته ۸', icon: 'CalendarCheck', layer: 'OPERATIONS', domain: 'hr', targetPhase: 'P9', dependsOn: ['hr-personnel'], status: 'INACTIVE', sortOrder: 37 },
    { code: 'hr-payroll', name: 'حقوق و دستمزد', description: 'محاسبه حقوق ایرانی: بیمه، مالیات حقوق، اضافه‌کاری، شب‌کاری، عیدی و سنوات و لیست بیمه (کارکرد داخلی — بدون اتصال الکترونیکی به سامانه بیمه، حکم کارفرما) — دسته ۸', icon: 'Banknote', layer: 'OPERATIONS', domain: 'hr', targetPhase: 'P9', dependsOn: ['hr-personnel', 'hr-attendance'], status: 'INACTIVE', sortOrder: 38 },
    { code: 'org-chart', name: 'چارت سازمانی', description: '[در انتظار ادغام به access-control] سلسله‌مراتب پست‌ها و جانشین‌ها؛ زیربنای گردشکارهای تأیید و تفویض اختیار', icon: 'Network', layer: 'OPERATIONS', domain: 'hr', targetPhase: 'P3', dependsOn: [], status: 'INACTIVE', sortOrder: 39 },
    { code: 'production-mrp', name: 'برنامه‌ریزی تولید', description: 'BOM، مسیر تولید، سفارش تولید و زمان‌بندی خطوط، ردیابی بچ از مواد اولیه تا محصول نهایی و مدیریت ضایعات — دسته ۶', icon: 'Factory', layer: 'OPERATIONS', domain: 'manufacturing', targetPhase: 'P7', dependsOn: ['warehouse-inventory', 'products'], status: 'INACTIVE', sortOrder: 40 },
    { code: 'production-oee', name: 'بهره‌وری تجهیزات (OEE)', description: 'OEE و جمع‌آوری داده خط (ادغام ورودی IoT طبق §۳ module-list) — دسته ۶ فهرست مصوب (P7)', icon: 'Gauge', layer: 'OPERATIONS', domain: 'manufacturing', targetPhase: 'P7', dependsOn: ['production-mrp'], status: 'INACTIVE', sortOrder: 41 },
    { code: 'production-maintenance', name: 'نگهداشت و تعمیرات', description: 'PM پیشگیرانه و پیش‌بینانه، خرابی‌ها و کارت کار، MTBF/MTTR و هزینه‌یابی؛ متصل به انبار قطعات یدکی — دسته ۶', icon: 'Wrench', layer: 'OPERATIONS', domain: 'manufacturing', targetPhase: 'P7', dependsOn: ['warehouse-spare-parts'], status: 'INACTIVE', sortOrder: 42 },
    { code: 'quality-lab', name: 'آزمایشگاه', description: 'نتایج آزمون‌های خمیر/پرس/کوره (جذب آب، مقاومت، ابعاد)، طرح کیفیت، نقاط بازرسی و SPC — دسته ۷', icon: 'FlaskConical', layer: 'OPERATIONS', domain: 'manufacturing', targetPhase: 'P7', dependsOn: ['production-mrp'], status: 'INACTIVE', sortOrder: 43 },
    { code: 'quality-control', name: 'کنترل کیفیت فرایند', description: 'عدم انطباق، CAPA، شکایات مشتری، بلوکه‌سازی محصول نامنطبق و گریدبندی محصول/ضایعات و بازرسی درون خطی — دسته ۷', icon: 'BadgeCheck', layer: 'OPERATIONS', domain: 'manufacturing', targetPhase: 'P7', dependsOn: ['production-mrp', 'quality-lab'], status: 'INACTIVE', sortOrder: 44 },
    { code: 'legal-affairs', name: 'امور حقوقی و قراردادها', description: 'پرونده‌های حقوقی و کیفری، طرفین و وکلا، تنظیم و پیگیری قراردادها و ابلاغ‌ها، مهلت‌ها و جلسات دادرسی و گزارش وضعیت دعاوی (نیازمندی صریح کارفرما — دسته ۱۰)', icon: 'Scale', layer: 'OPERATIONS', domain: 'office', targetPhase: 'P5', dependsOn: [], status: 'INACTIVE', sortOrder: 45 },
    { code: 'portal-customer', name: 'پرتال مشتری', description: 'درگاه سفارش و پیگیری برای مشتریان عمده — دسته ۹ فهرست مصوب (P10، خروج از سندباکس)', icon: 'Globe', layer: 'OPERATIONS', domain: 'commercial', targetPhase: 'P10', dependsOn: ['sales-orders'], status: 'INACTIVE', sortOrder: 46 },

    // ——— لایه ۳: هوشمندی ———
    { code: 'bi-reporting', name: 'گزارشساز و داشبورد', description: 'گزارش‌های تحلیلی و داشبوردهای مدیریتی — گزارش‌ساز حاکمیتی دسته ۹ فهرست مصوب، جدا از استودیوهای چشم‌انداز AI؛ زمان‌بندی و هشدار انحراف (P6)', icon: 'BarChart3', layer: 'INTELLIGENCE', domain: 'ai', targetPhase: 'P6', dependsOn: [], status: 'INACTIVE', sortOrder: 60 },
    { code: 'knowledge-base', name: 'دانش‌نامه سازمانی', description: 'دستورالعمل‌ها و رویه‌های کاری، مدارک استاندارد و پاسخ‌های مرجع — پیوند با پوستهٔ تب‌محور برای «راهنما کنار فرم» و بستر داده آموزشی/AI محصول (پذیرش حکم تفویضی CMD-010 — دسته ۱۰)', icon: 'BookOpen', layer: 'INTELLIGENCE', domain: 'ai', targetPhase: 'P6', dependsOn: [], status: 'INACTIVE', sortOrder: 61 },
    { code: 'ai-agents', name: 'عوامل هوش مصنوعی', description: '[چشم‌انداز — خارج از فهرست ۳۳ الزامی] ۱۳ عامل تخصصی: طبقه‌بندی اسناد، تحلیل مالی، پیش‌بینی خرابی، دستیار HR و ساخت ماژول — همه با نظارت انسانی', icon: 'Bot', layer: 'INTELLIGENCE', domain: 'ai', targetPhase: 'P5', dependsOn: [], status: 'INACTIVE', sortOrder: 62 },
    { code: 'smart-studio', name: 'استودیو هوشمند', description: '[چشم‌انداز — خارج از فهرست ۳۳ الزامی] سازنده کم‌کد ماژول/فرم/گزارش با sandbox، کنترل نسخه، تست خودکار و انتشار با تأیید انسانی', icon: 'Sparkles', layer: 'INTELLIGENCE', domain: 'ai', targetPhase: 'P5', dependsOn: ['ai-agents'], status: 'INACTIVE', sortOrder: 63 },
    { code: 'smart-gallery', name: 'گالری هوشمند', description: '[چشم‌انداز — خارج از فهرست ۳۳ الزامی] گالری محصول با حذف پس‌زمینه، صحنه‌پردازی اتاق، AR/3D و برچسب‌گذاری هوشمند تصاویر', icon: 'Image', layer: 'INTELLIGENCE', domain: 'ai', targetPhase: 'P5', dependsOn: ['products'], status: 'INACTIVE', sortOrder: 64 },
    { code: 'catalog-builder', name: 'کاتالوگ‌ساز هوشمند', description: '[چشم‌انداز — خارج از فهرست ۳۳ الزامی] کاتالوگ چندزبانه با خروجی وب/چاپ/پیام‌رسان متصل به مستردیتای محصول', icon: 'BookOpen', layer: 'INTELLIGENCE', domain: 'ai', targetPhase: 'P5', dependsOn: ['products', 'smart-gallery'], status: 'INACTIVE', sortOrder: 65 },
    { code: 'process-builder', name: 'فرآیندساز هوشمند', description: '[چشم‌انداز — خارج از فهرست ۳۳ الزامی] طراح فرآیند BPMN، گردشکار تأیید، SLA، قواعد کسب‌وکار و اتوماسیون‌های RPA-مانند', icon: 'Workflow', layer: 'INTELLIGENCE', domain: 'ai', targetPhase: 'P5', dependsOn: [], status: 'INACTIVE', sortOrder: 66 },
  ]
  const modules: Record<string, string> = {}
  for (const m of modDefs) {
    const mod = await db.platformModule.create({
      data: {
        code: m.code, name: m.name, description: m.description, icon: m.icon,
        layer: m.layer, domain: m.domain, targetPhase: m.targetPhase,
        dependsOn: JSON.stringify(m.dependsOn), status: m.status, sortOrder: m.sortOrder,
        menus: m.menus ? { create: m.menus.map((mi, i) => ({ ...mi, sortOrder: i + 1 })) } : undefined,
      },
    })
    modules[m.code] = mod.id
  }
  // فعال‌سازی پلاگین‌های فعال برای همه شرکت‌ها
  const companies = [hold, arad, isf, nilo, lian]
  for (const c of companies) {
    for (const m of modDefs.filter((x) => x.status === 'ACTIVE')) {
      await db.moduleActivation.create({ data: { moduleId: modules[m.code], companyId: c.id, enabled: true } })
    }
  }

  console.log('پرچم‌های ویژگی (Feature Flags)...')
  for (const f of [
    { key: 'ai.letter-assist', description: 'دستیار هوشمند نامه — طبقه‌بندی و خلاصه با تأیید انسانی (HITL)', enabled: true },
    { key: 'storage.letter-attachments', description: 'پیوست فایل به نامه (حداکثر ۱۰MB با فهرست انواع مجاز)', enabled: true },
    { key: 'scheduler.enabled', description: 'هسته زمان‌بند — پردازشگر Outbox و پایش دوره‌ای سلامت', enabled: true },
    { key: 'letters.ocr', description: 'P2-T16 — OCR نامه اسکن‌شده: استخراج متن فارسی (tesseract) + پیش‌پرکردن فرم ثبت با HITL', enabled: true },
    { key: 'ai.letter-ocr', description: 'P2-T16 — مرحله دوم OCR: ساختاردهی متن خام با LLM؛ خاموشی = فقط متن خام', enabled: true },
  ]) {
    await db.featureFlag.create({ data: f })
  }

  console.log('کانکتورهای یکپارچه‌سازی (Integration Bus)...')
  for (const c of [
    { code: 'tax-connector', name: 'سامانه مؤدیان و مالیات', kind: 'TAX', direction: 'OUTBOUND', note: 'صورتحساب الکترونیکی و گزارش‌های فصلی — فاز P10' },
    { code: 'bank-connector', name: 'درگاه‌های بانکی', kind: 'BANK', direction: 'BIDIRECTIONAL', note: 'گردش حساب و تسویه — فاز P8' },
    { code: 'attendance-device-connector', name: 'دستگاه‌های حضور و غیاب', kind: 'ATTENDANCE', direction: 'INBOUND', note: 'ثبت ورود/خروج پرسنل — فاز P3' },
    { code: 'e-invoice-connector', name: 'صورتحساب الکترونیکی', kind: 'E_INVOICE', direction: 'OUTBOUND', note: 'امضا و ارسال صورتحساب — فاز P10' },
    { code: 'legacy-connector', name: 'سیستم‌های موجود شرکت‌ها', kind: 'LEGACY', direction: 'BIDIRECTIONAL', note: 'مهاجرت از اکسل و نرم‌افزارهای جزیره‌ای — فاز P2' },
    { code: 'chat-connector', name: 'موتور چت سازمانی', kind: 'GENERIC', direction: 'BIDIRECTIONAL', note: 'SSO و اعلان متقابل با Mattermost/Rocket.Chat — فاز P2' },
  ]) {
    await db.integrationConnector.create({ data: c })
  }

  console.log('کاتالوگ گزارش‌ها (Reporting Metadata)...')
  for (const r of [
    { code: 'letters.register', name: 'دفتر ثبت نامه‌ها', moduleCode: 'office-automation', category: 'OPERATIONAL', engine: 'BUILTIN', targetPhase: 'P0' },
    { code: 'letters.overdue', name: 'نامه‌های دارای مهلت گذشته', moduleCode: 'office-automation', category: 'OPERATIONAL', engine: 'BUILTIN', targetPhase: 'P1' },
    { code: 'letters.cartable-workload', name: 'بار کارتابل کاربران', moduleCode: 'office-automation', category: 'MANAGEMENT', engine: 'BUILTIN', targetPhase: 'P1' },
    { code: 'letters.ai-summary', name: 'خلاصه‌های هوشمند نامه‌ها', moduleCode: 'office-automation', category: 'MANAGEMENT', engine: 'AI', targetPhase: 'P5' },
    { code: 'stock.by-grade', name: 'موجودی به تفکیک درجه', moduleCode: 'warehouse', category: 'OPERATIONAL', engine: 'BUILTIN', targetPhase: 'P0' },
    { code: 'stock.by-warehouse', name: 'موجودی به تفکیک انبار', moduleCode: 'warehouse', category: 'OPERATIONAL', engine: 'BUILTIN', targetPhase: 'P0' },
    { code: 'whdocs.register', name: 'دفتر اسناد انبار', moduleCode: 'warehouse', category: 'OPERATIONAL', engine: 'BUILTIN', targetPhase: 'P0' },
    { code: 'requests.aging', name: 'درخواست‌های معوق', moduleCode: 'warehouse', category: 'MANAGEMENT', engine: 'BUILTIN', targetPhase: 'P1' },
    { code: 'holding.stock-consolidated', name: 'موجودی تلفیقی هلدینگ', moduleCode: 'warehouse', category: 'MANAGEMENT', engine: 'BUILTIN', targetPhase: 'P2' },
    { code: 'products.cross-company', name: 'توزیع محصول بین شرکت‌ها', moduleCode: 'products', category: 'MANAGEMENT', engine: 'BUILTIN', targetPhase: 'P1' },
    { code: 'partners.credit', name: 'اعتبارات و شرایط شرکا', moduleCode: 'partners', category: 'MANAGEMENT', engine: 'BUILTIN', targetPhase: 'P1' },
    { code: 'audit.trail', name: 'گزارش حسابرسی تغییرات', moduleCode: 'platform', category: 'COMPLIANCE', engine: 'BUILTIN', targetPhase: 'P0' },
  ]) {
    await db.reportDefinition.create({ data: r })
  }

  console.log('کارهای زمان‌بند (Scheduler)...')
  for (const j of [
    { key: 'outbox-processor', name: 'پردازشگر رویدادهای Outbox', intervalSec: 60, note: 'تحویل رویدادهای در صف — بسته P0-T18' },
    { key: 'health-monitor', name: 'پایش سلامت', intervalSec: 120, note: 'دیتابیس + سرویس بلادرنگ — بسته P0-T14' },
    { key: 'session-purger', name: 'پاکسازی نشست‌های منقضی', intervalSec: 3600, note: 'بهداشت جدول نشست — بسته P1-T9' },
  ]) {
    await db.scheduledJob.create({ data: j })
  }

  console.log('انبارها — سه نوع مصوب (حکم نشست ۱۰): فیزیکی / مجازی / پای‌کار...')
  const whAradF = await db.warehouse.create({ data: { companyId: arad.id, code: 'AR-F01', name: 'انبار محصول آراد سرام', kind: 'PHYSICAL' } })
  const whAradR = await db.warehouse.create({ data: { companyId: arad.id, code: 'AR-R01', name: 'انبار مواد اولیه آراد سرام', kind: 'PHYSICAL' } })
  const whAradW = await db.warehouse.create({ data: { companyId: arad.id, code: 'AR-W01', name: 'انبار درجه ۲ و ضایعات آراد', kind: 'PHYSICAL' } })
  // دو انبار جدید: اثبات سه‌گانهٔ حکم نشست ۱۰ (بدون موجودی اولیه — فقط تعریف)
  await db.warehouse.create({ data: { companyId: arad.id, code: 'AR-S01', name: 'پای کار پرس سالن ۱ آراد سرام', kind: 'WORKSTATION' } })
  await db.warehouse.create({ data: { companyId: arad.id, code: 'AR-V01', name: 'انبار مجازی کالای در راه آراد سرام', kind: 'VIRTUAL' } })
  const whIsfF = await db.warehouse.create({ data: { companyId: isf.id, code: 'IS-F01', name: 'انبار محصول صنایع کاشی اصفهان', kind: 'PHYSICAL' } })
  const whNltF = await db.warehouse.create({ data: { companyId: nilo.id, code: 'NL-F01', name: 'انبار محصول کاشی نیلو', kind: 'PHYSICAL' } })

  console.log('محصولات...')
  type P = { companyId: string; code: string; name: string; line: string; size: string; color: string; surface: string; cartonArea: number; pallet: number }
  const pdefs: P[] = [
    { companyId: arad.id, code: 'ARD-P60-WHT', name: 'پرسلان پولیش سفید کلاسیک', line: 'پرسلان پولیش', size: '۶۰×۶۰', color: 'سفید', surface: 'پولیش', cartonArea: 1.44, pallet: 36 },
    { companyId: arad.id, code: 'ARD-P60-GRY', name: 'پرسلان پولیش خاکستری ساده', line: 'پرسلان پولیش', size: '۶۰×۶۰', color: 'خاکستری', surface: 'پولیش', cartonArea: 1.44, pallet: 36 },
    { companyId: arad.id, code: 'ARD-P80-BGE', name: 'پرسلان پولیش بژ سلطنتی', line: 'پرسلان پولیش', size: '۸۰×۸۰', color: 'بژ', surface: 'پولیش', cartonArea: 2.56, pallet: 24 },
    { companyId: arad.id, code: 'ARD-M60-CRM', name: 'پرسلان مات کرم آفاق', line: 'پرسلان مات', size: '۶۰×۶۰', color: 'کرم', surface: 'مات', cartonArea: 1.44, pallet: 36 },
    { companyId: arad.id, code: 'ARD-W30-BLA', name: 'کاشی دیوار براق بلاکا', line: 'کاشی دیوار', size: '۳۰×۹۰', color: 'سفید', surface: 'براق', cartonArea: 1.08, pallet: 48 },
    { companyId: isf.id, code: 'ISF-P60-AMB', name: 'پرسلان پولیش کهربایی', line: 'پرسلان پولیش', size: '۶۰×۶۰', color: 'کهربایی', surface: 'پولیش', cartonArea: 1.44, pallet: 36 },
    { companyId: isf.id, code: 'ISF-R60-MIX', name: 'پرسلان روستیک ترکیبی', line: 'پرسلان روستیک', size: '۶۰×۶۰', color: 'چندرنگ', surface: 'روستیک', cartonArea: 1.44, pallet: 36 },
    { companyId: isf.id, code: 'ISF-W25-DNB', name: 'کاشی دیوار ساتن دانوب', line: 'کاشی دیوار', size: '۲۵×۴۰', color: 'کرم', surface: 'ساتن', cartonArea: 0.8, pallet: 60 },
    { companyId: nilo.id, code: 'NLT-F75-MRM', name: 'پرسلان مارمریت فانتزی', line: 'پرسلان مارمریت', size: '۷۵×۷۵', color: 'سفید-طلایی', surface: 'پولیش', cartonArea: 1.125, pallet: 30 },
    { companyId: nilo.id, code: 'NLT-W30-OCE', name: 'کاشی دیوار اوشن', line: 'کاشی دیوار', size: '۳۰×۶۰', color: 'آبی پاستلی', surface: 'براق', cartonArea: 1.08, pallet: 48 },
    { companyId: lian.id, code: 'LKF-P60-SLV', name: 'پرسلان پولیش نقره‌ای', line: 'پرسلان پولیش', size: '۶۰×۶۰', color: 'نقره‌ای', surface: 'پولیش', cartonArea: 1.44, pallet: 36 },
  ]
  const products: Record<string, string> = {}
  for (const p of pdefs) {
    const rec = await db.product.create({
      data: {
        companyId: p.companyId, code: p.code, name: p.name, productLine: p.line,
        size: p.size, color: p.color, surface: p.surface, cartonArea: p.cartonArea,
        cartonsPerPallet: p.pallet,
      },
    })
    products[p.code] = rec.id
  }

  console.log('مشتریان و تأمین‌کنندگان (رکورد طلایی)...')
  const partners: { kind: string; goldenName: string; nationalId?: string; inst: { companyId: string; accountCode?: string; creditLimit?: number; terms?: string; note?: string }[] }[] = [
    { kind: 'CUSTOMER', goldenName: 'شرکت ابنیه مسکن ایرانیان', nationalId: '10861234546', inst: [
      { companyId: arad.id, accountCode: 'C-1102', creditLimit: 5000000000, terms: '۳۰ روزه', note: 'مشتری استراتژیک؛ پروژه‌های بزرگ مسکن ملی' },
      { companyId: isf.id, accountCode: 'C-2204', creditLimit: 2000000000, terms: 'پیش‌پرداخت ۳۰٪' },
    ] },
    { kind: 'CUSTOMER', goldenName: 'فروشگاه زنجیره‌ای مصالح نوین', nationalId: '10102345621', inst: [{ companyId: arad.id, accountCode: 'C-1118', creditLimit: 1500000000, terms: '۱۵ روزه' }] },
    { kind: 'CUSTOMER', goldenName: 'شرکت ساختمانی پارس ائل‌گلو', nationalId: '10104567820', inst: [{ companyId: nilo.id, accountCode: 'C-3310', creditLimit: 3000000000, terms: '۴۵ روزه' }] },
    { kind: 'CUSTOMER', goldenName: 'بازار صادراتی — عراق (بغداد)', inst: [{ companyId: lian.id, accountCode: 'C-4401', creditLimit: 8000000000, terms: 'اعتبار اسنادی', note: 'صادرات از سال ۱۴۰۲؛ تسویه ارزی' }] },
    { kind: 'SUPPLIER', goldenName: 'شرکت معدنی گل‌زار (فلسپار)', nationalId: '10203456746', inst: [
      { companyId: arad.id, accountCode: 'S-5100', terms: '۶۰ روزه' },
      { companyId: isf.id, accountCode: 'S-5200', terms: '۶۰ روزه' },
    ] },
    { kind: 'SUPPLIER', goldenName: 'رنگ و لعاب اصفهان', nationalId: '10301234567', inst: [{ companyId: arad.id, accountCode: 'S-5115', terms: '۴۵ روزه', note: 'تأمین‌کننده اصلی لعاب مات و براق' }] },
    { kind: 'SUPPLIER', goldenName: 'کارتن‌بسته‌بندی نگین', inst: [{ companyId: arad.id, accountCode: 'S-5130', terms: 'نقدی' }] },
    { kind: 'SUPPLIER', goldenName: 'شرکت پتروکیمیای جم (پودر PVC)', inst: [{ companyId: nilo.id, accountCode: 'S-5310', terms: '۹۰ روزه' }] },
  ]
  for (const p of partners) {
    const rec = await db.partner.create({ data: { kind: p.kind, goldenName: p.goldenName, nationalId: p.nationalId ?? null } })
    for (const i of p.inst) {
      await db.partnerInstance.create({
        data: {
          partnerId: rec.id, companyId: i.companyId, accountCode: i.accountCode,
          creditLimit: i.creditLimit ?? 0, terms: i.terms, note: i.note,
        },
      })
    }
  }

  console.log('موجودی و اسناد انبار...')
  // رسیدهای تولید (قطعی) → موجودی
  type RecItem = { code: string; tone: string; caliber: string; grade: string; qty: number }
  const receipts: { companyId: string; wh: string; type: string; partner: string; date: Date; items: RecItem[]; note?: string; creator: string; toWh?: string }[] = [
    { companyId: arad.id, wh: whAradF.id, type: 'RECEIPT', partner: 'خط تولید ۱ — کوره رولری', date: daysAgo(12, 8), creator: anbar.id, note: 'رسید تولید روزانه — شیفت شب', items: [
      { code: 'ARD-P60-WHT', tone: 'A', caliber: '۱', grade: '1', qty: 1240 },
      { code: 'ARD-P60-WHT', tone: 'B', caliber: '۲', grade: '1', qty: 860 },
      { code: 'ARD-P60-GRY', tone: 'A', caliber: '۱', grade: '1', qty: 980 },
      { code: 'ARD-P80-BGE', tone: 'B', caliber: '۲', grade: '1', qty: 640 },
      { code: 'ARD-P80-BGE', tone: 'C', caliber: '۳', grade: '2', qty: 210 },
    ] },
    { companyId: arad.id, wh: whAradF.id, type: 'RECEIPT', partner: 'خط تولید ۲ — پرس ۳۰۰۰ تن', date: daysAgo(6, 9), creator: anbar.id, note: 'رسید تولید پرسلان مات', items: [
      { code: 'ARD-M60-CRM', tone: 'A', caliber: '۱', grade: '1', qty: 1450 },
      { code: 'ARD-W30-BLA', tone: 'B', caliber: '۲', grade: '1', qty: 720 },
    ] },
    { companyId: isf.id, wh: whIsfF.id, type: 'RECEIPT', partner: 'خط تولید اصفهان — کوره ۲', date: daysAgo(9, 8), creator: anbar.id, items: [
      { code: 'ISF-P60-AMB', tone: 'A', caliber: '۱', grade: '1', qty: 1120 },
      { code: 'ISF-R60-MIX', tone: 'B', caliber: '۲', grade: '1', qty: 830 },
      { code: 'ISF-W25-DNB', tone: 'A', caliber: '۱', grade: '1', qty: 540 },
    ] },
    { companyId: nilo.id, wh: whNltF.id, type: 'RECEIPT', partner: 'خط تولید نیلو', date: daysAgo(5, 10), creator: anbar.id, items: [
      { code: 'NLT-F75-MRM', tone: 'A', caliber: '۲', grade: '1', qty: 760 },
      { code: 'NLT-W30-OCE', tone: 'B', caliber: '۱', grade: '1', qty: 480 },
    ] },
  ]
  let whNo = 0
  const whCounters: Record<string, number> = {}
  const nextWh = (companyId: string) => {
    whCounters[companyId] = (whCounters[companyId] ?? 0) + 1
    return whCounters[companyId]
  }
  for (const r of receipts) {
    whNo += 1
    const doc = await db.warehouseDoc.create({
      data: {
        companyId: r.companyId, docNumber: nextWh(r.companyId), type: r.type, warehouseId: r.wh,
        partnerName: r.partner, status: 'POSTED', docDate: r.date, note: r.note ?? '', createdById: r.creator,
      },
    })
    for (const it of r.items) {
      await db.docItem.create({ data: { docId: doc.id, productId: products[it.code], tone: it.tone, caliber: it.caliber, grade: it.grade, qtyM2: it.qty } })
      await upsertStock(r.wh, products[it.code], it.tone, it.caliber, it.grade, it.qty)
    }
  }

  // حواله فروش (قطعی) — کسر موجودی
  const issues: typeof receipts = [
    { companyId: arad.id, wh: whAradF.id, type: 'ISSUE', partner: 'ابنیه مسکن ایرانیان — سفارش ۱۲۵۴', date: daysAgo(4, 11), creator: anbar.id, note: 'بارگیری با ۲ کامیون', items: [
      { code: 'ARD-P60-WHT', tone: 'A', caliber: '۱', grade: '1', qty: 620 },
      { code: 'ARD-P80-BGE', tone: 'B', caliber: '۲', grade: '1', qty: 340 },
    ] },
    { companyId: arad.id, wh: whAradF.id, type: 'ISSUE', partner: 'مصالح نوین — شعبه یزد', date: daysAgo(2, 12), creator: anbar.id, items: [
      { code: 'ARD-P60-GRY', tone: 'A', caliber: '۱', grade: '1', qty: 300 },
    ] },
    { companyId: nilo.id, wh: whNltF.id, type: 'ISSUE', partner: 'ساختمانی پارس ائل‌گلو', date: daysAgo(1, 9), creator: anbar.id, items: [
      { code: 'NLT-F75-MRM', tone: 'A', caliber: '۲', grade: '1', qty: 260 },
    ] },
  ]
  for (const r of issues) {
    whNo += 1
    const doc = await db.warehouseDoc.create({
      data: { companyId: r.companyId, docNumber: nextWh(r.companyId), type: r.type, warehouseId: r.wh, partnerName: r.partner, status: 'POSTED', docDate: r.date, note: r.note ?? '', createdById: r.creator },
    })
    for (const it of r.items) {
      await db.docItem.create({ data: { docId: doc.id, productId: products[it.code], tone: it.tone, caliber: it.caliber, grade: it.grade, qtyM2: it.qty } })
      await upsertStock(r.wh, products[it.code], it.tone, it.caliber, it.grade, -it.qty)
    }
  }

  // انتقال درجه ۲ به انبار ضایعات
  const tr = await db.warehouseDoc.create({
    data: { companyId: arad.id, docNumber: nextWh(arad.id), type: 'TRANSFER', warehouseId: whAradF.id, toWarehouseId: whAradW.id, status: 'POSTED', docDate: daysAgo(3, 10), note: 'انتقال تولیدات درجه ۲ به انبار مجزا', createdById: anbar.id },
  })
  await db.docItem.create({ data: { docId: tr.id, productId: products['ARD-P80-BGE'], tone: 'C', caliber: '۳', grade: '2', qtyM2: 210 } })
  await upsertStock(whAradF.id, products['ARD-P80-BGE'], 'C', '۳', '2', -210)
  await upsertStock(whAradW.id, products['ARD-P80-BGE'], 'C', '۳', '2', 210)

  // شمارش با مغایرت (کاهش ۱۸ متر)
  const cnt = await db.warehouseDoc.create({
    data: { companyId: arad.id, docNumber: nextWh(arad.id), type: 'COUNT', warehouseId: whAradF.id, status: 'POSTED', docDate: daysAgo(1, 7), note: 'شمارش دوره‌ای قفسه‌های A و B — مغایرت ۱۸ متر کسری', createdById: anbar.id },
  })
  await db.docItem.create({ data: { docId: cnt.id, productId: products['ARD-P60-WHT'], tone: 'B', caliber: '۲', grade: '1', qtyM2: -18, note: 'کسری شمارش' } })
  await upsertStock(whAradF.id, products['ARD-P60-WHT'], 'B', '۲', '1', -18)

  // یک پیش‌نویس رسید برای دمو
  const draft = await db.warehouseDoc.create({
    data: { companyId: arad.id, docNumber: nextWh(arad.id), type: 'RECEIPT', warehouseId: whAradR.id, partnerName: 'شرکت معدنی گل‌زار', status: 'DRAFT', docDate: daysAgo(0, 8), note: 'رسید خرید فلسپار — در انتظار تأیید کنترل کیفیت', createdById: anbar.id },
  })
  await db.docItem.create({ data: { docId: draft.id, productId: products['ARD-P60-WHT'], tone: '', caliber: '', grade: '1', qtyM2: 0, note: 'اقلام مواد اولیه پس از تأیید کیفیت تکمیل می‌شود' } })

  console.log('درخواست‌های کالا...')
  const reqs: { companyId: string; wh: string; requester: string; status: string; neededFor: string; note: string; date: Date; items: { code: string; qty: number }[] }[] = [
    { companyId: arad.id, wh: whAradF.id, requester: dabir.id, status: 'PENDING', neededFor: 'واحد بازرگانی — نمایشگاه اکتبر', note: 'برای غرفه نمایشگاه نیاز فوری داریم', date: daysAgo(1, 9), items: [
      { code: 'ARD-P60-WHT', qty: 120 }, { code: 'ARD-M60-CRM', qty: 80 },
    ] },
    { companyId: arad.id, wh: whAradF.id, requester: ceo.id, status: 'APPROVED', neededFor: 'دفتر مرکزی', note: 'نمونه‌های هدیه مشتریان کلیدی', date: daysAgo(3, 11), items: [{ code: 'ARD-P80-BGE', qty: 40 }] },
    { companyId: arad.id, wh: whAradF.id, requester: anbar.id, status: 'FULFILLED', neededFor: 'تعمیرات خط ۱', note: 'کاشی یدک جهت تعمیر دیوار سالن', date: daysAgo(8, 10), items: [{ code: 'ARD-P60-GRY', qty: 25 }] },
    { companyId: nilo.id, wh: whNltF.id, requester: admin.id, status: 'PENDING', neededFor: 'بازدید مشتری صادراتی', note: 'نمونه مارمریت برای هیئت عراقی', date: daysAgo(2, 14), items: [{ code: 'NLT-F75-MRM', qty: 15 }] },
    { companyId: isf.id, wh: whIsfF.id, requester: admin.id, status: 'REJECTED', neededFor: 'بازاریابی', note: 'خارج از بودجه فصل', date: daysAgo(6, 13), items: [{ code: 'ISF-R60-MIX', qty: 200 }] },
  ]
  let reqNo = 0
  const reqCounters: Record<string, number> = {}
  for (const r of reqs) {
    reqNo += 1
    reqCounters[r.companyId] = (reqCounters[r.companyId] ?? 0) + 1
    const g = await db.goodsRequest.create({
      data: {
        companyId: r.companyId, reqNumber: reqCounters[r.companyId], requesterId: r.requester, warehouseId: r.wh,
        status: r.status, neededFor: r.neededFor, note: r.note, createdAt: r.date,
        decidedAt: r.status === 'PENDING' ? null : daysAgo(1, 12),
      },
    })
    for (const it of r.items) {
      await db.goodsRequestItem.create({ data: { requestId: g.id, productId: products[it.code], qtyM2: it.qty } })
    }
  }

  console.log('نامه‌ها و ارجاع‌ها...')
  type L = { companyId: string; type: string; subject: string; body: string; creator: string; holder: string | null; status: string; senderTitle?: string; receiverTitle?: string; conf?: string; urg?: string; deadline?: Date | null; date: Date; aiCat?: string; aiSum?: string; refs: { from: string; to: string; action: string; note?: string; date: Date }[] }
  const letters: L[] = [
    { companyId: arad.id, type: 'INCOMING', subject: 'شکایت از اختلاف تونالیته محموله ۹۸۲ ابنیه مسکن', body: 'با سلام؛ در بازدید حضوری نماینده مشتری از محموله شماره ۹۸۲ (پرسلان سفید ۶۰×۶۰ تون A)، اختلاف محسوس تونالیته بین پالت‌های ابتدایی و انتهایی بار مشاهده شد. خواهشمند است دستور فرمایید نسبت به بررسی بچ تولید و ارسال جایگزین اقدام گردد. در صورت نیاز، نماینده مشتری برای هماهنگی جمع‌بندی حاضر است.', creator: dabir.id, holder: ceo.id, status: 'IN_PROGRESS', senderTitle: 'بازرگانی ابنیه مسکن ایرانیان', urg: 'URGENT', conf: 'NORMAL', deadline: daysAhead(2), date: daysAgo(1, 8), refs: [
      { from: dabir.id, to: ceo.id, action: 'REFER', note: 'فوری — مشتری استراتژیک؛ لطفاً دستور بررسی صادر فرمایید', date: daysAgo(1, 9) },
    ] },
    { companyId: arad.id, type: 'INCOMING', subject: 'گزارش مغایرت شمارش دوره‌ای انبار محصول', body: 'در شمارش دوره‌ای مورخ جاری از قفسه‌های A و B انبار محصول، کسری ۱۸ مترمربعی در پرسلان سفید ۶۰×۶۰ تون B کالیبر ۲ مشاهده شد. سند شمارش در سامانه ثبت و موجودی اصلاح شده است. پیشنهاد می‌شود علت کسری از محل گردش حواله‌های هفته گذشته بررسی شود.', creator: dabir.id, holder: anbar.id, status: 'IN_PROGRESS', senderTitle: 'حسابرسی داخلی گروه', conf: 'CONFIDENTIAL', date: daysAgo(1, 7), refs: [
      { from: dabir.id, to: anbar.id, action: 'REFER', note: 'لطفاً مغایرت را با حواله‌های اخیر تطبیق دهید', date: daysAgo(1, 8) },
    ] },
    { companyId: arad.id, type: 'INTERNAL', subject: 'ابلاغ قیمت‌گذاری جدید محصولات پرسلان نیم‌سال دوم', body: 'بدین‌وسیله به استحضار می‌رساند با تصویب کمیته قیمت‌گذاری مورخ جاری، قیمت محصولات پرسلان پولیش از ابتدای نیم‌سال دوم حداکثر ۶.۵ درصد افزایش می‌یابد. لیست جدید قیمت‌ها به پیوست است و لازم است واحد بازرگانی در پیش‌فاکتورهای جدید از آن استفاده کند. سفارش‌های ثبت‌شده تا تاریخ ابلاغ با قیمت قبلی قطعی می‌شوند.', creator: dabir.id, holder: ceo.id, status: 'IN_PROGRESS', conf: 'NORMAL', date: daysAgo(3, 10), aiCat: 'مالی و بازرگانی', aiSum: 'افزایش ۶.۵ درصدی قیمت پرسلان از ابتدای نیم‌سال دوم با مصوبه کمیته قیمت‌گذاری ابلاغ شد؛ سفارش‌های پیش از ابلاغ با قیمت قبلی قطعی هستند.', refs: [
      { from: dabir.id, to: ceo.id, action: 'REFER', note: 'جهت اطلاع و تأیید نهایی', date: daysAgo(3, 11) },
    ] },
    { companyId: arad.id, type: 'INTERNAL', subject: 'درخواست خرید پالت فلزی جهت پالت‌بندی خط ۲', body: 'با توجه به افزایش تولید خط ۲ و استهلاک پالت‌های چوبی موجود، تقاضای خرید ۱۲۰ عدد پالت فلزی استاندارد را داریم. برآورد هزینه هر پالت ۲.۸ میلیون تومان و جمع کل ۳۳۶ میلیون تومان است. پیشنهاد می‌شود از تأمین‌کننده فعلی با همان شرایط پرداخت ۴۵ روزه خرید شود.', creator: anbar.id, holder: ceo.id, status: 'IN_PROGRESS', deadline: daysAhead(5), date: daysAgo(2, 9), refs: [
      { from: anbar.id, to: dabir.id, action: 'REFER', note: 'ثبت در کمیته خرید', date: daysAgo(2, 10) },
      { from: dabir.id, to: ceo.id, action: 'REFER', note: 'در کمیته خرید مطرح شد؛ تأیید نهایی با شماست', date: daysAgo(2, 12) },
    ] },
    { companyId: arad.id, type: 'OUTGOING', subject: 'پاسخ به استعلام فنی لعاب مات کد L-220', body: 'با سلام و احترام؛ در پاسخ به استعلام شماره ۱۴۰۴/۰۸۹ شما، مشخصات فنی لعاب مات کد L-220 شامل دمای پخت، ضخامت لایه و ضریب انبساط به شرح پیوست ارسال می‌گردد. در صورت نیاز به نمونه آزمایشگاهی، هماهنگی از طریق واحد فنی انجام شود. امید است همکاری فنی میان دو شرکت ادامه یابد.', creator: dabir.id, holder: dabir.id, status: 'ANSWERED', receiverTitle: 'رنگ و لعاب اصفهان', date: daysAgo(7, 11), refs: [] },
    { companyId: arad.id, type: 'INCOMING', subject: 'پیگیری بارگیری سفارش ۱۲۵۴ ابنیه مسکن', body: 'با سلام؛ با توجه به قرارداد جاری، ۳۰ درصد باقی‌مانده سفارش ۱۲۵۴ هنوز بارگیری نشده است. با عنایت به برنامه ریزی پروژه، خواهشمندیم زمان‌بندی بارگیری دو نوبت باقی‌مانده اعلام و هماهنگی لازم با ناو carrier انجام شود.', creator: dabir.id, holder: anbar.id, status: 'IN_PROGRESS', senderTitle: 'ابنیه مسکن ایرانیان — واحد پیگیری', deadline: daysAhead(1), date: daysAgo(2, 8), refs: [
      { from: dabir.id, to: anbar.id, action: 'REFER', note: 'زمان‌بندی بارگیری را با واحد بازرگانی هماهنگ کنید', date: daysAgo(2, 9) },
    ] },
    { companyId: arad.id, type: 'INTERNAL', subject: 'صورت‌جلسه کمیته بودجه فصل پاییز', body: 'جلسه کمیته بودجه با حضور مدیران عامل شرکت‌های گروه تشکیل شد. مصوبات: سقف سرمایه‌گذاری توسعه خط ۳، تأیید بودجه نگهداری کوره‌ها و اولویت پروژه سامانه یکپارچه عملیاتی هلدینگ. متن کامل مصوبات به پیوست است و اجرای بندها به تفکیک مالک پیگیری می‌شود.', creator: dabir.id, holder: null, status: 'ARCHIVED', date: daysAgo(18, 15), refs: [
      { from: dabir.id, to: ceo.id, action: 'APPROVE', note: 'مصوبات نهایی شد', date: daysAgo(17, 10) },
      { from: ceo.id, to: dabir.id, action: 'ARCHIVE', note: 'بایگانی در پرونده کمیته', date: daysAgo(16, 9) },
    ] },
    { companyId: arad.id, type: 'INTERNAL', subject: 'درخواست آموزش کاربران سامانه عملیاتی جدید هلدینگ', body: 'با سلام؛ در راستای آماده‌سازی استقرار فاز نخست سامانه عملیاتی سازمانی، پیشنهاد می‌گردد دو جلسه آموزش برای کاربران کلیدی انبار و دبیرخانه برگزار شود. سرفصل‌ها: کار با کارتابل، ثبت اسناد انبار و قواعد شماره‌گذاری. حضور کاربران کلیدی الزامی است.', creator: admin.id, holder: ceo.id, status: 'IN_PROGRESS', date: daysAgo(4, 9), refs: [
      { from: admin.id, to: ceo.id, action: 'REFER', note: 'پیشنهاد برگزاری هفته آینده', date: daysAgo(4, 10) },
    ] },
    { companyId: arad.id, type: 'OUTGOING', subject: 'ارسال گزارش ماهانه فروش به معاونت بازرگانی هلدینگ', body: 'گزارش عملکرد فروش ماه جاری شامل حجم فروش به تفکیک خط محصول، پنج مشتری برتر و وضعیت مطالبات به پیوست ارسال می‌گردد. نکته قابل توجه: سهم فروش صادراتی ۴ درصد نسبت به ماه قبل رشد داشته است.', creator: dabir.id, holder: dabir.id, status: 'ANSWERED', receiverTitle: 'معاونت بازرگانی هلدینگ', date: daysAgo(10, 13), refs: [] },
    { companyId: arad.id, type: 'INCOMING', subject: 'ابلاغ بخشنامه جدید صندوق بیمه اجتماعی', body: 'بخشنامه شماره ۱۴۰۴/۲۲۱ صندوق بیمه اجتماعی مبنی بر بازنگری نرخ حق بیمه سهم کارفرما از ماه آینده ابلاغ شد. لازم است واحد منابع انسانی و مالی نسبت به به‌روزرسانی جدول محاسبات اقدام کنند.', creator: dabir.id, holder: ceo.id, status: 'IN_PROGRESS', senderTitle: 'اداره کل تأمین اجتماعی استان', conf: 'CONFIDENTIAL', date: daysAgo(5, 8), refs: [
      { from: dabir.id, to: ceo.id, action: 'REFER', note: 'جهت ابلاغ به واحدهای ذی‌ربط', date: daysAgo(5, 9) },
    ] },
    { companyId: arad.id, type: 'OUTGOING', subject: 'دعوت به جلسه بررسی شاخص‌های بهره‌وری کوره', body: 'جلسه بررسی شاخص‌های بهره‌وری کوره‌های رولری با حضور نمایندگان تولید، کیفیت و نگهداری روز یکشنبه ساعت ۱۰ در اتاق جلسات کارخانه برگزار می‌شود. دستور جلسه: مصرف انرژی واحد محصول، ضریب بازیابی و برنامه تعمیرات اساسی فصل آینده.', creator: dabir.id, holder: dabir.id, status: 'IN_PROGRESS', receiverTitle: 'مدیران تولید، کیفیت و نگهداری', date: daysAgo(6, 8), refs: [] },
    { companyId: arad.id, type: 'INCOMING', subject: 'درخواست تعیین تکلیف موجودی کالیبر ۳ انبار محصول', body: 'موجودی پرسلان بژ ۸۰×۸۰ کالیبر ۳ که به انبار درجه ۲ منتقل شده، طی سه ماه اخیر تقاضای فروش نداشته است. پیشنهاد می‌شود با تخفیف پلکانی برای پروژه‌های اقتصادی عرضه شود.', creator: dabir.id, holder: ceo.id, status: 'IN_PROGRESS', senderTitle: 'مدیریت تولید آراد سرام', date: daysAgo(9, 10), refs: [
      { from: dabir.id, to: ceo.id, action: 'REFER', note: 'پیشنهاد عرضه با تخفیف را بررسی بفرمایید', date: daysAgo(9, 11) },
    ] },
    { companyId: arad.id, type: 'INTERNAL', subject: 'دستورالعمل ایمنی انبارش محصول فصل گرم', body: 'با نزدیک شدن به فصل گرم، رعایت موارد زیر در انبارهای محصول الزامی است: فاصله کافی پالت‌ها از دیوار، کنترل دمای سالن در ساعات اوج، ممنوعیت انبارش مواد آتش‌زا در مجاورت کارتن و بازدید هفتگی سیستم اطفاء. مسؤولیت اجرا با سرپرست هر انبار است.', creator: anbar.id, holder: null, status: 'ARCHIVED', date: daysAgo(25, 9), refs: [
      { from: anbar.id, to: dabir.id, action: 'ARCHIVE', note: 'ابلاغ به همه انبارها شد', date: daysAgo(24, 8) },
    ] },
    { companyId: arad.id, type: 'INTERNAL', subject: 'هماهنگی شمارش عمومی پایان سال مالی', body: 'شمارش عمومی انبارها در پایان سال مالی طبق برنامه انجام خواهد شد. تقویم شمارش، فرم‌ها و فهرست اقلام حساس در سامانه بارگذاری شده است. خواهشمند است انبارهای محصول و مواد اولیه آخرین اسناد خود را حداکثر تا سه روز پیش از شمارش قطعی کنند.', creator: dabir.id, holder: ceo.id, status: 'IN_PROGRESS', deadline: daysAhead(9), date: daysAgo(2, 14), refs: [
      { from: dabir.id, to: anbar.id, action: 'REFER', note: 'تقویم را نهایی کنید', date: daysAgo(2, 15) },
      { from: anbar.id, to: ceo.id, action: 'REFER', note: 'تقویم پیشنهادی آماده شد', date: daysAgo(1, 10) },
    ] },
  ]
  let letterNo = 0
  for (const l of letters) {
    letterNo += 1
    const rec = await db.letter.create({
      data: {
        companyId: l.companyId, number: letterNo, type: l.type, subject: l.subject, body: l.body,
        senderTitle: l.senderTitle, receiverTitle: l.receiverTitle,
        confidentiality: l.conf ?? 'NORMAL', urgency: l.urg ?? 'NORMAL',
        deadlineAt: l.deadline ?? null, status: l.status,
        currentHolderId: l.holder, creatorId: l.creator, createdAt: l.date,
        aiCategory: l.aiCat, aiSummary: l.aiSum,
      },
    })
    for (const r of l.refs) {
      await db.letterReferral.create({
        data: { letterId: rec.id, fromUserId: r.from, toUserId: r.to, action: r.action, note: r.note, createdAt: r.date },
      })
    }
  }

  console.log('اعلان‌ها و رویدادها...')
  await db.notification.createMany({
    data: [
      { userId: ceo.id, title: 'نامه فوری در کارتابل شما', body: 'شکایت از اختلاف تونالیته محموله ۹۸۲ ابنیه مسکن — مهلت پاسخ ۲ روز', kind: 'LETTER', targetView: 'cartable' },
      { userId: ceo.id, title: 'ارجاع جدید از دبیرخانه', body: 'ابلاغ قیمت‌گذاری جدید محصولات پرسلان نیم‌سال دوم', kind: 'LETTER', targetView: 'cartable' },
      { userId: anbar.id, title: 'نامه ارجاع‌شده به شما', body: 'گزارش مغایرت شمارش دوره‌ای انبار محصول', kind: 'LETTER', targetView: 'cartable' },
      { userId: anbar.id, title: 'سند انبار قطعی شد', body: 'حواله فروش مصالح نوین — شعبه یزد ثبت قطعی شد', kind: 'WAREHOUSE', targetView: 'whdocs' },
      { userId: dabir.id, title: 'درخواست کالا در انتظار تأیید', body: 'درخواست نمایشگاه اکتبر از واحد بازرگانی', kind: 'REQUEST', targetView: 'requests' },
      { userId: admin.id, title: 'خوش آمدید به پایلوت سامانه عملیاتی', body: 'فاز ۱ پایلوت ۹۰ روزه آغاز شد؛ ماژول‌های فعال را از رجیستری ببینید', kind: 'INFO', targetView: 'modules' },
    ],
  })
  await db.outboxEvent.createMany({
    data: [
      { type: 'letter.created', payload: JSON.stringify({ letterId: 'seed', number: 1, subject: letters[0].subject }), createdAt: daysAgo(1, 8), processedAt: daysAgo(1, 8) },
      { type: 'letter.referred', payload: JSON.stringify({ letterId: 'seed', number: 1, from: 'dabir.arad', to: 'ceo.arad' }), createdAt: daysAgo(1, 9), processedAt: daysAgo(1, 9) },
      { type: 'doc.posted', payload: JSON.stringify({ docNumber: 5, type: 'ISSUE', company: 'ARAD' }), createdAt: daysAgo(4, 11), processedAt: daysAgo(4, 11) },
      { type: 'request.approved', payload: JSON.stringify({ reqNumber: 2, company: 'ARAD' }), createdAt: daysAgo(1, 12), processedAt: daysAgo(1, 12) },
    ],
  })
  await db.auditLog.createMany({
    data: [
      { userId: admin.id, companyId: arad.id, action: 'LOGIN', entity: 'auth', createdAt: daysAgo(1, 7) },
      { userId: dabir.id, companyId: arad.id, action: 'CREATE', entity: 'letter', entityId: 'seed-1', details: JSON.stringify({ number: 1, type: 'INCOMING' }), createdAt: daysAgo(1, 8) },
      { userId: anbar.id, companyId: arad.id, action: 'POST', entity: 'warehouseDoc', entityId: 'seed-8', details: JSON.stringify({ type: 'ISSUE', partner: 'مصالح نوین' }), createdAt: daysAgo(2, 12) },
      { userId: ceo.id, companyId: arad.id, action: 'REFER', entity: 'letter', entityId: 'seed-4', details: JSON.stringify({ to: 'ceo.arad' }), createdAt: daysAgo(2, 12) },
      { userId: admin.id, companyId: arad.id, action: 'MODULE_TOGGLE', entity: 'platformModule', entityId: 'production', details: JSON.stringify({ enabled: false }), createdAt: daysAgo(10, 9) },
    ],
  })

  console.log('همگام‌سازی شمارنده‌های اسناد...')
  const year = 1405
  for (const [cid, v] of Object.entries(whCounters)) {
    await db.docCounter.create({ data: { companyId: cid, scope: 'WHDOC', year, value: v } })
  }
  for (const [cid, v] of Object.entries(reqCounters)) {
    await db.docCounter.create({ data: { companyId: cid, scope: 'GOODSREQ', year, value: v } })
  }
  await db.docCounter.create({ data: { companyId: arad.id, scope: 'LETTER', year, value: letterNo } })

  // P2-T5 — بازسازی ایندکس جستجوی تمام‌متن نامه‌ها پس از seed (دستور پخت R8)
  const { rebuildLetterFtsWith } = await import('../src/modules/office-automation/fts-sql')
  const ftsRows = await rebuildLetterFtsWith(db)
  console.log(`ایندکس FTS نامه‌ها: ${ftsRows.toLocaleString('fa-IR')} ردیف`)

  console.log('✅ seed کامل شد.')
}

async function upsertStock(warehouseId: string, productId: string, tone: string, caliber: string, grade: string, delta: number) {
  const existing = await db.stockItem.findUnique({
    where: { warehouseId_productId_tone_caliber_grade: { warehouseId, productId, tone, caliber, grade } },
  })
  if (existing) {
    await db.stockItem.update({ where: { id: existing.id }, data: { qtyM2: existing.qtyM2 + delta } })
  } else {
    await db.stockItem.create({ data: { warehouseId, productId, tone, caliber, grade, qtyM2: delta } })
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
