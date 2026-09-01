// -*- coding: utf-8 -*-
// بررسی عمیق وضعیت واقعی دیتابیس زنده Neon
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const out = [];
const add = (k, v) => out.push(`${k}: ${v}`);

try {
  // ۱. ماژول‌ها: جزئیات کامل رجیستری
  const mods = await p.platformModule.findMany({ orderBy: [{ layer: 'asc' }, { code: 'asc' }] });
  add('MODULES_TOTAL', mods.length);
  const byLayer = {};
  for (const m of mods) byLayer[m.layer] = (byLayer[m.layer] || 0) + 1;
  add('BY_LAYER', JSON.stringify(byLayer));
  const active = mods.filter(m => m.status === 'ACTIVE').map(m => m.code);
  add('ACTIVE_CODES', active.join(','));
  const inactive = mods.filter(m => m.status !== 'ACTIVE').map(m => m.code);
  add('INACTIVE_COUNT', inactive.length);
  add('INACTIVE_CODES', inactive.join(','));

  // ۲. کدهای رجیستری در برابر فهرست مصوب ۳۳ ماژولی
  const approved33 = ['users','access-control','audit-log','notification-center','workflow-engine',
    'finance-ledger','finance-treasury','finance-costing','finance-asset','tax-management',
    'sales-orders','sales-crm','sales-distribution','after-sales',
    'purchase-orders','purchase-vendors',
    'warehouse-inventory','warehouse-spare-parts','weighbridge',
    'production-mrp','production-oee','production-maintenance',
    'quality-lab','quality-control',
    'hr-personnel','hr-attendance','hr-payroll',
    'bi-reporting','integration-moadian','portal-customer',
    'office-automation','legal-affairs','knowledge-base'];
  const registryCodes = new Set(mods.map(m => m.code));
  const missing = approved33.filter(c => !registryCodes.has(c));
  add('APPROVED33_MISSING_IN_REGISTRY', missing.join(',') || 'NONE');
  const extraInRegistry = mods.filter(m => !approved33.includes(m.code) && !['dashboard','platform'].includes(m.code));
  add('REGISTRY_EXTRA_NOT_IN_APPROVED33', extraInRegistry.map(m=>`${m.code}(${m.status})`).join(',') || 'NONE');

  // ۳. انبارها: kind واقعی
  const whKinds = await p.warehouse.groupBy({ by: ['kind'], _count: true });
  add('WAREHOUSE_KINDS', JSON.stringify(whKinds.map(w => `${w.kind}:${w._count}`)));

  // ۴. طرحواره‌های کدگذاری
  const schemes = await p.codeScheme.findMany({ include: { segments: { orderBy: { position: 'asc' } } } });
  for (const s of schemes) {
    add(`SCHEME_${s.code}`, `seg=${s.segments.length} len=${s.totalLength ?? '?'} name=${s.nameFa}`);
  }

  // ۵. داده‌های کسب‌وکار
  const counts = {};
  for (const [name, model] of Object.entries({ letters: p.letter, partners: p.partner, products: p.product, users: p.user, companies: p.company, whdocs: p.warehouseDoc, requests: p.goodsRequest, notifications: p.notification, audit: p.auditLog, attachments: p.attachment, scheduledJobs: p.scheduledJob, aiInvocations: p.aiInvocation, featureFlags: p.featureFlag, outbox: p.outboxEvent, letterReferrals: p.letterReferral, stockItems: p.stockItem, docItems: p.docItem, integrationConnectors: p.integrationConnector, reportDefinitions: p.reportDefinition })) {
    counts[name] = await model.count();
  }
  add('ROW_COUNTS', JSON.stringify(counts));

  // ۶. پرچم‌های ویژگی
  const flags = await p.featureFlag.findMany();
  add('FEATURE_FLAGS', flags.map(f => `${f.key}=${f.enabled}`).join(', '));

  // ۷. کارهای زمان‌بندی‌شده
  const jobs = await p.scheduledJob.findMany();
  add('SCHEDULED_JOBS', jobs.map(j => `${j.key}(${j.intervalMinutes}m,${j.enabled ? 'on' : 'off'})`).join(', '));

  // ۸. وضعیت نامه‌ها (توزیع status)
  const letterStatus = await p.letter.groupBy({ by: ['status'], _count: true });
  add('LETTER_STATUS_DIST', JSON.stringify(letterStatus.map(s => `${s.status}:${s._count}`)));
  const letterTypes = await p.letter.groupBy({ by: ['type'], _count: true });
  add('LETTER_TYPE_DIST', JSON.stringify(letterTypes.map(s => `${s.type}:${s._count}`)));

  // ۹. سشن‌های فعال / اعلان‌های خوانده‌نشده
  const sessions = await p.session.count();
  add('SESSIONS', sessions);
  const unreadNotif = await p.notification.count({ where: { readAt: null } });
  add('UNREAD_NOTIFICATIONS', unreadNotif);

  // ۱۰. آخرین رخداد حسابرسی — زمان‌بندی واقعی فعالیت
  const lastAudit = await p.auditLog.findFirst({ orderBy: { at: 'desc' }, select: { at: true, action: true } });
  add('LAST_AUDIT', lastAudit ? `${lastAudit.at?.toISOString()} ${lastAudit.action}` : 'NONE');
  const lastLetter = await p.letter.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  add('LAST_LETTER_CREATED', lastLetter?.createdAt?.toISOString() || 'NONE');

  // ۱۱. اتصالات یکپارچه‌سازی
  const conns = await p.integrationConnector.findMany();
  add('CONNECTORS', conns.map(c => `${c.kind}(${c.status})`).join(', ') || 'NONE');
} catch (e) {
  add('ERROR', e.message);
} finally {
  await p.$disconnect();
}
console.log(out.join('\n'));
