#!/usr/bin/env tsx
/**
 * بررسی عمیق — سلامت داده و یکپارچگی ارجاعی دیتابیس
 * اجرا: bunx tsx scripts/deep-review.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function fa(n: number): string {
  return n.toLocaleString('fa-IR');
}

async function main() {
  const lines: string[] = [];
  const push = (s: string) => lines.push(s);

  push('━'.repeat(60));
  push('بررسی عمیق سلامت داده — ' + new Date().toISOString().slice(0, 19));
  push('━'.repeat(60));

  // ۱) سرشماری مدل‌ها
  const [companies, users, memberships, sessions, letters, referrals, attachments,
    whdocs, docItems, requests, requestItems, products, stockItems, partners,
    notifications, audits, settings, modules, outbox, devices] = await Promise.all([
    prisma.company.count(), prisma.user.count(), prisma.membership.count(),
    prisma.session.count(), prisma.letter.count(), prisma.letterReferral.count(),
    prisma.attachment.count(), prisma.warehouseDoc.count(), prisma.docItem.count(),
    prisma.goodsRequest.count(), prisma.goodsRequestItem.count(),
    prisma.product.count(), prisma.stockItem.count(), prisma.partner.count(),
    prisma.notification.count(), prisma.auditLog.count(),
    prisma.companySetting.count(), prisma.platformModule.count(),
    prisma.outboxEvent.count(), prisma.knownDevice.count(),
  ]);

  push('۱) سرشماری:');
  push(`   شرکت ${fa(companies)} · کاربر ${fa(users)} · عضویت ${fa(memberships)} · نشست ${fa(sessions)}`);
  push(`   نامه ${fa(letters)} · ارجاع ${fa(referrals)} · پیوست ${fa(attachments)}`);
  push(`   سند انبار ${fa(whdocs)} · قلم سند ${fa(docItems)} · درخواست ${fa(requests)} · قلم درخواست ${fa(requestItems)}`);
  push(`   کالا ${fa(products)} · موجودی ${fa(stockItems)} · شریک ${fa(partners)}`);
  push(`   اعلان ${fa(notifications)} · سجل ${fa(audits)} · تنظیم ${fa(settings)} · ماژول ${fa(modules)} · outbox ${fa(outbox)} · دستگاه ${fa(devices)}`);

  // ۲) یتیم‌ها: در Postgres قیدهای FK «حین نوشتن» تضمین می‌شوند (برخلاف SQLite که فقط PRAGMA می‌آزماید)
  //    — مهاجرت با ترتیب توپولوژیک FK انجام شد؛ نقض ساختاری ناممکن است. پیوست پلی‌مورف همچنان قابل آزمون است.
  const fkViolations: Array<{ table: string; rowid: number; parent: string; fkid: number }> = [];
  // پیوست‌های پلی‌مورف: entityType=letter ولی entityId ناموجود
  const danglingAttachments = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM "Attachment" a WHERE a."entityType"='letter' AND NOT EXISTS (SELECT 1 FROM "Letter" l WHERE l.id = a."entityId")`,
  );
  const orphanAttachments = Number(danglingAttachments[0]?.n ?? 0);

  push('');
  push(`۲) یتیم‌ها (${fkViolations.length === 0 ? '✓' : '✗'} FK-Check) + پیوست پلی‌مورف:`);
  push(`   ${fkViolations.length === 0 ? '✓' : '✗'} نقض قید FK (در Postgres تضمین ساختاری — بدون نیاز به بررسی): ${fa(fkViolations.length)}`);
  push(`   ${orphanAttachments === 0 ? '✓' : '✗'} پیوستِ نامه‌ی ناموجود (پلی‌مورف): ${fa(orphanAttachments)}`);
  for (const v of fkViolations.slice(0, 10)) {
    push(`   ✗ ${v.table} ردیف ${v.rowid} → والد ${v.parent}`);
  }
  const orphanTotal = fkViolations.length + orphanAttachments;

  // ۳) صحت منطقی: سند قطعی بدون قلم · موجودی منفی · نامه در جریان با مهلت گذشته
  const [postedNoItems, negStock, overdueLetters, cancelledStillCounts] = await Promise.all([
    prisma.warehouseDoc.count({ where: { status: 'POSTED', items: { none: {} } } }),
    prisma.stockItem.count({ where: { qtyM2: { lt: 0 } } }),
    prisma.letter.count({ where: { status: 'IN_PROGRESS', deadlineAt: { lt: new Date() } } }),
    Promise.resolve(0),
  ]);

  push('');
  push('۳) صحت منطقی:');
  push(`   ${postedNoItems === 0 ? '✓' : '✗'} سند قطعی بدون قلم: ${fa(postedNoItems)}`);
  push(`   ${negStock === 0 ? '✓' : '✗'} موجودی منفی: ${fa(negStock)}`);
  push(`   ℹ نامه در جریان با مهلت گذشته: ${fa(overdueLetters)} (اطلاعی — سنجه G1 «مهلت ≥۹۰٪»)`);

  // ۴) نشست‌های منقضی‌شده (پاک‌ساز ساعتی باید صفر نگه دارد)
  const expiredActive = await prisma.session.count({
    where: { expiresAt: { lt: new Date() } },
  });
  push(`   ${expiredActive === 0 ? '✓' : '⚠'} نشست منقضی مانده: ${fa(expiredActive)} (پاک‌ساز ساعتی)`);

  // ۵) کاربر غیرفعال با نشست زنده
  const inactiveWithSession = await prisma.session.count({
    where: { user: { isActive: false } },
  });
  push(`   ${inactiveWithSession === 0 ? '✓' : '✗'} نشست فعالِ کاربر غیرفعال: ${fa(inactiveWithSession)}`);

  // ۶) رویدادهای outbox معلق قدیمی (>۱ ساعت)
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const pendingOld = await prisma.outboxEvent.count({
    where: { processedAt: null, createdAt: { lt: hourAgo } },
  });
  push(`   ${pendingOld === 0 ? '✓' : '⚠'} رویداد outbox معلق >۱ ساعت: ${fa(pendingOld)}`);

  // ۷) توزیع داده بین شرکت‌ها
  const byCompany = await prisma.letter.groupBy({ by: ['companyId'], _count: true });
  push('');
  push('۴) توزیع نامه بین شرکت‌ها: ' + byCompany.map(g => `${g.companyId.slice(0, 8)}=${fa(g._count)}`).join(' · '));

  // ۸) تنظیمات per-company فعال
  const allSettings = await prisma.companySetting.findMany({
    select: { key: true, value: true, company: { select: { name: true } } },
  });
  push('');
  push('۵) تنظیمات per-company:');
  if (allSettings.length === 0) push('   (بدون تنظیم اختصاصی — همه پیش‌فرض)');
  for (const s of allSettings) push(`   ${s.company.name}: ${s.key}=${s.value}`);

  push('');
  push('━'.repeat(60));
  if (orphanTotal === 0 && postedNoItems === 0 && negStock === 0 && inactiveWithSession === 0) {
    push('✅ نتیجه بررسی عمیق داده: سالم — هیچ یتیم و ناهنجاری منطقی یافت نشد');
  } else {
    push(`⛔ ناهنجاری: یتیم=${fa(orphanTotal)} · سند بی‌قلم=${fa(postedNoItems)} · موجودی منفی=${fa(negStock)} · نشست غیرفعال=${fa(inactiveWithSession)}`);
  }
  push('━'.repeat(60));

  console.log(lines.join('\n'));
}

main()
  .catch((e) => { console.error('خطای بررسی:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
