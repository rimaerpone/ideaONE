import 'server-only'
import { db } from '@/core/shared/db'
import type { SessionContext } from '@/core/auth/auth'
import { scopeCompanyIds } from '@/core/tenancy/tenancy'
import type { ServiceResult } from '@/core/shared/types'

/**
 * ماژول شرکای تجاری (رکورد طلایی) — لایه سرویس
 * الگوی داده: رکورد طلایی گروه + نمونه‌های عملیاتی per-company (ADR-002)
 */
export async function listPartners(ctx: SessionContext): Promise<ServiceResult<{ partners: unknown[] }>> {
  const scopeIds = await scopeCompanyIds(ctx)
  const partners = await db.partner.findMany({
    where: { isActive: true },
    orderBy: [{ kind: 'asc' }, { goldenName: 'asc' }],
    include: {
      instances: {
        where: { companyId: { in: scopeIds } },
        include: { company: { select: { name: true, code: true } } },
      },
    },
  })
  return {
    ok: true,
    data: {
      partners: partners.map((p) => ({
        id: p.id,
        kind: p.kind,
        goldenName: p.goldenName,
        nationalId: p.nationalId,
        instances: p.instances.map((i) => ({
          id: i.id,
          companyName: i.company.name,
          companyCode: i.company.code,
          accountCode: i.accountCode,
          creditLimit: i.creditLimit,
          terms: i.terms,
          note: i.note,
        })),
      })),
    },
  }
}
