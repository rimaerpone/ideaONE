// تایپ‌های مشترک پلتفرم (سمت کلاینت)

/**
 * پاکت استاندارد فهرست سرور (P1-T3/T12) — امضای یکسان همه APIهای فهرست.
 * سقف pageSize سرور ۱۰۰ است؛ صفحه ۱-مبنا.
 */
export type ListEnvelope<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export type ListSortDir = 'asc' | 'desc'

export type Company = {
  id: string
  code: string
  name: string
  type: string // GROUP | COMPANY
  role: string
  sortOrder: number
}

export type SessionUser = {
  id: string
  username: string
  fullName: string
  jobTitle: string | null
  isAdmin: boolean
}

export type MeResponse = {
  user: SessionUser
  companies: Company[]
  activeCompanyId: string | null
  unreadCount: number
}

// ---------- تاکسونومی سه‌لایه پلاگین‌ها (ADR-008) ----------

export const LAYER_LABELS: Record<string, string> = {
  FOUNDATION: 'بستر و حاکمیت',
  OPERATIONS: 'عملیات کسب‌وکار',
  INTELLIGENCE: 'هوشمندی',
}

export const DOMAIN_LABELS: Record<string, string> = {
  general: 'عمومی',
  'master-data': 'مستر دیتا',
  office: 'اتوماسیون و همکاری',
  warehouse: 'انبار و لجستیک',
  manufacturing: 'تولید و کیفیت',
  finance: 'مالی',
  commercial: 'بازرگانی و فروش',
  hr: 'منابع انسانی',
  ai: 'هوش مصنوعی و استودیو',
}

export type ModuleMenuInfo = {
  viewKey: string
  label: string
  icon: string
}

export type ModuleInfo = {
  id: string
  code: string
  name: string
  description: string
  icon: string
  layer: string
  domain: string
  targetPhase: string
  dependsOn: string
  version: string
  status: string
  sortOrder: number
  menus: ModuleMenuInfo[]
  companyEnabled: boolean | null
}

// ---------- حاکمیت بستر (ADR-009) ----------

export type FeatureFlagItem = {
  key: string
  description: string
  enabled: boolean
  updatedAt: string
}

export type ConnectorItem = {
  code: string
  name: string
  kind: string
  status: string
  direction: string
  endpoint: string | null
  note: string | null
}

export type ReportItem = {
  code: string
  name: string
  moduleCode: string
  category: string
  engine: string
  targetPhase: string
}

export type JobStatusItem = {
  key: string
  name: string
  intervalSec: number
  enabled: boolean
  lastRunAt: string | null
  lastStatus: string | null
  lastError: string | null
  note: string | null
}

export type AiInvocationItem = {
  task: string
  provider: string
  ok: boolean
  error: string | null
  latencyMs: number
  createdAt: string
}

export type GovernanceData = {
  flags: FeatureFlagItem[]
  connectors: ConnectorItem[]
  reports: ReportItem[]
  jobs: JobStatusItem[]
  aiInvocations: AiInvocationItem[]
}

// ---------- نمای امنیت (P0-T22) ----------
export type SecurityData = {
  weakUsers: { username: string; fullName: string; jobTitle: string | null; demoPassword: string }[]
  activeUserCount: number
  sessionCount: number
  rateLimitDesc: string
  failed24h: number
  failedLogins: { id: string; username: string; ip: string; reason: string; createdAt: string }[]
}

export type AttachmentItem = {
  id: string
  fileObjectId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export type NotificationItem = {
  id: string
  title: string
  body: string | null
  kind: string
  targetView: string | null
  isRead: boolean
  createdAt: string
}

export type Product = {
  id: string
  code: string
  name: string
  productLine: string
  size: string
  color: string
  surface: string | null
  cartonArea: number
  cartonsPerPallet: number
  status: string
  companyName: string
  companyCode: string
  totalStockM2: number
}

export type PartnerInstance = {
  id: string
  companyName: string
  companyCode: string
  accountCode: string | null
  creditLimit: number
  terms: string | null
  note: string | null
}

export type Partner = {
  id: string
  kind: string // CUSTOMER | SUPPLIER
  goldenName: string
  nationalId: string | null
  instances: PartnerInstance[]
}

export type Warehouse = {
  id: string
  code: string
  name: string
  kind: string
  companyName: string
  companyCode: string
}

export type StockItem = {
  id: string
  qtyM2: number
  tone: string
  caliber: string
  grade: string
  updatedAt: string
  product: { code: string; name: string; size: string; color: string; productLine: string; cartonArea: number }
  warehouse: { id: string; name: string; kind: string; companyName: string; companyCode: string }
}

export type WhDocItem = {
  id: string
  productCode: string
  productName: string
  tone: string
  caliber: string
  grade: string
  qtyM2: number
  note: string | null
}

export type WhDoc = {
  id: string
  docNumber: number
  type: string
  status: string
  docDate: string
  note: string | null
  partnerName: string | null
  warehouseName: string
  toWarehouseName: string | null
  companyName: string
  companyCode: string
  items: WhDocItem[]
}

/** سند انبار در صفحه رکورد (P1.5-T9) — قلم با ابعاد */
export type WhDocDetail = Omit<WhDoc, 'items'> & {
  items: (WhDocItem & { size: string })[]
}

/** درخواست کالا در صفحه رکورد (P1.5-T10) */
export type GoodsRequestDetail = GoodsRequest

export type GoodsRequest = {
  id: string
  reqNumber: number
  status: string
  neededFor: string | null
  note: string | null
  createdAt: string
  decidedAt: string | null
  requesterName: string
  requesterTitle: string | null
  warehouseName: string
  companyName: string
  companyCode: string
  items: { id: string; productCode: string; productName: string; size: string; qtyM2: number }[]
}

export type LetterListItem = {
  id: string
  number: number
  type: string
  subject: string
  status: string
  confidentiality: string
  urgency: string
  deadlineAt: string | null
  // P2-T10 — مهلت گام جاری: آخرین ارجاعِ رساننده نامه به دارنده فعلی (null اگر مهلت ندارد)
  stepDeadlineAt: string | null
  createdAt: string
  senderTitle: string | null
  receiverTitle: string | null
  creatorName: string
  holderName: string | null
  isMine: boolean
  companyName: string
  companyCode: string
  aiCategory: string | null
}

export type LetterDetail = {
  id: string
  number: number
  type: string
  subject: string
  body: string
  status: string
  confidentiality: string
  urgency: string
  deadlineAt: string | null
  createdAt: string
  senderTitle: string | null
  receiverTitle: string | null
  creatorName: string
  creatorTitle: string | null
  creatorId: string
  holderName: string | null
  holderId: string | null
  companyName: string
  companyCode: string
  /** P2.5-U7 — سربرگ چاپ نامه: نام قانونی شرکت + دو کلید per-company (اختیاری) */
  companyLegalName: string | null
  letterheadSubtitle: string | null
  letterheadFooter: string | null
  aiCategory: string | null
  aiSummary: string | null
  /** شمار پیوست — برچسب تب داخلی «پیوست‌ها (N)» (P2.5-U10) */
  attachmentsCount: number
  referrals: { id: string; action: string; note: string | null; answerText: string | null; deadlineAt: string | null; createdAt: string; fromName: string; fromId: string; toName: string; toUserId: string }[]
}

export type UserDirectoryItem = {
  id: string
  fullName: string
  jobTitle: string | null
}

export type UserItem = UserDirectoryItem & {
  username: string
  isAdmin: boolean
  isActive: boolean
  companies: { code: string; name: string; role: string }[]
}

export type DashboardData = {
  /** بازه تحلیلی نمودارهای روندی (P2.5-U3/D7) — ۷/۳۰/۹۰ روز */
  range: number
  kpis: {
    cartableCount: number
    openLetters: number
    urgentLetters: number
    overdueLetters: number
    pendingRequests: number
    stockTotalM2: number
    postedDocs: number
    draftDocs: number
    activeModules: number
    pluginCatalog: { total: number; active: number; layers: { FOUNDATION: number; OPERATIONS: number; INTELLIGENCE: number } }
    aiAssistedLetters: number
  }
  lettersByType: { name: string; value: number }[]
  /** D7 — روند ثبت نامه در بازه تحلیلی (سطل روزانه/هفتگی، قدیم → جدید) */
  letterTrend: { name: string; وارده: number; صادره: number; داخلی: number }[]
  /** D7 — دلتای نامه‌های ثبت‌شده: بازه جاری در برابر دوره هم‌طول قبل */
  lettersInRange: number
  lettersPrevRange: number
  docTrend: { name: string; رسید: number; حواله: number }[]
  /** D7 — دلتای اسناد قطعی‌شده در بازه تحلیلی */
  docsInRange: number
  docsPrevRange: number
  stockByGrade: { name: string; value: number }[]
  stockByWarehouse: { name: string; value: number }[]
  /** نمای مقایسه‌ای شرکت‌های دامنه — فقط در دامنه چندشرکتی معنا دارد (D6) */
  perCompany: { id: string; name: string; lettersInProgress: number; pendingRequests: number; stockM2: number }[]
  gate: {
    id: string
    label: string
    kind: 'percent' | 'count'
    value: number | null
    target: number
    detail: string
  }[]
  gateMeta: { passCount: number; total: number }
  recentActivity: { id: string; action: string; entity: string; userName: string; createdAt: string }[]
}

export type AuditLogItem = {
  id: string
  action: string
  entity: string
  entityId: string | null
  details: string | null
  userName: string
  companyName: string
  createdAt: string
}

export type AuditData = {
  logs: ListEnvelope<AuditLogItem>
  events: { id: string; type: string; payload: string; createdAt: string; processedAt: string | null }[]
}

export type AiSuggestion = {
  category: string
  summary: string
  priority: string
  keyPoints: string[]
}

// ---------- P2-T13 — گزارش هفتگی کارتابل (DTO کلاینت — سرویس server-only است) ----------
export type CartableReportRowDto = {
  userId: string
  fullName: string
  jobTitle: string | null
  isActive: boolean
  received: number
  acted: number
  actedByKind: { REFER: number; ANSWER: number; APPROVE: number; ARCHIVE: number }
  stuck: number
}

export type WeeklyReportData = {
  from: string
  to: string
  fromJalali: string
  toJalali: string
  staleDays: number
  scopeCount: number
  rows: CartableReportRowDto[]
  totals: { received: number; acted: number; stuck: number }
  markdown: string
}

// ---------- P2-T16 — OCR نامه اسکن‌شده (DTO کلاینت — سرویس server-only است) ----------
export type OcrLetterDraftDto = {
  type: 'INCOMING' | 'OUTGOING' | 'INTERNAL' | null
  subject: string | null
  body: string | null
  senderTitle: string | null
  receiverTitle: string | null
  urgency: 'NORMAL' | 'URGENT' | null
}

export type OcrScanData = {
  fileName: string
  raw: string
  ocrLatencyMs: number
  draft: OcrLetterDraftDto | null
  // وقتی مرحله دوم (ساختاردهی LLM) در دسترس نبود/رد شد: متن خام همچنان قابل درج است
  aiNote: string | null
}


// ---------------- موتور کدگذاری ساختارمحور («کد به‌عنوان جمله») ----------------
// طرحواره = دستور زبان کد؛ عمومی برای هر خانواده قلم (کاشی/تجهیزات/قطعات/مواد اولیه)

export type CodeEnumValueDto = { code: string; label: string }

export type CodeSegmentDto = {
  key: string
  label: string
  position: number
  length: number
  kind: 'ENUM' | 'COUNTER'
  required: boolean
  mapsTo: string | null
  enumValues: CodeEnumValueDto[]
}

export type CodeSchemeDto = {
  id: string
  code: string
  name: string
  description: string | null
  itemFamily: string
  separator: string
  motherSegments: number | null
  totalLength: number
  segments: CodeSegmentDto[]
}

/** نتیجه رمزگشایی یک جزء از کد */
export type DecodedPart = { key: string; label: string; code: string; labelValue: string | null; error: string | null }

/** پاسخ POST /api/coding/compose */
export type ComposeResult = {
  code: string
  motherCode: string
  description: string
  parts: { key: string; label: string; code: string; labelValue: string }[]
}

/** پاسخ GET /api/coding/decode */
export type DecodeResult = {
  schemeCode: string
  schemeName: string
  code: string
  motherCode: string
  description: string
  parts: DecodedPart[]
  ok: boolean
  error: string | null
}

/** سطر خط زمان رکورد (P2.5-U5) — پاسخ GET /api/audit/timeline */
export type TimelineEntry = {
  id: string
  action: string
  actionFa: string
  userName: string
  companyName: string
  createdAt: string
  details: string | null
}
