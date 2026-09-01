'use client'

/**
 * کوئری‌های دامنه اتوماسیون اداری (P1-T2/T3/T12) — فهرست سروری نامه‌ها
 * با کلید companyId تا سوئیچ شرکت کش قبلی را نشان ندهد؛ صفحه/مرتب‌سازی/جستجو عضو کلید.
 *
 * نکته مرز: هوک «کاربران قابل ارجاع» عمداً اینجاست نه در ماژول platform —
 * فرم نامه از API عمومی کاربران می‌خواند (مرز ماژول = HTTP، CH-06)؛
 * کلید کش با qkUsers مشترک است تا کش بین نماها به اشتراک برود.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiGet } from '@/core/shared/api-client'
import { qkLetters, qkUsers } from '@/core/query/keys'
import { useApp } from '@/store/app'
import type { AttachmentItem, LetterDetail, LetterListItem, ListEnvelope, UserItem } from '@/types/platform'

export type LetterBox = 'all' | 'inbox' | 'sent'
export type ListSort = { field: string; dir: 'asc' | 'desc' }

export type LettersListParams = {
  box: LetterBox
  q: string
  page: number
  pageSize: number
  sort: ListSort
}

/** فهرست سروری نامه‌ها — پاکت استاندارد (items/total/page/pageSize/pageCount) */
export function useLettersQuery(p: LettersListParams) {
  const me = useApp((s) => s.me)
  const companyId = me?.activeCompanyId ?? ''
  return useQuery({
    queryKey: qkLetters(companyId, p.box, p.q, p.page, p.pageSize, `${p.sort.field}:${p.sort.dir}`),
    queryFn: () => {
      const params = new URLSearchParams({
        box: p.box, page: String(p.page), pageSize: String(p.pageSize), sort: `${p.sort.field}:${p.sort.dir}`,
      })
      if (p.q) params.set('q', p.q)
      return apiGet<ListEnvelope<LetterListItem>>(`/api/letters?${params.toString()}`)
    },
    enabled: !!me,
    placeholderData: keepPreviousData, // جستجو/صفحه‌بندی بدون پرش جدول
  })
}

/** کاربران فعال برای ارجاع نامه — مرز HTTP، کلید مشترک با مدیریت کاربر */
export function useReferUsersQuery() {
  const me = useApp((s) => s.me)
  return useQuery({
    queryKey: qkUsers(),
    queryFn: () => apiGet<{ users: UserItem[] }>('/api/users'),
    enabled: !!me,
    staleTime: 60_000,
  })
}

/** جزئیات یک نامه (P1.5-T6 — صفحه رکورد) */
export function useLetterQuery(letterId: string | null) {
  const me = useApp((s) => s.me)
  return useQuery({
    queryKey: ['letter', 'detail', letterId],
    queryFn: () => apiGet<{ letter: LetterDetail }>(`/api/letters/${letterId}`),
    enabled: !!me && !!letterId,
  })
}

/** پیوست‌های یک نامه (P1.5-T6) */
export function useLetterAttachmentsQuery(letterId: string | null) {
  const me = useApp((s) => s.me)
  return useQuery({
    queryKey: ['letter', 'attachments', letterId],
    queryFn: () => apiGet<{ attachments: AttachmentItem[] }>(`/api/letters/${letterId}/attachments`),
    enabled: !!me && !!letterId,
  })
}
