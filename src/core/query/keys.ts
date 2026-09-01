/**
 * کارخانه کلیدهای کوئری (P1-T2) — منبع واحد حقیقت برای کلیدهای کش.
 *
 * قاعده‌ها:
 *  - کلید همیشه با «دامنه» شروع می‌شود (letters/stock/…) تا ابطال پیشوندی ممکن باشد:
 *      invalidateQueries({ queryKey: QK_PREFIX.letters }) → همه کوئری‌های نامه با هر جستجو/تب
 *  - companyId عضو کلید است: سوئیچ شرکت نباید کش شرکت قبلی را نشان دهد
 *  - پارامترهای فیلتر (تب/جستجو/انبار) بعد از شرکت می‌آیند
 */

export const qkLetters = (companyId: string, box: string, q: string, page: number, pageSize: number, sort: string) =>
  ['letters', companyId, box, q, page, pageSize, sort] as const
export const qkStock = (companyId: string, warehouseId: string, grade: string) => ['stock', companyId, warehouseId, grade] as const
export const qkWhdocs = (companyId: string, q: string, type: string, page: number, pageSize: number, sort: string) =>
  ['whdocs', companyId, q, type, page, pageSize, sort] as const
export const qkRequests = (companyId: string, status: string, page: number, pageSize: number) =>
  ['requests', companyId, status, page, pageSize] as const
export const qkAudit = (companyId: string, q: string, action: string, entity: string, filterCompany: string, from: string, to: string, page: number, pageSize: number, sort: string) =>
  ['audit', companyId, q, action, entity, filterCompany, from, to, page, pageSize, sort] as const
export const qkWarehouses = () => ['warehouses'] as const
export const qkProducts = () => ['products'] as const
export const qkPartners = (companyId: string) => ['partners', companyId] as const
export const qkUsers = () => ['users'] as const
export const qkDashboard = (companyId: string) => ['dashboard', companyId] as const
export const qkCodingSchemes = (companyId: string) => ['coding', 'schemes', companyId] as const
/** خط زمان رکورد (P2.5-U5) — per شرکت+نهاد+رکورد */
export const qkTimeline = (companyId: string, entity: string, id: string) => ['timeline', companyId, entity, id] as const

/** پیشوندها برای ابطال دسته‌ای (invalidate با queryKey پیشوندی، همه پارامترها را می‌گیرد) */
export const QK_PREFIX = {
  letters: ['letters'] as const,
  stock: ['stock'] as const,
  whdocs: ['whdocs'] as const,
  requests: ['requests'] as const,
  warehouses: ['warehouses'] as const,
  products: ['products'] as const,
  partners: ['partners'] as const,
  users: ['users'] as const,
  dashboard: ['dashboard'] as const,
  audit: ['audit'] as const,
  coding: ['coding'] as const,
  timeline: ['timeline'] as const,
}
