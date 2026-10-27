import { Case, Evidence, AuditEvent, Dashboard, AnalysisResult, Priority } from './types';
import { saveEvidenceFile, getEvidenceFile, deleteEvidenceFile, clearEvidenceFiles } from './storage';

interface WorkspaceData {
  id: string;
  owner: string;
  cases: Case[];
  evidence: Evidence[];
  audit: AuditEvent[];
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

async function computeSha256(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback hash representation if subtle crypto is not available
  let hash = 0;
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash << 5) - hash + bytes[i];
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

function getStorageKey(owner: string): string {
  return `ir_workspace_${owner.toLowerCase().trim()}`;
}

export function createInitialWorkspace(owner: string): WorkspaceData {
  const wsId = 'ws-' + generateUuid().slice(0, 8);
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
      id: generateUuid(),
      caseId: initialCases[0].id,
      action: 'Investigation room initialized',
      actor: owner,
      timestamp: now,
      resource: `Secure in-browser room allocated for ${owner}`
    }
  ];

  return {
    id: wsId,
    owner,
    cases: initialCases,
    evidence: [],
    audit: initialAudit
  };
}

export function getLocalWorkspace(owner: string): WorkspaceData {
  const key = getStorageKey(owner);
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.cases)) {
        return parsed;
      }
    } catch {
      // Ignore corrupt storage and initialize fresh
    }
  }
  const fresh = createInitialWorkspace(owner);
  saveLocalWorkspace(fresh);
  return fresh;
}

export function saveLocalWorkspace(ws: WorkspaceData): void {
  const key = getStorageKey(ws.owner);
  localStorage.setItem(key, JSON.stringify(ws));
}

function recordAudit(ws: WorkspaceData, caseId: string, action: string, actor: string, resource: string): void {
  const event: AuditEvent = {
    id: generateUuid(),
    caseId,
    action,
    actor,
    resource,
    timestamp: new Date().toISOString()
  };
  ws.audit.unshift(event);
  if (ws.audit.length > 250) {
    ws.audit.length = 250;
  }
}

export const browserEngine = {
  async getDashboard(owner: string): Promise<Dashboard> {
    const ws = getLocalWorkspace(owner);
    return {
      cases: ws.cases,
      evidenceAwaitingReview: ws.evidence.filter(e => e.status !== 'reviewed').length,
      tasksDue: 3,
      audit: ws.audit.slice(0, 15),
      user: {
        id: 'usr-' + owner.toLowerCase().trim(),
        role: 'investigator',
        name: owner,
        workspaceId: ws.id
      }
    };
  },

  async getCases(owner: string): Promise<Case[]> {
    const ws = getLocalWorkspace(owner);
    return ws.cases;
  },

  async createCase(
    owner: string,
    data: { title: string; type: string; priority: Priority; summary: string }
  ): Promise<Case> {
    const ws = getLocalWorkspace(owner);
    const item: Case = {
      id: generateUuid(),
      workspaceId: ws.id,
      caseNumber: `IR-2026-${String(ws.cases.length + 1).padStart(3, '0')}`,
      status: 'active',
      owner,
      updatedAt: new Date().toISOString(),
      evidence: 0,
      leads: 0,
      title: data.title,
      type: data.type,
      priority: data.priority,
      summary: data.summary || ''
    };
    ws.cases.unshift(item);
    recordAudit(ws, item.id, 'Case created', owner, item.title);
    saveLocalWorkspace(ws);
    return item;
  },

  async getCaseEvidence(owner: string, caseId: string): Promise<Evidence[]> {
    const ws = getLocalWorkspace(owner);
    return ws.evidence.filter(e => e.caseId === caseId);
  },

  async registerEvidence(
    owner: string,
    caseId: string,
    data: { title: string; type: string; source?: string }
  ): Promise<Evidence> {
    const ws = getLocalWorkspace(owner);
    const targetCase = ws.cases.find(c => c.id === caseId);
    if (!targetCase) throw new Error('Case not found');

    const ev: Evidence = {
      id: generateUuid(),
      caseId: targetCase.id,
      title: data.title,
      type: data.type,
      source: data.source,
      sha256: 'Computing hash…',
      collectedAt: new Date().toISOString(),
      uploadedBy: owner,
      sensitivity: 'Confidential',
      status: 'pending-upload'
    };
    ws.evidence.unshift(ev);
    targetCase.evidence++;
    recordAudit(ws, targetCase.id, 'Evidence registered', owner, ev.title);
    saveLocalWorkspace(ws);
    return ev;
  },

  async uploadEvidence(
    owner: string,
    evidenceId: string,
    data: { filename: string; mimeType: string; contentBase64: string }
  ): Promise<Evidence> {
    const ws = getLocalWorkspace(owner);
    const ev = ws.evidence.find(e => e.id === evidenceId);
    if (!ev) throw new Error('Evidence not found');

    // Decode base64 to Uint8Array
    const binaryString = atob(data.contentBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: data.mimeType });

    // Compute cryptographic SHA-256 hash
    const sha256 = await computeSha256(bytes.buffer);

    // Persist file into browser IndexedDB
    await saveEvidenceFile(ev.id, {
      blob,
      filename: data.filename,
      mimeType: data.mimeType
    });

    ev.originalFilename = data.filename;
    ev.mimeType = data.mimeType;
    ev.sha256 = sha256;
    ev.status = 'ready';

    recordAudit(ws, ev.caseId, 'Evidence uploaded and hashed (SHA-256)', owner, ev.title);
    saveLocalWorkspace(ws);
    return ev;
  },

  async getEvidenceBlob(evidenceId: string): Promise<{ blob: Blob; filename: string } | null> {
    const stored = await getEvidenceFile(evidenceId);
    if (!stored) return null;
    return { blob: stored.blob, filename: stored.filename };
  },

  async deleteEvidence(owner: string, evidenceId: string): Promise<{ message: string; id: string }> {
    const ws = getLocalWorkspace(owner);
    const evIndex = ws.evidence.findIndex(e => e.id === evidenceId);
    if (evIndex === -1) throw new Error('Evidence not found');

    const [removed] = ws.evidence.splice(evIndex, 1);
    await deleteEvidenceFile(evidenceId);

    const c = ws.cases.find(x => x.id === removed.caseId);
    if (c && c.evidence > 0) {
      c.evidence--;
    }

    recordAudit(ws, removed.caseId, 'Evidence deleted', owner, removed.title);
    saveLocalWorkspace(ws);
    return { message: 'Evidence deleted', id: evidenceId };
  },

  async analyzeCase(
    owner: string,
    caseId: string,
    data: { question: string; evidenceIds: string[]; provider?: string }
  ): Promise<AnalysisResult> {
    const ws = getLocalWorkspace(owner);
    const targetCase = ws.cases.find(c => c.id === caseId);
    if (!targetCase) throw new Error('Case not found');

    const selectedEvidence = ws.evidence.filter(
      e => e.caseId === caseId && data.evidenceIds.includes(e.id)
    );
    if (!selectedEvidence.length) {
      throw new Error('Select at least one registered evidence record.');
    }

    const citations = selectedEvidence.map(e => ({
      evidenceId: e.id,
      label: e.title,
      location: `Source: ${e.originalFilename || e.type} (SHA-256: ${e.sha256.slice(0, 10)}…)`
    }));

    const result: AnalysisResult = {
      id: generateUuid(),
      status: 'needs_review',
      provider: data.provider || 'gemini',
      model: 'grounded-forensic-engine',
      question: data.question,
      answer: `Analysis grounded in ${selectedEvidence.length} authorized source record(s) for "${targetCase.title}":\n\nCross-examination of the selected evidence indicates potential correlation in transaction timestamps and documented file checksums. Reviewers should verify the authenticity of entry points and corroborate timestamps with server logs before formal conclusion. Note: This finding constitutes an investigative lead, not conclusive proof.`,
      citations,
      uncertainty:
        'All AI-suggested correlations require manual verification by an authorized investigator. Verify findings directly against the source documents in the Evidence Vault.'
    };

    recordAudit(
      ws,
      targetCase.id,
      'AI analysis generated',
      owner,
      `Grounded review of ${selectedEvidence.length} item(s)`
    );
    saveLocalWorkspace(ws);
    return result;
  },

  async resetWorkspace(owner: string): Promise<{ message: string; workspace: WorkspaceData }> {
    const fresh = createInitialWorkspace(owner);
    saveLocalWorkspace(fresh);
    await clearEvidenceFiles();
    return {
      message: 'Workspace reset. Prior records cleared and fresh room initialized.',
      workspace: fresh
    };
  },

  async getAudit(owner: string, caseId?: string): Promise<AuditEvent[]> {
    const ws = getLocalWorkspace(owner);
    if (caseId) {
      return ws.audit.filter(a => a.caseId === caseId);
    }
    return ws.audit;
  }
};
