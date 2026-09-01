'use client'

/**
 * محتوای پنل پیش‌نمایش درخواست کالا (P2.5-U4 — Master-Detail) — فقط-خواندنی.
 * تصمیم/تأمین (اقدام‌های نوشتاری) عمداً در پنل نیست — در صفحه کامل با گارد سروری.
 */

import { useRequestQuery } from '@/modules/warehouse/queries'
import type { GoodsRequest } from '@/types/platform'
import { StatusBadge } from '@/components/common/ui-bits'
import { PreviewInfo } from '@/components/common/preview-panel'
import { Badge } from '@/components/ui/badge'
import { formatJalali, faDigits, faNumber } from '@/core/shared/jalali'

export function RequestPreviewContent({ requestId }: { requestId: string }) {
  const { data, isLoading, error } = useRequestQuery(requestId)
  const r = data?.request ?? null

  if (isLoading) return <p className="py-8 text-center text-xs text-muted-foreground">در حال بارگذاری…</p>
  if (error) return <p className="rounded-lg bg-destructive/10 p-3 text-xs leading-5 text-destructive" role="alert">{error instanceof Error ? error.message : 'درخواست بارگذاری نشد'}</p>
  if (!r) return <p className="rounded-lg bg-destructive/10 p-3 text-xs leading-5 text-destructive" role="alert">درخواست یافت نشد</p>

  return <RequestPreviewBody r={r} />
}

function RequestPreviewBody({ r }: { r: GoodsRequest }) {
  const totalM2 = r.items.reduce((s, i) => s + i.qtyM2, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className="border-0 bg-primary/10 text-primary">درخواست {faDigits(r.reqNumber)}</Badge>
        <StatusBadge status={r.status} />
      </div>

      <PreviewInfo
        rows={[
          { label: 'متقاضی', value: r.requesterName },
          { label: 'سمت', value: r.requesterTitle ?? '—' },
          { label: 'انبار', value: r.warehouseName },
          { label: 'مصرف', value: r.neededFor ?? '—' },
          { label: 'تاریخ ثبت', value: formatJalali(r.createdAt) },
          { label: 'تاریخ تصمیم', value: r.decidedAt ? formatJalali(r.decidedAt) : '—' },
          { label: 'شرکت', value: `${r.companyName} (${r.companyCode})` },
          { label: 'جمع درخواست', value: `${faNumber(totalM2)} مترمربع` },
        ]}
      />

      {r.note ? (
        <p className="rounded-lg bg-muted/40 p-3 text-xs leading-6">«{r.note}»</p>
      ) : null}

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">اقلام درخواست ({faNumber(r.items.length)} قلم)</p>
        <div className="space-y-1.5 rounded-lg bg-muted/40 p-3">
          {r.items.map((i) => (
            <div key={i.id} className="flex items-center justify-between text-xs">
              <span className="truncate">{i.productName} <span className="text-muted-foreground">({i.size})</span></span>
              <span className="shrink-0 font-medium tabular-nums">{faNumber(i.qtyM2)} م²</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
