import 'server-only'
import { PrismaClient } from '@prisma/client'

/**
 * نسخه کلاینت Prisma — پس از هر «prisma db push + generate» این رشته را به‌روز کنید.
 * چرا: نمونه PrismaClient روی globalThis کش می‌شود تا HMR نمونه تکراری نسازد؛ اما پس از
 * تغییر شِما، آن نمونه قدیمیِ زنده شمای قدیمی را دارد (P2-T11: خطای Unknown argument
 * `dedupKey` در فرایند devِ باز). با mismatch نسخه، نمونه قدیمی disconnect و دور
 * انداخته می‌شود و ماژول تازه‌ارزیابی‌شده کلاینتِ تازه‌ تولیدشده می‌سازد.
 */
const PRISMA_GEN = 'gen-2026-09-02-p05-t3-loginattempt' // بامپ پس از افزودن LoginAttempt (P0.5-T3 — CREATE مستقیم)

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaGen?: string
}

if (globalForPrisma.prismaGen !== PRISMA_GEN) {
  if (globalForPrisma.prisma) void globalForPrisma.prisma.$disconnect().catch(() => {})
  globalForPrisma.prisma = undefined
  globalForPrisma.prismaGen = PRISMA_GEN
}

/**
 * گارد لایه سوم ماندگاری: محیط اجرایی سندباکس گاهی DATABASE_URL قدیمی (file:… SQLite) را
 * به‌صورت متغیر تزریقی می‌آورد که بر .env (Neon) اولویت دارد — علامت: خطای
 * «the URL must start with the protocol postgresql://». .env منبع حقیقت است؛
 * راه‌حل: احیای سرور با unset صریح داخل subshell (AGENTS.md بند RB — لایه سوم).
 */
if (process.env.DATABASE_URL?.startsWith('file:')) {
  throw new Error(
    'DATABASE_URL محیط file:… (SQLite) است، ولی شِما postgresql است — متغیر تزریقی را unset کنید تا .env (Neon) اعمال شود (AGENTS.md — لایه سوم ماندگاری)',
  )
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
