// ثبت idempotent پرچم‌های ویژگی OCR (P2-T16) — الگوی add-deadline-reminder-job
// اجرا: bunx tsx scripts/add-ocr-flags.ts
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const FLAGS = [
  { key: 'letters.ocr', description: 'P2-T16 — OCR نامه اسکن‌شده: استخراج متن فارسی (tesseract) + پیش‌پرکردن فرم ثبت با HITL', enabled: true },
  { key: 'ai.letter-ocr', description: 'P2-T16 — مرحله دوم OCR: ساختاردهی متن خام با LLM؛ خاموشی = فقط متن خام', enabled: true },
]

async function main() {
  for (const f of FLAGS) {
    const exists = await db.featureFlag.findUnique({ where: { key: f.key } })
    if (exists) {
      console.log(`(موجود) ${f.key}`)
      continue
    }
    await db.featureFlag.create({ data: f })
    console.log(`+ ثبت شد: ${f.key}`)
  }
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
