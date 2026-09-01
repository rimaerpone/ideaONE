import { NextRequest, NextResponse } from 'next/server'
import { requireModule, jsonError } from '@/core/shared/server-helpers'
import { createProduct, listProducts } from '@/modules/products/service'

// GET — محصولات در دامنه دید + جمع موجودی
export async function GET() {
  const r = await requireModule('products')
  if (!r.ok) return r.res
  const res = await listProducts(r.ctx)
  return res.ok ? NextResponse.json(res.data) : jsonError(res.error, res.status)
}

// POST — ثبت محصول جدید (در شرکت فعال)
export async function POST(req: NextRequest) {
  const r = await requireModule('products')
  if (!r.ok) return r.res
  const res = await createProduct(r.ctx, await req.json())
  return res.ok ? NextResponse.json({ ok: true, ...res.data }) : jsonError(res.error, res.status)
}
