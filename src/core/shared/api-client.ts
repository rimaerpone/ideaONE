// کلاینت API سمت مرورگر — همه درخواست‌ها مسیر نسبی

/**
 * توکن نشست برای بافت‌های تعبیه‌شده (iframe پیش‌نمایش).
 *
 * چرا: مرورگرها کوکی نشست (SameSite/HttpOnly) را در بافت third-party — یعنی
 * وقتی برنامه داخل iframe پنل پیش‌نمایش بارگذاری می‌شود — مسدود می‌کنند؛ نتیجه
 * آن است که ورود ۲۰۰ برمی‌گردد اما فراخوانی بعدی /me بدون کوکی → 401 و کاربر
 * به صفحه ورود برمی‌گردد. کلاینت توکن نشست را پس از ورود در sessionStorage
 * نگه می‌دارد و در هر درخواست با هدر اختصاصی می‌فرستد؛ سرور در نبود کوکی از
 * همین هدر استفاده می‌کند (اولویت همچنان با کوکی httpOnly است).
 */
export const SESSION_TOKEN_KEY = 'pos_session_token'

export function readSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveSessionToken(token: string | null | undefined): void {
  try {
    if (token) sessionStorage.setItem(SESSION_TOKEN_KEY, token)
    else sessionStorage.removeItem(SESSION_TOKEN_KEY)
  } catch {
    /* sessionStorage در حالت‌های حریم خصوصی ممکن است بسته باشد */
  }
}

function sessionTokenHeaders(): Record<string, string> {
  const token = readSessionToken()
  return token ? { 'x-session-token': token } : {}
}

/**
 * خطای API با کد وضعیت HTTP — تا مصرف‌کننده‌ها (مثل retry کوئری) بتوانند
 * خطای گذرا (5xx/شبکه) را از خطای منطقی/مجوز (4xx) جدا کنند.
 */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function parseError(res: Response, fallback: string): Promise<never> {
  let message = fallback
  try {
    const data = (await res.json()) as { error?: string }
    if (data?.error) message = data.error
  } catch {
    /* بدنه JSON نبود — پیام پیش‌فرض */
  }
  throw new ApiError(message, res.status)
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', headers: sessionTokenHeaders() })
  if (res.status === 401) window.dispatchEvent(new Event('auth:expired'))
  if (!res.ok) await parseError(res, 'خطای نامشخص سرور')
  return (await res.json()) as T
}

export async function apiPost<T>(path: string, body?: unknown, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'POST'): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...sessionTokenHeaders() },
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) window.dispatchEvent(new Event('auth:expired'))
  if (!res.ok) await parseError(res, 'خطای نامشخص سرور')
  return (await res.json()) as T
}

// آپلود فایل (multipart) — استفاده از هسته Storage
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(path, { method: 'POST', body: form, credentials: 'same-origin', headers: sessionTokenHeaders() })
  if (res.status === 401) window.dispatchEvent(new Event('auth:expired'))
  if (!res.ok) await parseError(res, 'آپلود ناموفق بود')
  return (await res.json()) as T
}

/**
 * دانلود فایل از سرور (P1-T15 — خروجی CSV حسابرسی):
 * همان مسیر نشست‌دار را می‌گیرد، پاسخ را Blob می‌کند و دانلود مرورگر را
 * با نام فایل دریافتی از Content-Disposition راه می‌اندازد.
 * متادیتای سطرها (X-Csv-Rows/X-Csv-Capped) برای بازخورد کاربر برگردانده می‌شود.
 */
export async function apiDownload(path: string, fallbackName: string): Promise<{ rows: number | null; capped: boolean }> {
  const res = await fetch(path, { credentials: 'same-origin', headers: sessionTokenHeaders() })
  if (res.status === 401) {
    window.dispatchEvent(new Event('auth:expired'))
    throw new ApiError('نشست منقضی شده است', 401)
  }
  if (!res.ok) await parseError(res, 'دریافت فایل ناموفق بود')
  const blob = await res.blob()
  // نام فایل از هدر Content-Disposition (filename="...")
  const cd = res.headers.get('content-disposition') ?? ''
  const match = cd.match(/filename="?([^";]+)"?/i)
  const name = match?.[1] || fallbackName
  const rowsRaw = Number.parseInt(res.headers.get('x-csv-rows') ?? '', 10)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return { rows: Number.isFinite(rowsRaw) ? rowsRaw : null, capped: res.headers.get('x-csv-capped') === '1' }
}
