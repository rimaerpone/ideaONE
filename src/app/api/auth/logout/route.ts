import { NextResponse } from 'next/server'
import { getSessionCtx, logout } from '@/core/auth/auth'

export const dynamic = 'force-dynamic'

// POST — خروج و حذف نشست
export async function POST() {
  await logout(await getSessionCtx())
  return NextResponse.json({ ok: true })
}
