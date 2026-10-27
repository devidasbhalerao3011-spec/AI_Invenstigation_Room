INVESTIGATION ROOM

Project Specification (SPEC) — v1.0

Build. Investigate. Uncover the Truth.

1. Project Overview

Investigation Room is a secure, AI-assisted case-management and evidence-analysis workspace. It helps authorized users organize case files, record leads, examine digital artifacts, build timelines, connect entities and evidence, and generate source-linked investigative summaries. It supports workflows for fraud, cyber incidents, digital forensics, missing-property/person scenarios, and fictional training mysteries.

The system is an investigative aid, not an autonomous judge or law-enforcement system. AI output is a hypothesis or lead, not proof. Users must verify findings against source evidence. The application must not declare a person guilty, identify a suspect solely from AI inference, or present unsupported conclusions as facts.

2. Goals and Non-Goals

Goals

Create and manage cases with type, status, priority, owner, tags, and access controls.

Upload, classify, hash, annotate, and securely link evidence to cases.

Connect clues visually in an evidence graph and build an event timeline.

Use OpenAI and Gemini for bounded extraction, summarization, comparison, and question answering grounded in selected evidence.

Track every AI output, source citation, human review, and change in an audit log.

Provide a polished investigation dashboard with search, filters, reports, and task management.

Non-Goals for v1

No autonomous accusation, suspect ranking presented as fact, or automated guilt determination.

No unauthorized access, credential theft, malware deployment, account intrusion, or covert surveillance.

No automatic evidence collection from third-party accounts or devices.

No replacement for qualified forensic, legal, or emergency-response professionals.

3. Target Users and Roles

Role

Permissions

Workspace Admin

Manage workspace, users, roles, integrations, retention and security settings.

Investigator

Create assigned cases, add evidence and leads, build timelines, request AI analysis.

Reviewer / Supervisor

Review evidence handling and AI outputs, approve reports, resolve conflicting interpretations.

Read-only Viewer

View explicitly shared cases and approved reports.

4. Main Application Modules

Command Center Dashboard — Open cases, recently updated cases, tasks due, evidence awaiting review, and recent audit events.

Case Workspace — Case overview, classification, objectives, working hypotheses, assigned team, notes, tasks, and status history.

Evidence Vault — Secure file upload, metadata, SHA-256 hash, evidence source, acquisition details, timestamps, tags, access history, and chain-of-custody events.

Clue & Entity Graph — Visual nodes for evidence, people, organizations, accounts, devices, locations, and events; edges show a documented relationship with source and confidence.

Timeline Builder — Normalize event times, retain original timezone, order events, mark uncertain dates, and link every event to supporting evidence.

AI Analysis Lab — Evidence-grounded summaries, document extraction, contradiction detection, comparison, question answering, and lead suggestions with citations.

Digital & Cyber Analysis — Analyze user-authorized logs, email headers, CSVs, JSON, and exported incident records; redact secrets and flag suspicious patterns for human review.

Fraud Review — Organize transactions, invoices, claims, and records; highlight anomalies and inconsistencies without automatically labeling a person fraudulent.

Reports & Briefings — Generate a case summary, evidence index, timeline, open questions, alternative explanations, and review status.

Audit & Settings — Access controls, integration settings, audit events, retention policies, model usage, and workspace configuration.

5. Core User Flow

Sign in and open the Command Center.

Create a case, choose a case type, set a scope, and assign authorized team members.

Upload or manually register evidence. Validate file type and size; calculate a SHA-256 hash; record who added it and when.

Review extracted metadata and correct errors. Preserve the original file as immutable; store annotations separately.

Add clues, entities, and events; link each relationship to one or more evidence items.

Ask the AI Analysis Lab a question scoped to selected case evidence. The system retrieves relevant passages and sends only the minimum necessary context to the chosen provider.

Review citations, uncertainty, alternative explanations, and any unsupported statements. Accept, edit, or reject the proposed lead.

Generate a report that separates verified observations, AI-generated leads, unresolved questions, and human conclusions.

Export an authorized report and preserve an audit record.

6. AI Integration Requirements

Provider strategy

Create a provider adapter layer: AIProvider interface with OpenAIProvider and GeminiProvider implementations.

Keep API keys on the server in environment variables or a managed secret store; never expose them in React or client bundles.

Allow a per-request provider choice and configurable model names. Do not hard-code model names throughout the codebase.

Use structured JSON outputs where supported and validate them with a schema before saving.

Use retrieval-augmented generation (RAG): split supported text into chunks, attach case/evidence/page/line metadata, retrieve relevant chunks, and require citations.

Store provider, model, prompt-template version, timestamp, selected evidence IDs, token/usage metadata when available, and reviewer decision.

Treat uploaded documents and extracted text as untrusted data, not instructions. Defend against prompt injection and cross-case data leakage.

Do not send sensitive files to an external AI provider without clear workspace configuration, authorization, and disclosure. Provide a no-external-AI option.

AI features

Evidence summary with citations to evidence IDs and page/line/record locations when available.

Entity and event extraction with explicit 'needs review' status.

Cross-document comparison and potential contradiction detection, including exact source passages.

Timeline draft with original timestamps, timezone, and uncertainty markers.

Lead generation framed as questions to investigate, with supporting and contradicting evidence.

Case Q&A that responds 'not enough evidence in the supplied case material' when sources do not support an answer.

Report drafting that separates source facts, interpretations, and unverified hypotheses.

7. Suggested Technical Architecture

Frontend — React + Vite, TypeScript, React Router, Tailwind CSS, a component library, React Query/TanStack Query, React Flow for graph visualization, and a timeline visualization library.

Backend — Node.js + Express + TypeScript; REST API under /api/v1; centralized validation, authorization middleware, rate limits, request IDs, and structured logging.

Database — MongoDB with Mongoose or the native driver. Use indexes and schema validation; enforce tenant/workspace and case authorization in every query.

File storage — Private object storage (S3-compatible or equivalent) for original evidence; MongoDB stores metadata, not large binary files. Use short-lived signed upload/download URLs.

Search / RAG — Start with MongoDB text search or a supported vector-search setup; keep evidence chunk metadata tied to caseId and evidenceId. Filter by authorization before retrieval.

AI — OpenAI API and Gemini API behind a common server-side adapter; optional provider fallback only when explicitly configured.

Background jobs — Queue for file parsing, hashing, OCR where appropriate, embedding, and report generation; retry safely and expose job status.

Testing / delivery — Vitest/Jest, Supertest, React Testing Library, Playwright, ESLint, Prettier, Docker for local development, and CI checks.

8. High-Level Data Model

Collection

Suggested fields

User

email, displayName, authProvider, status, createdAt, lastLoginAt

Workspace

name, ownerId, settings, retentionPolicy, createdAt

Membership

workspaceId, userId, role, status

Case

workspaceId, caseNumber, title, type, status, priority, summary, scope, ownerId, teamIds, tags, createdAt, updatedAt

Evidence

workspaceId, caseId, title, type, originalFilename, storageKey, mimeType, size, sha256, source, collectedAt, uploadedBy, sensitivity, processingStatus

EvidenceVersion

evidenceId, version, storageKey, sha256, createdAt, createdBy, reason; originals are never silently overwritten

EvidenceAnnotation

caseId, evidenceId, pageOrRecord, quoteOrExcerpt, note, createdBy, createdAt

Entity

caseId, entityType, displayLabel, aliases, description, reviewStatus; avoid unnecessary personal data

Relationship

caseId, fromEntityOrEvidenceId, toEntityOrEvidenceId, relationshipType, rationale, supportingEvidenceIds, confidenceLabel, reviewStatus, createdBy

TimelineEvent

caseId, title, eventTime, originalTimeText, timezone, uncertainty, description, evidenceIds, reviewStatus

AnalysisRun

caseId, provider, model, taskType, promptVersion, evidenceIds, output, citations, status, createdBy, createdAt

Task

caseId, title, description, assigneeId, dueAt, status, relatedEvidenceIds

Report

caseId, title, version, content, evidenceIds, status, createdBy, approvedBy, createdAt

AuditEvent

workspaceId, caseId, actorId, action, resourceType, resourceId, timestamp, requestId, metadata

Use ObjectId references and indexes on workspaceId, caseId, status, createdAt, and frequently filtered fields. Add compound indexes to support tenant-scoped queries. Treat names and labels as allegations or unverified entities until reviewed; do not store a 'guilty' field.

9. API Outline

Method

Endpoint

Purpose

POST

/api/v1/auth/session

Create/refresh an authenticated session (implementation depends on auth provider).

GET / POST

/api/v1/cases

List authorized cases / create a case.

GET / PATCH

/api/v1/cases/:caseId

Read or update an authorized case.

GET / POST

/api/v1/cases/:caseId/evidence

List evidence / register or initiate an upload.

POST

/api/v1/evidence/:evidenceId/complete-upload

Verify uploaded object, hash, and metadata.

GET / POST

/api/v1/cases/:caseId/entities

List or create graph entities.

GET / POST

/api/v1/cases/:caseId/relationships

List or create evidence-backed relationships.

GET / POST

/api/v1/cases/:caseId/timeline

List or create timeline events.

POST

/api/v1/cases/:caseId/ai/analyze

Start an AI task against explicitly selected evidence.

GET

/api/v1/analysis/:analysisId

Get task status and result with citations.

POST

/api/v1/cases/:caseId/reports

Generate a draft report.

POST

/api/v1/reports/:reportId/approve

Reviewer approval with audit event.

GET

/api/v1/cases/:caseId/audit

List audit events, subject to permissions.

10. Security, Privacy, and Evidence Integrity

Authentication: use a reputable identity provider or secure session implementation; use secure, HttpOnly, SameSite cookies where applicable and protect state-changing requests against CSRF.

Authorization: enforce role and case-level access on the server for every read, write, download, graph query, search, and AI retrieval. Never trust a client-supplied caseId alone.

Secrets: store API keys in server-side environment variables for development and a secret manager for production; redact secrets from logs.

Uploads: allowlist file types, cap size, verify MIME and file signatures, generate storage names, scan files where possible, and keep storage private.

Integrity: calculate SHA-256, record upload and access events, preserve originals, and append corrections as new versions or annotations.

Encryption: use TLS in transit and encryption at rest; consider field-level encryption for highly sensitive metadata.

Privacy: minimize personal data, define retention/deletion rules, and provide workspace controls for external AI processing.

Audit: record who accessed, exported, edited, analyzed, or approved evidence and reports. Do not log raw secrets or unnecessary evidence contents.

AI safeguards: treat evidence as untrusted input, require source citations, display uncertainty, and prevent one case's retrieved chunks from leaking into another case.

Legal and operational safeguards: require lawful authorization for evidence collection; preserve applicable chain-of-custody requirements and consult qualified counsel for real investigations.

11. UI / UX Requirements

Visual direction: dark investigation-room theme, restrained accent colors, readable contrast, clear status labels, and responsive layout.

Primary navigation: Dashboard, Cases, Evidence Vault, Clue Graph, Timeline, AI Lab, Reports, Audit, Settings.

Case workspace tabs: Overview, Evidence, Graph, Timeline, Notes & Tasks, AI Analysis, Reports, Audit.

Graph nodes must be keyboard-accessible or have an equivalent list/table view; relationships must display their source evidence and review status.

Use clear labels such as 'AI-suggested lead', 'Unverified', 'Reviewed', and 'Contradicted'; do not use AI confidence as a probability of guilt.

Provide empty states, loading states, failed upload/retry states, accessible form validation, and clear error messages.

12. Non-Functional Requirements

All protected API endpoints require authentication and authorization.

Every case-scoped query is tenant-scoped and tested for cross-workspace access denial.

Long-running file processing and AI analysis run asynchronously with visible status and safe retries.

Paginate case, evidence, audit, and search results; enforce configurable upload and request limits.

All AI results store citations and the exact evidence IDs used; if citations cannot be produced, mark the result as ungrounded and require review.

Provide database backups, restore procedures, structured logs, health checks, and error monitoring before production launch.

13. Acceptance Criteria for MVP

A user can sign in and only access workspaces and cases permitted by their role.

A user can create, edit, search, filter, and archive a case.

A user can upload evidence; the backend records SHA-256, metadata, uploader, and audit events.

A user can add entities and evidence-backed relationships and view them in a graph.

A user can create timeline events linked to evidence and preserve uncertain timestamps.

An authorized user can request an OpenAI or Gemini analysis against selected evidence and see citations to the source material.

AI results are labeled as suggestions and can be accepted, edited, or rejected by a human reviewer.

A report can be generated with source-linked observations, leads, uncertainties, and open questions.

Automated tests confirm that unauthorized users cannot access cases, evidence, search results, reports, or AI outputs from another workspace.

The app handles invalid uploads, provider errors, timeouts, and malformed AI output without losing source evidence.

14. Delivery Plan

Phase 1 — Foundation: Repository setup, React shell, Express API, MongoDB connection, authentication, roles, workspace and case CRUD.

Phase 2 — Evidence: Private upload flow, hashing, metadata, evidence list/detail, annotations, and audit trail.

Phase 3 — Investigation tools: Entity graph, relationship evidence, timeline, search and tasks.

Phase 4 — AI Lab: Provider adapters, selected-evidence RAG, citations, structured output validation, review workflow.

Phase 5 — Reports and hardening: Report generation, approvals, security tests, error handling, backup/restore, deployment and documentation.

15. Suggested Repository Structure

investigation-room/
  apps/
    web/
      src/
        app/
        components/
        features/
          auth/
          dashboard/
          cases/
          evidence/
          graph/
          timeline/
          ai-lab/
          reports/
          audit/
        lib/
        routes/
    api/
      src/
        config/
        middleware/
        modules/
          auth/
          workspaces/
          cases/
          evidence/
          entities/
          relationships/
          timeline/
          ai/
          reports/
          audit/
        providers/
          ai-provider.interface.ts
          openai.provider.ts
          gemini.provider.ts
        jobs/
        utils/
  packages/
    shared/
      schemas/
      types/
  tests/
  .env.example
  docker-compose.yml
  README.md

16. Environment Configuration

NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb://localhost:27017/investigation_room
SESSION_SECRET=replace_with_a_long_random_secret
OPENAI_API_KEY=
OPENAI_MODEL=
GEMINI_API_KEY=
GEMINI_MODEL=
PRIVATE_EVIDENCE_BUCKET=
EVIDENCE_STORAGE_ENDPOINT=
MAX_UPLOAD_MB=25
AI_EXTERNAL_PROCESSING_ENABLED=false

Use .env.example for variable names only. Never commit real keys or secrets. Confirm current model names and SDK setup in the providers’ official documentation when implementing.

17. MVP Priorities

Build the first release around: authentication and roles; case management; secure evidence uploads and hashing; evidence-linked graph and timeline; one grounded AI analysis workflow with citations; and a report draft/review flow. Add specialized parsers and more advanced workflows after the security and evidence-integrity foundations are tested.

18. Definition of Done

The MVP is ready for a controlled demo when the acceptance criteria pass, setup instructions work from a clean checkout, no API keys are shipped to the browser, access-control tests cover cross-case and cross-workspace boundaries, AI outputs cite the exact sources used, and the UI clearly distinguishes verified evidence from hypotheses.