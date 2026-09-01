import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { ocrLetterScan } from '@/modules/office-automation/service'

export const dynamic = 'force-dynamic'

// POST — P2-T16: OCR نامه اسکن‌شده (multipart/form-data، فیلد file)
// تصویر → متن خام tesseract + ساختاردهی LLM → پیش‌پرکردن فرم ثبت (HITL — هرگز ثبت خودکار)
// سگمنت استاتیک هم‌جوار [id] — الگوی weekly-report/bulk
export async function POST(req: NextRequest) {
  const r = await requireModule('office-automation')
  if (!r.ok) return r.res
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return jsonError('فایلی ارسال نشده است', 400)
  const res = await ocrLetterScan(r.ctx, file)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
