'use client'

/**
 * محتوای پنل پیش‌نمایش سند انبار (P2.5-U4 — Master-Detail) — فقط-خواندنی.
 * داده از همان کوئری صفحه رکورد (useWhDocQuery) — کش مشترک با تب رکورد.
 */

import { useWhDocQuery } from '@/modules/warehouse/queries'
import type { WhDocDetail } from '@/types/platform'
import { DOC_TYPE_LABELS, StatusBadge } from '@/components/common/ui-bits'
import { PreviewInfo } from '@/components/common/preview-panel'
import { Badge } from '@/components/ui/badge'
import { formatJalali, faDigits, faNumber } from '@/core/shared/jalali'

export function WhDocPreviewContent({ docId }: { docId: string }) {
  const { data, isLoading, error } = useWhDocQuery(docId)
  const doc = data?.doc ?? null

  if (isLoading) return <p className="py-8 text-center text-xs text-muted-foreground">در حال بارگذاری…</p>
  if (error) return <p className="rounded-lg bg-destructive/10 p-3 text-xs leading-5 text-destructive" role="alert">{error instanceof Error ? error.message : 'سند بارگذاری نشد'}</p>
  if (!doc) return <p className="rounded-lg bg-destructive/10 p-3 text-xs leading-5 text-destructive" role="alert">سند یافت نشد</p>

  const totalM2 = doc.items.reduce((s, i) => s + i.qtyM2, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className="border-0 bg-primary/10 text-primary">{DOC_TYPE_LABELS[doc.type]} · {faDigits(doc.docNumber)}</Badge>
        <StatusBadge status={doc.status} />
      </div>

      <PreviewInfo
        rows={[
          { label: 'نوع سند', value: DOC_TYPE_LABELS[doc.type] ?? doc.type },
          { label: 'تاریخ سند', value: formatJalali(doc.docDate) },
          { label: 'طرف حساب', value: doc.partnerName ?? '—' },
          { label: 'انبار', value: doc.toWarehouseName ? `${doc.warehouseName} → ${doc.toWarehouseName}` : doc.warehouseName },
          { label: 'شرکت', value: `${doc.companyName} (${doc.companyCode})` },
          { label: 'جمع اقلام', value: `${faNumber(totalM2)} مترمربع` },
        ]}
      />

      {doc.note ? (
        <p className="rounded-lg bg-muted/40 p-3 text-xs leading-6">{doc.note}</p>
      ) : null}

      {/* اقلام — جدول فشرده با ابعاد (تون/کالیبر/درجه) */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">اقلام سند ({faNumber(doc.items.length)} قلم)</p>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-[11px]">
            <tbody>
              {doc.items.map((i) => (
                <tr key={i.id} className="border-b last:border-b-0">
                  <td className="px-2.5 py-1.5">
                    <p className="truncate font-medium">{i.productName}</p>
                    <p className="text-muted-foreground">{i.size}</p>
                  </td>
                  <td className="w-20 shrink-0 px-2.5 py-1.5 text-end tabular-nums">{faNumber(i.qtyM2)} م²</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
