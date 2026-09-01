/**
 * P1-T36 — بخش دوم: مسیرهای طلایی G5..G8
 */
import { PrismaClient } from '@prisma/client'
import { ab, ev, wait, shot, login, logout, navigate, bodyText, fillByLabel, toastText, searchSelect, faToEnNumber, loginSession, switchCompanyUI } from './e2e-golden-helpers'
import { record, testArtifact } from './e2e-golden-paths1'

const prisma = new PrismaClient()

// ─────────────────────────── G5 — بلادرنگ دومرورگری: اعلان زنده
async function g5() {
  const checks: string[] = []
  // نشست ۱ (پیش‌فرض): ceo.arad — گیرنده اعلان
  ab('close', 15000)
  const okCeo = login('ceo.arad', '12345678')
  checks.push(`${okCeo ? '✓' : '✗'} مرورگر ۱: ورود ceo.arad`)
  // صبر بر اتصال سوکت و ثبت‌نام در اتاق (نقطه سبز = registered) — پیش‌نیاز اعلان زنده
  let socketReady = false
  for (let i = 0; i < 8; i++) {
    wait(1500)
    socketReady = ev(`!!Array.from(document.querySelectorAll('[aria-label]')).find(el => (el.getAttribute('aria-label') || '').includes('بلادرنگ فعال'))`) === true
    if (socketReady) break
  }
  checks.push(`${socketReady ? '✓' : '✗'} سوکت ceo متصل و ثبت‌نام شد`)
  // شمار اعلان خوانده‌نشده قبل — اولین span با متن (span نقطه سبز آنلاین متن ندارد)
  const badgeBefore = String(ev(`(function(){ const b = Array.from(document.querySelectorAll('button')).find(x => (x.getAttribute('aria-label')||'').includes('اعلان')); if (!b) return '۰'; const spans = Array.from(b.querySelectorAll('span')).map(s => s.textContent.trim()).join(''); return spans || '۰' })()`) ?? '۰')
  const before = faToEnNumber(badgeBefore)
  shot('g5-ceo-before')

  // نشست ۲ (ایزوله): dabir.arad — نامه ثبت و ارجاع می‌دهد
  const okDabir = loginSession('g5b', 'dabir.arad', '12345678')
  checks.push(`${okDabir ? '✓' : '✗'} مرورگر ۲: ورود dabir.arad`)
  // نامه جدید + ارجاع فوری به ceo (ناوبری از طریق تزریق نشست مثل بقیه مسیرها)
  ev(`(function(){ window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:letters', kind: 'list', viewKey: 'letters', title: 'نامهها', icon: 'Mail' }], activeTabId: 'list:letters' })); return true })()`, 'g5b')
  ab('--session g5b open http://localhost:81/')
  wait(4000)
  ab('--session g5b find role button click --name "ثبت نامه جدید"')
  wait(2200)
  ab(`--session g5b find role textbox fill --name "موضوع" "نامه فوری مسیر طلایی G5"`)
  ab(`--session g5b find role textbox fill --name "متن نامه" "متن آزمایشی اعلان بلادرنگ."`)
  // ارجاع اولیه به مدیرعامل (ناصر رضایی) — در همان فرم
  // FieldSelect = Radix Select؛ نام قابل‌دسترس آن از <label> می‌آید نه aria-label
  // (تا اینجا تست قبلی دنبال aria-label «ارجاع اولیه» می‌گشت و هرگز تریگر را نمی‌یافت)
  const refOpened = String(ev(`(function(){ const labels = Array.from(document.querySelectorAll('main label')); const lab = labels.find(l => (l.textContent || '').includes('ارجاع اولیه')); if (!lab) return 'label-not-found'; const wrap = lab.parentElement; const trigger = wrap ? wrap.querySelector('button[role="combobox"]') : null; if (!trigger) return 'trigger-not-found'; trigger.click(); return true })()`, 'g5b'))
  wait(1100)
  const refPicked = String(ev(`(function(){ const opts = Array.from(document.querySelectorAll('[role="option"]')); const opt = opts.find(o => (o.textContent || '').includes('رضایی')); if (!opt) return 'option-not-found(' + opts.length + ')'; opt.click(); return true })()`, 'g5b'))
  wait(700)
  checks.push(`${refOpened === 'true' && refPicked === 'true' ? '✓' : '✗'} ارجاع اولیه رضایی انتخاب شد (${refOpened}/${refPicked})`)
  ab('--session g5b find role button click --name "ثبت نامه"')
  wait(5000)
  shot('g5-dabir-sent')

  // مرورگر ۱: اعلان زنده بدون رفرش (سوکت)
  wait(2500)
  const badgeAfter = String(ev(`(function(){ const b = Array.from(document.querySelectorAll('button')).find(x => (x.getAttribute('aria-label')||'').includes('اعلان')); if (!b) return '۰'; const spans = Array.from(b.querySelectorAll('span')).map(s => s.textContent.trim()).join(''); return spans || '۰' })()`) ?? '۰')
  const after = faToEnNumber(badgeAfter)
  const live = after > before
  checks.push(`${live ? '✓' : '✗'} اعلان زنده بدون رفرش: ${before} → ${after}`)
  shot('g5-ceo-after')

  // پاک‌سازی (نشست اصلی روی ceo است — Prisma مستقیم)
  const letter = await prisma.letter.findFirst({ where: { subject: 'نامه فوری مسیر طلایی G5' } })
  if (letter) {
    testArtifact.letterIds.push(letter.id)
    await prisma.letterReferral.deleteMany({ where: { letterId: letter.id } })
    await prisma.notification.deleteMany({ where: { body: 'نامه فوری مسیر طلایی G5' } })
    await prisma.auditLog.deleteMany({ where: { entity: 'letter', entityId: letter.id } })
    await prisma.letter.delete({ where: { id: letter.id } })
    checks.push('✓ پاک‌سازی نامه تستی G5')
  }
  // بستن مرورگرهای نشست دوم + ریست کش مرورگر اصلی برای مسیرهای بعدی
  ab('--session g5b close', 15000)
  record('G5', 'دو مرورگر → نامه + ارجاع → اعلان زنده (سوکت)', checks,
    ['سناریو: SC-004 · خودترمیمی kill/restart در SC-004 دستی پوشش داده شده'])
}

// ─────────────────────────── G6 — دستیار AI نامه با HITL
async function g6() {
  const checks: string[] = []
  logout()
  const okDabir = login('dabir.arad', '12345678')
  checks.push(`${okDabir ? '✓' : '✗'} ورود dabir.arad`)

  // نامه غیرسری موجود (آخرین نامه آراد) — باز کردن از فهرست
  // P2.5-U4/U9: کلیک ردیف در دسکتاپ = پنل (پیش‌فرض نیم‌صفحه = رکورد کامل)؛
  // «تمام‌صفحه» = تب رکورد (دکمه باز کردن کامل فوتر فقط در حالت باریک است)
  navigate('letters', 'اتوماسیون')
  wait(1500)
  const firstRow = ev(`(() => { const r = document.querySelector('main table tbody tr'); if (r) { r.click(); return 'clicked' } return 'no-row' })()`)
  wait(2200)
  const previewOpen = ev(`!!document.querySelector('[data-preview-panel]')`) === true
  const halfMode = ev(`(() => { const p = document.querySelector('[data-preview-panel]'); return p ? p.getAttribute('data-panel-mode') === 'half' : false })()`) === true
  checks.push(`${firstRow === 'clicked' ? '✓' : '✗'} کلیک ردیف → پنل پیش‌نمایش (${firstRow})`)
  checks.push(`${previewOpen ? '✓' : '✗'} پنل پیش‌نمایش باز شد (U4)`)
  checks.push(`${halfMode ? '✓' : '✗'} پنل در حالت نیم‌صفحه = رکورد کامل (U9)`)
  const openFull = ab('find role button click --name "تمام‌صفحه"')
  wait(3500)
  checks.push(`${openFull.includes('✓') ? '✓' : '✗'} تمام‌صفحه → تب رکورد نامه`)

  // درخواست پیشنهاد AI
  const aiBtn = ab('find role button click --name "دریافت پیشنهاد"')
  wait(9000) // تحلیل AI زمان می‌برد
  shot('g6-ai-suggestion')
  const hasSuggest = bodyText().includes('طبقه‌بندی پیشنهادی') || bodyText().includes('اولویت')
  checks.push(`${hasSuggest ? '✓' : '✗'} پیشنهاد AI رندر شد (${aiBtn.includes('✓') ? 'کلیک ok' : 'کلیک fail'})`)

  // اعمال با HITL
  ab('find role button click --name "تأیید و اعمال پیشنهاد"')
  wait(3500)
  const applied = bodyText().includes('تأییدشده') || bodyText().includes('دستیار هوشمند')
  checks.push(`${applied ? '✓' : '✗'} پیشنهاد پس از تأیید انسانی اعمال شد`)
  shot('g6-ai-applied')
  record('G6', 'دستیار AI نامه → پیشنهاد → اعمال HITL', checks, ['سناریو: SC-006'])
}

// ─────────────────────────── G7 — خاموشی شرکتی ماژول → منو فقط همان شرکت
async function g7() {
  const checks: string[] = []
  logout()
  const okAdmin = login('admin', 'admin123')
  checks.push(`${okAdmin ? '✓' : '✗'} ورود admin`)

  // آراد فعال؟ سوییچ مطمئن
  const switchedArad = switchCompanyUI('آراد سرام پیشرو')
  checks.push(`${switchedArad ? '✓' : '✗'} شرکت فعال = آراد سرام پیشرو`)

  // کاتالوگ پلاگین‌ها → خاموش کردن «مشتریان و تأمین‌کنندگان» برای آراد (scope=company پیش‌فرض)
  navigate('modules', 'کاتالوگ')
  wait(2500)
  // یافتن کارت ماژول شرکا و کلیک سوییچ آن
  const toggled = ev(`(function(){
    const cards = Array.from(document.querySelectorAll('main [data-slot="card"], main div.rounded-xl, main div.rounded-lg'))
    const card = cards.find(c => (c.textContent || '').includes('مشتریان و تأمین') && c.querySelector('button[role="switch"]'))
    if (!card) return 'card-not-found'
    const sw = card.querySelector('button[role="switch"]')
    if (!sw) return 'switch-not-found'
    sw.click()
    return true
  })()`)
  wait(1200)
  // P1-T23 — تأیید غیرفعال‌سازی با ConfirmDialog (شاید هنوز باز است — کلیک قطعی با eval)
  const confirmed = ev(`(function(){
    const btns = Array.from(document.querySelectorAll('button'))
    const btn = btns.find(b => (b.textContent || '').trim() === 'غیرفعال‌سازی')
    if (!btn) return 'confirm-btn-not-found'
    btn.click()
    return true
  })()`)
  wait(3000)
  shot('g7-partners-toggled-off')

  // منوی آراد: «شرکا» باید غایب باشد — textContent مستقل از دید (کشو بسته هم خوانده می‌شود)
  const menuArad = String(ev(`(document.querySelector('nav[aria-label="ناوبری اصلی"]') || {}).textContent || ''`) ?? '')
  const goneInArad = !menuArad.includes('شرکا')
  checks.push(`${goneInArad && toggled === true ? '✓' : '✗'} منوی آراد پس از خاموشی: «شرکا» حذف شد (${toggled === true ? 'کلیک' : toggled}${confirmed === true ? '+تأیید' : '/' + String(confirmed).slice(0, 20)})`)

  // سوییچ به کاشی نیلو: «شرکا» باید باشد (خاموشی فقط شرکتی)
  const switchedNilu = switchCompanyUI('کاشی نیلو')
  const menuNilo = String(ev(`(document.querySelector('nav[aria-label="ناوبری اصلی"]') || {}).textContent || ''`) ?? '')
  const presentInNilo = menuNilo.includes('شرکا')
  checks.push(`${switchedNilu && presentInNilo ? '✓' : '✗'} منوی کاشی نیلو: «شرکا» هنوز هست (خاموشی فقط آراد)`)

  // بازگرداندن: به آراد برگرد و روشن کن
  const switchedBack = switchCompanyUI('آراد سرام پیشرو')
  navigate('modules', 'کاتالوگ')
  wait(2500)
  const restored = ev(`(function(){
    const cards = Array.from(document.querySelectorAll('main [data-slot="card"], main div.rounded-xl, main div.rounded-lg'))
    const card = cards.find(c => (c.textContent || '').includes('مشتریان و تأمین') && c.querySelector('button[role="switch"]'))
    if (!card) return 'card-not-found'
    const sw = card.querySelector('button[role="switch"]')
    if (!sw) return 'switch-not-found'
    sw.click()
    return true
  })()`)
  wait(2500)
  const menuRestored = String(ev(`(document.querySelector('nav[aria-label="ناوبری اصلی"]') || {}).textContent || ''`) ?? '')
  checks.push(`${switchedBack && menuRestored.includes('شرکا') ? '✓' : '✗'} بازگرداندن ماژول شرکا برای آراد (${restored === true ? 'کلیک' : restored})`)
  shot('g7-partners-restored')
  record('G7', 'خاموشی شرکتی ماژول → منوی شرکت فعال تغییر، شرکت دیگر نه', checks, ['سناریو: SC-008'])
}

// ─────────────────────────── G8 — ارقام فارسی و تاریخ جلالی در فرم‌ها
async function g8() {
  const checks: string[] = []
  logout()
  const okDabir = login('dabir.arad', '12345678')
  checks.push(`${okDabir ? '✓' : '✗'} ورود dabir.arad`)

  // فرم نامه: مهلت با تاریخ نامعتبر → خطای فارسی زیر فیلد
  navigate('letters', 'اتوماسیون')
  ab('find role button click --name "ثبت نامه جدید"')
  wait(2200)
  fillByLabel('مهلت', '۱۴۰۵/۱۳/۴۵')
  wait(900)
  shot('g8-invalid-jalali')
  const errVisible = bodyText().includes('نامعتبر') || bodyText().includes('تاریخ')
  checks.push(`${errVisible ? '✓' : '✗'} تاریخ جلالی نامعتبر «۱۴۰۵/۱۳/۴۵» → خطای فارسی`)

  // پاک کردن و مقدار معتبر
  fillByLabel('مهلت', '۱۴۰۵/۰۷/۱۵')
  wait(600)
  const validOk = !bodyText().includes('نامعتبر')
  checks.push(`${validOk ? '✓' : '✗'} تاریخ معتبر «۱۴۰۵/۰۷/۱۵» پذیرفته شد`)

  // ارقام فارسی در فیلد متنی موضوع با عدد: «سفارش ۲۵ فوری» — پذیرش و رندر
  fillByLabel('موضوع', 'سفارش ۲۵ فوری — تست G8')
  wait(500)
  const subjVal = String(ev(`(function(){ const inp = Array.from(document.querySelectorAll('main input')).find(i => (i.placeholder || '').includes('موضوع')); return inp ? inp.value : '' })()`) ?? '')
  checks.push(`${subjVal.includes('۲۵') ? '✓' : '✗'} ارقام فارسی «۲۵» در ورودی موضوع پذیرفته شد`)

  // بستن تب بدون ثبت — فرم dirty است → دیالوگ تأیید «بستن تب و حذف پیش‌نویس؟» (بررسی عمیق فرم‌ها)
  ab('find role button click --name "انصراف و بستن تب"')
  wait(600)
  shot('g8-confirm-close-dialog')
  const dialogShown = bodyText().includes('بستن تب و حذف پیش‌نویس')
  checks.push(`${dialogShown ? '✓' : '✗'} انصراف در فرم dirty → دیالوگ تأیید حذف پیش‌نویس`)
  ab('find role button click --name "بله، حذف و بستن تب"')
  wait(1500)
  record('G8', 'فرم‌ها با ارقام فارسی/جلالی — پذیرش معتبر، خطای فارسی نامعتبر، تأیید بستن فرم dirty', checks, ['سنجه: بررسی عمیق فرم‌ها — گارد حذف پیش‌نویس'])
}

export { g5, g6, g7, g8 }
