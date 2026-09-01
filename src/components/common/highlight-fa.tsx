import type { ReactNode } from 'react'
import { faSearchTokens } from '@/core/shared/normalize'

/**
 * هایلایت فارسی نتایج جستجو (P2-T5) — «HighlightFa regex یونیکدی» دستور پخت RECOVERY-PLAN.
 *
 * متن «اصلی» (غیرنرمال‌شده) رندر می‌شود و regex واریانت‌آگاه همان توکن‌هایی را علامت می‌زند که
 * سرور با FTS نرمال‌شده یافته: هر نویسه به کلاس نویسه‌های هم‌ارز نگاشت می‌شود (ك↔ک، ي↔ی،
 * أ/إ/آ↔ا، ؤ↔و، ارقام فارسی/عربی/لاتین) — آینه normalizeFaText.
 *  - توکن حرفی (پیشوند*) → کل واژه‌ای که با آن شروع می‌شود («مهر» در «مهرداد» کامل هایلایت)
 *  - توکن رقمی (دقیق) → فقط واژه برابر («۴۲» در «۴۲۴» علامت نمی‌خورد)
 * مرز واژه با lookbehind/lookahead یونیکدی — نه \b (که فقط ASCII می‌فهمد).
 */

/** نگاشت نویسه نرمال‌شده → کلاس نویسه‌های هم‌ارز در متن اصلی (آینه normalizeFaText) */
const CHAR_VARIANTS: Record<string, string> = {
  ک: '[كک]',
  ی: '[يی]',
  ا: '[أإآا]',
  و: '[ؤو]',
}

const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g
const WORD_CHARS = '\\p{L}\\p{N}'

function tokenPattern(token: string): string {
  const core = [...token]
    .map((ch) => {
      if (ch >= '0' && ch <= '9') return '[0-9۰-۹٠-٩]'
      if (CHAR_VARIANTS[ch]) return CHAR_VARIANTS[ch]
      return ch.replace(REGEX_ESCAPE, '\\$&')
    })
    .join('')
  // ارقام دقیق‌اند (بدون *)؛ حروف پیشوندی‌اند (واژه کامل)
  return /^[0-9]+$/.test(token)
    ? `(?<![${WORD_CHARS}])${core}(?![${WORD_CHARS}])`
    : `(?<![${WORD_CHARS}])${core}[${WORD_CHARS}]*`
}

/** الگوی هایلایت مشترک بین توکن‌ها (alternation) — null = چیزی برای هایلایت نیست */
export function buildFaHighlightRegex(query: string): RegExp | null {
  const tokens = faSearchTokens(query)
  if (tokens.length === 0) return null
  try {
    return new RegExp(tokens.map(tokenPattern).join('|'), 'gu')
  } catch {
    return null
  }
}

/** هایلایت واریانت‌آگاه متن با پرس‌وجوی جستجوی فعال — در ستون‌های فهرست نامه‌ها */
export function HighlightFa({ text, query }: { text: string | null | undefined; query: string }) {
  if (!text || !query) return <>{text ?? ''}</>
  const re = buildFaHighlightRegex(query)
  if (!re) return <>{text}</>

  const nodes: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0
    if (idx > last) nodes.push(text.slice(last, idx))
    nodes.push(
      <mark key={`${idx}-${m[0]}`} className="rounded-sm bg-amber-200/80 px-0.5 text-inherit">
        {m[0]}
      </mark>,
    )
    last = idx + m[0].length
  }
  if (nodes.length === 0) return <>{text}</>
  if (last < text.length) nodes.push(text.slice(last))
  return <>{nodes}</>
}
