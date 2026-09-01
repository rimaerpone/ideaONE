'use client'

/**
 * کوئری‌های دامنه پلتفرم (P1-T15) — سجل حسابرسی با فیلترهای غنی و صفحه‌بندی سروری
 *
 * کلید کش شامل companyId + همه فیلترها (جستجو/اقدام/موجودیت/شرکت/بازه/صفحه/مرتب‌سازی)
 * است تا هر تغییر فیلتر، کوئری مستقل و کش‌پذیر باشد؛ keepPreviousData = بدون پرش جدول.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiGet } from '@/core/shared/api-client'
import { qkAudit } from '@/core/query/keys'
import { useApp } from '@/store/app'
import type { AuditData } from '@/types/platform'

export type AuditListParams = {
  q: string
  action: string
  entity: string
  companyId: string
  from: string
  to: string
  page: number
  pageSize: number
  sort: string // «field:dir»
}

/** سجل حسابرسی صفحه‌بندی‌شده سروری — پاکت استاندارد logs + رویدادهای Outbox */
export function useAuditLogsQuery(p: AuditListParams, enabled: boolean) {
  const me = useApp((s) => s.me)
  const activeCompanyId = me?.activeCompanyId ?? ''
  return useQuery({
    queryKey: qkAudit(activeCompanyId, p.q, p.action, p.entity, p.companyId, p.from, p.to, p.page, p.pageSize, p.sort),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(p.page),
        pageSize: String(p.pageSize),
        sort: p.sort,
      })
      if (p.q) params.set('q', p.q)
      if (p.action) params.set('action', p.action)
      if (p.entity) params.set('entity', p.entity)
      if (p.companyId) params.set('companyId', p.companyId)
      if (p.from) params.set('from', p.from)
      if (p.to) params.set('to', p.to)
      return apiGet<AuditData>(`/api/audit?${params.toString()}`)
    },
    enabled: enabled && !!me,
    placeholderData: keepPreviousData,
  })
}
