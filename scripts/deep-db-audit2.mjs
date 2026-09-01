// -*- coding: utf-8 -*-
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const out = [];
const add = (k, v) => out.push(`${k}: ${v}`);

try {
  // ۱. رجیستری کامل با نام و فاز
  const mods = await p.platformModule.findMany({ orderBy: [{ layer: 'asc' }, { code: 'asc' }], select: { code: true, name: true, layer: true, targetPhase: true, status: true } });
  for (const m of mods) add(`MOD ${m.layer}|${m.code}|${m.name}|P:${m.targetPhase}|${m.status}`);

  // ۲. طرحواره کدگذاری tile — جزئیات اجزای ۱۶گانه
  const tile = await p.codeScheme.findFirst({ where: { code: 'tile' }, include: { segments: { orderBy: { position: 'asc' } } } });
  if (tile) {
    add('TILE_SCHEME', `name="${tile.name}" mother=${tile.motherSegments} sep="${tile.separator}"`);
    add('TILE_SEGMENTS', tile.segments.map(s => `${s.position}.${s.key}(${s.label})`).join(' | '));
    // بررسی: آیا ۱۶ جزء سند docx دقیقاً همان است؟
    const docx16 = ['نوع لعاب','ضخامت','سایز','واحد تولید','کد طرح','رنگ','کنتراست','طیف','شید','درجه','کلاس سایز','نوع قالب','گروه جذب آب','نوع پرداخت','تیپ بسته بندی','برند'];
    const labels = tile.segments.map(s => s.label);
    const mismatches = [];
    for (const d of docx16) if (!labels.includes(d)) mismatches.push(`MISSING_LABEL:${d}`);
    add('DOCX16_LABEL_MATCH', mismatches.length ? mismatches.join(',') : 'ALL_16_MATCH');
    // enum values برای چند جزء کلیدی
    const glaze = tile.segments.find(s => s.key === 'glaze');
    if (glaze) {
      const vals = await p.codeEnumValue.findMany({ where: { segmentId: glaze.id } });
      add('GLAZE_ENUMS', vals.map(v => `${v.value}=${v.label}`).join(','));
    }
    const size = tile.segments.find(s => s.key === 'size');
    if (size) {
      const vals = await p.codeEnumValue.findMany({ where: { segmentId: size.id } });
      add('SIZE_ENUMS', vals.map(v => `${v.value}=${v.label}`).join(','));
    }
    const brand = tile.segments.find(s => s.key === 'brand');
    if (brand) {
      const vals = await p.codeEnumValue.findMany({ where: { segmentId: brand.id } });
      add('BRAND_ENUMS', vals.map(v => `${v.value}=${v.label}`).join(','));
    }
  }

  // ۳. اعلان خوانده‌نشده + آخرین فعالیت
  const unread = await p.notification.count({ where: { isRead: false } });
  add('UNREAD_NOTIF', unread);
  const lastAudit = await p.auditLog.findFirst({ orderBy: { at: 'desc' }, select: { at: true, action: true } });
  add('LAST_AUDIT', lastAudit ? `${lastAudit.at?.toISOString()} ${lastAudit.action}` : 'NONE');
  const lastLetter = await p.letter.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true, subject: true } });
  add('LAST_LETTER', lastLetter ? `${lastLetter.createdAt?.toISOString()} "${(lastLetter.subject || '').slice(0, 40)}"` : 'NONE');

  // ۴. کانکتورها
  const conns = await p.integrationConnector.findMany();
  for (const c of conns) add('CONN', `${c.code}|${c.name}|${c.kind}|${c.status}|${c.direction}`);

  // ۵. گزارش‌ها
  const reports = await p.reportDefinition.findMany();
  add('REPORTS', reports.map(r => `${r.code}(${r.targetPhase},${r.engine})`).join(', '));

  // ۶. کارهای زمان‌بندی
  const jobs = await p.scheduledJob.findMany();
  for (const j of jobs) add('JOB', `${j.key}|every=${j.intervalSec}s|${j.enabled ? 'ON' : 'OFF'}|last=${j.lastRunAt?.toISOString() || 'never'}|${j.lastStatus || ''}`);

  // ۷. شرکت‌ها
  const companies = await p.company.findMany({ select: { legalName: true, code: true, group: true } });
  add('COMPANIES', companies.map(c => `${c.code}:${c.legalName}${c.group ? '(GROUP)' : ''}`).join(' | '));

  // ۸. سلامت Outbox — رویدادهای پردازش‌نشده
  const outboxPending = await p.outboxEvent.count({ where: { processedAt: null } });
  add('OUTBOX_PENDING', outboxPending);

  // ۹. AI — تکالیف واقعی اجراشده
  const aiByTask = await p.aiInvocation.groupBy({ by: ['task'], _count: true, _avg: { latencyMs: true } });
  for (const t of aiByTask) add('AI_TASK', `${t._count}x ${t.task} avg=${Math.round(t._avg.latencyMs || 0)}ms`);
  const aiOk = await p.aiInvocation.count({ where: { ok: true } });
  add('AI_OK_RATE', `${aiOk}/${await p.aiInvocation.count()}`);
} catch (e) {
  add('ERROR', String(e).slice(0, 300));
} finally { await p.$disconnect(); }
console.log(out.join('\n'));
