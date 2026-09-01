import 'server-only'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/core/shared/db'
import { isFeatureEnabled } from '@/core/featureflags/featureflags'

/**
 * هسته AI Gateway — سرویس ۱۷ از ۱۸ سرویس هسته سند منبع (بخش ۵.۱: AI Gateway)
 * تنها نقطه ورود فراخوانی مدل زبانی در کل پلتفرم:
 *   ۱) گیت Feature Flag (کلید اختصاصی هر قابلیت)
 *   ۲) سجل تلمتری AiInvocation برای هر فراخوانی (موفق یا ناموفق)
 *   ۳) تایم‌اوت و ترجمه خطا به پیام فارسی یکدست
 * سیاست‌های داده (مثل محرومیت نامه «سری») در ماژول کسب‌وکار اعمال می‌شوند، نه اینجا.
 */

export type AiMessage = { role: 'assistant' | 'user' | 'system'; content: string }

export type AiGatewayResult<T> =
  | { ok: true; data: T; latencyMs: number }
  | { ok: false; error: string; status: number }

const REQUEST_TIMEOUT_MS = 45_000

export async function runAiJson<T>(opts: {
  task: string // شناسه تلمتری؛ نمونه: letter.classify-summarize
  flagKey: string // کلید Feature Flag کنترل‌کننده قابلیت
  flagLabel: string // نام فارسی قابلیت برای پیام خاموشی
  messages: AiMessage[]
  parse: (raw: string) => T | null
  ctx: { userId: string; companyId: string | null }
}): Promise<AiGatewayResult<T>> {
  if (!(await isFeatureEnabled(opts.flagKey, true))) {
    return { ok: false, error: `قابلیت «${opts.flagLabel}» توسط پرچم ویژگی (${opts.flagKey}) غیرفعال است`, status: 503 }
  }

  const startedAt = Date.now()
  let latencyMs = 0
  try {
    const zai = await ZAI.create()
    const completion = await Promise.race([
      zai.chat.completions.create({ messages: opts.messages, thinking: { type: 'disabled' } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), REQUEST_TIMEOUT_MS)),
    ])
    latencyMs = Date.now() - startedAt
    const raw = completion.choices[0]?.message?.content ?? ''
    const parsed = opts.parse(raw)
    if (!parsed) {
      await recordInvocation(opts.task, { ok: false, error: 'UNPARSABLE_RESPONSE', latencyMs, ctx: opts.ctx })
      return { ok: false, error: 'پاسخ سرویس هوش مصنوعی قابل تفسیر نبود', status: 502 }
    }
    await recordInvocation(opts.task, { ok: true, latencyMs, ctx: opts.ctx })
    return { ok: true, data: parsed, latencyMs }
  } catch (e) {
    latencyMs = Date.now() - startedAt
    const isTimeout = e instanceof Error && e.message === 'AI_TIMEOUT'
    await recordInvocation(opts.task, { ok: false, error: isTimeout ? 'TIMEOUT' : String(e).slice(0, 300), latencyMs, ctx: opts.ctx })
    return { ok: false, error: 'سرویس هوش مصنوعی در دسترس نیست؛ لطفاً بعداً تلاش کنید', status: 503 }
  }
}

async function recordInvocation(
  task: string,
  o: { ok: boolean; latencyMs: number; error?: string; ctx: { userId: string; companyId: string | null } },
): Promise<void> {
  try {
    await db.aiInvocation.create({
      data: {
        task,
        provider: 'zai',
        ok: o.ok,
        error: o.error ?? null,
        latencyMs: o.latencyMs,
        userId: o.ctx.userId,
        companyId: o.ctx.companyId,
      },
    })
  } catch {
    // سجل تلمتری هرگز نباید مسیر اصلی را بندازد — سکوت عمدی
  }
}

export async function listRecentInvocations(take = 50) {
  return db.aiInvocation.findMany({ orderBy: { createdAt: 'desc' }, take })
}
