/**
 * سرویس بلادرنگ پلتفرم ideaone (پایلوت فاز ۱)
 * ------------------------------------------------------------
 * مسئولیت: تحویل فوری رویدادها (اعلان و ...) به کاربران متصل
 *
 * معماری:
 *  - کلاینت Next.js با «بلیت امضاشده HMAC» (صادره از /api/realtime/ticket)
 *    در اتاق `user:<userId>` ثبت‌نام می‌کند — هیچ اعتماد کوری به ادعای کاربر نیست.
 *  - سرور Next.js پس از ثبت اعلان در دیتابیس، رویداد را به endpoint داخلی
 *    /emit می‌فرستد (با کلید اشتراکی) و این سرویس آن را به اتاق کاربر می‌رساند.
 *  - در صورت قطعی این سرویس، سازوکار polling صفحه (هر ۳۰ ثانیه) پوشش می‌دهد؛
 *    بنابراین push صرفاً شتاب‌دهنده است، نه تنها مسیر تحویل. (طراحی مقاوم)
 */
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Server } from 'socket.io'

const PORT = 3003            // پورت عمومی سوکت (از طریق Caddy با XTransformPort)
const INTERNAL_PORT = 3004   // پورت داخلی API تزریق رویداد — فقط localhost، بیرون در معرض نیست
// در استقرار واقعی از متغیر محیطی استفاده شود؛ مقدار پیش‌فرض مخصوص پایلوت سندباکس است.
const SECRET = process.env.REALTIME_SECRET || 'ideaone-pilot-rt-secret-2026'

// ---------- بلیت‌های امضاشده ----------
// قالب بلیت: `<expiresAtMs>.<hmac>` که hmac = HMAC-SHA256(`${userId}:${expiresAtMs}`)
function signTicket(userId: string, expiresAtMs: number): string {
  return createHmac('sha256', SECRET).update(`${userId}:${expiresAtMs}`).digest('hex')
}

function verifyTicket(userId: string, ticket: string): boolean {
  try {
    const [expRaw, mac] = String(ticket || '').split('.')
    const exp = Number(expRaw)
    if (!exp || !mac || !Number.isFinite(exp)) return false
    if (Date.now() > exp) return false // بلیت منقضی — کلاینت بلیت تازه می‌گیرد
    const expected = signTicket(userId, exp)
    const a = Buffer.from(mac, 'hex')
    const b = Buffer.from(expected, 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ---------- شمارش اتصال هر کاربر (چند تب = چند سوکت) ----------
const onlineUsers = new Map<string, Set<string>>() // userId -> socket ids

function joinUser(userId: string, socketId: string) {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set())
  onlineUsers.get(userId)!.add(socketId)
}

function leaveUser(userId: string, socketId: string) {
  const set = onlineUsers.get(userId)
  if (!set) return
  set.delete(socketId)
  if (set.size === 0) onlineUsers.delete(userId)
}

// ---------- HTTP داخلی ----------
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 1_000_000) reject(new Error('body too large')) // حفاظت
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function isAuthorized(req: IncomingMessage): boolean {
  const key = req.headers['x-internal-key']
  if (typeof key !== 'string' || !key) return false
  const a = Buffer.from(key)
  const b = Buffer.from(SECRET)
  return a.length === b.length && timingSafeEqual(a, b)
}

// سرور سوکت — درخواست‌های HTTP عادی روی این پورت به engine.io می‌رسد و معنا ندارد؛
// بنابراین فقط 404 برمی‌گرداند.
const httpServer = createServer((_req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
})

// سرور HTTP داخلی (فقط 127.0.0.1) برای دریافت رویداد از سرور Next.js
// ⚠️ جدا از سرور سوکت است، چون socket.io با path '/' تمام درخواست‌های سرور خودش را تصاحب می‌کند.
const internalServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // سلامت سرویس
  if (req.method === 'GET' && req.url?.split('?')[0] === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, online: onlineUsers.size, port: PORT }))
    return
  }

  // نقطه تزریق رویداد از سرور Next.js (فقط داخلی، با کلید اشتراکی)
  if (req.method === 'POST' && req.url?.split('?')[0] === '/emit') {
    if (!isAuthorized(req)) {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'unauthorized' }))
      return
    }
    try {
      const body = JSON.parse((await readBody(req)) || '{}') as {
        userIds?: string[]
        event?: string
        data?: Record<string, unknown>
      }
      const userIds = Array.isArray(body.userIds) ? body.userIds.filter((u) => typeof u === 'string' && u) : []
      const event = typeof body.event === 'string' && body.event ? body.event : 'notification'
      if (userIds.length === 0) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'userIds required' }))
        return
      }
      let delivered = 0
      for (const userId of userIds) {
        const room = `user:${userId}`
        const sockets = await io.in(room).fetchSockets()
        if (sockets.length > 0) {
          io.to(room).emit(event, body.data ?? {})
          delivered += sockets.length
        }
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, rooms: userIds.length, delivered }))
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'bad request' }))
    }
    return
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
})

// ---------- Socket.io ----------
// ⚠️ مسیر '/' نباید تغییر کند — Caddy برای فوروارد از آن استفاده می‌کند.
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 200_000,
})

io.on('connection', (socket) => {
  socket.data.userId = null as string | null

  // ثبت‌نام کاربر با بلیت امضاشده (صادره از نشست احراز هویت Next.js)
  socket.on('register', (payload: { userId?: string; ticket?: string }) => {
    const { userId, ticket } = payload || {}
    if (typeof userId !== 'string' || !userId || !verifyTicket(userId, String(ticket || ''))) {
      socket.emit('register-error', { message: 'invalid ticket' })
      return
    }
    socket.data.userId = userId
    socket.join(`user:${userId}`)
    joinUser(userId, socket.id)
    socket.emit('registered', { userId, online: onlineUsers.size })
    console.log(`[rt] registered user=${userId} sockets=${onlineUsers.get(userId)!.size}`)
  })

  // ضربان سبک برای سنجش زنده بودن مسیر (اختیاری کلاینت)
  socket.on('ping-x', (cb: (t: string) => void) => {
    if (typeof cb === 'function') cb(new Date().toISOString())
  })

  socket.on('disconnect', () => {
    const userId = socket.data.userId as string | null
    if (userId) {
      leaveUser(userId, socket.id)
      console.log(`[rt] disconnect user=${userId} remaining=${onlineUsers.get(userId)?.size ?? 0}`)
    }
  })

  socket.on('error', (err: unknown) => {
    console.error(`[rt] socket error (${socket.id}):`, err)
  })
})

httpServer.listen(PORT, () => {
  console.log(`[rt] ideaone realtime service listening on port ${PORT}`)
})

internalServer.listen(INTERNAL_PORT, '127.0.0.1', () => {
  console.log(`[rt] internal emit API listening on 127.0.0.1:${INTERNAL_PORT}`)
})

// خاموشی آرام
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    console.log(`[rt] ${sig} received, shutting down...`)
    internalServer.close()
    io.close(() => process.exit(0))
  })
}
