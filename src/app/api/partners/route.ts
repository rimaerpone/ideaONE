import { NextResponse } from 'next/server'
import { requireModule } from '@/core/shared/server-helpers'
import { listPartners } from '@/modules/partners/service'

// GET — مشتریان و تأمین‌کنندگان: رکورد طلایی گروه + نمونه‌های عملیاتی شرکت‌های در دسترس
export async function GET() {
  const r = await requireModule('partners')
  if (!r.ok) return r.res
  const res = await listPartners(r.ctx)
  return res.ok ? NextResponse.json(res.data) : NextResponse.json({ error: res.error }, { status: res.status ?? 400 })
}
