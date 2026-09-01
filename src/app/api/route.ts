import { NextResponse } from 'next/server'

/**
 * سلامت سامانه — GET /api
 * ابزار runbook (RB-01) برای راستی‌آزمایی زنده بودن سرویس Next.js
 * اطلاعات حساس (نسخه دقیق پکیج‌ها، مسیرها) برمی‌نگرداند — فقط وضعیت.
 */
export async function GET() {
  return NextResponse.json({
    app: 'ideaone-platform',
    status: 'ok',
    time: new Date().toISOString(),
  })
}
