/** ورود API برای تست‌های T16 — همان قرارداد test-p2-t13-t14 (کوکی + توکن دو‌مسیره) */
export type Jar = { cookie: string; token: string }

export async function login(username: string, password: string): Promise<Jar | null> {
  const res = await fetch('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 T16OCR' },
    body: JSON.stringify({ username, password }),
  })
  const body = (await res.json().catch(() => ({}))) as { token?: string }
  return body.token ? { cookie: `pos_sid=${body.token}`, token: body.token } : null
}
