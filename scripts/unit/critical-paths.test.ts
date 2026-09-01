// تست واحد مسیرهای بحرانی — P0.5-T1 (معیارهای پذیرش ۱ تا ۴ فایل فاز)
// بدون DB زنده: Prisma با mock درون‌حافظه‌ای جایگزین شده (mock-db.ts با rollback واقعی).
// پوشش: قطعی‌سازی اتمیک سند انبار (rollback/idempotency/انتقال) + گارد هم‌زمانی اقدام نامه (409).
/// <reference types="bun-types" />
import { describe, test, expect, mock, beforeEach, beforeAll } from 'bun:test'
import { createMockDb, type Row } from './mock-db'
import type { SessionContext } from '@/core/auth/auth'

const emitEvent = mock(async (_type: string, _payload?: Record<string, unknown>) => {})
const notify = mock(async (_p: unknown) => {})
const audit = mock(async () => {})
const { db, state, hooks } = createMockDb({})

// 'server-only' در زمان اجرای Bun به شاخهٔ browser می‌رود (خطا می‌دهد) — در تست، server فرض می‌کنیم
mock.module('server-only', () => ({}))

// ماژول‌های زیرآزمونی — پیش از import کدِ تحت تست ثبت می‌شوند (شرط mock.module)
mock.module('@/core/shared/db', () => ({ db }))
mock.module('@/core/events/outbox', () => ({ emitEvent }))
mock.module('@/core/notifications/notify', () => ({ notify }))
mock.module('@/core/audit/audit', () => ({ audit }))
mock.module('@/core/tenancy/tenancy', () => ({
  scopeCompanyIds: async () => ['co-1'],
  requireWriteRole: async () => true,
  requireSettingsAdmin: async () => true,
}))

const { applyDocToStock } = await import('@/modules/warehouse/warehouse')

// ---------- سازنده‌های داده ----------
const BASE_DOC: Row = { id: 'doc-1', companyId: 'co-1', docNumber: 42, type: 'RECEIPT', warehouseId: 'wh-1', toWarehouseId: null, status: 'DRAFT', createdById: 'user-1' }
const ITEMS = (qtys: number[]): Row[] => qtys.map((q, i) => ({ id: `it-${i + 1}`, docId: 'doc-1', productId: 'p-1', tone: '', caliber: '', grade: '1', qtyM2: q, note: null }))
const STOCK = (qty: number, warehouseId = 'wh-1'): Row[] => (qty === null ? [] : [{ id: `s-${warehouseId}`, warehouseId, productId: 'p-1', tone: '', caliber: '', grade: '1', qtyM2: qty }])

function resetWarehouse(doc: Row | null, items: Row[], stocks: Row[]) {
  state.warehouseDoc = doc ? [structuredClone(doc)] : []
  state.docItem = structuredClone(items)
  state.stockItem = structuredClone(stocks)
  state.product = [{ id: 'p-1', code: 'PRD-100', companyId: 'co-1' }]
  emitEvent.mockClear()
}

// ---------- ۱) قطعی‌سازی سند انبار (applyDocToStock) ----------
describe('applyDocToStock — اتمیک یا هیچ (P0.5-T1)', () => {
  beforeEach(() => {
    hooks.onCreate = undefined
  })

  test('رسید DRAFT: موجودی افزایش، سند POSTED، رویداد doc.posted یک‌بار', async () => {
    resetWarehouse({ ...BASE_DOC }, ITEMS([100]), STOCK(50))
    const err = await applyDocToStock('doc-1')
    expect(err).toBeNull()
    expect((state.stockItem[0].qtyM2 as number)).toBe(150)
    expect(state.warehouseDoc[0].status).toBe('POSTED')
    expect(emitEvent).toHaveBeenCalledTimes(1)
    expect(emitEvent.mock.calls[0][0]).toBe('doc.posted')
  })

  test('سند غایب → پیام «سند یافت نشد» بدون تغییر داده', async () => {
    resetWarehouse(null, [], [])
    const err = await applyDocToStock('nope')
    expect(err).toBe('سند یافت نشد')
    expect(state.stockItem).toHaveLength(0)
  })

  test('سند POSTED → idempotency: پیام «قبلاً قطعی» و موجودی دست‌نخورده', async () => {
    resetWarehouse({ ...BASE_DOC, status: 'POSTED' }, ITEMS([100]), STOCK(50))
    const err = await applyDocToStock('doc-1')
    expect(err).toBe('سند قبلاً قطعی شده است')
    expect((state.stockItem[0].qtyM2 as number)).toBe(50)
    expect(emitEvent).toHaveBeenCalledTimes(0)
  })

  test('رقابت دوبار POST (فراخوانی متوالی): فقط اولی برنده، موجودی یک‌بار اعمال', async () => {
    resetWarehouse({ ...BASE_DOC }, ITEMS([100]), STOCK(50))
    const first = await applyDocToStock('doc-1')
    const second = await applyDocToStock('doc-1')
    expect(first).toBeNull()
    expect(second).toBe('سند قبلاً قطعی شده است')
    expect((state.stockItem[0].qtyM2 as number)).toBe(150) // نه ۲۵۰
  })

  test('C1 — کمبود موجودی در قلم دوم: rollback کامل (موجودی + status + بدون رویداد)', async () => {
    // قلم اول موفق (+60 ⇒ 160)، قلم دوم کمبود (−200 ⇒ −40) ⇒ پرتاب ⇒ rollback: موجودی 100، سند DRAFT
    resetWarehouse({ ...BASE_DOC }, ITEMS([60, -200]), STOCK(100))
    const err = await applyDocToStock('doc-1')
    expect(err).toContain('موجودی کافی نیست')
    expect(err).toContain('PRD-100')
    expect((state.stockItem[0].qtyM2 as number)).toBe(100) // +60 قلم اول هم برگشت
    expect(state.warehouseDoc[0].status).toBe('DRAFT')
    expect(emitEvent).toHaveBeenCalledTimes(0)
  })

  test('رسید قلم بدون ردیف موجودی: ردیف جدید ساخته می‌شود', async () => {
    resetWarehouse({ ...BASE_DOC }, ITEMS([70]), [])
    const err = await applyDocToStock('doc-1')
    expect(err).toBeNull()
    expect(state.stockItem).toHaveLength(1)
    expect((state.stockItem[0].qtyM2 as number)).toBe(70)
    expect(state.stockItem[0].warehouseId).toBe('wh-1')
  })

  test('انتقال: مبدأ کسر و مقصد افزوده می‌شود', async () => {
    resetWarehouse({ ...BASE_DOC, type: 'TRANSFER', toWarehouseId: 'wh-2' }, ITEMS([30]), [...STOCK(50, 'wh-1'), ...STOCK(0, 'wh-2')])
    const err = await applyDocToStock('doc-1')
    expect(err).toBeNull()
    expect((state.stockItem[0].qtyM2 as number)).toBe(20)
    expect((state.stockItem[1].qtyM2 as number)).toBe(30)
    expect(state.warehouseDoc[0].status).toBe('POSTED')
  })

  test('انتقال با کمبود مبدأ: rollback هر دو انبار (بدون اثر جزئی)', async () => {
    resetWarehouse({ ...BASE_DOC, type: 'TRANSFER', toWarehouseId: 'wh-2' }, ITEMS([80]), [...STOCK(50, 'wh-1'), ...STOCK(0, 'wh-2')])
    const err = await applyDocToStock('doc-1')
    expect(err).toContain('موجودی کافی نیست')
    expect((state.stockItem[0].qtyM2 as number)).toBe(50)
    expect((state.stockItem[1].qtyM2 as number)).toBe(0)
    expect(state.warehouseDoc[0].status).toBe('DRAFT')
  })

  test('حواله با کمبود موجودی: rollback کامل و سند در DRAFT می‌ماند', async () => {
    resetWarehouse({ ...BASE_DOC, type: 'ISSUE' }, ITEMS([-60]), STOCK(50))
    const err = await applyDocToStock('doc-1')
    expect(err).toContain('موجودی کافی نیست')
    expect((state.stockItem[0].qtyM2 as number)).toBe(50)
    expect(state.warehouseDoc[0].status).toBe('DRAFT')
  })
})

// ---------- ۲) اقدام روی نامه (actOnLetter) ----------
describe('actOnLetter — گارد اتمیک و اعتبارسنجی (P0.5-T1)', () => {
  // import تنبل: اگر زنجیرهٔ ماژول OA مشکل داشته باشد، تست‌های انبار بالا همچنان اجرا شده‌اند
  let actOnLetter: typeof import('@/modules/office-automation/service')['actOnLetter']
  beforeAll(async () => {
    ;({ actOnLetter } = await import('@/modules/office-automation/service'))
  })

  const ctx = { userId: 'user-1', companyId: 'co-1' } as unknown as SessionContext

  // ServiceResult یک union discriminant است؛ تست به error/status از هر دو شاخه دسترسی دارد
  type LooseResult = { ok: boolean; error?: string; status?: number }
  const loose = (r: unknown): LooseResult => r as LooseResult

  function resetLetters(over: Row = {}) {
    state.letter = [
      structuredClone({ id: 'l-1', companyId: 'co-1', number: 7, type: 'IN', subject: 'موضوع تست', confidentiality: 'NORMAL', status: 'IN_PROGRESS', currentHolderId: 'user-1', creatorId: 'user-1', ...over }),
    ]
    state.letterReferral = []
    state.user = [
      { id: 'user-1', fullName: 'کاربر یک' },
      { id: 'user-2', fullName: 'کاربر دو' },
    ]
    state.membership = [
      { id: 'm-1', userId: 'user-1', companyId: 'co-1', role: 'ADMIN' },
      { id: 'm-2', userId: 'user-2', companyId: 'co-1', role: 'OPERATOR' },
    ]
    notify.mockClear()
    emitEvent.mockClear()
    audit.mockClear()
    hooks.onCreate = undefined
  }

  beforeEach(() => {
    hooks.onCreate = undefined
  })

  test('ارجاع معتبر: ارجاع ثبت، دارنده/وضعیت به‌روز، اعلان و رویداد', async () => {
    resetLetters()
    const res = loose(await actOnLetter(ctx, 'l-1', { action: 'REFER', toUserId: 'user-2' }))
    expect(res.ok).toBe(true)
    expect(state.letter[0].currentHolderId).toBe('user-2')
    expect(state.letter[0].status).toBe('IN_PROGRESS')
    expect(state.letterReferral).toHaveLength(1)
    expect(state.letterReferral[0].action).toBe('REFER')
    expect(state.letterReferral[0].toUserId).toBe('user-2')
    expect(notify).toHaveBeenCalledTimes(1)
    expect((notify.mock.calls[0][0] as Row).userId).toBe('user-2')
    expect(emitEvent).toHaveBeenCalledTimes(1)
  })

  test('اقدام هم‌زمان (رقابت): 409 + rollback ارجاع یتیم + بدون اعلان', async () => {
    resetLetters()
    // شبیه‌سازی: اقدام کاربرِ دیگر دقیقاً پس از ثبت ارجاعِ ما و پیش از به‌روزرسانی نامه commit می‌شود
    hooks.onCreate = (model) => {
      if (model === 'letterReferral') state.letter[0].currentHolderId = 'user-3'
    }
    const res = loose(await actOnLetter(ctx, 'l-1', { action: 'REFER', toUserId: 'user-2' }))
    expect(res.ok).toBe(false)
    expect(res.status).toBe(409)
    expect(res.error).toContain('هم‌زمان')
    expect(state.letterReferral).toHaveLength(0) // ارجاع ما rollback شد
    expect(state.letter[0].currentHolderId).toBe('user-3') // اثرِ «دیگری» پابرجا
    expect(notify).toHaveBeenCalledTimes(0)
    expect(emitEvent).toHaveBeenCalledTimes(0)
  })

  test('پاسخ بدون متن → خطای «متن پاسخ الزامی است»', async () => {
    resetLetters()
    const res = loose(await actOnLetter(ctx, 'l-1', { action: 'ANSWER' }))
    expect(res.ok).toBe(false)
    expect(res.error).toBe('متن پاسخ الزامی است')
    expect(state.letterReferral).toHaveLength(0)
  })

  test('نامه بایگانی‌شده + اقدام غیر ارجاع → رد', async () => {
    resetLetters({ status: 'ARCHIVED', currentHolderId: null })
    const res = loose(await actOnLetter(ctx, 'l-1', { action: 'ANSWER', answerText: 'متن' }))
    expect(res.ok).toBe(false)
    expect(res.error).toBe('نامه بایگانی‌شده قابل اقدام نیست')
  })

  test('اقدام توسط غیردارنده → «این نامه در کارتابل شما نیست»', async () => {
    resetLetters({ currentHolderId: 'user-2' })
    const res = loose(await actOnLetter(ctx, 'l-1', { action: 'ANSWER', answerText: 'متن' }))
    expect(res.ok).toBe(false)
    expect(res.error).toBe('این نامه در کارتابل شما نیست')
  })

  test('عملیات نامعتبر → «عملیات نامعتبر است»', async () => {
    resetLetters()
    const res = loose(await actOnLetter(ctx, 'l-1', { action: 'DELETE' }))
    expect(res.ok).toBe(false)
    expect(res.error).toBe('عملیات نامعتبر است')
  })

  test('ارجاع به کاربر بدون دسترسی به شرکت نامه → رد', async () => {
    resetLetters()
    state.membership = [{ id: 'm-2', userId: 'user-2', companyId: 'co-OTHER', role: 'ADMIN' }]
    const res = loose(await actOnLetter(ctx, 'l-1', { action: 'REFER', toUserId: 'user-2' }))
    expect(res.ok).toBe(false)
    expect(res.error).toBe('کاربر گیرنده به شرکت این نامه دسترسی ندارد')
    expect(state.letterReferral).toHaveLength(0)
  })
})
