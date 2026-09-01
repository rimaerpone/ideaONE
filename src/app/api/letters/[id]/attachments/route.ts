import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { listLetterAttachments, addLetterAttachment } from '@/modules/office-automation/service'

export const dynamic = 'force-dynamic'

// GET — پیوست‌های نامه
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireModule('office-automation')
  if (!r.ok) return r.res
  const res = await listLetterAttachments(r.ctx, (await params).id)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}

// POST — افزودن پیوست (multipart/form-data، فیلد file)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireModule('office-automation')
  if (!r.ok) return r.res
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return jsonError('فایلی ارسال نشده است', 400)
  const res = await addLetterAttachment(r.ctx, (await params).id, file)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}
