'use client'

/**
 * دیالوگ تأیید اقدام (P1-T23) — هیچ اقدام مخرب/قطعی بدون تأیید صریح انجام نمی‌شود.
 *
 * قاعده: هر عملیات «برگشت‌ناپذیر یا پرپیامد» (قطعی‌سازی سند، ابطال، خروج از همه دستگاه‌ها،
 * غیرفعال‌سازی کاربر، خاموشی سراسری ماژول، رد درخواست) قبل از فراخوانی API از این دیالوگ
 * می‌گذرد — با متن فارسیِ «چه اتفاقی می‌افتد»، نه فقط «مطمئنید؟».
 */
import { Loader2, TriangleAlert } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** پیامد دقیق به فارسی — «چه اتفاقی می‌افتد اگر تأیید کنم» */
  description: string
  confirmLabel?: string
  cancelLabel?: string
  /** اقدام مخرب — دکمه قرمز + آیکون هشدار */
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
}

export function ConfirmDialog({
  open, onOpenChange, title, description,
  confirmLabel = 'تأیید و ادامه', cancelLabel = 'انصراف',
  destructive = false, busy = false, onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o) }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <div className="mb-1 flex justify-start">
            <span className={
              destructive
                ? 'flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive'
                : 'flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary'
            }>
              <TriangleAlert className="h-5 w-5" />
            </span>
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="leading-6">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2 gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={busy}
            className="gap-1.5"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
