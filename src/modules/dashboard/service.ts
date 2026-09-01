import 'server-only'
import { db } from '@/core/shared/db'
import type { SessionContext } from '@/core/auth/auth'
import { scopeCompanyIds } from '@/core/tenancy/tenancy'
import { toJalali, faNumber } from '@/core/shared/jalali'
import type { ServiceResult } from '@/core/shared/types'

/**
 * ماژول داشبورد — لایه سرویس
 * شاخص‌های هلدینگ/شرکت + سنجه‌های گیت ۱ پایلوت (P0-T23 — فرمول‌ها در SPEC §۳ مستند)
 *
 * P1-T13 — جمع‌ها در DB (count/groupBy/aggregate) نه واکشی کل ردیف‌ها و reduce در سرویس.
 * با seed:big (۱۰هزار نامه / ۵هزار سند) داشبورد فقط کوئری‌های شمارشی/تجمعی اجرا می‌کند.
 *
 * P2.5-U3/D7 — بازه تحلیلی ۷/۳۰/۹۰ روز: نمودار روند نامه (پرمصرف‌ترین ماژول) + دلتای
 * هر نمودار نسبت به دوره هم‌طول قبل. کوئری روند یک‌بار تا «شروع دوره قبل» می‌خواند تا
 * دلتا و سطل‌های دوره جاری از همان داده محاسبه شوند (بدون کوئری تکراری).
 */
export async function getDashboard(ctx: SessionContext, range: 7 | 30 | 90 = 30): Promise<ServiceResult<Record<string, unknown>>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const scoped = { companyId: { in: scopeIds } }
  const now = new Date()
  const weekMs = 7 * 86400000
  const rangeMs = range * 86400000
  const windowStart = new Date(now.getTime() - rangeMs)
  const prevStart = new Date(now.getTime() - 2 * rangeMs)
  // D7 — اندازه سطل نمودار: ۹۰ روزه = هفتگی (۱۳ سطل خوانا)، ۷/۳۰ روزه = روزانه
  const binMs = range === 90 ? weekMs : 86400000
  const binCount = Math.ceil(rangeMs / binMs)

  const [
    lettersTotal, lettersByTypeG, cartableCount, openLetters, urgentLetters,
    lettersWithFlowRows, withDeadline, breached, aiAssisted,
    docsByStatus, docTrendRows, letterRows,
    pendingRequests, decidedRows,
    stockTotalAgg, stockByGradeG, stockByWarehouseG,
    lettersInProgressByCompany, pendingRequestsByCompany, scopeCompanies,
    audits, modules, memberships, weekActiveG, jobs,
  ] = await Promise.all([
    // ---------- نامه‌ها (شمارشی) ----------
    db.letter.count({ where: scoped }),
    db.letter.groupBy({ by: ['type'], _count: { _all: true }, where: scoped }),
    db.letter.count({ where: { ...scoped, currentHolderId: ctx.userId, status: 'IN_PROGRESS' } }),
    db.letter.count({ where: { ...scoped, status: 'IN_PROGRESS' } }),
    db.letter.count({ where: { ...scoped, status: 'IN_PROGRESS', deadlineAt: { not: null, lte: new Date(now.getTime() + 3 * 86400000) } } }),
    // نامه‌های دارای ≥۱ ارجاع = ارجاع‌های یکتا در دامنه (distinct در DB)
    db.letterReferral.findMany({ where: { letter: scoped }, distinct: ['letterId'], select: { letterId: true } }),
    db.letter.count({ where: { ...scoped, deadlineAt: { not: null } } }),
    db.letter.count({ where: { ...scoped, deadlineAt: { not: null, lt: now }, status: { not: 'ARCHIVED' } } }),
    db.letter.count({ where: { ...scoped, aiCategory: { not: null } } }),

    // ---------- اسناد انبار ----------
    db.warehouseDoc.groupBy({ by: ['status'], _count: { _all: true }, where: scoped }),
    // D7 — روند اسناد در بازه تحلیلی: پنجره تا شروع دوره قبل (دلتا هم از همان داده می‌آید)
    db.warehouseDoc.findMany({
      where: { ...scoped, docDate: { gte: prevStart } },
      select: { type: true, status: true, docDate: true },
    }),

    // D7 — روند نامه‌ها در بازه تحلیلی (پرمصرف‌ترین ماژول — حلقه بازخورد کاربر): ثبت به تفکیک نوع
    db.letter.findMany({
      where: { ...scoped, createdAt: { gte: prevStart } },
      select: { type: true, createdAt: true },
    }),

    // ---------- درخواست‌ها ----------
    db.goodsRequest.count({ where: { ...scoped, status: 'PENDING' } }),
    db.goodsRequest.findMany({ where: { ...scoped, decidedAt: { not: null } }, select: { createdAt: true, decidedAt: true } }),

    // ---------- موجودی (P1-T13: aggregate/groupBy در DB) ----------
    // P1-T36/G1 — ایزولاسیون داده: تجمیع موجودی باید در دامنه شرکت فعال بماند
    // (باگ کشف‌شده توسط رگرسیون طلایی: KPI موجودی کل برای هر شرکت فعال یکسان بود)
    db.stockItem.aggregate({ _sum: { qtyM2: true }, where: { qtyM2: { not: 0 }, warehouse: { companyId: { in: scopeIds } } } }),
    db.stockItem.groupBy({ by: ['grade'], _sum: { qtyM2: true }, where: { qtyM2: { not: 0 }, warehouse: { companyId: { in: scopeIds } } } }),
    db.stockItem.groupBy({ by: ['warehouseId'], _sum: { qtyM2: true }, where: { qtyM2: { not: 0 }, warehouse: { companyId: { in: scopeIds } } } }),

    // ---------- نمای مقایسه‌ای شرکت‌ها (D6 — داشبورد نسل ۲) ----------
    db.letter.groupBy({ by: ['companyId'], _count: { _all: true }, where: { ...scoped, status: 'IN_PROGRESS' } }),
    db.goodsRequest.groupBy({ by: ['companyId'], _count: { _all: true }, where: { ...scoped, status: 'PENDING' } }),
    db.company.findMany({ where: { id: { in: scopeIds }, type: 'COMPANY' }, select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),

    // ---------- حاکمیت ----------
    // D4 — نویز رویدادهای نشست (ورود/خروج/سوییچ) از فید فعالیت حذف می‌شود؛
    // take بزرگ‌تر جبران می‌کند تا پس از فیلتر همچنان ۱۰ رویداد کسب‌وکاری بماند
    db.auditLog.findMany({
      where: { ...scoped, action: { notIn: ['LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'LOGIN_NEW_DEVICE', 'SWITCH_COMPANY'] } },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: { user: { select: { fullName: true } } },
    }),
    db.platformModule.findMany({ select: { status: true, layer: true, domain: true } }),
    db.membership.findMany({ where: scoped, select: { userId: true, user: { select: { id: true, isActive: true } } } }),
    db.auditLog.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: new Date(now.getTime() - weekMs) }, userId: { not: null } },
      _count: { _all: true },
    }),
    db.scheduledJob.findMany({ select: { key: true, name: true, lastStatus: true, lastRunAt: true } }),
  ])

  // نام انبارهای دارای موجودی (پرسش دوم پس از groupBy — فقط شناسه‌های ظاهرشده)
  const whIds = stockByWarehouseG.map((g) => g.warehouseId)
  const warehouseNames = whIds.length
    ? await db.warehouse.findMany({ where: { id: { in: whIds } }, select: { id: true, name: true, company: { select: { name: true } } } })
    : []

  // ---------- KPIها از نتایج شمارشی ----------
  const lettersByTypeMap = new Map(lettersByTypeG.map((g) => [g.type, g._count._all]))
  const lettersByType = [
    { name: 'وارده', value: lettersByTypeMap.get('INCOMING') ?? 0 },
    { name: 'صادره', value: lettersByTypeMap.get('OUTGOING') ?? 0 },
    { name: 'داخلی', value: lettersByTypeMap.get('INTERNAL') ?? 0 },
  ]

  const docsStatusMap = new Map(docsByStatus.map((g) => [g.status, g._count._all]))
  const postedDocs = docsStatusMap.get('POSTED') ?? 0
  const draftDocs = docsStatusMap.get('DRAFT') ?? 0

  // D7 — روند بازه تحلیلی: سطل‌های روزانه (۷/۳۰ روز) یا هفتگی (۹۰ روز) از قدیم به جدید؛
  // آخرین سطل تا «الان» باز است (سطل مقایسه‌ای قدیمی با شرط < خالی می‌ماند)
  const letterTrend: { name: string; وارده: number; صادره: number; داخلی: number }[] = []
  const docTrend: { name: string; رسید: number; حواله: number }[] = []
  for (let b = binCount - 1; b >= 0; b -= 1) {
    const from = now.getTime() - (b + 1) * binMs
    const to = b === 0 ? Number.MAX_SAFE_INTEGER : now.getTime() - b * binMs
    const lettersInBin = letterRows.filter((r) => r.createdAt.getTime() >= from && r.createdAt.getTime() < to)
    const docsInBin = docTrendRows.filter((d) => d.docDate.getTime() >= from && d.docDate.getTime() < to)
    const jFrom = toJalali(new Date(from))
    const label = `${jFrom.jm}/${jFrom.jd}`
    letterTrend.push({
      name: label,
      وارده: lettersInBin.filter((l) => l.type === 'INCOMING').length,
      صادره: lettersInBin.filter((l) => l.type === 'OUTGOING').length,
      داخلی: lettersInBin.filter((l) => l.type === 'INTERNAL').length,
    })
    docTrend.push({
      name: label,
      رسید: docsInBin.filter((d) => d.type === 'RECEIPT' && d.status === 'POSTED').length,
      حواله: docsInBin.filter((d) => d.type === 'ISSUE' && d.status === 'POSTED').length,
    })
  }
  // دلتا نسبت به دوره هم‌طول قبل — از همان پنجره لاغر (بدون کوئری اضافه)
  const lettersInRange = letterRows.filter((r) => r.createdAt >= windowStart).length
  const lettersPrevRange = letterRows.filter((r) => r.createdAt >= prevStart && r.createdAt < windowStart).length
  const docsInRange = docTrendRows.filter((d) => d.status === 'POSTED' && d.docDate >= windowStart).length
  const docsPrevRange = docTrendRows.filter((d) => d.status === 'POSTED' && d.docDate >= prevStart && d.docDate < windowStart).length

  const stockTotalM2 = stockTotalAgg._sum.qtyM2 ?? 0
  const gradeLabels: Record<string, string> = { '1': 'درجه ۱', '2': 'درجه ۲', w: 'ضایعات' }
  const stockByGrade = stockByGradeG
    .map((g) => ({ name: gradeLabels[g.grade] ?? g.grade, value: Math.round(g._sum.qtyM2 ?? 0) }))
    .sort((a, b) => b.value - a.value)

  const whNameById = new Map(warehouseNames.map((w) => [w.id, `${w.company.name} — ${w.name}`]))
  const stockByWarehouse = stockByWarehouseG
    .map((g) => ({ name: whNameById.get(g.warehouseId) ?? g.warehouseId, value: Math.round(g._sum.qtyM2 ?? 0) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  // نمای مقایسه‌ای شرکت‌های دامنه (D6) — موجودی هر شرکت از تجمیع per-warehouse بازسازی می‌شود
  // (به‌جای groupBy روی رابطه که Prisma پشتیبانی نمی‌کند — همان داده موجود، بدون کوئری اضافه)
  const whCompanyByWhId = new Map(warehouseNames.map((w) => [w.id, w.company.name]))
  const stockByCompanyName = new Map<string, number>()
  for (const g of stockByWarehouseG) {
    const cname = whCompanyByWhId.get(g.warehouseId) ?? '?'
    stockByCompanyName.set(cname, (stockByCompanyName.get(cname) ?? 0) + Math.round(g._sum.qtyM2 ?? 0))
  }
  const lettersInProgressMap = new Map(lettersInProgressByCompany.map((g) => [g.companyId, g._count._all]))
  const pendingRequestsMap = new Map(pendingRequestsByCompany.map((g) => [g.companyId, g._count._all]))
  const perCompany = scopeCompanies.map((c) => ({
    id: c.id,
    name: c.name,
    lettersInProgress: lettersInProgressMap.get(c.id) ?? 0,
    pendingRequests: pendingRequestsMap.get(c.id) ?? 0,
    stockM2: stockByCompanyName.get(c.name) ?? 0,
  })).sort((a, b) => b.stockM2 - a.stockM2)

  const activeModules = modules.filter((m) => m.status === 'ACTIVE').length
  const pluginCatalog = {
    total: modules.length,
    active: activeModules,
    layers: {
      FOUNDATION: modules.filter((m) => m.layer === 'FOUNDATION').length,
      OPERATIONS: modules.filter((m) => m.layer === 'OPERATIONS').length,
      INTELLIGENCE: modules.filter((m) => m.layer === 'INTELLIGENCE').length,
    },
  }

  // درصد نمایشی با ارقام فارسی (کمکی رندر gate)
  function round1(v: number): number {
    return Math.round(v * 10) / 10
  }

  // سنجه‌های گیت ۱ پایلوت (P0-T23 — مبنای چارت محصول §۳؛ فرمول‌ها در SPEC §۳)
  // M1 نرخ گردش دیجیتال نامه: نامه با ≥۱ ارجاع ÷ کل نامه‌های ثبت‌شده (≥۷۰٪)
  const lettersWithFlow = lettersWithFlowRows.length
  const m1 = lettersTotal ? round1((lettersWithFlow / lettersTotal) * 100) : null
  // M2 نرخ قطعی‌سازی اسناد: POSTED ÷ (POSTED+DRAFT) — سند پیش‌نویس‌مانده = عملیات هنوز کاغذی (≥۸۰٪)
  const openDocs = postedDocs + draftDocs
  const m2 = openDocs ? round1((postedDocs / openDocs) * 100) : null
  // M3 نرخ رعایت مهلت: نامه‌های دارای مهلتِ بدون نقض ÷ کل نامه‌های دارای مهلت (≥۹۰٪)
  const m3 = withDeadline ? round1(((withDeadline - breached) / withDeadline) * 100) : null
  // M4 تصمیم درخواست <۲۴h: درخواست‌های تصمیم‌خورده با فاصله <۲۴ ساعت ÷ تصمیم‌خورده‌ها (≥۸۵٪)
  const decided = decidedRows.length
  const under24 = decidedRows.filter((q) => q.decidedAt !== null && q.decidedAt.getTime() - q.createdAt.getTime() < 24 * 3600 * 1000).length
  const m4 = decided ? round1((under24 / decided) * 100) : null
  // M5 کاربر فعال هفتگی: کاربران دامنه با رکورد حسابرسی در ۷ روز ÷ کاربران فعال دامنه (≥۸۰٪)
  const scopedUserIds = new Set(memberships.filter((m) => m.user.isActive).map((m) => m.user.id))
  const activeIds = new Set(weekActiveG.map((g) => g.userId).filter((id): id is string => !!id && scopedUserIds.has(id)))
  const m5 = scopedUserIds.size ? round1((activeIds.size / scopedUserIds.size) * 100) : null
  // M6 سلامت سرویس: شمار کارهای زمان‌بند با آخرین وضعیت ERROR (هدف: صفر)
  const errorJobs = jobs.filter((j) => j.lastStatus === 'ERROR').length

  const gate = [
    {
      id: 'letters-flow',
      label: 'نرخ گردش دیجیتال نامه',
      kind: 'percent' as const,
      value: m1,
      target: 70,
      detail: `${faNumber(lettersWithFlow)} نامه دارای گردش دیجیتال از ${faNumber(lettersTotal)} نامه ثبت‌شده`,
    },
    {
      id: 'docs-posted',
      label: 'نرخ قطعی‌سازی اسناد انبار',
      kind: 'percent' as const,
      value: m2,
      target: 80,
      detail: `${faNumber(postedDocs)} سند قطعی از ${faNumber(openDocs)} سند ثبت‌شده`,
    },
    {
      id: 'deadline-compliance',
      label: 'نرخ رعایت مهلت نامه‌ها',
      kind: 'percent' as const,
      value: m3,
      target: 90,
      detail: withDeadline
        ? `${faNumber(withDeadline - breached)} نامه دارای مهلت بدون نقض از ${faNumber(withDeadline)} نامه دارای مهلت`
        : 'نامه دارای مهلتی ثبت نشده است',
    },
    {
      id: 'request-decision-24h',
      label: 'تصمیم درخواست کالا زیر ۲۴ ساعت',
      kind: 'percent' as const,
      value: m4,
      target: 85,
      detail: decided
        ? `${faNumber(under24)} تصمیم زیر ۲۴ ساعت از ${faNumber(decided)} درخواست تصمیم‌خورده`
        : 'درخواست تصمیم‌خورده‌ای وجود ندارد',
    },
    {
      id: 'weekly-active-users',
      label: 'کاربر فعال هفتگی',
      kind: 'percent' as const,
      value: m5,
      target: 80,
      detail: `${faNumber(activeIds.size)} کاربر فعال از ${faNumber(scopedUserIds.size)} کاربر فعال دامنه دید`,
    },
    {
      id: 'service-health',
      label: 'خطای سرویس در پایش جاری',
      kind: 'count' as const,
      value: errorJobs,
      target: 0,
      detail: jobs.length
        ? `${faNumber(jobs.length)} کار زمان‌بند پایش می‌شوند — آخرین وضعیت: ${jobs.map((j) => `${j.name}=${j.lastStatus ?? 'در انتظار'}`).join('، ')}`
        : 'کاری در زمان‌بند ثبت نشده است',
    },
  ]

  const actionLabels: Record<string, string> = {
    LOGIN: 'ورود به سامانه', LOGIN_FAILED: 'تلاش ورود ناموفق', LOGOUT: 'خروج', CREATE: 'ثبت رکورد', POST: 'قطعی‌سازی سند',
    REFER: 'ارجاع نامه', APPROVE: 'تأیید', ANSWER: 'پاسخ', ARCHIVE: 'بایگانی',
    'CREATE+POST': 'ثبت و قطعی‌سازی', CANCEL: 'ابطال', MODULE_TOGGLE: 'تغییر وضعیت ماژول',
    AI_SUGGEST: 'پیشنهاد هوش مصنوعی', AI_APPLY: 'اعمال هوش مصنوعی', SWITCH_COMPANY: 'تغییر شرکت',
    REQUEST_APPROVE: 'تأیید درخواست', REQUEST_REJECT: 'رد درخواست', REQUEST_FULFILL: 'تأمین درخواست',
    PROFILE_UPDATE: 'به‌روزرسانی پروفایل', PASSWORD_CHANGE: 'تغییر گذرواژه', PASSWORD_RESET: 'بازنشانی گذرواژه',
    LOGIN_NEW_DEVICE: 'ورود از دستگاه جدید', USER_UPDATE: 'ویرایش کاربر', USER_CREATE: 'ایجاد کاربر',
  }
  const entityLabels: Record<string, string> = {
    letter: 'نامه', warehouseDoc: 'سند انبار', goodsRequest: 'درخواست کالا', product: 'محصول',
    platformModule: 'پلاگین', auth: 'نشست', featureFlag: 'پرچم ویژگی', user: 'کاربر', warehouse: 'انبار',
  }

  return {
    ok: true,
    data: {
      range,
      kpis: {
        cartableCount,
        openLetters,
        urgentLetters,
        overdueLetters: breached,
        pendingRequests,
        stockTotalM2: Math.round(stockTotalM2),
        postedDocs,
        draftDocs,
        activeModules,
        pluginCatalog,
        aiAssistedLetters: aiAssisted,
      },
      lettersByType,
      letterTrend,
      lettersInRange,
      lettersPrevRange,
      docTrend,
      docsInRange,
      docsPrevRange,
      stockByGrade,
      stockByWarehouse,
      perCompany,
      gate,
      gateMeta: {
        passCount: gate.filter((g) => g.value !== null && (g.kind === 'count' ? g.value <= g.target : g.value >= g.target)).length,
        total: gate.length,
      },
      recentActivity: audits.slice(0, 10).map((a) => ({
        id: a.id,
        action: actionLabels[a.action] ?? a.action,
        entity: entityLabels[a.entity] ?? a.entity,
        userName: a.user?.fullName ?? '—',
        createdAt: a.createdAt,
      })),
    },
  }
}
