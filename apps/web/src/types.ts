export type Role = 'admin' | 'investigator' | 'reviewer' | 'viewer';
export type CaseStatus = 'active' | 'review' | 'closed' | 'archived';
export type Priority = 'critical' | 'high' | 'normal' | 'low';

export interface Case {
  id: string;
  workspaceId: string;
  caseNumber: string;
  title: string;
  type: string;
  status: CaseStatus;
  priority: Priority;
  summary: string;
  owner: string;
  updatedAt: string;
  evidence: number;
  leads: number;
}

export interface Evidence {
  id: string;
  caseId: string;
  title: string;
  type: string;
  originalFilename?: string;
  mimeType?: string;
  sha256: string;
  collectedAt: string;
  uploadedBy: string;
  sensitivity: string;
  status: string;
  source?: string;
}

export interface AuditEvent {
  id: string;
  caseId: string;
  action: string;
  actor: string;
  timestamp: string;
  resource: string;
}

export interface Dashboard {
  cases: Case[];
  evidenceAwaitingReview: number;
  tasksDue: number;
  audit: AuditEvent[];
  user?: {
    id: string;
    role: Role;
    name: string;
    workspaceId: string;
  };
}

export interface AnalysisCitation {
  evidenceId: string;
  label: string;
  location: string;
}

export interface AnalysisResult {
  id: string;
  status: string;
  provider: string;
  model: string;
  question: string;
  answer: string;
  citations: AnalysisCitation[];
  uncertainty: string;
}

export interface GNode {
  id: string;
  label: string;
  type: string;
}

export interface GEdge {
  id: string;
  from: string;
  to: string;
  relation: string;
}

export interface TEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  description: string;
  category: string;
}

export interface NoteItem {
  id: string;
  text: string;
  type: 'note' | 'task';
  done: boolean;
  assignee: string;
  priority: string;
  createdAt: string;
}

export interface ReportDraft {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface PanelState {
  nodes: GNode[];
  edges: GEdge[];
  events: TEvent[];
  notes: NoteItem[];
  reports: ReportDraft[];
}
