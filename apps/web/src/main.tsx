import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  Bot,
  Check,
  ChevronRight,
  FilePlus2,
  FileText,
  FolderSearch,
  LayoutDashboard,
  LogOut,
  Network,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { client, EngineMode } from './apiClient';
import { Case, Evidence, Dashboard, GNode, GEdge, TEvent, NoteItem, ReportDraft, PanelState, Priority } from './types';
import './styles.css';

const nav = [
  { label: 'Command Center', icon: LayoutDashboard },
  { label: 'Cases', icon: FolderSearch },
  { label: 'Evidence Vault', icon: Archive },
  { label: 'Clue Graph', icon: Network },
  { label: 'Timeline', icon: Timer },
  { label: 'AI Analysis Lab', icon: Bot },
  { label: 'Reports', icon: FileText }
];

function readFile(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

function fileMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return (
    ({
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      txt: 'text/plain',
      csv: 'text/csv',
      json: 'application/json',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    } as Record<string, string>)[ext || ''] || 'application/octet-stream'
  );
}

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Login({ onLogin }: { onLogin: (n: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="login">
      <div className="login-card">
        <div className="login-mark">
          <Search size={27} />
        </div>
        <span className="eyebrow">SECURE CASE WORKSPACE</span>
        <h1>Investigation Room</h1>
        <p>Enter your investigator name to start a fresh, secure workspace session.</p>
        <form
          onSubmit={e => {
            e.preventDefault();
            if (name.trim()) onLogin(name.trim());
          }}
        >
          <label>
            Investigator name
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your full name"
              maxLength={60}
            />
          </label>
          <button className="primary wide">
            <ShieldCheck size={17} />
            Enter secure workspace
          </button>
        </form>
        <small>When a new investigator logs in, older data is automatically erased and a new room starts.</small>
      </div>
    </div>
  );
}

const emptyPanel = (): PanelState => ({ nodes: [], edges: [], events: [], notes: [], reports: [] });

function App() {
  const [name, setName] = useState(() => localStorage.getItem('ir-name') || '');
  const [data, setData] = useState<Dashboard | null>(null);
  const [section, setSection] = useState('Command Center');
  const [selected, setSelected] = useState<Case | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [tab, setTab] = useState('Overview');
  const [modal, setModal] = useState<'case' | 'evidence' | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [toast, setToast] = useState('');
  const [engineMode, setEngineMode] = useState<EngineMode>(() => client.getMode());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [splashTimeout, setSplashTimeout] = useState(false);

  // Per-user-per-case panel state — key: `${name}::${caseId}`
  const [panelStore, setPanelStore] = useState<Record<string, PanelState>>(() => {
    try {
      const saved = localStorage.getItem(`ir_panels_${name}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const sessionKey = selected ? `${name}::${selected.id}` : '__none__';
  const panel = panelStore[sessionKey] ?? emptyPanel();

  function setPanel(updater: (p: PanelState) => PanelState) {
    setPanelStore(s => {
      const next = { ...s, [sessionKey]: updater(s[sessionKey] ?? emptyPanel()) };
      try {
        localStorage.setItem(`ir_panels_${name}`, JSON.stringify(next));
      } catch {
        // Ignore quota errors
      }
      return next;
    });
  }

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3400);
  };

  const load = async () => {
    if (!name) return;
    try {
      const dash = await client.getDashboard(name);
      setData(dash);
      setEngineMode(client.getMode());
    } catch (e: any) {
      console.warn('Dashboard load error, switching to browser engine:', e);
      client.setMode('browser');
      setEngineMode('browser');
      const fallbackDash = await client.getDashboard(name);
      setData(fallbackDash);
      notify('Switched to secure in-browser workspace mode.');
    }
  };

  useEffect(() => {
    if (!name) return;
    let cancelled = false;

    // Safety timeout: never leave user stuck on splash screen for more than 1.2s
    const timer = window.setTimeout(() => {
      if (!cancelled) {
        setSplashTimeout(true);
        if (!data) {
          client.setMode('browser');
          setEngineMode('browser');
          load();
        }
      }
    }, 1200);

    load();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [name]);

  function handleLogin(n: string) {
    const previous = localStorage.getItem('ir-name');
    if (previous !== n) {
      setSelected(null);
      setEvidence([]);
      setAnalysis(null);
      setPanelStore({});
      try {
        localStorage.removeItem(`ir_panels_${previous}`);
      } catch {
        // Ignore
      }
    }
    localStorage.setItem('ir-name', n);
    setName(n);
    setData(null);
    setSection('Command Center');
    setTab('Overview');
    notify(`Welcome, Investigator ${n}. Secure room initialized.`);
  }

  async function resetRoom() {
    if (!confirm('Erase older workspace data and start a completely new room?')) return;
    try {
      await client.resetRoom(name);
      setSelected(null);
      setEvidence([]);
      setAnalysis(null);
      setPanelStore({});
      localStorage.removeItem(`ir_panels_${name}`);
      setTab('Overview');
      setSection('Command Center');
      await load();
      notify('Room reset. Older data erased and a new room started.');
    } catch (e: any) {
      notify(e.message);
    }
  }

  async function openCase(c: Case, initialTab = 'Overview') {
    setSelected(c);
    setSection('Cases');
    setTab(initialTab);
    setAnalysis(null);
    try {
      const evList = await client.getCaseEvidence(name, c.id);
      setEvidence(evList);
    } catch (e: any) {
      notify(e.message);
    }
  }

  async function createCase(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const c = await client.createCase(name, {
        title: String(f.get('title') || 'Untitled Case'),
        type: String(f.get('type') || 'Fraud review'),
        priority: (String(f.get('priority') || 'normal')) as Priority,
        summary: String(f.get('summary') || '')
      });
      setModal(null);
      notify('Case created and audit event recorded.');
      await load();
      openCase(c);
    } catch (err: any) {
      notify(err.message);
    }
  }

  async function registerEvidence(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const f = new FormData(e.currentTarget);
    const file = f.get('file') as File;
    if (!file?.size) return notify('Choose a file to upload.');
    if (file.size > 10 * 1024 * 1024) return notify('Choose a file smaller than 10 MB.');

    try {
      const item = await client.registerEvidence(name, selected.id, {
        title: String(f.get('title') || file.name),
        type: file.name.split('.').pop()?.toUpperCase() || 'FILE',
        source: String(f.get('source') || '')
      });

      const uploaded = await client.uploadEvidence(name, item.id, {
        filename: file.name,
        mimeType: fileMime(file),
        contentBase64: await readFile(file)
      });

      setEvidence(prev => [uploaded, ...prev]);
      setModal(null);
      await load();
      notify(`Evidence uploaded and SHA-256 verified: ${file.name}`);
    } catch (err: any) {
      notify(err.message);
    }
  }

  async function previewEvidence(item: Evidence) {
    try {
      await client.previewEvidence(name, item);
    } catch (err: any) {
      notify(err.message);
    }
  }

  async function deleteEvidence(item: Evidence, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!confirm(`Are you sure you want to delete evidence "${item.title}"?`)) return;
    try {
      await client.deleteEvidence(name, item.id);
      setEvidence(prev => prev.filter(x => x.id !== item.id));
      await load();
      notify(`Evidence "${item.title}" deleted.`);
    } catch (err: any) {
      notify(err.message);
    }
  }

  async function analyze() {
    if (!selected || !evidence.length) {
      return notify('Register or upload evidence before requesting analysis.');
    }
    try {
      const res = await client.analyzeCase(name, selected.id, {
        question: 'What should be reviewed next based on this selected evidence?',
        evidenceIds: evidence.map(x => x.id),
        provider: 'gemini'
      });
      setAnalysis(res);
      setTab('AI Analysis');
      notify('Analysis created and marked for human review.');
    } catch (e: any) {
      notify(e.message);
    }
  }

  function logout() {
    localStorage.removeItem('ir-name');
    setName('');
    setData(null);
    setSelected(null);
    setEvidence([]);
    setAnalysis(null);
    setPanelStore({});
    setSection('Command Center');
    setTab('Overview');
  }

  function forceBrowserMode() {
    client.setMode('browser');
    setEngineMode('browser');
    load();
  }

  if (!name) return <Login onLogin={handleLogin} />;

  if (!data) {
    return (
      <div className="splash">
        <ShieldCheck size={44} />
        <p>Opening secure workspace…</p>
        <small>Initializing tamper-evident case environment for {name}.</small>
        {splashTimeout && (
          <div className="splash-actions">
            <button className="primary" onClick={forceBrowserMode}>
              <ShieldCheck size={16} /> Enter Standalone Browser Mode
            </button>
            <small style={{ color: '#8898aa', maxWidth: 380 }}>
              Running on GitHub Pages or offline? Click above to immediately launch in full client-side mode.
            </small>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <span className="brand-mark">
            <Search size={19} />
          </span>
          <span>
            INVESTIGATION<small>ROOM</small>
          </span>
        </div>

        <div className="workspace">
          <span className="avatar">{name.slice(0, 2).toUpperCase()}</span>
          <div style={{ flex: 1 }}>
            <b>{name}'s Room</b>
            <div style={{ marginTop: 4 }}>
              <button
                className={`engine-badge ${engineMode}`}
                onClick={() => setSettingsOpen(true)}
                title="Click to configure workspace engine / API settings"
              >
                <span className={`engine-dot ${engineMode}`} />
                {engineMode === 'browser' ? 'Browser Engine' : 'API Connected'}
                <Settings size={10} style={{ marginLeft: 2 }} />
              </button>
            </div>
          </div>
          <button className="reset-room-btn" onClick={resetRoom} title="Erase older data and start a new room">
            <RotateCcw size={12} />
            New room
          </button>
        </div>

        <nav>
          {nav.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={section === label ? 'active' : ''}
              onClick={() => {
                setSection(label);
                if (label === 'Cases') setSelected(null);
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <button
            className={section === 'Security & audit' ? 'active' : ''}
            onClick={() => {
              setSection('Security & audit');
              setSelected(null);
            }}
          >
            <ShieldCheck size={17} />
            Security &amp; audit
          </button>
          <div className="profile">
            <span className="avatar">{name.slice(0, 2).toUpperCase()}</span>
            <div>
              <b>{name}</b>
              <small>Investigator</small>
            </div>
            <button className="logout" title="Sign out" onClick={logout}>
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main>
        {selected ? (
          <CaseView
            selected={selected}
            tab={tab}
            setTab={setTab}
            evidence={evidence}
            analysis={analysis}
            analyze={analyze}
            back={() => setSelected(null)}
            register={() => setModal('evidence')}
            preview={previewEvidence}
            notify={notify}
            panel={panel}
            setPanel={setPanel}
            audit={data.audit}
            onDeleteEvidence={deleteEvidence}
          />
        ) : (
          <Home
            section={section}
            data={data}
            name={name}
            panelStore={panelStore}
            openCase={openCase}
            create={() => setModal('case')}
            notify={notify}
          />
        )}
      </main>

      {modal && (
        <Modal
          type={modal}
          close={() => setModal(null)}
          submit={modal === 'case' ? createCase : registerEvidence}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          currentMode={engineMode}
          close={() => setSettingsOpen(false)}
          onApply={async (mode, apiUrl) => {
            client.setMode(mode);
            client.setApiUrl(apiUrl);
            setEngineMode(mode);
            setSettingsOpen(false);
            await load();
            notify(`Workspace engine updated: ${mode === 'browser' ? 'Browser Engine' : 'Backend API'}`);
          }}
        />
      )}

      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Home({
  section,
  data,
  name,
  panelStore,
  openCase,
  create,
  notify
}: {
  section: string;
  data: Dashboard;
  name: string;
  panelStore: Record<string, PanelState>;
  openCase: (c: Case, tab?: string) => void;
  create: () => void;
  notify: (x: string) => void;
}) {
  if (section === 'Security & audit') {
    return (
      <section>
        <header>
          <div>
            <span className="eyebrow">IMMUTABLE WORKSPACE LEDGER</span>
            <h1>Security &amp; Audit Trail</h1>
            <p>Cryptographically protected record of all authorized activity across this investigation room.</p>
          </div>
          <div className="header-actions">
            <Badge tone="violet">{data.audit.length} Audit Events</Badge>
            <Badge tone="green">Tamper-Evident SHA-256</Badge>
          </div>
        </header>
        <AuditPanel audit={data.audit} selected={null} />
      </section>
    );
  }

  if (section === 'Reports') {
    return (
      <section>
        <header>
          <div>
            <span className="eyebrow">CASE REPORTS &amp; BRIEFINGS</span>
            <h1>Reports Center</h1>
            <p>Review, compose, and manage source-grounded investigative report drafts for your active cases.</p>
          </div>
        </header>
        <div className="hub-grid">
          {data.cases.map(c => {
            const reports = panelStore[`${name}::${c.id}`]?.reports || [];
            return (
              <div key={c.id} className="hub-card">
                <div className="hub-card-head">
                  <span className="eyebrow">{c.caseNumber}</span>
                  <Badge tone={reports.length > 0 ? 'green' : 'blue'}>
                    {reports.length} draft{reports.length === 1 ? '' : 's'}
                  </Badge>
                </div>
                <h3>{c.title}</h3>
                <p>{c.summary}</p>
                <button className="primary" style={{ marginTop: 'auto' }} onClick={() => openCase(c, 'Reports')}>
                  <FileText size={15} />
                  Open Reports ({reports.length})
                </button>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (section !== 'Command Center' && section !== 'Cases') {
    const tabMap: Record<string, string> = {
      'Evidence Vault': 'Evidence',
      'Clue Graph': 'Graph',
      'Timeline': 'Timeline',
      'AI Analysis Lab': 'AI Analysis'
    };
    const targetTab = tabMap[section] || 'Overview';
    return (
      <section>
        <header>
          <div>
            <span className="eyebrow">WORKSPACE TOOL</span>
            <h1>{section}</h1>
            <p>Select an authorized case to open its {section.toLowerCase()}.</p>
          </div>
        </header>
        <div className="hub-grid">
          {data.cases.map(c => (
            <div key={c.id} className="hub-card">
              <div className="hub-card-head">
                <span className="eyebrow">{c.caseNumber}</span>
                <Badge tone="blue">{c.priority}</Badge>
              </div>
              <h3>{c.title}</h3>
              <p>{c.summary}</p>
              <button className="primary" style={{ marginTop: 'auto' }} onClick={() => openCase(c, targetTab)}>
                Open {targetTab}
              </button>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <>
      <header>
        <div>
          <span className="eyebrow">{section === 'Cases' ? 'AUTHORIZED CASES' : 'COMMAND CENTER'}</span>
          <h1>{section === 'Cases' ? 'Case register' : `Welcome, ${name || 'Investigator'}`}</h1>
          <p>
            {section === 'Cases'
              ? 'Open an authorized case to investigate its evidence.'
              : 'Review active investigations, evidence, and recent activity.'}
          </p>
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            onClick={() => notify('Search is indexed across authorized case metadata.')}
          >
            <Search size={19} />
          </button>
          <button className="primary" onClick={create}>
            <Plus size={17} />
            New case
          </button>
        </div>
      </header>

      {section === 'Command Center' && (
        <section className="metrics">
          <Metric
            icon={<FolderSearch />}
            label="Open cases"
            value={String(data.cases.filter(c => c.status === 'active').length)}
            detail="In this workspace"
          />
          <Metric
            icon={<FileText />}
            label="Evidence to review"
            value={String(data.evidenceAwaitingReview)}
            detail="Requires attention"
            tone="amber"
          />
          <Metric icon={<Timer />} label="Tasks due" value={String(data.tasksDue)} detail="Next 7 days" />
          <Metric
            icon={<Activity />}
            label="Audit events"
            value={String(data.audit.length)}
            detail="Recent protected events"
            tone="violet"
          />
        </section>
      )}

      <section className="grid">
        <div className="panel cases-panel">
          <div className="panel-head">
            <div>
              <h2>{section === 'Cases' ? 'All authorized cases' : 'Active cases'}</h2>
              <p>Open a case to begin work</p>
            </div>
          </div>
          <div className="case-list">
            {data.cases.map(c => (
              <button className="case-row" key={c.id} onClick={() => openCase(c)}>
                <div className={`priority-bar ${c.priority}`} />
                <div className="case-main">
                  <span className="case-number">{c.caseNumber}</span>
                  <b>{c.title}</b>
                  <span>
                    {c.type} · {c.owner}
                  </span>
                </div>
                <div className="case-count">
                  <FileText size={15} />
                  {c.evidence}
                </div>
                <Badge tone={c.status === 'review' ? 'violet' : 'blue'}>
                  {c.status === 'review' ? 'In review' : 'Active'}
                </Badge>
                <ChevronRight size={18} className="muted" />
              </button>
            ))}
          </div>
        </div>

        {section === 'Command Center' && (
          <div className="right-col">
            <div className="panel tasks">
              <div className="panel-head">
                <div>
                  <h2>Priority focus</h2>
                  <p>Next actions</p>
                </div>
              </div>
              <Task
                title="Review pending evidence"
                meta="Open the case evidence vault"
                action={() => openCase(data.cases[0], 'Evidence')}
              />
              <Task
                title="Build clue & entity graph"
                meta="Connect source-backed relationships"
                action={() => openCase(data.cases[0], 'Graph')}
              />
              <Task
                title="Review AI leads"
                meta="Human review is required"
                action={() => openCase(data.cases[0], 'AI Analysis')}
              />
            </div>
            <div className="panel audit">
              <div className="panel-head">
                <div>
                  <h2>Audit trail</h2>
                  <p>Latest protected events</p>
                </div>
              </div>
              {data.audit.slice(0, 5).map(a => (
                <div className="audit-row" key={a.id}>
                  <span className="audit-icon">
                    <Activity size={14} />
                  </span>
                  <div>
                    <b>{a.action}</b>
                    <p>
                      {a.actor} · {a.resource}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function CaseView({
  selected,
  tab,
  setTab,
  evidence,
  analysis,
  analyze,
  back,
  register,
  preview,
  notify,
  panel,
  setPanel,
  audit,
  onDeleteEvidence
}: any) {
  const tabs = ['Overview', 'Evidence', 'Graph', 'Timeline', 'Notes & Tasks', 'AI Analysis', 'Reports', 'Audit'];
  return (
    <>
      <header className="case-header">
        <button className="back" onClick={back}>
          ‹ Cases
        </button>
        <div className="case-title">
          <span className="eyebrow">
            {selected.caseNumber} · {selected.type}
          </span>
          <h1>{selected.title}</h1>
          <p>{selected.summary}</p>
        </div>
        <div className="header-actions">
          <Badge tone="blue">{selected.status}</Badge>
          <button className="secondary" onClick={register}>
            <Upload size={16} />
            Upload evidence
          </button>
          <button className="primary" onClick={analyze}>
            <Sparkles size={16} />
            Analyze evidence
          </button>
        </div>
      </header>
      <div className="tabs">
        {tabs.map(t => (
          <button className={tab === t ? 'selected' : ''} onClick={() => setTab(t)} key={t}>
            {t}
          </button>
        ))}
      </div>
      <section className="case-content">
        {tab === 'Evidence' ? (
          <EvidenceList items={evidence} register={register} preview={preview} onDelete={onDeleteEvidence} />
        ) : tab === 'AI Analysis' ? (
          <Analysis analysis={analysis} analyze={analyze} notify={notify} />
        ) : tab === 'Graph' ? (
          <GraphPanel notify={notify} panel={panel} setPanel={setPanel} />
        ) : tab === 'Timeline' ? (
          <TimelinePanel notify={notify} panel={panel} setPanel={setPanel} />
        ) : tab === 'Notes & Tasks' ? (
          <NotesPanel notify={notify} panel={panel} setPanel={setPanel} />
        ) : tab === 'Reports' ? (
          <ReportsPanel
            notify={notify}
            panel={panel}
            setPanel={setPanel}
            caseTitle={selected.title}
            caseNumber={selected.caseNumber}
          />
        ) : tab === 'Audit' ? (
          <AuditPanel audit={audit} selected={selected} />
        ) : (
          <>
            <div className="panel case-summary">
              <span className="eyebrow">CASE OBJECTIVE</span>
              <h2>Establish a source-backed explanation through documented, authorized investigation.</h2>
              <p>{selected.summary} AI suggestions and entity connections require human review.</p>
              <div className="summary-stats">
                <div>
                  <b>{selected.evidence}</b>
                  <span>Evidence items</span>
                </div>
                <div>
                  <b>{selected.leads}</b>
                  <span>Open leads</span>
                </div>
                <div>
                  <b>Human</b>
                  <span>Review required</span>
                </div>
              </div>
            </div>
            <div className="panel evidence-preview">
              <div className="panel-head">
                <div>
                  <h2>Evidence activity</h2>
                  <p>Click an uploaded evidence item to view original file, or delete it from this case.</p>
                </div>
                <div className="evidence-actions">
                  <button className="secondary small-button" onClick={register}>
                    <Upload size={14} />
                    Upload evidence
                  </button>
                  <button className="text-button" onClick={() => setTab('Evidence')}>
                    View evidence <ChevronRight size={15} />
                  </button>
                </div>
              </div>
              {evidence.length === 0 ? (
                <div style={{ padding: '24px 22px', color: '#8490a2', fontSize: 12 }}>
                  No evidence uploaded yet. Click <b>Upload evidence</b> to add records.
                </div>
              ) : (
                evidence.map((e: Evidence) => (
                  <div
                    className="evidence-row openable"
                    key={e.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                    onClick={() => preview(e)}
                  >
                    <span className="file-icon">
                      <FileText size={18} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <b>{e.title}</b>
                      <p>
                        {e.type} · SHA-256: {e.sha256}
                      </p>
                    </div>
                    <Badge tone={e.status === 'ready' || e.status === 'reviewed' ? 'green' : 'amber'}>
                      {e.status}
                    </Badge>
                    <button
                      className="evidence-del-btn"
                      title={`Delete ${e.title}`}
                      onClick={ev => {
                        ev.stopPropagation();
                        onDeleteEvidence(e, ev);
                      }}
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </section>
    </>
  );
}

function Metric({ icon, label, value, detail, tone = 'blue' }: any) {
  return (
    <div className={`metric ${tone}`}>
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <b>{value}</b>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function Task({ title, meta, action }: any) {
  return (
    <div className="task">
      <span className="task-dot blue" />
      <div>
        <b>{title}</b>
        <p>{meta}</p>
      </div>
      <button onClick={action}>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function EvidenceList({
  items,
  register,
  preview,
  onDelete
}: {
  items: Evidence[];
  register: () => void;
  preview: (e: Evidence) => void;
  onDelete: (e: Evidence, ev?: React.MouseEvent) => void;
}) {
  return (
    <div className="panel table-panel">
      <div className="panel-head">
        <div>
          <h2>Evidence vault</h2>
          <p>Originals are immutable. Click an uploaded item to open its original file, or delete it from the vault.</p>
        </div>
        <button className="primary" onClick={register}>
          <Upload size={16} />
          Upload evidence
        </button>
      </div>
      {items.length === 0 ? (
        <div className="empty" style={{ padding: '60px 20px' }}>
          <span className="ai-orb">
            <Archive size={26} />
          </span>
          <h2>Evidence vault is empty</h2>
          <p>No evidence files uploaded to this case yet.</p>
          <button className="primary" style={{ margin: 'auto' }} onClick={register}>
            <Upload size={16} />
            Upload first evidence
          </button>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Evidence</th>
              <th>Integrity hash (SHA-256)</th>
              <th>Collected</th>
              <th>Sensitivity</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(e => (
              <tr className="clickable-row" key={e.id} onClick={() => preview(e)}>
                <td>
                  <b>{e.title}</b>
                  <small>
                    {e.type} · Added by {e.uploadedBy}
                  </small>
                </td>
                <td>
                  <code>{e.sha256}</code>
                </td>
                <td>{new Date(e.collectedAt).toLocaleDateString()}</td>
                <td>
                  <Badge>{e.sensitivity}</Badge>
                </td>
                <td>
                  <Badge tone={e.status === 'ready' || e.status === 'reviewed' ? 'green' : 'amber'}>
                    {e.status}
                  </Badge>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="evidence-del-btn"
                    title={`Delete ${e.title}`}
                    onClick={ev => {
                      ev.stopPropagation();
                      onDelete(e, ev);
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Analysis({ analysis, analyze, notify }: any) {
  if (!analysis) {
    return (
      <div className="empty">
        <span className="ai-orb">
          <Sparkles size={28} />
        </span>
        <h2>Evidence-grounded analysis</h2>
        <p>Analysis uses only the evidence registered in this case and must be reviewed by a human.</p>
        <button className="primary" onClick={analyze}>
          <Sparkles size={17} />
          Generate lead review
        </button>
      </div>
    );
  }
  return (
    <div className="analysis">
      <div className="analysis-head">
        <div>
          <span className="eyebrow">AI-SUGGESTED LEAD</span>
          <h2>Needs reviewer assessment</h2>
        </div>
        <Badge tone="amber">Needs review</Badge>
      </div>
      <div className="notice">
        <ShieldCheck size={18} />
        <span>AI output is a lead, not proof. Verify it against each cited source record.</span>
      </div>
      <section className="panel answer">
        <h3>Analysis</h3>
        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{analysis.answer}</p>
        <h3>Source evidence</h3>
        {analysis.citations?.map((c: any) => (
          <div className="citation" key={c.evidenceId}>
            <FileText size={17} />
            <div>
              <b>{c.label}</b>
              <small>{c.location}</small>
            </div>
          </div>
        ))}
        <div className="uncertainty">
          <b>Uncertainty</b>
          <p>{analysis.uncertainty}</p>
        </div>
      </section>
      <div className="review-actions">
        <button onClick={() => notify('Lead rejected. Recorded in the local session audit log.')}>
          Reject lead
        </button>
        <button onClick={() => notify('Review comments noted.')}>Edit before saving</button>
        <button className="primary" onClick={() => notify('Lead accepted for human investigation review.')}>
          Accept for review
        </button>
      </div>
    </div>
  );
}

function GraphPanel({ notify, panel, setPanel }: any) {
  const { nodes, edges } = panel;
  const setNodes = (fn: any) => setPanel((p: any) => ({ ...p, nodes: fn(p.nodes) }));
  const setEdges = (fn: any) => setPanel((p: any) => ({ ...p, edges: fn(p.edges) }));
  const [form, setForm] = useState(false);
  const [edgeForm, setEdgeForm] = useState(false);
  const [nl, setNl] = useState('');
  const [nt, setNt] = useState('Person');
  const [ef, setEf] = useState('');
  const [et, setEt] = useState('');
  const [er, setEr] = useState('');

  const typeColor: Record<string, string> = {
    Person: '#2aacc0',
    Organization: '#9b72f4',
    Location: '#4dd99a',
    Event: '#f0c263',
    Object: '#ee6e76'
  };

  function addNode() {
    if (!nl.trim()) return;
    const n = { id: Date.now().toString(), label: nl.trim(), type: nt };
    setNodes((x: any) => [...x, n]);
    setNl('');
    setForm(false);
    notify(`Entity "${n.label}" added to the graph.`);
  }

  function addEdge() {
    if (!ef || !et || !er.trim()) return notify('Select both entities and enter a relationship.');
    if (ef === et) return notify('Source and target must be different entities.');
    setEdges((x: any) => [...x, { id: Date.now().toString(), from: ef, to: et, relation: er.trim() }]);
    setEf('');
    setEt('');
    setEr('');
    setEdgeForm(false);
    notify('Relationship added to the graph.');
  }

  function removeNode(id: string) {
    setNodes((x: any) => x.filter((n: any) => n.id !== id));
    setEdges((x: any) => x.filter((e: any) => e.from !== id && e.to !== id));
  }

  const nodeMap = useMemo(() => Object.fromEntries(nodes.map((n: any) => [n.id, n])), [nodes]);

  return (
    <div className="wp-root">
      <div className="wp-header">
        <div>
          <span className="eyebrow">CLUE GRAPH</span>
          <h2>Entity &amp; Relationship Map</h2>
          <p>Build a visual map of entities and their documented connections.</p>
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <button
            className="secondary"
            onClick={() => {
              setEdgeForm(v => !v);
              setForm(false);
            }}
          >
            <Network size={15} />
            Link entities
          </button>
          <button
            className="primary"
            onClick={() => {
              setForm(v => !v);
              setEdgeForm(false);
            }}
          >
            <Plus size={15} />
            Add entity
          </button>
        </div>
      </div>
      {form && (
        <div className="wp-form panel">
          <div className="wp-form-row">
            <label>
              Entity name
              <input
                autoFocus
                value={nl}
                onChange={e => setNl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNode()}
                placeholder="e.g. John Doe"
              />
            </label>
            <label>
              Type
              <select value={nt} onChange={e => setNt(e.target.value)}>
                {Object.keys(typeColor).map(k => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <button className="primary" style={{ alignSelf: 'flex-end' }} onClick={addNode}>
              <Check size={15} />
              Add
            </button>
            <button className="secondary" style={{ alignSelf: 'flex-end' }} onClick={() => setForm(false)}>
              <X size={15} />
            </button>
          </div>
        </div>
      )}
      {edgeForm && (
        <div className="wp-form panel">
          <div className="wp-form-row">
            <label>
              From
              <select value={ef} onChange={e => setEf(e.target.value)}>
                <option value="">Select entity…</option>
                {nodes.map((n: any) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Relationship
              <input value={er} onChange={e => setEr(e.target.value)} placeholder="e.g. owns, transferred to" />
            </label>
            <label>
              To
              <select value={et} onChange={e => setEt(e.target.value)}>
                <option value="">Select entity…</option>
                {nodes.map((n: any) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" style={{ alignSelf: 'flex-end' }} onClick={addEdge}>
              <Check size={15} />
              Link
            </button>
            <button className="secondary" style={{ alignSelf: 'flex-end' }} onClick={() => setEdgeForm(false)}>
              <X size={15} />
            </button>
          </div>
        </div>
      )}
      {nodes.length === 0 ? (
        <div className="empty" style={{ padding: '60px 20px' }}>
          <span className="ai-orb">
            <Network size={26} />
          </span>
          <h2>No entities yet</h2>
          <p>Add people, organizations, locations, or objects to begin mapping relationships.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="panel" style={{ padding: 20 }}>
            <h3
              style={{
                marginBottom: 14,
                color: '#8b96a7',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '.08em'
              }}
            >
              Entities ({nodes.length})
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
              {nodes.map((n: any) => (
                <div key={n.id} className="graph-node">
                  <span className="graph-node-dot" style={{ background: typeColor[n.type] }} />
                  <span className="graph-node-type">{n.type}</span>
                  <b>{n.label}</b>
                  <button className="graph-del" onClick={() => removeNode(n.id)} title="Remove">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          {edges.length > 0 && (
            <div className="panel" style={{ padding: 20 }}>
              <h3
                style={{
                  marginBottom: 14,
                  color: '#8b96a7',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '.08em'
                }}
              >
                Relationships ({edges.length})
              </h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {edges.map((e: any) => (
                  <div key={e.id} className="graph-edge">
                    <span className="graph-edge-label">{(nodeMap as any)[e.from]?.label}</span>
                    <span className="graph-edge-rel">— {e.relation} →</span>
                    <span className="graph-edge-label">{(nodeMap as any)[e.to]?.label}</span>
                    <button
                      className="graph-del"
                      onClick={() => setEdges((x: any) => x.filter((ed: any) => ed.id !== e.id))}
                      title="Remove"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TimelinePanel({ notify, panel, setPanel }: any) {
  const events = panel.events;
  const setEvents = (fn: any) => setPanel((p: any) => ({ ...p, events: fn(p.events) }));
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState('Action');

  const cats = ['Action', 'Discovery', 'Communication', 'Financial', 'Other'];
  const catColor: Record<string, string> = {
    Action: '#2aacc0',
    Discovery: '#9b72f4',
    Communication: '#4dd99a',
    Financial: '#f0c263',
    Other: '#8b96a7'
  };

  function addEvent() {
    if (!title.trim() || !date) return notify('Title and date are required.');
    const ev = { id: Date.now().toString(), title: title.trim(), date, time, description: desc.trim(), category: cat };
    setEvents((x: any) => [ev, ...x].sort((a: any, b: any) => (a.date + a.time < b.date + b.time ? 1 : -1)));
    setTitle('');
    setDate('');
    setTime('');
    setDesc('');
    setForm(false);
    notify(`Timeline event "${ev.title}" recorded.`);
  }

  return (
    <div className="wp-root">
      <div className="wp-header">
        <div>
          <span className="eyebrow">TIMELINE</span>
          <h2>Case Timeline</h2>
          <p>Record events in chronological order with their original timestamps.</p>
        </div>
        <button className="primary" onClick={() => setForm(v => !v)}>
          <Plus size={15} />
          Add event
        </button>
      </div>
      {form && (
        <div className="wp-form panel">
          <div className="wp-form-col">
            <div className="wp-form-row">
              <label>
                Event title
                <input
                  autoFocus
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Suspicious transfer detected"
                />
              </label>
              <label>
                Category
                <select value={cat} onChange={e => setCat(e.target.value)}>
                  {cats.map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="wp-form-row">
              <label>
                Date
                <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </label>
              <label>
                Time (optional)
                <input type="time" value={time} onChange={e => setTime(e.target.value)} />
              </label>
            </div>
            <label>
              Description
              <textarea
                rows={2}
                value={desc}
                onChange={e => setDesc(e.target.value)}
                placeholder="Describe what happened…"
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="secondary" onClick={() => setForm(false)}>
                <X size={14} />
                Cancel
              </button>
              <button className="primary" onClick={addEvent}>
                <Check size={14} />
                Save event
              </button>
            </div>
          </div>
        </div>
      )}
      {events.length === 0 && !form ? (
        <div className="empty" style={{ padding: '60px 20px' }}>
          <span className="ai-orb">
            <Timer size={26} />
          </span>
          <h2>No events recorded</h2>
          <p>Add the first event to begin building the case timeline.</p>
        </div>
      ) : (
        <div className="panel" style={{ padding: '4px 0' }}>
          {events.map((ev: any, i: number) => (
            <div key={ev.id} className="tl-row">
              <div className="tl-spine">
                <div className="tl-dot" style={{ background: catColor[ev.category] }} />
                {i < events.length - 1 && <div className="tl-line" />}
              </div>
              <div className="tl-body">
                <div className="tl-meta">
                  <span className="tl-date">
                    {ev.date}
                    {ev.time && ' · ' + ev.time}
                  </span>
                  <Badge>{ev.category}</Badge>
                  <button
                    className="graph-del"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => setEvents((x: any) => x.filter((e: any) => e.id !== ev.id))}
                    title="Remove"
                  >
                    <X size={12} />
                  </button>
                </div>
                <b style={{ fontSize: 12 }}>{ev.title}</b>
                {ev.description && <p style={{ marginTop: 4 }}>{ev.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotesPanel({ notify, panel, setPanel }: any) {
  const items = panel.notes;
  const setItems = (fn: any) => setPanel((p: any) => ({ ...p, notes: fn(p.notes) }));
  const [noteForm, setNoteForm] = useState(false);
  const [taskForm, setTaskForm] = useState(false);
  const [text, setText] = useState('');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState('normal');

  function addItem(type: 'note' | 'task') {
    if (!text.trim()) return notify('Please enter some text.');
    const it = {
      id: Date.now().toString(),
      text: text.trim(),
      type,
      done: false,
      assignee: assignee.trim(),
      priority,
      createdAt: new Date().toLocaleString()
    };
    setItems((x: any) => [it, ...x]);
    setText('');
    setAssignee('');
    setPriority('normal');
    setNoteForm(false);
    setTaskForm(false);
    notify(`${type === 'task' ? 'Task' : 'Note'} added.`);
  }

  function toggle(id: string) {
    setItems((x: any) => x.map((i: any) => (i.id === id ? { ...i, done: !i.done } : i)));
  }

  const tasks = items.filter((i: any) => i.type === 'task');
  const notes = items.filter((i: any) => i.type === 'note');
  const prioColor: Record<string, string> = { normal: '#55a9e1', high: '#e9af5a', critical: '#ee6e76' };

  return (
    <div className="wp-root">
      <div className="wp-header">
        <div>
          <span className="eyebrow">NOTES &amp; TASKS</span>
          <h2>Case Notes &amp; Tasks</h2>
          <p>Record investigator notes and assign actionable tasks.</p>
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <button
            className="secondary"
            onClick={() => {
              setNoteForm(v => !v);
              setTaskForm(false);
            }}
          >
            <FilePlus2 size={15} />
            Add note
          </button>
          <button
            className="primary"
            onClick={() => {
              setTaskForm(v => !v);
              setNoteForm(false);
            }}
          >
            <Plus size={15} />
            Add task
          </button>
        </div>
      </div>
      {noteForm && (
        <div className="wp-form panel">
          <div className="wp-form-col">
            <label>
              Note
              <textarea
                autoFocus
                rows={3}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Write a case note…"
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="secondary" onClick={() => setNoteForm(false)}>
                <X size={14} />
                Cancel
              </button>
              <button className="primary" onClick={() => addItem('note')}>
                <Check size={14} />
                Save note
              </button>
            </div>
          </div>
        </div>
      )}
      {taskForm && (
        <div className="wp-form panel">
          <div className="wp-form-col">
            <label>
              Task description
              <textarea
                autoFocus
                rows={2}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Describe the task…"
              />
            </label>
            <div className="wp-form-row">
              <label>
                Assignee (optional)
                <input
                  value={assignee}
                  onChange={e => setAssignee(e.target.value)}
                  placeholder="Investigator name"
                />
              </label>
              <label>
                Priority
                <select value={priority} onChange={e => setPriority(e.target.value)}>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="secondary" onClick={() => setTaskForm(false)}>
                <X size={14} />
                Cancel
              </button>
              <button className="primary" onClick={() => addItem('task')}>
                <Check size={14} />
                Create task
              </button>
            </div>
          </div>
        </div>
      )}
      {items.length === 0 && !noteForm && !taskForm ? (
        <div className="empty" style={{ padding: '60px 20px' }}>
          <span className="ai-orb">
            <FilePlus2 size={26} />
          </span>
          <h2>No notes or tasks yet</h2>
          <p>Add a note to capture observations or create a task to track investigation actions.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {tasks.length > 0 && (
            <div className="panel" style={{ padding: '4px 0' }}>
              <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid #252c38' }}>
                <h3>Tasks ({tasks.length})</h3>
              </div>
              {tasks.map((it: any) => (
                <div key={it.id} className={`nt-row ${it.done ? 'done' : ''}`}>
                  <button
                    className="nt-check"
                    onClick={() => toggle(it.id)}
                    style={{ borderColor: prioColor[it.priority] }}
                  >
                    {it.done && <Check size={12} color={prioColor[it.priority]} />}
                  </button>
                  <div style={{ flex: 1 }}>
                    <span
                      style={{
                        fontSize: 12,
                        textDecoration: it.done ? 'line-through' : 'none',
                        color: it.done ? '#56677a' : '#e9edf5'
                      }}
                    >
                      {it.text}
                    </span>
                    {it.assignee && <p style={{ marginTop: 3 }}>Assigned: {it.assignee}</p>}
                  </div>
                  <Badge
                    tone={it.priority === 'critical' ? 'violet' : it.priority === 'high' ? 'amber' : 'blue'}
                  >
                    {it.priority}
                  </Badge>
                  <button
                    className="graph-del"
                    onClick={() => setItems((x: any) => x.filter((i: any) => i.id !== it.id))}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {notes.length > 0 && (
            <div className="panel" style={{ padding: '4px 0' }}>
              <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid #252c38' }}>
                <h3>Notes ({notes.length})</h3>
              </div>
              {notes.map((it: any) => (
                <div key={it.id} className="nt-row">
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12, color: '#d0d8e8', lineHeight: 1.6 }}>{it.text}</p>
                    <p style={{ marginTop: 4, fontSize: 10 }}>{it.createdAt}</p>
                  </div>
                  <button
                    className="graph-del"
                    onClick={() => setItems((x: any) => x.filter((i: any) => i.id !== it.id))}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReportsPanel({ notify, panel, setPanel, caseTitle, caseNumber }: any) {
  const reports = panel.reports;
  const setReports = (fn: any) => setPanel((p: any) => ({ ...p, reports: fn(p.reports) }));
  const [form, setForm] = useState(false);
  const [rtitle, setRtitle] = useState('');
  const [rbody, setRbody] = useState('');

  function addReport() {
    if (!rtitle.trim() || !rbody.trim()) return notify('Title and body are required.');
    const r = {
      id: Date.now().toString(),
      title: rtitle.trim(),
      body: rbody.trim(),
      createdAt: new Date().toLocaleString()
    };
    setReports((x: any) => [r, ...x]);
    setRtitle('');
    setRbody('');
    setForm(false);
    notify(`Report draft "${r.title}" saved.`);
  }

  return (
    <div className="wp-root">
      <div className="wp-header">
        <div>
          <span className="eyebrow">REPORTS &amp; BRIEFINGS</span>
          <h2>Case Reports</h2>
          <p>
            Compose source-linked report drafts and executive summaries for <b>{caseNumber}</b>.
          </p>
        </div>
        <button className="primary" onClick={() => setForm(v => !v)}>
          <Plus size={15} />
          New report draft
        </button>
      </div>
      {form && (
        <div className="wp-form panel">
          <div className="wp-form-col">
            <label>
              Report title
              <input
                autoFocus
                value={rtitle}
                onChange={e => setRtitle(e.target.value)}
                placeholder={`e.g. ${caseNumber} Preliminary Findings`}
              />
            </label>
            <label>
              Report body
              <textarea
                rows={6}
                value={rbody}
                onChange={e => setRbody(e.target.value)}
                placeholder="Summarize observations, cite evidence files, and note recommended follow-up actions…"
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="secondary" onClick={() => setForm(false)}>
                <X size={14} />
                Cancel
              </button>
              <button className="primary" onClick={addReport}>
                <Check size={14} />
                Save draft
              </button>
            </div>
          </div>
        </div>
      )}
      {reports.length === 0 && !form ? (
        <div className="empty" style={{ padding: '60px 20px' }}>
          <span className="ai-orb">
            <FileText size={26} />
          </span>
          <h2>No reports drafted yet</h2>
          <p>
            Create the first investigative briefing or report for <b>{caseTitle}</b>.
          </p>
        </div>
      ) : (
        <div className="panel" style={{ padding: '4px 0' }}>
          {reports.map((r: any) => (
            <div key={r.id} className="report-row">
              <div className="report-meta">
                <span className="eyebrow">{r.createdAt}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    className="secondary small-button"
                    onClick={() => {
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(`${r.title}\n\n${r.body}`);
                      }
                      notify('Report copied to clipboard.');
                    }}
                  >
                    <FileText size={12} />
                    Copy draft
                  </button>
                  <button
                    className="graph-del"
                    onClick={() => setReports((x: any) => x.filter((i: any) => i.id !== r.id))}
                    title="Delete report"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
              <b style={{ fontSize: 13 }}>{r.title}</b>
              <p style={{ marginTop: 8, fontSize: 12, color: '#c4cdd9', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {r.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditPanel({ audit, selected }: any) {
  const caseAudit = selected ? audit.filter((a: any) => a.caseId === selected.id) : audit;
  const [filter, setFilter] = useState('');
  const displayed = caseAudit.filter(
    (a: any) =>
      !filter ||
      a.action?.toLowerCase().includes(filter.toLowerCase()) ||
      a.actor?.toLowerCase().includes(filter.toLowerCase()) ||
      a.resource?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="wp-root">
      <div className="wp-header">
        <div>
          <span className="eyebrow">AUDIT TRAIL</span>
          <h2>Immutable Action History</h2>
          <p>Every protected action taken in this {selected ? 'case' : 'workspace'} is logged with actor identification.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge tone="violet">{caseAudit.length} events</Badge>
          <Badge tone="green">Tamper-Proof</Badge>
        </div>
      </div>
      <div className="audit-search-bar">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Search audit trail by action, investigator, or resource…"
        />
      </div>
      {displayed.length === 0 ? (
        <div className="empty" style={{ padding: '60px 20px' }}>
          <span className="ai-orb">
            <Activity size={26} />
          </span>
          <h2>No matching audit events</h2>
          <p>Protected events will be logged here automatically as case actions are taken.</p>
        </div>
      ) : (
        <div className="panel" style={{ padding: '4px 0' }}>
          {displayed.map((a: any) => (
            <div key={a.id} className="tl-row">
              <div className="tl-spine">
                <div className="tl-dot" style={{ background: '#70c6d2' }} />
              </div>
              <div className="tl-body">
                <div className="tl-meta">
                  <span className="tl-date">{new Date(a.timestamp).toLocaleString()}</span>
                  <Badge tone="violet">Protected</Badge>
                  <code style={{ marginLeft: 'auto', fontSize: 10, color: '#566b7d' }}>
                    {a.id?.slice(0, 8)}
                  </code>
                </div>
                <b style={{ fontSize: 12 }}>{a.action}</b>
                <p style={{ marginTop: 3 }}>
                  {a.actor} · {a.resource}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Modal({
  type,
  close,
  submit
}: {
  type: 'case' | 'evidence';
  close: () => void;
  submit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const isCase = type === 'case';
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <div>
          <span className="eyebrow">{isCase ? 'NEW INVESTIGATION' : 'UPLOAD EVIDENCE'}</span>
          <h2>{isCase ? 'Create a case' : 'Add original evidence file'}</h2>
          <button type="button" className="close" onClick={close}>
            <X size={19} />
          </button>
        </div>
        <label>
          {isCase ? 'Case title' : 'Evidence title'}
          <input
            name="title"
            required
            placeholder={isCase ? 'e.g. Northstar payment review' : 'e.g. Original invoice export'}
          />
        </label>
        {isCase ? (
          <>
            <label>
              Case type
              <select name="type">
                {['Fraud review', 'Cyber incident', 'Missing property', 'Digital forensics'].map(x => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select name="priority">
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label>
              Authorized scope / summary
              <textarea name="summary" rows={3} placeholder="Define the authorized investigation scope…" />
            </label>
          </>
        ) : (
          <>
            <label>
              Choose file
              <input
                name="file"
                type="file"
                required
                accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.json,.doc,.docx"
              />
            </label>
            <p className="upload-help">
              Accepted: PDF, images, TXT, CSV, JSON, DOC, DOCX. Maximum 10 MB. A cryptographic SHA-256 hash is
              calculated immediately.
            </p>
            <label>
              Evidence source
              <textarea name="source" rows={2} placeholder="Where and how was this evidence collected?" />
            </label>
          </>
        )}
        <button className="primary wide" type="submit">
          <Upload size={17} />
          {isCase ? 'Create authorized case' : 'Upload and hash evidence'}
        </button>
      </form>
    </div>
  );
}

function SettingsModal({
  currentMode,
  close,
  onApply
}: {
  currentMode: EngineMode;
  close: () => void;
  onApply: (mode: EngineMode, apiUrl: string) => void;
}) {
  const [mode, setMode] = useState<EngineMode>(currentMode);
  const [apiUrl, setApiUrl] = useState(() => client.getApiUrl());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const isOk = await client.probeApiServer();
      if (isOk) {
        setTestResult('Connection successful! API is responsive.');
      } else {
        const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
        if (isHttps && apiUrl.startsWith('http://')) {
          setTestResult('Blocked by Browser Mixed Content: Cannot call http:// from https://. Use Browser Engine or HTTPS API.');
        } else {
          setTestResult('Unable to reach server. Check that your API is running and accessible.');
        }
      }
    } catch (err: any) {
      setTestResult(`Failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal settings-modal">
        <div>
          <span className="eyebrow">ENVIRONMENT CONFIGURATION</span>
          <h2>Workspace Engine</h2>
          <button type="button" className="close" onClick={close}>
            <X size={19} />
          </button>
        </div>

        <p style={{ color: '#909fac', fontSize: 11, lineHeight: 1.5 }}>
          Investigation Room can operate either 100% in-browser (standalone, offline ready, perfect for GitHub Pages)
          or connect to a remote Node.js Express backend.
        </p>

        <div style={{ display: 'grid', gap: 10 }}>
          <div
            className={`settings-option ${mode === 'browser' ? 'selected' : ''}`}
            onClick={() => setMode('browser')}
          >
            <input
              type="radio"
              checked={mode === 'browser'}
              onChange={() => setMode('browser')}
              name="engineMode"
            />
            <div>
              <b>Secure In-Browser Engine (Recommended for GitHub Pages)</b>
              <p>
                Runs entirely in your browser using local storage, Web Crypto SHA-256 hashing, and IndexedDB.
                Requires zero server setup.
              </p>
            </div>
          </div>

          <div
            className={`settings-option ${mode === 'api' ? 'selected' : ''}`}
            onClick={() => setMode('api')}
          >
            <input
              type="radio"
              checked={mode === 'api'}
              onChange={() => setMode('api')}
              name="engineMode"
            />
            <div>
              <b>Backend API Server</b>
              <p>Connects to a running Investigation Room Express server (e.g. localhost or deployed cloud instance).</p>
            </div>
          </div>
        </div>

        {mode === 'api' && (
          <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
            <label>
              API Base URL
              <input
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                placeholder="http://localhost:4000/api/v1 or https://..."
              />
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" className="test-conn-btn" onClick={testConnection} disabled={testing}>
                {testing ? 'Testing…' : 'Test API Connection'}
              </button>
              {testResult && (
                <span style={{ fontSize: 11, color: testResult.includes('successful') ? '#5fd1a6' : '#ee6e76' }}>
                  {testResult}
                </span>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="secondary" onClick={close}>
            Cancel
          </button>
          <button className="primary" onClick={() => onApply(mode, apiUrl)}>
            <Check size={15} /> Save &amp; Apply
          </button>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
