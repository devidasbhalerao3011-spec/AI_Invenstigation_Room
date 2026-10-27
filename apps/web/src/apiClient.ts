import { browserEngine } from './browserEngine';
import { Case, Evidence, AuditEvent, Dashboard, AnalysisResult, Priority } from './types';

const DEFAULT_API_URL = 'http://localhost:4000/api/v1';

export type EngineMode = 'browser' | 'api';

class ApiClient {
  private mode: EngineMode = 'browser';
  private customApiUrl: string = '';
  private initialized: boolean = false;

  constructor() {
    this.customApiUrl = localStorage.getItem('ir_api_url') || '';
    const savedMode = localStorage.getItem('ir_mode') as EngineMode | null;

    // Default determination:
    // If the app is loaded over HTTPS (like GitHub Pages), browser Mixed Content
    // strictly prevents connecting to http://localhost. In that case, default to 'browser'.
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

    if (savedMode) {
      // If user explicitly chose API but is on HTTPS with an HTTP URL, warn/revert
      if (savedMode === 'api' && isHttps && (!this.customApiUrl || this.customApiUrl.startsWith('http://'))) {
        this.mode = 'browser';
      } else {
        this.mode = savedMode;
      }
    } else {
      // Automatic detection: if on HTTPS, use browser engine; if on HTTP localhost, allow trying API
      this.mode = isHttps ? 'browser' : 'browser'; // Start in fast browser mode by default
    }
  }

  public getMode(): EngineMode {
    return this.mode;
  }

  public setMode(m: EngineMode): void {
    this.mode = m;
    localStorage.setItem('ir_mode', m);
  }

  public getApiUrl(): string {
    return this.customApiUrl || DEFAULT_API_URL;
  }

  public setApiUrl(url: string): void {
    this.customApiUrl = url.trim();
    if (this.customApiUrl) {
      localStorage.setItem('ir_api_url', this.customApiUrl);
    } else {
      localStorage.removeItem('ir_api_url');
    }
  }

  public async probeApiServer(): Promise<boolean> {
    const url = this.getApiUrl();
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    if (isHttps && url.startsWith('http://')) {
      return false; // Mixed content will be blocked by browser
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${url}/health`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    }
  }

  public async autoDetectMode(): Promise<EngineMode> {
    if (this.initialized) return this.mode;
    this.initialized = true;

    const savedMode = localStorage.getItem('ir_mode') as EngineMode | null;
    if (savedMode) {
      this.mode = savedMode;
      return this.mode;
    }

    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    if (isHttps) {
      this.mode = 'browser';
      return 'browser';
    }

    const isAvailable = await this.probeApiServer();
    this.mode = isAvailable ? 'api' : 'browser';
    return this.mode;
  }

  private async request(path: string, name: string, init?: RequestInit): Promise<any> {
    const url = `${this.getApiUrl()}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-investigator-name': name,
        ...init?.headers
      }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || `Server returned ${res.status}`);
    }
    return body;
  }

  // Unified Dashboard
  public async getDashboard(name: string): Promise<Dashboard> {
    if (this.mode === 'api') {
      try {
        return await this.request('/dashboard', name);
      } catch (err) {
        console.warn('API error, falling back to Browser Engine:', err);
        this.setMode('browser');
        return browserEngine.getDashboard(name);
      }
    }
    return browserEngine.getDashboard(name);
  }

  // Cases
  public async getCases(name: string): Promise<Case[]> {
    if (this.mode === 'api') {
      try {
        return await this.request('/cases', name);
      } catch (err) {
        this.setMode('browser');
        return browserEngine.getCases(name);
      }
    }
    return browserEngine.getCases(name);
  }

  public async createCase(
    name: string,
    data: { title: string; type: string; priority: Priority; summary: string }
  ): Promise<Case> {
    if (this.mode === 'api') {
      try {
        return await this.request('/cases', name, {
          method: 'POST',
          body: JSON.stringify(data)
        });
      } catch (err) {
        this.setMode('browser');
        return browserEngine.createCase(name, data);
      }
    }
    return browserEngine.createCase(name, data);
  }

  // Evidence
  public async getCaseEvidence(name: string, caseId: string): Promise<Evidence[]> {
    if (this.mode === 'api') {
      try {
        return await this.request(`/cases/${caseId}/evidence`, name);
      } catch (err) {
        this.setMode('browser');
        return browserEngine.getCaseEvidence(name, caseId);
      }
    }
    return browserEngine.getCaseEvidence(name, caseId);
  }

  public async registerEvidence(
    name: string,
    caseId: string,
    data: { title: string; type: string; source?: string }
  ): Promise<Evidence> {
    if (this.mode === 'api') {
      try {
        return await this.request(`/cases/${caseId}/evidence/register`, name, {
          method: 'POST',
          body: JSON.stringify(data)
        });
      } catch (err) {
        this.setMode('browser');
        return browserEngine.registerEvidence(name, caseId, data);
      }
    }
    return browserEngine.registerEvidence(name, caseId, data);
  }

  public async uploadEvidence(
    name: string,
    evidenceId: string,
    data: { filename: string; mimeType: string; contentBase64: string }
  ): Promise<Evidence> {
    if (this.mode === 'api') {
      try {
        return await this.request(`/evidence/${evidenceId}/upload`, name, {
          method: 'POST',
          body: JSON.stringify(data)
        });
      } catch (err) {
        this.setMode('browser');
        return browserEngine.uploadEvidence(name, evidenceId, data);
      }
    }
    return browserEngine.uploadEvidence(name, evidenceId, data);
  }

  public async previewEvidence(name: string, item: Evidence): Promise<void> {
    if (this.mode === 'api') {
      try {
        const response = await fetch(`${this.getApiUrl()}/evidence/${item.id}/content`, {
          headers: { 'x-investigator-name': name }
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to download evidence file.');
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        return;
      } catch (err: any) {
        // Fall back to trying local browser engine storage
        console.warn('API file preview failed, checking local browser storage:', err);
      }
    }

    const stored = await browserEngine.getEvidenceBlob(item.id);
    if (!stored) {
      throw new Error(`Original file for "${item.title}" is not available in local storage.`);
    }
    const url = URL.createObjectURL(stored.blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  public async deleteEvidence(name: string, evidenceId: string): Promise<void> {
    if (this.mode === 'api') {
      try {
        await this.request(`/evidence/${evidenceId}`, name, { method: 'DELETE' });
        return;
      } catch (err) {
        this.setMode('browser');
        await browserEngine.deleteEvidence(name, evidenceId);
        return;
      }
    }
    await browserEngine.deleteEvidence(name, evidenceId);
  }

  // AI Analysis
  public async analyzeCase(
    name: string,
    caseId: string,
    data: { question: string; evidenceIds: string[]; provider?: string }
  ): Promise<AnalysisResult> {
    if (this.mode === 'api') {
      try {
        return await this.request(`/cases/${caseId}/ai/analyze`, name, {
          method: 'POST',
          body: JSON.stringify(data)
        });
      } catch (err) {
        this.setMode('browser');
        return browserEngine.analyzeCase(name, caseId, data);
      }
    }
    return browserEngine.analyzeCase(name, caseId, data);
  }

  // Workspace Reset
  public async resetRoom(name: string): Promise<void> {
    if (this.mode === 'api') {
      try {
        await this.request('/workspace/reset', name, { method: 'POST' });
        return;
      } catch (err) {
        this.setMode('browser');
        await browserEngine.resetWorkspace(name);
        return;
      }
    }
    await browserEngine.resetWorkspace(name);
  }

  // Audit
  public async getAudit(name: string, caseId?: string): Promise<AuditEvent[]> {
    if (this.mode === 'api') {
      try {
        const path = caseId ? `/cases/${caseId}/audit` : '/audit';
        return await this.request(path, name);
      } catch (err) {
        this.setMode('browser');
        return browserEngine.getAudit(name, caseId);
      }
    }
    return browserEngine.getAudit(name, caseId);
  }
}

export const client = new ApiClient();
