import 'server-only'
import { db } from '@/core/shared/db'
import type { SessionContext } from '@/core/auth/auth'
import { scopeCompanyIds } from '@/core/tenancy/tenancy'
import { actionLabelFa } from '@/core/shared/audit-labels'
import type { ServiceResult } from '@/core/shared/types'
import type { TimelineEntry } from '@/types/platform'

// ---------- حسابرسی ----------
// بعد از هر عملیات نوشتاری کسب‌وکار صدا زده می‌شود (قاعده AGENTS.md).
export async function audit(opts: {
  ctx: SessionContext
  action: string
  entity: string
  entityId?: string
  details?: unknown
}) {
  await db.auditLog.create({
    data: {
      userId: opts.ctx.userId,
      companyId: opts.ctx.companyId,
      action: opts.action,
      entity: opts.entity,
      entityId: opts.entityId,
      details: opts.details ? JSON.stringify(opts.details) : null,
    },
  })
}

// ---------- خط زمان رکورد (P2.5-U5 / R1) ----------
// سجل حسابرسی یک موجودیت خاص به‌صورت زمانی — «Chatter سبک» برای هر رکورد.
// نامه عمداً در لیست نیست: گردش اختصاصی خودش (ارجاع/پاسخ) در تب «گردش نامه» رندر می‌شود
// و سجل حسابرسی آن تکرار همان اطلاعات است (تصمیم SPEC اتوماسیون اداری).
export const TIMELINE_ENTITIES = [
  'warehouseDoc', 'goodsRequest', 'product', 'partner', 'warehouse', 'user', 'codeScheme',
] as const
const TIMELINE_ENTITIES_SET = new Set<string>(TIMELINE_ENTITIES)

/**
 * خط زمان یک رکورد — فقط نهادهای لیست‌سفید + گارد دامنه دید شرکت (scopeCompanyIds):
 * کاربر فقط سجل‌های رکوردهای شرکت‌های خودش را می‌بیند (ایزولاسیون چندشرکتی، ADR-002).
 * توجه: برخلاف listAudit (مدیریت تنظیمات)، خط زمان برای همه نقش‌هاست —
 * اطلاعات عملیاتیِ همان رکوردی است که کاربر اجازه دیدنش را دارد.
 */
export async function entityTimeline(
  ctx: SessionContext,
  entity: string,
  entityId: string,
): Promise<ServiceResult<{ entries: TimelineEntry[] }>> {
  if (!TIMELINE_ENTITIES_SET.has(entity)) {
    return { ok: false, error: 'نهاد پشتیبانی نمی‌شود', status: 400 }
  }
  if (!entityId) {
    return { ok: false, error: 'شناسه رکورد الزامی است', status: 400 }
  }
  const scope = await scopeCompanyIds(ctx)
  const rows = await db.auditLog.findMany({
    where: { entity, entityId, companyId: { in: scope } },
    orderBy: { createdAt: 'asc' },
    take: 200, // سقف دفاعی — سجل یک رکورد در عمل <۲۰ است
    include: {
      user: { select: { fullName: true } },
      company: { select: { name: true } },
    },
  })
  return {
    ok: true,
    data: {
      entries: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actionFa: actionLabelFa(r.action),
        userName: r.user?.fullName ?? '—',
        companyName: r.company?.name ?? '—',
        createdAt: r.createdAt.toISOString(),
        details: r.details,
      })),
    },
  }
}
