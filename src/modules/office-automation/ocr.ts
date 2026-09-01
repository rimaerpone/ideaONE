import 'server-only'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * ماژول OCR فارسی (P2-T16) — پوشش بی‌حالت موتور tesseract
 *
 * دو مرحله‌ای (دستور پخت RECOVERY-PLAN R7):
 *   ۱) این ماژول: تصویر → متن خام فارسی با tesseract (-l fas --psm 6)
 *   ۲) ساختاردهی LLM در service (مسیر runAiJson) — متن خام → پیش‌پرکردن فرم
 *
 * قرارداد:
 *   - بی‌حالت: هیچ state/کش/جدولی ندارد — هر فراخوانی مستقل است
 *   - امنیت: باینری با آرگومان‌های آرایه‌ای (بدون شل)؛ تصویر از stdin می‌رود
 *     و هرگز روی دیسک نوشته نمی‌شود؛ فقط png/jpeg/webp با جادوی بایت پذیرفته می‌شود
 *   - زبان: بسته fas از مسیر پروژه (.tessdata/) — با ریست سندباکس از git برمی‌گردد
 */

const OCR_TIMEOUT_MS = 60_000
const MAX_BYTES = 10 * 1024 * 1024 // آینه سقف هسته Storage
const MAX_TEXT_BYTES = 2 * 1024 * 1024 // سقف خروجی متن (محافظ تخریب حافظه)

/** بایت‌های جادویی تصویر مجاز — نوع فایل از محتوا سنجیده می‌شود نه ادعای کلاینت */
const IMAGE_MAGICS: Array<{ ext: string; mime: string; test: (b: Buffer) => boolean }> = [
  { ext: '.png', mime: 'image/png', test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: '.jpg', mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.webp', mime: 'image/webp', test: (b) => b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
]

export type OcrImageOk = { ok: true; text: string; mime: string; latencyMs: number }
export type OcrImageErr = { ok: false; error: string; status: number }
export type OcrImageResult = OcrImageOk | OcrImageErr

function tessdataDir(): string {
  return process.env.TESSDATA_DIR ?? path.join(process.cwd(), '.tessdata')
}

/** اعتبارسنجی محتوا: نوع تصویر از بایت‌های جادویی + سقف حجم */
function detectImage(bytes: Buffer): { ext: string; mime: string } | null {
  for (const m of IMAGE_MAGICS) {
    if (m.test(bytes)) return { ext: m.ext, mime: m.mime }
  }
  return null
}

/**
 * استخراج متن فارسی از تصویر — tesseract بومی با زبان fas.
 * تصویر از stdin (بدون فایل موقت)؛ خروجی stdout؛ تایم‌اوت با SIGKILL.
 */
export async function ocrImage(bytes: Buffer): Promise<OcrImageResult> {
  if (bytes.byteLength === 0) return { ok: false, error: 'فایل خالی است', status: 400 }
  if (bytes.byteLength > MAX_BYTES) return { ok: false, error: 'حجم تصویر بیش از حد مجاز (۱۰ مگابایت) است', status: 400 }
  const image = detectImage(bytes)
  if (!image) return { ok: false, error: 'فقط تصویر PNG، JPEG یا WebP برای OCR پذیرفته می‌شود', status: 400 }

  const dir = tessdataDir()
  if (!existsSync(path.join(dir, 'fas.traineddata'))) {
    return { ok: false, error: 'بسته زبان فارسی OCR (.tessdata/fas.traineddata) نصب نیست — با پشتیبانی تماس بگیرید', status: 500 }
  }

  const startedAt = Date.now()
  return new Promise<OcrImageResult>((resolve) => {
    // آرگومان‌های آرایه‌ای = بدون شل = بدون تزریق؛ stdin/stdout = بدون فایل موقت
    const child = spawn('tesseract', ['stdin', 'stdout', '-l', 'fas', '--psm', '6', '--tessdata-dir', dir], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout: Buffer[] = []
    let stdoutLen = 0
    let stderr = ''
    let settled = false

    const finish = (r: OcrImageResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(r)
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish({ ok: false, error: 'پردازش تصویر بیش از حد طول کشید — تصویر کوچک‌تر یا واضح‌تر انتخاب کنید', status: 504 })
    }, OCR_TIMEOUT_MS)

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutLen += chunk.byteLength
      if (stdoutLen <= MAX_TEXT_BYTES) stdout.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4000) stderr += chunk.toString('utf-8')
    })
    child.on('error', () => {
      finish({ ok: false, error: 'موتور OCR روی سرور در دسترس نیست', status: 500 })
    })
    child.on('close', (code) => {
      const latencyMs = Date.now() - startedAt
      if (code === 0) {
        const text = Buffer.concat(stdout).toString('utf-8').trim()
        finish({ ok: true, text, mime: image.mime, latencyMs })
      } else {
        finish({ ok: false, error: 'استخراج متن از تصویر ناموفق بود — تصویر واضح‌تر با متن فارسی انتخاب کنید', status: 422 })
      }
    })

    // تصویر از stdin — خطا/قطع زودهنگام هرگز نباید پرامیس را معلق بگذارد
    child.stdin.on('error', () => undefined)
    child.stdin.end(bytes)
    void stderr // فقط برای عیب‌یابی لاگ آتی؛ متن خام موتور به کاربر نمایش داده نمی‌شود
  })
}
