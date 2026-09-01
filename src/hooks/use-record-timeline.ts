'use client'

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/core/shared/api-client'
import { qkTimeline } from '@/core/query/keys'
import { useApp } from '@/store/app'
import type { TimelineEntry } from '@/types/platform'

/**
 * P2.5-U5 (R1) — خط زمان رکورد (سجل حسابرسی همان موجودیت).
 * هوک مشترک بین ماژول‌ها (انبار/محصول/شرکا) — چون نهاد آن «حسابرسی» است نه یک ماژول.
 * invalidation: با QK_PREFIX.timeline پس از هر عملیات نوشتاری روی رکورد
 * (مصرف‌کننده‌های امروز: post/cancel/edit-items خودشان invalidate می‌کنند — کافی است چون
 * خط زمان همان جدول AuditLog را می‌خواند و کوئری رکورد اصلی همزمان تازه می‌شود).
 */
export function useRecordTimelineQuery(entity: string, recordId: string | null | undefined) {
  const me = useApp((s) => s.me)
  const companyId = me?.activeCompanyId ?? ''
  const id = recordId ?? ''
  return useQuery({
    queryKey: qkTimeline(companyId, entity, id),
    queryFn: () => apiGet<{ entries: TimelineEntry[] }>(`/api/audit/timeline?entity=${entity}&id=${encodeURIComponent(id)}`),
    enabled: !!me && !!id,
    staleTime: 0, // همیشه تازه — پارچه کوچک و نمایان‌شدن فوری اقدامِ همین لحظه مهم‌تر از کش است
  })
}
