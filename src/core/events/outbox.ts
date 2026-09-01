import 'server-only'
import { db } from '@/core/shared/db'

// ---------- باس رویداد (الگوی Outbox — ADR-003) ----------
// همیشه داخل همان عملیات کسب‌وکار صدا زده می‌شود؛ مصرف توسط worker دوره‌ای.
export async function emitEvent(type: string, payload: Record<string, unknown>) {
  await db.outboxEvent.create({
    data: { type, payload: JSON.stringify(payload) },
  })
}
