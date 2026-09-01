import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { getLetterFile } from '@/modules/office-automation/service'

export const dynamic = 'force-dynamic'

// GET — دانلود پیوست (کنترل دسترسی از طریق دامنه نامه متصل)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireModule('office-automation')
  if (!r.ok) return r.res
  const res = await getLetterFile(r.ctx, (await params).id)
  if (!res.ok) return jsonError(res.error, res.status)
  const { bytes, fileName, mimeType } = res.data
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}
