// QA بصری VLM — P2-T5 هایلایت جستجوی تمام‌متن (سه اسکرین‌شات بسته)
// اجرا: bun scripts/vlm-t5-qa.ts  → download/qa-p2-t5/vlm-t5.json
import ZAI from 'z-ai-web-dev-sdk'
import { readFileSync, writeFileSync } from 'node:fs'

const SHOTS = [
  { file: 'download/qa-p2-t5/t5-highlight-desktop.png', name: 'دسکتاپ ۱۲۸۰ — جستجوی «استعلام»' },
  { file: 'download/qa-p2-t5/t5-highlight-variant.png', name: 'دسکتاپ — جستجوی واریانت «قيمت» (ي عربی)' },
  { file: 'download/qa-p2-t5/t5-highlight-mobile.png', name: 'موبایل ۳۹۰ — جستجو + هایلایت' },
]

const PROMPT = `این اسکرین‌شات‌های یک اپلیکیشن سازمانی فارسی (RTL) هستند — نمای فهرست نامه‌ها با جستجوی فعال و هایلایت نتایج (بخش‌های زرد کم‌رنگ <mark> روی واژه‌های یافته‌شده در ستون «موضوع»).
برای هر تصویر بررسی کن و پاسخ فارسی بده:
۱) آیا مارک‌های هایلایت زرد روی واژه‌ها دیده می‌شوند؟ چند مورد تقریبی؟
۲) آیا متن هایلایت‌شده داخل ستون موضوع است و چیدمان RTL سالم است (جدول راست، ستون‌ها راست‌به‌چپ)؟
۳) هم‌پوشانی/بیرون‌زدگی متن یا عنصر هست؟
۴) در تصویر موبایل: جدول تک‌ستونه/اسکرول سالم است؟
۵) ایراد بصری جدی (در صورت وجود) را دقیق بگو.`

async function main() {
  const zai = await ZAI.create()
  const content: { type: 'text'; text: string }[] | { type: 'image_url'; image_url: { url: string } }[] = [
    { type: 'text', text: `${PROMPT}\n\nتصاویر به ترتیب: ${SHOTS.map((s, i) => `${i + 1}) ${s.name}`).join(' · ')}` },
  ] as never
  for (const s of SHOTS) {
    const b64 = readFileSync(s.file).toString('base64')
    ;(content as unknown[]).push({ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } })
  }
  const res = await zai.chat.completions.createVision({
    // بسته SDK model را الزامی می‌خواهد؛ پاسخ‌های آرشیوی همین نام مدل را نشان می‌دهند
    model: 'glm-5v-turbo',
    messages: [{ role: 'user', content }],
  })
  const text = res.choices?.[0]?.message?.content ?? ''
  writeFileSync('download/qa-p2-t5/vlm-t5.json', JSON.stringify(res, null, 2))
  console.log(text)
}

main().catch((e) => {
  console.error('VLM خطا:', String(e).slice(0, 300))
  process.exit(1)
})
