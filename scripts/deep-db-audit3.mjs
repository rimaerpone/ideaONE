// -*- coding: utf-8 -*-
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const out = [];
const add = (k, v) => out.push(`${k}: ${v}`);
try {
  // enumها با نام فیلد درست
  const tile = await p.codeScheme.findFirst({ where: { code: 'tile' }, include: { segments: { orderBy: { position: 'asc' }, include: { enumValues: true } } } });
  if (tile) {
    add('TILE', `"${tile.name}" mother=${tile.motherSegments}`);
    for (const s of tile.segments) {
      if (s.enumValues && s.enumValues.length > 0) {
        add(`SEG${s.position}_${s.key}`, s.enumValues.map(v => `${v.code}=${v.label}`).join(','));
      } else {
        add(`SEG${s.position}_${s.key}`, `NO_ENUM (${s.label})`);
      }
    }
  }
  // سایر طرحواره‌ها
  for (const code of ['equipment', 'spare-part', 'raw-material']) {
    const s = await p.codeScheme.findFirst({ where: { code }, include: { segments: true } });
    if (s) add(`SCHEME_${code}`, `${s.name} | seg=${s.segments.length} | mother=${s.motherSegments} | sep="${s.separator}"`);
  }
  // آخرین فعالیت‌ها
  const lastAudit = await p.auditLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true, action: true, entity: true } });
  add('LAST_AUDIT', lastAudit ? `${lastAudit.createdAt?.toISOString()} ${lastAudit.action}/${lastAudit.entity}` : 'NONE');
  const lastLetter = await p.letter.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true, subject: true } });
  add('LAST_LETTER', lastLetter ? `${lastLetter.createdAt?.toISOString()} "${(lastLetter.subject || '').slice(0, 50)}"` : 'NONE');
  const lastAi = await p.aiInvocation.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true, task: true, ok: true, latencyMs: true } });
  add('LAST_AI', lastAi ? `${lastAi.createdAt?.toISOString()} ${lastAi.task} ok=${lastAi.ok} ${lastAi.latencyMs}ms` : 'NONE');
  // کانکتورها
  const conns = await p.integrationConnector.findMany();
  for (const c of conns) add('CONN', `${c.code}|${c.kind}|${c.status}|${c.direction}`);
  // گزارش‌ها
  const reports = await p.reportDefinition.findMany({ orderBy: { code: 'asc' } });
  for (const r of reports) add('REPORT', `${r.code}|${r.moduleCode}|${r.category}|${r.engine}|P:${r.targetPhase}`);
  // کارها
  const jobs = await p.scheduledJob.findMany();
  for (const j of jobs) add('JOB', `${j.key}|${j.intervalSec}s|${j.enabled ? 'ON' : 'OFF'}|last=${j.lastRunAt?.toISOString() || 'never'}|${j.lastStatus || '?'}`);
  // شرکت‌ها
  const companies = await p.company.findMany({ select: { legalName: true, code: true, group: true } });
  add('COMPANIES', companies.map(c => `${c.code}:${c.legalName}${c.group ? '(GROUP)' : ''}`).join(' | '));
  // Outbox
  add('OUTBOX_PENDING', await p.outboxEvent.count({ where: { processedAt: null } }));
  // AI tasks
  const aiByTask = await p.aiInvocation.groupBy({ by: ['task'], _count: true, _avg: { latencyMs: true } });
  for (const t of aiByTask) add('AI_TASK', `${t._count}x ${t.task} avg=${Math.round(t._avg.latencyMs || 0)}ms`);
  const aiOk = await p.aiInvocation.count({ where: { ok: true } });
  add('AI_OK_RATE', `${aiOk}/${await p.aiInvocation.count()}`);
} catch (e) { add('ERROR', String(e).slice(0, 400)); } finally { await p.$disconnect(); }
console.log(out.join('\n'));
