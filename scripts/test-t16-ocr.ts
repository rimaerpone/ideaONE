// تست خودکار P2-T16 — OCR نامه اسکن‌شده فارسی (دو مرحله: tesseract محلی + ساختاردهی LLM)
// اجرا: bunx tsx scripts/test-t16-ocr.ts  (سرور dev روشن؛ گیت‌وی ۸۱ برای رندر نمونه‌ها)
import { readFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { login as loginApi } from './t16-login'
import { generateSamples, T16_SAMPLES, TINY_PNG_B64, SAMPLES_DIR } from './t16-samples'

const db = new PrismaClient()
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'

let failures = 0
let skipped = 0
let softWarns = 0
function check(name: string, cond: boolean, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL'
  if (!cond) failures += 1
  console.log(`[${mark}] ${name}${extra ? ` — ${extra}` : ''}`)
}
function skip(name: string, why = '') {
  skipped += 1
  console.log(`[SKIP] ${name}${why ? ` — ${why}` : ''}`)
}
/** سنجه نرم (LLM ناکاتشی): ثبت می‌شود ولی شکست نیست — کیفیت مدل، نه باگ محصول */
function soft(name: string, cond: boolean, extra = '') {
  if (cond) { console.log(`[PASS] ${name}${extra ? ` — ${extra}` : ''}`); return }
  softWarns += 1
  console.log(`[SOFT] ${name}${extra ? ` — ${extra}` : ''}`)
}

type Jar = { cookie: string; token: string }

async function uploadOcr(jar: Jar, bytes: Buffer, fileName: string, mime: string) {
  const form = new FormData()
  // Uint8Array نه Buffer — BlobPart در این lib.dont به ArrayBufferView محدود است
  form.append('file', new File([new Uint8Array(bytes)], fileName, { type: mime }))
  const res = await fetch(`${BASE}/api/letters/ocr`, {
    method: 'POST',
    headers: { cookie: jar.cookie, 'x-session-token': jar.token },
    body: form,
  })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try { data = JSON.parse(text) as Record<string, unknown> } catch { data = { raw: text } }
  return { status: res.status, data }
}

type Draft = { type: string | null; subject: string | null; body: string | null; senderTitle: string | null; receiverTitle: string | null; urgency: string | null }
type OcrResp = { fileName: string; raw: string; ocrLatencyMs: number; draft: Draft | null; aiNote: string | null }

/** نرمال‌سازی مقایسه: حذف نیم‌فاصله/فاصله/نقطه‌گذاری — «صورت‌حساب» = «صورت حساب» */
const norm = (s: string) => s.replace(/[\s\u200c\u200f.,؛:،()"'\-–—]/g, '')

async function patchFlag(jar: Jar, key: string, enabled: boolean) {
  const res = await fetch(`${BASE}/api/platform/governance`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: jar.cookie, 'x-session-token': jar.token },
    body: JSON.stringify({ key, enabled }),
  })
  return res.status
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  console.log('══ P2-T16 — OCR فارسی: تست API ══\n')

  // ── ۰. تولید ۵ نمونه فارسی (رندر مرورگر → PNG) ──
  const gen = generateSamples()
  check('S0: تولید ۵ نمونه فارسی', gen.ok, `generated=${gen.generated} (از قبل موجود: ${5 - gen.generated})`)
  if (!gen.ok) return summary()

  const admin = await loginApi('admin', 'admin123')
  check('S0: ورود admin', !!admin)
  if (!admin) return summary()
  const dabir = await loginApi('dabir.arad', '12345678')
  check('S0: ورود dabir.arad (OPERATOR دبیرخانه)', !!dabir)

  // ── A. دقت OCR روی ۵ نمونه (معیار پذیرش T16) ──
  console.log('\n── A. دقت روی ۵ نمونه فارسی ──')
  const ocrBySample = new Map<number, OcrResp>()
  for (const s of T16_SAMPLES) {
    const bytes = await readFile(`${SAMPLES_DIR}/${s.file}`)
    const r = await uploadOcr(admin, bytes, s.file, 'image/png')
    const d = r.data as unknown as OcrResp
    ocrBySample.set(s.n, d)
    check(`A${s.n}: پاسخ ۲۰۰ + پاکت کامل`, r.status === 200 && typeof d.raw === 'string' && typeof d.ocrLatencyMs === 'number', `status=${r.status}`)

    // دقت متن خام: هر توکن کلیدی باید در متن نرمال‌شده باشد
    const rawNorm = norm(d.raw ?? '')
    const hits = s.tokens.filter((t) => rawNorm.includes(norm(t)))
    const acc = hits.length / s.tokens.length
    check(`A${s.n}: دقت متن خام ≥ ۶۰٪ (${hits.length}/${s.tokens.length})`, acc >= 0.6, `acc=${Math.round(acc * 100)}٪ missing=[${s.tokens.filter((t) => !rawNorm.includes(norm(t))).join('،')}]`)
    check(`A${s.n}: متن خام ≥ ۱۰۰ نویسه`, (d.raw ?? '').length >= 100, `chars=${(d.raw ?? '').length}`)

    // ساختاردهی LLM (زنده) — شاخه خاموشی = SKIP نه FAIL (درس R6)
    if (r.status === 503) { skip(`A${s.n}: ساختاردهی`, 'سرویس AI در دسترس نیست'); continue }
    if (r.status !== 200) { skip(`A${s.n}: سنجه‌های ساختاردهی`, `پاسخ ${r.status} — شکست پاکت بالا ثبت شد`); continue }
    if (s.expectType === null) {
      // نمونه «سری» → سیاست داده: پیش‌نویس ساختار‌یافته نباید ساخته شود
      check(`A${s.n}: نامه «سری» → draft=null (سیاست داده)`, d.draft === null)
      check(`A${s.n}: توضیح سیاست در aiNote`, (d.aiNote ?? '').includes('سیاست'), d.aiNote ?? '')
    } else {
      check(`A${s.n}: پیش‌نویس ساختاری ساخته شد`, d.draft !== null, `aiNote=${d.aiNote ?? ''}`)
      if (d.draft) {
        check(`A${s.n}: نوع در فهرست مجاز`, d.draft.type === null || ['INCOMING', 'OUTGOING', 'INTERNAL'].includes(d.draft.type), `type=${d.draft.type}`)
        // نوع موردانتظار — LLM ناکاتشی: یک تلاش مجدد؛ نتیجه پایانی نرم (SOFT) است نه FAIL
        if (d.draft.type !== s.expectType) {
          const retry = await uploadOcr(admin, bytes, s.file, 'image/png')
          const rd = (retry.data as unknown as OcrResp).draft
          soft(`A${s.n}: طبقه‌بندی نوع = ${s.expectType}`, rd?.type === s.expectType, `تلاش اول=${d.draft.type} تلاش دوم=${rd?.type ?? '—'}`)
        } else {
          check(`A${s.n}: طبقه‌بندی نوع = ${s.expectType}`, true)
        }
        check(`A${s.n}: موضوع غیرخالی`, (d.draft.subject ?? '').length > 3, `subject=${(d.draft.subject ?? '').slice(0, 50)}`)
        check(`A${s.n}: متن پاک غیرخالی`, (d.draft.body ?? '').length > 40, `bodyChars=${(d.draft.body ?? '').length}`)
        // سربرگ = سطرِ برچسب‌دار است نه واژهٔ درون جمله (سنجه سطر-محور — همان منطق حذف مکانیکی کد)
        const HEADER_LINE = /^(به\s*نام\s*خدا|شماره\s*:|تاریخ\s*:|پیوست\s*:|گیرنده\s*:|فرستنده\s*:|موضوع\s*:)/
        const bodyLines = (d.draft.body ?? '').split('\n').map((l) => l.trim())
        check(`A${s.n}: سربرگ از متن پاک حذف شد`, !bodyLines.some((l) => HEADER_LINE.test(l)), bodyLines[0]?.slice(0, 60) ?? '')
        if (s.n === 1) check('A1: فرستنده وارده استخراج شد', (d.draft.senderTitle ?? '').includes('ابنیه'), `sender=${d.draft.senderTitle}`)
        if (s.n === 2) check('A2: گیرنده صادره استخراج شد', (d.draft.receiverTitle ?? '').includes('رنگ و لعاب'), `receiver=${d.draft.receiverTitle}`)
        if (s.n === 3) soft('A3: فوریت فوری تشخیص داده شد', d.draft.urgency === 'URGENT', `urgency=${d.draft.urgency}`)
      }
    }
  }

  // ── B. گاردها و ورودی‌های نامعتبر ──
  console.log('\n── B. گاردها و ورودی نامعتبر ──')
  const rNoFile = await fetch(`${BASE}/api/letters/ocr`, { method: 'POST', headers: { cookie: admin.cookie, 'x-session-token': admin.token }, body: new FormData() })
  check('B1: بدون فایل → ۴۰۰', rNoFile.status === 400, `status=${rNoFile.status}`)

  const rText = await uploadOcr(admin, Buffer.from('این یک فایل متنی است نه تصویر', 'utf-8'), 'fake.png', 'image/png')
  check('B2: بایت جادویی غیرتصویری → ۴۰۰ فارسی', rText.status === 400 && String((rText.data as { error?: string }).error ?? '').includes('PNG'), `status=${rText.status} err=${(rText.data as { error?: string }).error}`)

  const tiny = Buffer.from(TINY_PNG_B64, 'base64')
  const rTiny = await uploadOcr(admin, tiny, 'tiny.png', 'image/png')
  check('B3: تصویر بدون متن → ۴۲۲ فارسی', rTiny.status === 422 && String((rTiny.data as { error?: string }).error ?? '').includes('استخراج نشد'), `status=${rTiny.status} err=${(rTiny.data as { error?: string }).error}`)

  // ── C. کنترل دسترسی نقش‌ها ──
  console.log('\n── C. RBAC ──')
  const sample1 = await readFile(`${SAMPLES_DIR}/sample1.png`)
  if (dabir) {
    const rDabir = await uploadOcr(dabir, sample1, 'sample1.png', 'image/png')
    check('C1: OPERATOR دبیرخانه مجاز (۲۰۰)', rDabir.status === 200, `status=${rDabir.status}`)
  }
  // VIEWER اختصاصی تست (الگوی u7.viewer — عضویت VIEWER در شرکت عملیاتی، ایزوله از seed)
  let viewer = await loginApi('u16.viewer', 'U16viewer!1405')
  if (!viewer) {
    const company = await db.company.findFirst({ where: { type: { not: 'GROUP' } }, select: { id: true } })
    const mk = await fetch(`${BASE}/api/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie, 'x-session-token': admin.token },
      body: JSON.stringify({ username: 'u16.viewer', fullName: 'بازدیدکننده تست U16', jobTitle: 'کارشناس تماشاگر', password: 'U16viewer!1405', memberships: [{ companyId: company?.id ?? '', role: 'VIEWER' }] }),
    })
    const mkBody = (await mk.json().catch(() => ({}))) as { error?: string }
    check('C2-آماده‌سازی u16.viewer', mk.status === 201 || /قبلاً ثبت شده/.test(mkBody.error ?? ''), `status=${mk.status} err=${mkBody.error ?? ''}`)
    viewer = await loginApi('u16.viewer', 'U16viewer!1405')
  }
  check('C2: ورود u16.viewer (VIEWER)', !!viewer)
  if (viewer) {
    const rView = await uploadOcr(viewer, sample1, 'sample1.png', 'image/png')
    check('C2: VIEWER → ۴۰۳ (OCR پیش‌درآمد نوشتن است)', rView.status === 403, `status=${rView.status}`)
  }

  // ── D. پرچم‌های ویژگی (خاموشی/تحلیل لطیف) ──
  console.log('\n── D. پرچم‌های ویژگی ──')
  check('D0: پرچم letters.ocr در DB', !!(await db.featureFlag.findUnique({ where: { key: 'letters.ocr' } })))
  check('D0: پرچم ai.letter-ocr در DB', !!(await db.featureFlag.findUnique({ where: { key: 'ai.letter-ocr' } })))

  const pOff = await patchFlag(admin, 'letters.ocr', false)
  check('D1: خاموشی letters.ocr (PATCH حاکمیت)', pOff === 200, `status=${pOff}`)
  // کش ۱۵ث + HMR — گیت خاموشی را با poll قطعی کن (نه یک POST فوری)
  let gateStatus = 0
  for (let i = 0; i < 8; i++) {
    const rGate = await uploadOcr(admin, sample1, 'sample1.png', 'image/png')
    gateStatus = rGate.status
    if (gateStatus === 503) break
    await sleep(2500)
  }
  check('D1: endpoint با فلگ خاموش → ۵۰۳ فارسی', gateStatus === 503 && true, `status=${gateStatus}`)
  await patchFlag(admin, 'letters.ocr', true)

  const pAi = await patchFlag(admin, 'ai.letter-ocr', false)
  check('D2: خاموشی ai.letter-ocr', pAi === 200, `status=${pAi}`)
  // گیت endpoint باید دوباره روشن باشد — probe ارزان: تصویر خالی → ۴۲۲ (503 = هنوز خاموش)
  const probePng = Buffer.from(TINY_PNG_B64, 'base64')
  let gateOn = 0
  for (let i = 0; i < 10; i++) {
    gateOn = (await uploadOcr(admin, probePng, 'tiny.png', 'image/png')).status
    if (gateOn === 422) break
    await sleep(2000)
  }
  check('D2: گیت endpoint دوباره روشن (probe ۴۲۲)', gateOn === 422, `probe=${gateOn}`)
  let rAi = await uploadOcr(admin, sample1, 'sample1.png', 'image/png')
  let dAi = rAi.data as unknown as OcrResp
  // کش ۱۵ث — اگر پیش‌نویس هنوز ساخته می‌شود، poll تا اعمال خاموشی
  for (let i = 0; i < 6 && dAi.draft !== null; i++) {
    await sleep(3000)
    rAi = await uploadOcr(admin, sample1, 'sample1.png', 'image/png')
    dAi = rAi.data as unknown as OcrResp
  }
  check('D2: متن خام همچنان برمی‌گردد (۲۰۰)', rAi.status === 200 && (dAi.raw ?? '').length > 100, `status=${rAi.status}`)
  check('D2: draft=null + توضیح خاموشی', dAi.draft === null && (dAi.aiNote ?? '').includes('غیرفعال'), `aiNote=${dAi.aiNote}`)
  await patchFlag(admin, 'ai.letter-ocr', true)

  // ── E. تلمتری و سجل حسابرسی ──
  console.log('\n── E. تلمتری و سجل ──')
  const invocations = await db.aiInvocation.count({ where: { task: 'letter.ocr-structure' } })
  check('E1: سجل تلمتری AiInvocation (letter.ocr-structure)', invocations >= 3, `count=${invocations}`)
  const ocrLogs = await db.auditLog.count({ where: { action: 'OCR', entity: 'letter' } })
  check('E2: سجل حسابرسی OCR', ocrLogs >= 6, `count=${ocrLogs}`)
  const last = await db.auditLog.findFirst({ where: { action: 'OCR' }, orderBy: { createdAt: 'desc' } })
  const det = JSON.parse(last?.details ?? '{}') as { rawChars?: number; structured?: boolean; ocrLatencyMs?: number }
  check('E2: جزئیات سجل (rawChars/latency/structured)', typeof det.rawChars === 'number' && typeof det.ocrLatencyMs === 'number' && typeof det.structured === 'boolean', JSON.stringify(det))

  return summary()
}

function summary() {
  console.log(`\n──── نتیجه: ${failures === 0 ? '✅ همه سبز' : `❌ ${failures} شکست`} (skip=${skipped} · soft=${softWarns}) ────`)
  return failures === 0 ? 0 : 1
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .then((code) => { void db.$disconnect(); process.exit(code ?? 0) })
