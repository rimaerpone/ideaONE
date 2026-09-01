// تست خودکار P1-T3/T12: قرارداد فهرست استاندارد — امضای یکسان ۵ endpoint + صفحه‌بندی/مرتب‌سازی/فیلتر/جستجو
// اجرا: bunx tsx scripts/test-list-contract.ts  (سرور dev باید روشن باشد)
export {} // ماژول‌سازی — جلوگیری از برخورد حوزه سراسری با سایر اسکریپت‌های تست

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL'
  if (!cond) failures += 1
  console.log(`[${mark}] ${name}${extra ? ` — ${extra}` : ''}`)
}

type Envelope = { items: unknown[]; total: number; page: number; pageSize: number; pageCount: number }

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'list-contract/1.0' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })
  const lb = (await login.json()) as { token?: string }
  check('ورود مدیر', login.status === 200 && !!lb.token)
  const H = { cookie: `pos_sid=${lb.token}`, 'x-session-token': lb.token! }

  const get = async (path: string) => {
    const res = await fetch(`${BASE}${path}`, { headers: H })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { status: res.status, data }
  }

  console.log('\n— نامه‌ها (/api/letters) —')
  const l1 = await get('/api/letters?page=1&pageSize=5')
  const l1d = l1.data as unknown as Envelope
  check('پاکت استاندارد (items/total/page/pageSize/pageCount)', l1.status === 200 && Array.isArray(l1d.items) && typeof l1d.total === 'number' && typeof l1d.page === 'number' && typeof l1d.pageSize === 'number' && typeof l1d.pageCount === 'number', `total=${l1d.total}`)
  check('صفحه ۱ با pageSize=۵ → ۵ سطر و page=1', l1d.items.length === 5 && l1d.page === 1 && l1d.pageSize === 5)
  check('pageCount = ⌈total/5⌉', l1d.pageCount === Math.ceil(l1d.total / 5), `${l1d.pageCount}`)
  const l2 = await get('/api/letters?page=2&pageSize=5')
  const l2d = l2.data as unknown as Envelope
  check('صفحه ۲ سطرهای متفاوت (بدون هم‌پوشانی)', l2d.page === 2 && l2d.items.length > 0 && (l2d.items[0] as { id: string }).id !== (l1d.items[0] as { id: string }).id)
  const lAsc = await get('/api/letters?sort=number:asc&pageSize=100')
  const lDesc = await get('/api/letters?sort=number:desc&pageSize=100')
  const ascFirst = (lAsc.data as unknown as Envelope).items[0] as { number: number } | undefined
  const descFirst = (lDesc.data as unknown as Envelope).items[0] as { number: number } | undefined
  check('مرتب‌سازی شماره صعودی/نزولی در سرور', !!ascFirst && !!descFirst && ascFirst.number <= descFirst.number, `asc=${ascFirst?.number} desc=${descFirst?.number}`)
  const lBox = await get('/api/letters?box=inbox&pageSize=100')
  const inboxItems = (lBox.data as unknown as Envelope).items as { isMine: boolean }[]
  check('فیلتر box=inbox → همه «کارتابل من» (isMine)', inboxItems.length > 0 && inboxItems.every((i) => i.isMine))
  const lBadSort = await get('/api/letters?sort=هکر:DROP&pageSize=5')
  check('کلید مرتب‌سازی نامعتبر → پیش‌فرض بدون خطا', lBadSort.status === 200)
  const lBig = await get('/api/letters?pageSize=5000')
  check('سقف pageSize=۱۰۰ تضمین می‌شود', ((lBig.data as unknown as Envelope).pageSize) === 100)
  const lOver = await get('/api/letters?page=9999&pageSize=15')
  check('صفحه فرامحدود → خالی، total پایدار', ((lOver.data as unknown as Envelope).items.length === 0) && (lOver.data as unknown as Envelope).total === l1d.total)

  console.log('\n— اسناد انبار (/api/whdocs) —')
  const w1 = await get('/api/whdocs?page=1&pageSize=5')
  const w1d = w1.data as unknown as Envelope
  check('پاکت استاندارد', w1.status === 200 && Array.isArray(w1d.items) && typeof w1d.total === 'number')
  const wAll = await get('/api/whdocs?pageSize=100')
  const wAllD = (wAll.data as unknown as Envelope)
  const first = wAllD.items[0] as { docNumber: number; type: string; partnerName: string | null } | undefined
  if (first) {
    const wType = await get(`/api/whdocs?type=${first.type}&pageSize=100`)
    check('فیلتر type سروری', ((wType.data as unknown as Envelope).items as { type: string }[]).every((d) => d.type === first.type))
    // جستجوی شماره با ارقام فارسی
    const faNum = String(first.docNumber).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
    const wQ = await get(`/api/whdocs?q=${encodeURIComponent(faNum)}`)
    check('جستجوی شماره سند با ارقام فارسی', ((wQ.data as unknown as Envelope).items.some((d) => (d as { docNumber: number }).docNumber === first.docNumber)), `q=${faNum}`)
    if (first.partnerName) {
      const wP = await get(`/api/whdocs?q=${encodeURIComponent(first.partnerName.slice(0, 6))}`)
      check('جستجوی طرف حساب', ((wP.data as unknown as Envelope).items.some((d) => (d as { partnerName: string | null }).partnerName === first.partnerName)))
    }
  } else {
    check('داده سند موجود برای تست فیلتر/جستجو', false, 'seed اجرا نشده؟')
  }
  const wSort = await get('/api/whdocs?sort=date:asc&pageSize=100')
  const dates = (wSort.data as unknown as Envelope).items.map((d) => new Date((d as { docDate: string }).docDate).getTime())
  check('مرتب‌سازی تاریخ سند صعودی', dates.every((v, i) => i === 0 || dates[i - 1] <= v))

  console.log('\n— درخواست‌های کالا (/api/requests) —')
  const r1 = await get('/api/requests?page=1&pageSize=3')
  const r1d = r1.data as unknown as Envelope
  check('پاکت استاندارد', r1.status === 200 && Array.isArray(r1d.items) && typeof r1d.total === 'number')
  const rAll = await get('/api/requests?pageSize=100')
  const rAllD = (rAll.data as unknown as Envelope)
  const anyReq = rAllD.items[0] as { status: string; reqNumber: number } | undefined
  if (anyReq) {
    const rStatus = await get(`/api/requests?status=${anyReq.status}&pageSize=100`)
    check('فیلتر status سروری', ((rStatus.data as unknown as Envelope).items as { status: string }[]).every((x) => x.status === anyReq.status))
    const faReq = String(anyReq.reqNumber).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
    const rQ = await get(`/api/requests?q=${encodeURIComponent(faReq)}`)
    check('جستجوی شماره درخواست با ارقام فارسی', ((rQ.data as unknown as Envelope).items.some((x) => (x as { reqNumber: number }).reqNumber === anyReq.reqNumber)))
  } else {
    console.log('[SKIP] درخواستی برای تست فیلتر نیست')
  }

  console.log('\n— موجودی (/api/stock) —')
  const s1 = await get('/api/stock')
  const s1d = s1.data as unknown as Envelope
  check('پاکت استاندارد (همان کلید items قبلی + total)', s1.status === 200 && Array.isArray(s1d.items) && typeof s1d.total === 'number')
  const sAll = await get('/api/stock?pageSize=100')
  const sAllD = (sAll.data as unknown as Envelope)
  const anyStock = sAllD.items[0] as { grade: string; product: { code: string } } | undefined
  if (anyStock) {
    const sG = await get(`/api/stock?grade=${encodeURIComponent(anyStock.grade)}`)
    check('فیلتر درجه سروری', ((sG.data as unknown as Envelope).items as { grade: string }[]).every((i) => i.grade === anyStock.grade))
  } else {
    console.log('[SKIP] موجودی برای تست نیست')
  }

  console.log('\n— حسابرسی (/api/audit) —')
  const a1 = await get('/api/audit')
  const a1d = a1.data as { logs?: Envelope; events?: unknown[] }
  check('سجل‌ها در پاکت استاندارد + رویدادها دست‌نخورده', a1.status === 200 && Array.isArray(a1d.logs?.items) && typeof a1d.logs?.total === 'number' && Array.isArray(a1d.events))
  check('پیش‌فرض pageSize=۳۰ (P1-T15 — همسان DataGrid حسابرسی)', a1d.logs?.pageSize === 30 && a1d.logs?.items.length! <= 30)
  const aBig = await get('/api/audit?pageSize=60')
  check('pageSize=۶۰ برای تب تنظیمات', ((aBig.data as { logs: Envelope }).logs.pageSize) === 60)

  console.log('\n— داشبورد (P1-T13 — جمع‌ها در DB) —')
  const t0 = Date.now()
  const dash = await get('/api/dashboard')
  const dt = Date.now() - t0
  const d = dash.data as { kpis?: Record<string, number>; gate?: { id: string; value: number | null; detail: string }[]; stockByGrade?: unknown[]; stockByWarehouse?: unknown[] }
  check('داشبورد سالم با ساختار کامل', dash.status === 200 && !!d.kpis && Array.isArray(d.gate) && d.gate.length === 6 && Array.isArray(d.stockByGrade) && Array.isArray(d.stockByWarehouse))
  check('سنجه‌های عددی معتبر (NaN نیست)', ['cartableCount', 'openLetters', 'pendingRequests', 'stockTotalM2', 'postedDocs', 'draftDocs'].every((k) => Number.isFinite(Number(d.kpis?.[k]))))
  // بودجه WAN (Neon، RTT ~۲۲۰ms): داشبورد ~۱۰ پرس‌وجو موازی دارد؛ بودجه SQLite محلی ۵۰۰ms بود.
  // پیگیری بهینه‌سازی: ادغام COUNTهای داشبورد در یک SQL با FILTER (۶ رفت‌وبرگشت → ۱)
  check(`زمان پاسخ داشبورد ${dt}ms < 6000ms (WAN)`, dt < 6000)

  console.log(`\n${failures === 0 ? '✅ همه سنجه‌ها سبز' : `❌ ${failures} سنجه قرمز`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
