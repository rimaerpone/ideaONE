// دود-تست API اقدام گروهی P2.5-U2 — بایگانی گروهی نامه‌ها + تأیید گروهی درخواست‌ها
// اجرا: bunx tsx scripts/smoke-u2-bulk.ts  (سرور dev باید روشن باشد)
export {} // ماژول‌سازی

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  if (!cond) failures += 1
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${extra ? ` — ${extra}` : ''}`)
}

async function login(username: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'bulk-smoke/1.0' },
    body: JSON.stringify({ username, password }),
  })
  const body = (await res.json()) as { token?: string }
  if (!body.token) throw new Error(`ورود ${username} ناموفق`)
  return { cookie: `pos_sid=${body.token}`, 'x-session-token': body.token }
}

/** شرکت فعال نشست را به شرکت با کد داده‌شده سوییچ می‌کند (تست‌ها مستقل از شرکت پیش‌فرض) */
async function switchCompany(H: Record<string, string>, code: string): Promise<void> {
  const me = await fetch(`${BASE}/api/auth/me`, { headers: H })
  const meBody = (await me.json()) as { companies?: { id: string; code: string }[] }
  const target = meBody.companies?.find((c) => c.code === code)
  if (!target) throw new Error(`شرکت ${code} برای این کاربر یافت نشد`)
  const res = await fetch(`${BASE}/api/auth/switch-company`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...H },
    body: JSON.stringify({ companyId: target.id }),
  })
  if (res.status !== 200) throw new Error(`سوییچ به ${code} ناموفق: ${res.status}`)
}

type Created = { id: string; number: number }

async function createLetter(H: Record<string, string>, subject: string, referTo?: string): Promise<Created> {
  const res = await fetch(`${BASE}/api/letters`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...H },
    body: JSON.stringify({
      type: 'INTERNAL', subject, body: `متن آزمون اقدام گروهی — ${subject}`,
      confidentiality: 'NORMAL', urgency: 'NORMAL',
      ...(referTo ? { referTo } : {}),
    }),
  })
  const body = (await res.json()) as { id?: string; number?: number }
  if (!body.id || !body.number) throw new Error(`ثبت نامه ناموفق: ${JSON.stringify(body)}`)
  return { id: body.id, number: body.number }
}

async function main() {
  const dabir = await login('dabir.arad', '12345678')

  // ── سنجه‌های گارد ورودی ──
  const r0 = await fetch(`${BASE}/api/letters/bulk`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...dabir },
    body: JSON.stringify({ action: 'DELETE', ids: ['x'] }),
  })
  check('action نامعتبر → 400', r0.status === 400)
  const r1 = await fetch(`${BASE}/api/letters/bulk`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...dabir },
    body: JSON.stringify({ action: 'ARCHIVE', ids: [] }),
  })
  check('ids خالی → خطا', r1.status === 400 || r1.status === 422)
  const r2 = await fetch(`${BASE}/api/letters/bulk`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...dabir },
    body: JSON.stringify({ action: 'ARCHIVE', ids: Array.from({ length: 101 }, (_, i) => `id-${i}`) }),
  })
  check('سقف ۱۰۰ رکورد → خطا', r2.status === 400 || r2.status === 422)

  // بدون احراز هویت → 401
  const r3 = await fetch(`${BASE}/api/letters/bulk`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'ARCHIVE', ids: ['x'] }),
  })
  check('بدون نشست → 401', r3.status === 401)

  // ── داده آزمون: ۳ نامه قابل بایگانی (DRAFT دبیرخانه) ──
  const mine: Created[] = []
  for (let i = 1; i <= 3; i++) mine.push(await createLetter(dabir, `نامه دود-تست گروهی ${i} — ${Date.now() % 100000}`))

  // ── اقدام گروهی: ۳ نامه خودم + ۱ شناسه ناموجود → ۳ موفق + ۱ رد ──
  const bulk = await fetch(`${BASE}/api/letters/bulk`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...dabir },
    body: JSON.stringify({ action: 'ARCHIVE', ids: [...mine.map((m) => m.id), 'nonexistent-id'] }),
  })
  const bulkBody = (await bulk.json()) as { affected?: number; results?: { id: string; ok: boolean; error?: string }[] }
  check('پاسخ 200 با affected=3', bulk.status === 200 && bulkBody.affected === 3, `affected=${bulkBody.affected}`)
  check('results شامل ۴ ردیف (۳ موفق + ۱ رد)', bulkBody.results?.length === 4)
  const rejected = bulkBody.results?.find((x) => !x.ok)
  check('شناسه ناموجود با دلیل رد شد', !!rejected && !!rejected.error?.includes('یافت نشد'), rejected?.error ?? '')

  // ── راستی‌آزمایی وضعیت نامه‌ها در فهرست ──
  const list = await fetch(`${BASE}/api/letters?pageSize=100&q=${encodeURIComponent('دود-تست گروهی')}`, { headers: dabir })
  const listBody = (await list.json()) as { items: { id: string; status: string }[] }
  const archived = listBody.items.filter((l) => mine.some((m) => m.id === l.id) && l.status === 'ARCHIVED')
  check('هر ۳ نامه در فهرست «بایگانی» است', archived.length === 3, `${archived.length}/3`)

  // ── تکرار اقدام روی بایگانی‌شده → همه رد (گارد تک‌نامه پابرجا) ──
  const again = await fetch(`${BASE}/api/letters/bulk`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...dabir },
    body: JSON.stringify({ action: 'ARCHIVE', ids: mine.map((m) => m.id) }),
  })
  const againBody = (await again.json()) as { affected?: number; results?: { ok: boolean; error?: string }[] }
  check('بایگانی مجدد → affected=0 با دلیل رکورد‌به‌رکورد', againBody.affected === 0 && (againBody.results?.every((x) => !x.ok && !!x.error) ?? false), againBody.results?.[0]?.error ?? '')

  // ── VIEWER رد می‌شود (cfo.hold در آراد VIEWER است — ابتدا شرکت فعالش را آراد می‌کنیم) ──
  const viewer = await login('cfo.hold', '12345678')
  await switchCompany(viewer, 'ARAD')
  const viewerLetter = await createLetter(dabir, `نامه دود-تست ویوئر — ${Date.now() % 100000}`)
  const vRes = await fetch(`${BASE}/api/letters/bulk`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...viewer },
    body: JSON.stringify({ action: 'ARCHIVE', ids: [viewerLetter.id] }),
  })
  check('VIEWER → 403', vRes.status === 403, `status=${vRes.status}`)

  // ── حسابرسی: برای هر نامه یک سجل ARCHIVE (خواندن حسابرسی فقط با ادمین) ──
  const admin = await login('admin', 'admin123')
  const auditRes = await fetch(`${BASE}/api/audit?action=ARCHIVE&entity=letter&pageSize=100`, { headers: admin })
  const auditBody = (await auditRes.json()) as { logs?: { items: { entityId: string | null; action: string; entity: string }[] } }
  const auditIds = new Set((auditBody.logs?.items ?? []).filter((a) => a.action === 'ARCHIVE' && a.entity === 'letter' && a.entityId).map((a) => a.entityId as string))
  const allAudited = mine.every((m) => auditIds.has(m.id))
  check('سجل حسابرسی ARCHIVE برای هر ۳ نامه', allAudited, `${mine.filter((m) => auditIds.has(m.id)).length}/3`)

  // ── درخواست‌ها: تأیید گروهی (ادمین روی شرکت عملیاتی آراد) + گارد عملیات غیرمجاز ──
  await switchCompany(admin, 'ARAD')
  const badAction = await fetch(`${BASE}/api/requests/bulk`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...admin },
    body: JSON.stringify({ action: 'FULFILL', ids: ['x'] }),
  })
  check('عملیات غیرمجاز درخواست → خطا', badAction.status === 400 || badAction.status === 422)

  // درخواست‌های در انتظار شرکت فعال ادمین (آراد) — دو مورد اول
  const reqList = await fetch(`${BASE}/api/requests?status=PENDING&pageSize=100`, { headers: admin })
  const reqBody = (await reqList.json()) as { items: { id: string; reqNumber: number; status: string }[] }
  const pendings = (reqBody.items ?? []).filter((r) => r.status === 'PENDING').slice(0, 2)
  if (pendings.length === 2) {
    const bulkReq = await fetch(`${BASE}/api/requests/bulk`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...admin },
      body: JSON.stringify({ action: 'APPROVE', ids: pendings.map((p) => p.id) }),
    })
    const bulkReqBody = (await bulkReq.json()) as { affected?: number; results?: { ok: boolean }[] }
    check('تأیید گروهی ۲ درخواست → affected=2', bulkReq.status === 200 && bulkReqBody.affected === 2, `affected=${bulkReqBody.affected}`)
    const afterList = await fetch(`${BASE}/api/requests?status=APPROVED&pageSize=100`, { headers: admin })
    const afterBody = (await afterList.json()) as { items: { id: string }[] }
    const bothApproved = pendings.every((p) => afterBody.items.some((a) => a.id === p.id))
    check('هر ۲ درخواست «تأییدشده» شد', bothApproved)
    // دوباره تأیید → رد (قبلاً تعیین تکلیف شده)
    const reqAgain = await fetch(`${BASE}/api/requests/bulk`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...admin },
      body: JSON.stringify({ action: 'APPROVE', ids: pendings.map((p) => p.id) }),
    })
    const reqAgainBody = (await reqAgain.json()) as { affected?: number; results?: { error?: string }[] }
    check('تأیید مجدد → affected=0 با دلیل', reqAgainBody.affected === 0 && !!reqAgainBody.results?.[0]?.error, reqAgainBody.results?.[0]?.error ?? '')
  } else {
    console.log(`[SKIP] درخواست در انتظار کافی نیست (${pendings.length})`)
  }

  // دبیرخانه (OPERATOR) اجازه تصمیم گروهی ندارد
  const opDecide = await fetch(`${BASE}/api/requests/bulk`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...dabir },
    body: JSON.stringify({ action: 'APPROVE', ids: ['x'] }),
  })
  check('OPERATOR → 403 تصمیم گروهی', opDecide.status === 403)

  console.log(`\n${failures === 0 ? '✅ همه سنجه‌ها سبز' : `❌ ${failures} سنجه قرمز`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
