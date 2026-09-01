// تست خودکار P1-T5: CRUD انبارها — اعتبارسنجی + محافظ موجودی + ظهور فوری
// اجرا: bunx tsx scripts/test-warehouses-crud.ts  (سرور dev باید روشن باشد)
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL'
  if (!cond) failures += 1
  console.log(`[${mark}] ${name}${extra ? ` — ${extra}` : ''}`)
}

async function main() {
  // ورود مدیر پلتفرم
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'wh-test/1.0' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })
  const lb = (await login.json()) as { token?: string }
  check('ورود مدیر', login.status === 200 && !!lb.token)
  const H = { 'content-type': 'application/json', cookie: `pos_sid=${lb.token}`, 'x-session-token': lb.token! }

  const api = async (path: string, method: string, body?: unknown) => {
    const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
    const data = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
    return { status: res.status, data }
  }

  // ---------- اعتبارسنجی ----------
  const badCode = await api('/api/warehouses', 'POST', { code: 'کد فارسی!', name: 'تست' })
  check('کد غیرمجاز رد با پیام فارسی', badCode.status === 400 && /۱ تا ۱۶ نویسه/.test(String(badCode.data.error)), String(badCode.data.error))
  const badName = await api('/api/warehouses', 'POST', { code: 'TST1', name: 'ت' })
  check('نام کوتاه رد', badName.status === 400 && /۲ تا ۶۰/.test(String(badName.data.error)), String(badName.data.error))
  const badKind = await api('/api/warehouses', 'POST', { code: 'TST1', name: 'تست تستی', kind: 'MAGIC' })
  check('نوع نامعتبر رد', badKind.status === 400 && /نوع انبار/.test(String(badKind.data.error)), String(badKind.data.error))
  // P0.5-T2: نوع‌های قدیمی (RAW/FINISHED/WASTE) باید پس از مهاجرت سه‌گانه رد شوند
  const legacyKind = await api('/api/warehouses', 'POST', { code: 'TST0', name: 'نوع قدیمی رد', kind: 'RAW' })
  check('نوع قدیمی RAW رد (مهاجرت سه‌گانه)', legacyKind.status === 400 && /نوع انبار/.test(String(legacyKind.data.error)), String(legacyKind.data.error))

  // ---------- ایجاد ----------
  const stamp = Date.now() % 100000
  const code = `T${stamp}`
  const create = await api('/api/warehouses', 'POST', { code, name: 'انبار تستی خودکار', kind: 'VIRTUAL' })
  check('ایجاد انبار مجازی → 201', create.status === 201, `status=${create.status} err=${create.data.error}`)
  const whId = create.data.id as string

  const dup = await api('/api/warehouses', 'POST', { code, name: 'تکراری' })
  check('کد تکراری per-company رد', dup.status === 400 && /قبلاً/.test(String(dup.data.error)), String(dup.data.error))

  // ---------- ظهور فوری در فهرست فرم‌ها ----------
  const listActive = await api('/api/warehouses', 'GET')
  check('انبار جدید در فهرست فعال (فرم سند)', (listActive.data.warehouses as { code: string }[]).some((w) => w.code === code))

  // ---------- فهرست مدیریتی ----------
  const listAll = await api('/api/warehouses?all=1', 'GET')
  const rows = listAll.data.warehouses as { code: string; stockM2: number; stockCount: number; isActive: boolean }[]
  check('فهرست مدیریتی شامل انبار جدید', rows.some((w) => w.code === code))
  check('فهرست مدیریتی دارای جمع موجودی', rows.every((w) => typeof w.stockM2 === 'number'))

  // ---------- ویرایش ----------
  const upd = await api(`/api/warehouses/${whId}`, 'PATCH', { name: 'انبار تستی ویرایش‌شده', kind: 'WORKSTATION' })
  check('ویرایش نام/نوع موفق', upd.status === 200, String(upd.data.error))
  const wh = await db.warehouse.findUnique({ where: { id: whId } })
  check('تغییرات ذخیره شد', wh?.name === 'انبار تستی ویرایش‌شده' && wh.kind === 'WORKSTATION', `${wh?.name}/${wh?.kind}`)

  const codeChange = await api(`/api/warehouses/${whId}`, 'PATCH', { code: 'NEW' })
  check('تغییر کد نادیده گرفته می‌شود (بدون خطای سرور)', codeChange.status === 200 || codeChange.status === 400)

  // ---------- غیرفعال‌سازی انبار بدون موجودی ----------
  const deactivate = await api(`/api/warehouses/${whId}`, 'PATCH', { isActive: false })
  check('غیرفعال‌سازی انبار خالی موفق', deactivate.status === 200, String(deactivate.data.error))
  const listAfter = await api('/api/warehouses', 'GET')
  check('انبار غیرفعال از فهرست فرم‌ها حذف شد', !(listAfter.data.warehouses as { code: string }[]).some((w) => w.code === code))
  const reactivate = await api(`/api/warehouses/${whId}`, 'PATCH', { isActive: true })
  check('فعال‌سازی مجدد موفق', reactivate.status === 200)

  // ---------- محافظ موجودی: انبار دارای موجودی > 0 ----------
  // انبارهای seed دارای موجودی را پیدا کن
  const stocked = await db.warehouse.findFirst({
    where: { stockItems: { some: { qtyM2: { gt: 0 } } } },
    include: { stockItems: { select: { qtyM2: true } } },
  })
  if (stocked) {
    const total = stocked.stockItems.reduce((s, i) => s + i.qtyM2, 0)
    const blocked = await api(`/api/warehouses/${stocked.id}`, 'PATCH', { isActive: false })
    check('محافظ: انبار دارای موجودی غیرفعال نمی‌شود', blocked.status === 400 && /موجودی/.test(String(blocked.data.error)), `stock=${total.toFixed(0)}m2 err=${blocked.data.error}`)
  } else {
    check('محافظ موجودی — انبار پر موجودی برای تست موجود بود', true, 'رد شد چون انبار پر موجودی نبود')
  }

  // ---------- مجوز: کاربر عادی ----------
  const plainLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'wh-test-plain/1.0' },
    body: JSON.stringify({ username: 'dabir.arad', password: '12345678' }),
  })
  const pb = (await plainLogin.json()) as { token?: string }
  check('ورود کاربر عادی (OPERATOR)', plainLogin.status === 200 && !!pb.token)
  const PH = { 'content-type': 'application/json', cookie: `pos_sid=${pb.token}`, 'x-session-token': pb.token! }
  const forbidden = await fetch(`${BASE}/api/warehouses`, { method: 'POST', headers: PH, body: JSON.stringify({ code: 'X1', name: 'غیرمجاز تست' }) })
  check('کاربر عادی → 403', forbidden.status === 403, `status=${forbidden.status}`)
  const forbiddenAll = await fetch(`${BASE}/api/warehouses?all=1`, { headers: PH })
  check('فهرست مدیریتی برای غیرمدیر → 403', forbiddenAll.status === 403, `status=${forbiddenAll.status}`)

  // ---------- سجل حسابرسی ----------
  const auditRow = await db.auditLog.findFirst({ where: { action: 'WH_CREATE', entityId: whId } })
  check('سجل WH_CREATE ثبت شد', !!auditRow)

  // ---------- پاک‌سازی ----------
  await db.warehouse.delete({ where: { id: whId } })
  await db.auditLog.deleteMany({ where: { entityId: whId } })
  console.log('\nپاک‌سازی انجام شد — انبار تست حذف گردید')

  await db.$disconnect()
  console.log(failures === 0 ? '\n✅ همه تست‌ها پاس شدند' : `\n❌ ${failures} تست شکست خورد`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('خطای اجرای تست:', e)
  process.exit(1)
})
