'use client'

/**
 * کوئری‌های دامنه شرکا (P1-T25) — مرز ماژول = HTTP؛
 * کلید کش qkPartners مشترک بین نمای شرکا و پالت فرمان تا کش به اشتراک برود (هم‌الگوی products).
 */
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/core/shared/api-client'
import { qkPartners } from '@/core/query/keys'
import { useApp } from '@/store/app'
import type { Partner } from '@/types/platform'

/** فهرست شرکا: رکورد طلایی گروه + نمونه‌های عملیاتی شرکت‌های در دسترس */
export function usePartnersQuery() {
  const me = useApp((s) => s.me)
  const companyId = me?.activeCompanyId
  return useQuery({
    queryKey: qkPartners(companyId ?? 'none'),
    queryFn: () => apiGet<{ partners: Partner[] }>('/api/partners'),
    enabled: !!me,
    staleTime: 60_000,
  })
}
