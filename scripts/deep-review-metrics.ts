#!/usr/bin/env tsx
/**
 * بررسی تکمیلی — تحلیل سنجه‌های عملیاتی برای گزارش بررسی عمیق
 * اجرا: bunx tsx scripts/deep-review-metrics.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const fa = (n: number) => n.toLocaleString('fa-IR');

async function main() {
  // ۱) سنجه مهلت نامه‌ها (G1: پاسخ‌دهی ≥۹۰٪ در مهلت)
  const inProgress = await prisma.letter.count({ where: { status: 'IN_PROGRESS' } });
  const overdue = await prisma.letter.count({ where: { status: 'IN_PROGRESS', deadlineAt: { lt: new Date() } } });
  console.log('نامه در جریان:', fa(inProgress));
  console.log('با مهلت گذشته:', fa(overdue), `(${((overdue / Math.max(inProgress, 1)) * 100).toFixed(1)}%)`);

  const byStatus = await prisma.letter.groupBy({ by: ['status'], _count: true });
  console.log('وضعیت نامه:', byStatus.map(s => `${s.status}=${s._count}`).join(' · '));

  // ۲) وضعیت اسناد انبار
  const whByStatus = await prisma.warehouseDoc.groupBy({ by: ['status'], _count: true });
  console.log('وضعیت سند انبار:', whByStatus.map(s => `${s.status}=${s._count}`).join(' · '));

  // ۳) حجم دیتابیس و وضعیت ایندکس‌ها — Postgres: pg_database_size (بایت)
  const dbSize = await prisma.$queryRawUnsafe<{ n: number }[]>(
    'SELECT pg_database_size(current_database())::BIGINT AS n',
  );
  console.log('حجم دیتابیس:', (Number(dbSize[0].n) / 1024 / 1024).toFixed(1), 'MB');

  // ۴) نامه‌های DRAFT/IN_PROGRESS بدون ارجاع (باید برای IN_PROGRESS صفر باشد؟ فقط اطلاعی)
  const inProgressNoReferral = await prisma.letter.count({
    where: { status: 'IN_PROGRESS', referrals: { none: {} } },
  });
  console.log('نامه در جریان بدون هیچ ارجاع:', fa(inProgressNoReferral), inProgressNoReferral === 0 ? '(✓)' : '(⚠ بررسی شود)');

  // ۵) تناقض موجودی: قلم کالای فعال در سند قطعی ولی ردیف StockItem ندارد
  const danglingStock = await prisma.$queryRawUnsafe<{ n: number }[]>(`
    SELECT COUNT(*) as n FROM DocItem di
    JOIN WarehouseDoc wd ON wd.id = di.docId
    WHERE wd.status = 'POSTED'
      AND NOT EXISTS (SELECT 1 FROM StockItem si WHERE si.productId = di.productId AND si.warehouseId = wd.warehouseId)
  `);
  console.log('قلم قطعی‌شده بدون ردیف موجودی:', fa(Number(danglingStock[0]?.n ?? 0)));

  // ۶) کاربران با عضویت بدون نقش مشخص
  const noRoleMemberships = await prisma.membership.count({ where: { role: { notIn: ['ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'] } } });
  console.log('عضویت با نقش خارج از چهار نقش:', fa(noRoleMemberships));

  // ۷) نشست‌ها با عمر غیرعادی (>۳۰ روز)
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const oldSessions = await prisma.session.count({ where: { createdAt: { lt: monthAgo } } });
  console.log('نشست قدیمی‌تر از ۳۰ روز (نشانه نشت):', fa(oldSessions));

  // ۸) رویدادهای outbox با خطا (payload دارد ولی processedAt خالی و تلاش زیاد)
  const failedOutbox = await prisma.$queryRawUnsafe<{ n: number }[]>(
    'SELECT COUNT(*) as n FROM OutboxEvent WHERE processedAt IS NULL AND attempts > 3',
  );
  console.log('رویداد outbox شکست‌خورده (attempts>3):', fa(Number(failedOutbox[0]?.n ?? 0)));
}

main()
  .catch(e => { console.error('خطا:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
