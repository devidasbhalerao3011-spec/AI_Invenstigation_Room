import crypto from 'node:crypto';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { z } from 'zod';

type Role = 'admin' | 'investigator' | 'reviewer' | 'viewer';
type CaseStatus = 'active' | 'review' | 'closed' | 'archived';
type Evidence = { id: string; caseId: string; title: string; type: string; originalFilename?: string; mimeType?: string; sha256: string; collectedAt: string; uploadedBy: string; sensitivity: string; status: string };
type Case = { id: string; workspaceId: string; caseNumber: string; title: string; type: string; status: CaseStatus; priority: 'critical' | 'high' | 'normal' | 'low'; summary: string; owner: string; updatedAt: string; evidence: number; leads: number };
type AuditEvent = { id: string; caseId: string; action: string; actor: string; timestamp: string; resource: string };

interface Workspace {
  id: string;
  owner: string;
  cases: Case[];
  evidence: Evidence[];
  audit: AuditEvent[];
  evidenceFiles: Map<string, { buffer: Buffer; mimeType: string; filename: string }>;
}

const workspaces = new Map<string, Workspace>();

function createFreshWorkspace(owner: string): Workspace {
  const wsId = 'ws-' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const initialCases: Case[] = [
    {
      id: 'case-001',
      workspaceId: wsId,
      caseNumber: 'IR-2026-001',
      title: 'Northstar Vendor Anomaly',
      type: 'Fraud review',
      status: 'active',
      priority: 'high',
      summary: 'Reviewing a cluster of duplicate vendor payments and invoice inconsistencies.',
      owner,
      updatedAt: now,
      evidence: 0,
      leads: 1
    },
    {
      id: 'case-002',
      workspaceId: wsId,
      caseNumber: 'IR-2026-002',
      title: 'Harbor Network Incident',
      type: 'Cyber incident',
      status: 'review',
      priority: 'critical',
      summary: 'Authorized analysis of endpoint logs following unusual outbound traffic.',
      owner,
      updatedAt: now,
      evidence: 0,
      leads: 2
    },
    {
      id: 'case-003',
      workspaceId: wsId,
      caseNumber: 'IR-2026-003',
      title: 'Gallery Inventory Discrepancy',
      type: 'Missing property',
      status: 'active',
      priority: 'normal',
      summary: 'Reconciling inventory records, delivery logs, and access events.',
      owner,
      updatedAt: now,
      evidence: 0,
      leads: 0
    }
  ];

  const initialAudit: AuditEvent[] = [
    {
      id: crypto.randomUUID(),
      caseId: initialCases[0].id,
      action: 'Investigation room initialized',
      actor: owner,
      timestamp: now,
      resource: `Workspace allocated for ${owner}`
    }
  ];

  return {
    id: wsId,
    owner,
    cases: initialCases,
    evidence: [],
    audit: initialAudit,
    evidenceFiles: new Map()
  };
}

function getWorkspaceForActor(req: Request): Workspace {
  const key = (req.actor?.name || 'Investigator').toLowerCase().trim();
  let ws = workspaces.get(key);
  if (!ws) {
    ws = createFreshWorkspace(req.actor?.name || 'Investigator');
    workspaces.set(key, ws);
  }
  return ws;
}

declare global { namespace Express { interface Request { actor?: { id: string; role: Role; workspaceId: string; name: string } } } }
const permissions: Record<Role, string[]> = { admin: ['read', 'write', 'approve'], investigator: ['read', 'write'], reviewer: ['read', 'write', 'approve'], viewer: ['read'] };

function authenticate(req: Request, _res: Response, next: NextFunction) {
  const role = (req.header('x-demo-role') || 'investigator') as Role;
  const suppliedName = (req.header('x-investigator-name') || 'Investigator').trim().replace(/[^a-zA-Z .'-]/g, '').slice(0, 60);
  const name = suppliedName || 'Investigator';
  const key = name.toLowerCase().trim();
  let ws = workspaces.get(key);
  if (!ws) {
    ws = createFreshWorkspace(name);
    workspaces.set(key, ws);
  }
  req.actor = { id: 'usr-' + key, role: permissions[role] ? role : 'viewer', workspaceId: ws.id, name };
  next();
}

function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => permissions[req.actor!.role].includes(permission) ? next() : res.status(403).json({ error: 'Insufficient permission' });
}

function record(ws: Workspace, caseId: string, action: string, actor: string, resource: string) {
  ws.audit.unshift({ id: crypto.randomUUID(), caseId, action, actor, resource, timestamp: new Date().toISOString() });
}

const app = express();
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '15mb' }));
app.use(authenticate);

app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/v1/workspace/reset', requirePermission('write'), (req, res) => {
  const key = req.actor!.name.toLowerCase().trim();
  const ws = createFreshWorkspace(req.actor!.name);
  workspaces.set(key, ws);
  res.json({ message: 'Room reset. Older data erased and new room started.', workspace: ws });
});

app.get('/api/v1/dashboard', requirePermission('read'), (req, res) => {
  const ws = getWorkspaceForActor(req);
  res.json({
    cases: ws.cases,
    evidenceAwaitingReview: ws.evidence.filter(e => e.status !== 'reviewed').length,
    tasksDue: 3,
    audit: ws.audit.slice(0, 10),
    user: req.actor
  });
});

app.get('/api/v1/cases', requirePermission('read'), (req, res) => {
  const ws = getWorkspaceForActor(req);
  res.json(ws.cases);
});

app.post('/api/v1/cases', requirePermission('write'), (req, res) => {
  const ws = getWorkspaceForActor(req);
  const input = z.object({
    title: z.string().min(3).max(160),
    type: z.string().min(2),
    priority: z.enum(['critical', 'high', 'normal', 'low']).default('normal'),
    summary: z.string().max(2000).default('')
  }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid case data', details: input.error.flatten() });
  const item: Case = {
    id: crypto.randomUUID(),
    workspaceId: ws.id,
    caseNumber: `IR-2026-${String(ws.cases.length + 1).padStart(3, '0')}`,
    status: 'active',
    owner: req.actor!.name,
    updatedAt: new Date().toISOString(),
    evidence: 0,
    leads: 0,
    ...input.data
  };
  ws.cases.unshift(item);
  record(ws, item.id, 'Case created', req.actor!.name, item.title);
  res.status(201).json(item);
});

app.get('/api/v1/cases/:caseId', requirePermission('read'), (req, res) => {
  const ws = getWorkspaceForActor(req);
  const item = ws.cases.find(c => c.id === req.params.caseId);
  if (!item) return res.status(404).json({ error: 'Case not found' });
  res.json(item);
});

app.get('/api/v1/cases/:caseId/evidence', requirePermission('read'), (req, res) => {
  const ws = getWorkspaceForActor(req);
  const item = ws.cases.find(c => c.id === req.params.caseId);
  if (!item) return res.status(404).json({ error: 'Case not found' });
  res.json(ws.evidence.filter(e => e.caseId === item.id));
});

app.post('/api/v1/cases/:caseId/evidence/register', requirePermission('write'), (req, res) => {
  const ws = getWorkspaceForActor(req);
  const item = ws.cases.find(c => c.id === req.params.caseId);
  if (!item) return res.status(404).json({ error: 'Case not found' });
  const input = z.object({ title: z.string().min(1), type: z.string().min(1), source: z.string().max(300).optional() }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid evidence data' });
  const ev: Evidence = {
    id: crypto.randomUUID(),
    caseId: item.id,
    title: input.data.title,
    type: input.data.type,
    sha256: 'Pending upload hash',
    collectedAt: new Date().toISOString(),
    uploadedBy: req.actor!.name,
    sensitivity: 'Confidential',
    status: 'pending-upload'
  };
  ws.evidence.unshift(ev);
  item.evidence++;
  record(ws, item.id, 'Evidence registered', req.actor!.name, ev.title);
  res.status(201).json(ev);
});

app.post('/api/v1/evidence/:evidenceId/upload', requirePermission('write'), (req, res) => {
  const ws = getWorkspaceForActor(req);
  const ev = ws.evidence.find(e => e.id === req.params.evidenceId);
  if (!ev) return res.status(404).json({ error: 'Evidence not found' });
  const input = z.object({ filename: z.string().min(1).max(180), mimeType: z.string().min(1).max(100), contentBase64: z.string().min(1) }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid upload payload' });
  const allowed = new Set(['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/json','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword']);
  if (!allowed.has(input.data.mimeType)) return res.status(415).json({ error: 'Unsupported file type. Use PDF, image, TXT, CSV, JSON, DOC, or DOCX.' });
  let buffer: Buffer;
  try { buffer = Buffer.from(input.data.contentBase64, 'base64'); } catch { return res.status(400).json({ error: 'Unable to read the uploaded file.' }); }
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'File must be between 1 byte and 10 MB.' });
  ev.originalFilename = input.data.filename.replace(/[^a-zA-Z0-9._ -]/g, '_');
  ev.mimeType = input.data.mimeType;
  ev.sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  ev.status = 'ready';
  ws.evidenceFiles.set(ev.id, { buffer, mimeType: ev.mimeType, filename: ev.originalFilename });
  record(ws, ev.caseId, 'Evidence uploaded and hashed', req.actor!.name, ev.title);
  res.json(ev);
});

app.get('/api/v1/evidence/:evidenceId/content', requirePermission('read'), (req, res) => {
  const ws = getWorkspaceForActor(req);
  const evidenceId = String(req.params.evidenceId);
  const ev = ws.evidence.find(e => e.id === evidenceId);
  const file = ws.evidenceFiles.get(evidenceId);
  if (!ev || !file) return res.status(404).json({ error: 'Original file is not available in this local session.' });
  record(ws, ev.caseId, 'Evidence viewed', req.actor!.name, ev.title);
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
  res.send(file.buffer);
});

app.delete('/api/v1/evidence/:evidenceId', requirePermission('write'), (req, res) => {
  const ws = getWorkspaceForActor(req);
  const evidenceId = String(req.params.evidenceId);
  const evIndex = ws.evidence.findIndex(e => e.id === evidenceId);
  if (evIndex === -1) return res.status(404).json({ error: 'Evidence not found' });
  const [removed] = ws.evidence.splice(evIndex, 1);
  ws.evidenceFiles.delete(evidenceId);
  const c = ws.cases.find(x => x.id === removed.caseId);
  if (c && c.evidence > 0) c.evidence--;
  record(ws, removed.caseId, 'Evidence deleted', req.actor!.name, removed.title);
  res.json({ message: 'Evidence deleted', id: evidenceId });
});

app.post('/api/v1/cases/:caseId/ai/analyze', requirePermission('write'), (req, res) => {
  const ws = getWorkspaceForActor(req);
  const item = ws.cases.find(c => c.id === req.params.caseId);
  if (!item) return res.status(404).json({ error: 'Case not found' });
  const input = z.object({ question: z.string().min(5).max(1000), evidenceIds: z.array(z.string()).min(1), provider: z.enum(['openai', 'gemini']).default('openai') }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Select evidence and enter a question.' });
  const allowed = ws.evidence.filter(e => e.caseId === item.id && input.data.evidenceIds.includes(e.id));
  if (allowed.length !== input.data.evidenceIds.length) return res.status(403).json({ error: 'Evidence selection is outside this authorized case.' });
  const output = {
    id: crypto.randomUUID(),
    status: 'needs_review',
    provider: input.data.provider,
    model: 'demo-grounded-mode',
    question: input.data.question,
    answer: 'This is a demo grounded response. The selected records may warrant a reviewer checking payment timing and invoice identifiers. This is an investigative lead, not a finding of fact.',
    citations: allowed.map(e => ({ evidenceId: e.id, label: e.title, location: 'Source record — review required' })),
    uncertainty: 'No external AI provider was contacted. Configure the provider adapter and approved RAG pipeline before production use.'
  };
  record(ws, item.id, 'AI analysis requested', req.actor!.name, `${allowed.length} evidence item(s)`);
  res.status(201).json(output);
});

app.get('/api/v1/cases/:caseId/audit', requirePermission('read'), (req, res) => {
  const ws = getWorkspaceForActor(req);
  res.json(ws.audit.filter(a => a.caseId === req.params.caseId));
});

app.get('/api/v1/audit', requirePermission('read'), (req, res) => {
  const ws = getWorkspaceForActor(req);
  res.json(ws.audit);
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.listen(Number(process.env.PORT || 4000), () => console.log('Investigation Room API listening on :4000'));
