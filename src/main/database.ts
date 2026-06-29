// Type-only import - erased at compile time so requiring this module is cheap.
// The native better-sqlite3 binding loads lazily in initializeDatabase(), keeping
// it off the app's cold-start critical path so the window can appear immediately.
import type DatabaseType from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  JobApplication,
  Workflow,
  StageHistory,
  GuidanceDoc,
  GuidanceType,
  GuidanceContent,
  ExtractedJobData,
  Attachment,
  AnswerBankEntry,
  LockerDocument,
  VoiceNote,
  VoiceNoteKind,
  PortfolioLink,
  CoverLetter,
} from '../shared/types';

let db: DatabaseType.Database | null = null;

/**
 * Initialize the SQLite database with all tables and schema
 */
export function initializeDatabase(): void {
  // Idempotent - safe to call from both the deferred startup path and the
  // macOS activate handler without leaking a second connection.
  if (db) return;

  const dbPath = path.join(app.getPath('userData'), 'job-tracker.db');

  // Lazy require - this is where the native binding actually loads.
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create workflows table
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      name TEXT NOT NULL,
      stages TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  // Create applications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      job_title TEXT NOT NULL,
      location TEXT NOT NULL,
      job_url TEXT NOT NULL,
      job_source TEXT,
      salary_min REAL,
      salary_max REAL,
      equity TEXT,
      benefits TEXT,
      job_description TEXT NOT NULL,
      key_responsibilities TEXT NOT NULL,
      required_skills TEXT NOT NULL,
      nice_to_have_skills TEXT NOT NULL,
      team_info TEXT,
      hiring_timeline TEXT,
      application_deadline TEXT,
      current_stage TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id)
    )
  `);

  // Create stage_history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS stage_history (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      entered_at TEXT NOT NULL,
      exited_at TEXT,
      notes TEXT,
      guidance TEXT,
      outcome TEXT,
      FOREIGN KEY (application_id) REFERENCES applications(id)
    )
  `);

  // Create guidance_docs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS guidance_docs (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      guidance_type TEXT NOT NULL,
      content TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES applications(id)
    )
  `);

  // Create attachments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES applications(id)
    )
  `);

  // Create chat_messages table (per-application AI assistant)
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES applications(id)
    )
  `);

  // ── learnable answer bank, document locker, voice profile ──────
  db.exec(`
    CREATE TABLE IF NOT EXISTS answer_bank (
      id TEXT PRIMARY KEY,
      field_key TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL,
      context TEXT,
      patterns TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS locker_documents (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      file_path TEXT NOT NULL,
      tags TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_notes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_links (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cover_letters (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      job_url TEXT,
      body TEXT NOT NULL,
      is_final INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Generic key/value settings (profile JSON, cover-letter dir, etc.).
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Create indices for common queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_applications_company ON applications(company);
    CREATE INDEX IF NOT EXISTS idx_applications_stage ON applications(current_stage);
    CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at);
    CREATE INDEX IF NOT EXISTS idx_stage_history_application_id ON stage_history(application_id);
    CREATE INDEX IF NOT EXISTS idx_guidance_docs_application_id ON guidance_docs(application_id);
    CREATE INDEX IF NOT EXISTS idx_guidance_docs_stage ON guidance_docs(stage);
    CREATE INDEX IF NOT EXISTS idx_attachments_application_id ON attachments(application_id);
  `);

  runMigrations();
}

/**
 * Idempotent data migrations, run on every startup.
 * Safe to run repeatedly - each is a no-op once applied.
 */
function runMigrations(): void {
  if (!db) return;

  // Add job_source to applications for DBs created before the field existed.
  // ALTER throws "duplicate column name" once applied, so swallow that - it's
  // how we keep this idempotent without a separate schema-version table.
  try {
    db.exec(`ALTER TABLE applications ADD COLUMN job_source TEXT`);
  } catch {
    /* column already exists */
  }
  // Link a cover-letter draft to its application (per-application cover letters).
  try { db.exec(`ALTER TABLE cover_letters ADD COLUMN application_id TEXT`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE cover_letters ADD COLUMN label TEXT`); } catch { /* already exists */ }

  // One-time backfill: stamp every application that predates the job_source
  // field as 'LinkedIn' (where they were all sourced from). Gated on
  // user_version so it runs exactly once - new rows added later keep whatever
  // source the user picks (or null), they don't get forced to LinkedIn.
  const schemaVersion = db.pragma('user_version', { simple: true }) as number;
  if (schemaVersion < 1) {
    db.exec(
      `UPDATE applications SET job_source = 'LinkedIn' WHERE job_source IS NULL OR job_source = ''`
    );
    db.pragma('user_version = 1');
  }

  // Merge the legacy 'started' stage into 'applied'. Adding a job to the tracker
  // means you've applied, so there's no separate pre-apply bucket.
  // 1. Drop redundant 'started' rows for apps that already have an 'applied' row.
  db.exec(
    `DELETE FROM stage_history
       WHERE stage = 'started'
         AND application_id IN (SELECT application_id FROM stage_history WHERE stage = 'applied')`
  );
  // 2. Rename remaining 'started' history rows to 'applied'.
  db.exec(`UPDATE stage_history SET stage = 'applied' WHERE stage = 'started'`);
  // 3. Update current stage on applications.
  db.exec(`UPDATE applications SET current_stage = 'applied' WHERE current_stage = 'started'`);
  // 4. Strip 'started' out of saved workflow stage lists.
  const workflows = db.prepare(`SELECT id, stages FROM workflows`).all() as {
    id: string;
    stages: string;
  }[];
  const updateStages = db.prepare(`UPDATE workflows SET stages = ? WHERE id = ?`);
  for (const wf of workflows) {
    try {
      const stages: string[] = JSON.parse(wf.stages);
      if (stages.includes('started')) {
        const cleaned = stages.filter((s) => s !== 'started');
        if (!cleaned.includes('applied')) cleaned.unshift('applied');
        updateStages.run(JSON.stringify(cleaned), wf.id);
      }
    } catch {
      /* leave malformed rows untouched */
    }
  }
}

/**
 * Get the database instance
 */
export function getDatabase(): DatabaseType.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Workflow CRUD operations

/**
 * Create a new workflow
 */
export function createWorkflow(
  company: string,
  name: string,
  stages: string[],
  isDefault: boolean
): Workflow {
  const database = getDatabase();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const stagesJson = JSON.stringify(stages);

  const stmt = database.prepare(`
    INSERT INTO workflows (id, company, name, stages, is_default, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, company, name, stagesJson, isDefault ? 1 : 0, createdAt);

  return {
    id,
    company,
    name,
    stages,
    is_default: isDefault,
    created_at: createdAt,
  };
}

/**
 * Get a workflow by ID
 */
export function getWorkflow(id: string): Workflow | null {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM workflows WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    company: row.company,
    name: row.name,
    stages: JSON.parse(row.stages),
    is_default: row.is_default === 1,
    created_at: row.created_at,
  };
}

/**
 * Get the default workflow for a company
 */
export function getDefaultWorkflowForCompany(company: string): Workflow | null {
  const database = getDatabase();
  const stmt = database.prepare(
    'SELECT * FROM workflows WHERE company = ? AND is_default = 1 LIMIT 1'
  );
  const row = stmt.get(company) as any;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    company: row.company,
    name: row.name,
    stages: JSON.parse(row.stages),
    is_default: row.is_default === 1,
    created_at: row.created_at,
  };
}

/**
 * Get all workflows
 */
export function getAllWorkflows(): Workflow[] {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM workflows');
  const rows = stmt.all() as any[];

  return rows.map((row) => ({
    id: row.id,
    company: row.company,
    name: row.name,
    stages: JSON.parse(row.stages),
    is_default: row.is_default === 1,
    created_at: row.created_at,
  }));
}

/**
 * Update a workflow
 */
export function updateWorkflow(
  id: string,
  updates: Partial<Workflow>
): Workflow {
  const database = getDatabase();
  const current = getWorkflow(id);

  if (!current) {
    throw new Error(`Workflow with ID ${id} not found`);
  }

  const updated = { ...current, ...updates };
  const stagesJson = JSON.stringify(updated.stages);

  const stmt = database.prepare(`
    UPDATE workflows
    SET company = ?, name = ?, stages = ?, is_default = ?
    WHERE id = ?
  `);

  stmt.run(updated.company, updated.name, stagesJson, updated.is_default ? 1 : 0, id);

  return updated;
}

/**
 * Delete a workflow
 */
export function deleteWorkflow(id: string): void {
  const database = getDatabase();
  // Don't orphan applications: refuse to delete a workflow still in use (the FK
  // would otherwise throw a raw SQLITE_CONSTRAINT). Surface a clear message instead.
  const inUse = (database.prepare('SELECT COUNT(*) AS n FROM applications WHERE workflow_id = ?').get(id) as { n: number }).n;
  if (inUse > 0) {
    throw new Error(`This workflow is used by ${inUse} application${inUse === 1 ? '' : 's'}. Move or delete them first.`);
  }
  database.prepare('DELETE FROM workflows WHERE id = ?').run(id);
}

// Application CRUD operations

/**
 * Create a new application
 */
export function createApplication(
  extractedData: ExtractedJobData,
  workflowId: string,
  notes: string | null = null
): JobApplication {
  const database = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();

  const stmt = database.prepare(`
    INSERT INTO applications (
      id, company, job_title, location, job_url, job_source,
      salary_min, salary_max, equity, benefits,
      job_description, key_responsibilities, required_skills, nice_to_have_skills,
      team_info, hiring_timeline, application_deadline,
      current_stage, workflow_id, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    extractedData.company,
    extractedData.job_title,
    extractedData.location,
    extractedData.job_url,
    extractedData.job_source ?? null,
    extractedData.salary_min ?? null,
    extractedData.salary_max ?? null,
    extractedData.equity ?? null,
    extractedData.benefits ?? null,
    extractedData.job_description,
    extractedData.key_responsibilities,
    extractedData.required_skills,
    extractedData.nice_to_have_skills,
    extractedData.team_info ?? null,
    extractedData.hiring_timeline ?? null,
    extractedData.application_deadline ?? null,
    'applied',
    workflowId,
    notes,
    now,
    now
  );

  return {
    id,
    company: extractedData.company,
    job_title: extractedData.job_title,
    location: extractedData.location,
    job_url: extractedData.job_url,
    job_source: extractedData.job_source ?? null,
    salary_min: extractedData.salary_min,
    salary_max: extractedData.salary_max,
    equity: extractedData.equity,
    benefits: extractedData.benefits,
    job_description: extractedData.job_description,
    key_responsibilities: extractedData.key_responsibilities,
    required_skills: extractedData.required_skills,
    nice_to_have_skills: extractedData.nice_to_have_skills,
    team_info: extractedData.team_info,
    hiring_timeline: extractedData.hiring_timeline,
    application_deadline: extractedData.application_deadline,
    current_stage: 'applied',
    workflow_id: workflowId,
    notes,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Get an application by ID
 */
export function getApplication(id: string): JobApplication | null {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM applications WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    return null;
  }

  return rowToApplication(row);
}

/**
 * Get all applications with optional filters
 */
export function getAllApplications(filters?: {
  company?: string;
  search?: string;
  stage?: string;
  dateFrom?: string;
  dateTo?: string;
}): JobApplication[] {
  const database = getDatabase();
  let query = 'SELECT * FROM applications WHERE 1=1';
  const params: any[] = [];

  // Fuzzy multi-field search (LIKE is case-insensitive for ASCII in SQLite). Each
  // whitespace-separated term must match somewhere, so a role, company, or keyword works.
  if (filters?.search) {
    const fields = ['company', 'job_title', 'location', 'job_source', 'required_skills', 'nice_to_have_skills', 'key_responsibilities', 'notes', 'job_description'];
    for (const term of filters.search.split(/\s+/).filter(Boolean)) {
      query += ' AND (' + fields.map((f) => `${f} LIKE ?`).join(' OR ') + ')';
      for (let i = 0; i < fields.length; i++) params.push(`%${term}%`);
    }
  }

  // Backward-compatible exact company filter (partial match via LIKE).
  if (filters?.company) {
    query += ' AND company LIKE ?';
    params.push(`%${filters.company}%`);
  }

  if (filters?.stage) {
    query += ' AND current_stage = ?';
    params.push(filters.stage);
  }

  if (filters?.dateFrom) {
    query += ' AND created_at >= ?';
    params.push(filters.dateFrom);
  }

  if (filters?.dateTo) {
    query += ' AND created_at <= ?';
    params.push(filters.dateTo);
  }

  query += ' ORDER BY created_at DESC';

  const stmt = database.prepare(query);
  const rows = stmt.all(...params) as any[];

  return rows.map(rowToApplication);
}

/**
 * Update an application
 */
export function updateApplication(
  id: string,
  updates: Partial<JobApplication>
): JobApplication {
  const database = getDatabase();
  const current = getApplication(id);

  if (!current) {
    throw new Error(`Application with ID ${id} not found`);
  }

  const updated = { ...current, ...updates, updated_at: new Date().toISOString() };

  const stmt = database.prepare(`
    UPDATE applications
    SET company = ?, job_title = ?, location = ?, job_url = ?, job_source = ?,
        salary_min = ?, salary_max = ?, equity = ?, benefits = ?,
        job_description = ?, key_responsibilities = ?, required_skills = ?,
        nice_to_have_skills = ?, team_info = ?, hiring_timeline = ?,
        application_deadline = ?, current_stage = ?, workflow_id = ?,
        notes = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    updated.company,
    updated.job_title,
    updated.location,
    updated.job_url,
    updated.job_source ?? null,
    updated.salary_min ?? null,
    updated.salary_max ?? null,
    updated.equity ?? null,
    updated.benefits ?? null,
    updated.job_description,
    updated.key_responsibilities,
    updated.required_skills,
    updated.nice_to_have_skills,
    updated.team_info ?? null,
    updated.hiring_timeline ?? null,
    updated.application_deadline ?? null,
    updated.current_stage,
    updated.workflow_id,
    updated.notes ?? null,
    updated.updated_at,
    id
  );

  return updated;
}

/**
 * Delete an application and all related records
 */
export function deleteApplication(id: string): void {
  const database = getDatabase();

  // Delete all related records first (cascade delete)
  database.prepare('DELETE FROM stage_history WHERE application_id = ?').run(id);
  database.prepare('DELETE FROM guidance_docs WHERE application_id = ?').run(id);
  database.prepare('DELETE FROM attachments WHERE application_id = ?').run(id);
  database.prepare('DELETE FROM chat_messages WHERE application_id = ?').run(id);

  // Then delete the application itself
  database.prepare('DELETE FROM applications WHERE id = ?').run(id);
}

// Chat message CRUD operations

export interface ChatMessageRow {
  id: string;
  application_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export function addChatMessage(
  applicationId: string,
  role: 'user' | 'assistant',
  content: string
): ChatMessageRow {
  const database = getDatabase();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  database
    .prepare('INSERT INTO chat_messages (id, application_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, applicationId, role, content, createdAt);
  return { id, application_id: applicationId, role, content, created_at: createdAt };
}

export function getChatMessages(applicationId: string): ChatMessageRow[] {
  const database = getDatabase();
  return database
    .prepare('SELECT * FROM chat_messages WHERE application_id = ? ORDER BY created_at ASC')
    .all(applicationId) as ChatMessageRow[];
}

// Stage History CRUD operations

/**
 * Create a stage history entry
 */
export function createStageHistory(
  applicationId: string,
  stage: string,
  notes: string | null = null,
  guidance: string | null = null
): StageHistory {
  const database = getDatabase();
  const id = randomUUID();
  const enteredAt = new Date().toISOString();

  const stmt = database.prepare(`
    INSERT INTO stage_history (
      id, application_id, stage, entered_at, exited_at, notes, guidance, outcome
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, applicationId, stage, enteredAt, null, notes, guidance, null);

  return {
    id,
    application_id: applicationId,
    stage,
    entered_at: enteredAt,
    exited_at: null,
    notes,
    guidance,
    outcome: null,
  };
}

/**
 * Get stage history for an application
 */
export function getStageHistoryForApplication(applicationId: string): StageHistory[] {
  const database = getDatabase();
  const stmt = database.prepare(
    'SELECT * FROM stage_history WHERE application_id = ? ORDER BY entered_at ASC'
  );
  const rows = stmt.all(applicationId) as any[];

  return rows.map(rowToStageHistory);
}

/**
 * Update a stage history entry
 */
export function updateStageHistory(
  id: string,
  updates: Partial<StageHistory>
): StageHistory {
  const database = getDatabase();
  const stmt = database.prepare(
    'SELECT * FROM stage_history WHERE id = ?'
  );
  const row = stmt.get(id) as any;

  if (!row) {
    throw new Error(`Stage history with ID ${id} not found`);
  }

  const current = rowToStageHistory(row);
  const updated = { ...current, ...updates };

  const updateStmt = database.prepare(`
    UPDATE stage_history
    SET stage = ?, entered_at = ?, exited_at = ?, notes = ?, guidance = ?, outcome = ?
    WHERE id = ?
  `);

  updateStmt.run(
    updated.stage,
    updated.entered_at,
    updated.exited_at ?? null,
    updated.notes ?? null,
    updated.guidance ?? null,
    updated.outcome ?? null,
    id
  );

  return updated;
}

// Guidance Docs CRUD operations

/**
 * Create guidance documents for an application and stage
 */
export function createGuidanceDocs(
  applicationId: string,
  stage: string,
  content: GuidanceContent
): GuidanceDoc[] {
  const database = getDatabase();
  const generatedAt = new Date().toISOString();
  const guidanceDocs: GuidanceDoc[] = [];

  const guidanceTypes: GuidanceType[] = [
    'interview_prep',
    'company_research',
    'application_strategy',
    'follow_up_template',
  ];

  const stmt = database.prepare(`
    INSERT INTO guidance_docs (
      id, application_id, stage, guidance_type, content, generated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const guidanceType of guidanceTypes) {
    const id = randomUUID();
    const contentValue = content[guidanceType];

    if (contentValue) {
      stmt.run(id, applicationId, stage, guidanceType, contentValue, generatedAt);

      guidanceDocs.push({
        id,
        application_id: applicationId,
        stage,
        guidance_type: guidanceType,
        content: contentValue,
        generated_at: generatedAt,
      });
    }
  }

  return guidanceDocs;
}

/**
 * Get guidance docs for an application and stage
 */
export function getGuidanceDocsForApplicationAndStage(
  applicationId: string,
  stage: string
): GuidanceDoc[] {
  const database = getDatabase();
  const stmt = database.prepare(
    'SELECT * FROM guidance_docs WHERE application_id = ? AND stage = ? ORDER BY generated_at DESC'
  );
  const rows = stmt.all(applicationId, stage) as any[];

  return rows.map(rowToGuidanceDoc);
}

/**
 * Get all guidance docs for an application
 */
export function getAllGuidanceDocsForApplication(applicationId: string): GuidanceDoc[] {
  const database = getDatabase();
  const stmt = database.prepare(
    'SELECT * FROM guidance_docs WHERE application_id = ? ORDER BY generated_at DESC'
  );
  const rows = stmt.all(applicationId) as any[];

  return rows.map(rowToGuidanceDoc);
}

// Helper functions for converting database rows to typed objects

function rowToApplication(row: any): JobApplication {
  return {
    id: row.id,
    company: row.company,
    job_title: row.job_title,
    location: row.location,
    job_url: row.job_url,
    job_source: row.job_source ?? null,
    salary_min: row.salary_min,
    salary_max: row.salary_max,
    equity: row.equity,
    benefits: row.benefits,
    job_description: row.job_description,
    key_responsibilities: row.key_responsibilities,
    required_skills: row.required_skills,
    nice_to_have_skills: row.nice_to_have_skills,
    team_info: row.team_info,
    hiring_timeline: row.hiring_timeline,
    application_deadline: row.application_deadline,
    current_stage: row.current_stage,
    workflow_id: row.workflow_id,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToStageHistory(row: any): StageHistory {
  return {
    id: row.id,
    application_id: row.application_id,
    stage: row.stage,
    entered_at: row.entered_at,
    exited_at: row.exited_at,
    notes: row.notes,
    guidance: row.guidance,
    outcome: row.outcome,
  };
}

function rowToGuidanceDoc(row: any): GuidanceDoc {
  return {
    id: row.id,
    application_id: row.application_id,
    stage: row.stage,
    guidance_type: row.guidance_type,
    content: row.content,
    generated_at: row.generated_at,
  };
}

// Attachment CRUD operations

/**
 * Create an attachment for an application
 */
export function createAttachment(
  applicationId: string,
  fileName: string,
  fileType: string,
  filePath: string
): Attachment {
  const database = getDatabase();
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  const stmt = database.prepare(`
    INSERT INTO attachments (id, application_id, file_name, file_type, file_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, applicationId, fileName, fileType, filePath, createdAt);

  return {
    id,
    application_id: applicationId,
    file_name: fileName,
    file_type: fileType,
    file_path: filePath,
    created_at: createdAt,
  };
}

/**
 * Get all attachments for an application
 */
export function getAttachmentsForApplication(applicationId: string): Attachment[] {
  const database = getDatabase();
  const stmt = database.prepare(
    'SELECT * FROM attachments WHERE application_id = ? ORDER BY created_at DESC'
  );
  const rows = stmt.all(applicationId) as any[];

  return rows.map((row) => ({
    id: row.id,
    application_id: row.application_id,
    file_name: row.file_name,
    file_type: row.file_type,
    file_path: row.file_path,
    created_at: row.created_at,
  }));
}

/**
 * Delete an attachment
 */
export function deleteAttachment(id: string): void {
  const database = getDatabase();
  const stmt = database.prepare('DELETE FROM attachments WHERE id = ?');
  stmt.run(id);
}

// ── answer bank ───────────────────────────────────────────────────
function rowToAnswer(row: any): AnswerBankEntry {
  return {
    id: row.id,
    fieldKey: row.field_key,
    label: row.label,
    value: row.value,
    context: row.context ?? null,
    patterns: JSON.parse(row.patterns || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAnswerBank(): AnswerBankEntry[] {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM answer_bank ORDER BY label COLLATE NOCASE').all() as any[]).map(rowToAnswer);
}

export function upsertAnswer(input: Partial<AnswerBankEntry> & { value: string; label: string }): AnswerBankEntry {
  const db = getDatabase();
  const now = new Date().toISOString();
  const patterns = JSON.stringify(input.patterns ?? []);
  const fieldKey = input.fieldKey || input.label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (input.id) {
    db.prepare('UPDATE answer_bank SET field_key=?, label=?, value=?, context=?, patterns=?, updated_at=? WHERE id=?')
      .run(fieldKey, input.label, input.value, input.context ?? null, patterns, now, input.id);
    return rowToAnswer(db.prepare('SELECT * FROM answer_bank WHERE id=?').get(input.id));
  }
  const id = randomUUID();
  db.prepare('INSERT INTO answer_bank (id, field_key, label, value, context, patterns, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, fieldKey, input.label, input.value, input.context ?? null, patterns, now, now);
  return rowToAnswer(db.prepare('SELECT * FROM answer_bank WHERE id=?').get(id));
}

export function deleteAnswer(id: string): void {
  getDatabase().prepare('DELETE FROM answer_bank WHERE id=?').run(id);
}

// ── document locker ───────────────────────────────────────────────
function rowToDoc(row: any): LockerDocument {
  return {
    id: row.id,
    label: row.label,
    filePath: row.file_path,
    tags: JSON.parse(row.tags || '[]'),
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
  };
}

export function getDocuments(): LockerDocument[] {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM locker_documents ORDER BY created_at DESC').all() as any[]).map(rowToDoc);
}

export function addDocument(label: string, filePath: string, tags: string[], isDefault: boolean): LockerDocument {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  // a default replaces any existing default sharing its first tag
  if (isDefault && tags[0]) {
    for (const d of getDocuments()) {
      if (d.isDefault && d.tags[0] === tags[0]) {
        db.prepare('UPDATE locker_documents SET is_default=0 WHERE id=?').run(d.id);
      }
    }
  }
  db.prepare('INSERT INTO locker_documents (id, label, file_path, tags, is_default, created_at) VALUES (?,?,?,?,?,?)')
    .run(id, label, filePath, JSON.stringify(tags), isDefault ? 1 : 0, now);
  return rowToDoc(db.prepare('SELECT * FROM locker_documents WHERE id=?').get(id));
}

// Per-resume "focus" notes (docId -> focus text), used to pick the best variant.
export function getResumeFocus(): Record<string, string> {
  try { const raw = getSetting('resume_focus'); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
export function setResumeFocus(docId: string, focus: string): void {
  const m = getResumeFocus();
  if (focus.trim()) m[docId] = focus.trim(); else delete m[docId];
  setSetting('resume_focus', JSON.stringify(m));
}

// Make a document the default for its first tag (e.g. the default resume variant).
export function setDocumentDefault(id: string): void {
  const db = getDatabase();
  const doc = db.prepare('SELECT tags FROM locker_documents WHERE id=?').get(id) as any;
  if (!doc) return;
  const tag0 = (JSON.parse(doc.tags || '[]')[0]) || '';
  for (const d of getDocuments()) {
    if (d.id !== id && d.tags[0] === tag0 && d.isDefault) db.prepare('UPDATE locker_documents SET is_default=0 WHERE id=?').run(d.id);
  }
  db.prepare('UPDATE locker_documents SET is_default=1 WHERE id=?').run(id);
}

export function deleteDocument(id: string): void {
  getDatabase().prepare('DELETE FROM locker_documents WHERE id=?').run(id);
}

// ── voice profile ─────────────────────────────────────────────────
export function getVoiceNotes(): VoiceNote[] {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM voice_notes ORDER BY created_at DESC').all() as any[]).map((r) => ({
    id: r.id, kind: r.kind as VoiceNoteKind, note: r.note, createdAt: r.created_at,
  }));
}

export function addVoiceNote(kind: VoiceNoteKind, note: string): VoiceNote {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO voice_notes (id, kind, note, created_at) VALUES (?,?,?,?)').run(id, kind, note, now);
  return { id, kind, note, createdAt: now };
}

export function deleteVoiceNote(id: string): void {
  getDatabase().prepare('DELETE FROM voice_notes WHERE id=?').run(id);
}

// ── portfolio links (Claude can reference / fetch these) ───────────
export function getPortfolioLinks(): PortfolioLink[] {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM portfolio_links ORDER BY created_at DESC').all() as any[]).map((r) => ({
    id: r.id, label: r.label, url: r.url, createdAt: r.created_at,
  }));
}

export function addPortfolioLink(label: string, url: string): PortfolioLink {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO portfolio_links (id, label, url, created_at) VALUES (?,?,?,?)').run(id, label, url, now);
  return { id, label, url, createdAt: now };
}

export function deletePortfolioLink(id: string): void {
  getDatabase().prepare('DELETE FROM portfolio_links WHERE id=?').run(id);
}

// ── cover-letter vault ────────────────────────────────────────────
function rowToCover(r: any): CoverLetter {
  return {
    id: r.id, company: r.company, role: r.role, jobUrl: r.job_url, applicationId: r.application_id ?? null,
    label: r.label ?? null, body: r.body, isFinal: r.is_final === 1, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// Vault view: explicitly-saved letters (is_final=1) + standalone ones, NOT the
// per-application auto-draft (is_final=0), which would otherwise be noise.
export function getCoverLetters(): CoverLetter[] {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM cover_letters WHERE is_final=1 OR application_id IS NULL ORDER BY updated_at DESC').all() as any[]).map(rowToCover);
}

// The working (auto-saved) draft for an application - exactly one, is_final=0.
export function getCoverLetterForApplication(applicationId: string): CoverLetter | null {
  const db = getDatabase();
  const r = db.prepare('SELECT * FROM cover_letters WHERE application_id=? AND is_final=0 ORDER BY updated_at DESC LIMIT 1').get(applicationId);
  return r ? rowToCover(r) : null;
}

// Saved versions you chose to keep for an application (is_final=1), newest first.
export function getSavedCoverLettersForApplication(applicationId: string): CoverLetter[] {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM cover_letters WHERE application_id=? AND is_final=1 ORDER BY updated_at DESC').all(applicationId) as any[]).map(rowToCover);
}

// Upsert the single working DRAFT (is_final=0) for an application.
export function saveCoverLetterForApplication(applicationId: string, input: { company: string; role: string; jobUrl?: string | null; body: string }): CoverLetter {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM cover_letters WHERE application_id=? AND is_final=0 LIMIT 1').get(applicationId) as any;
  if (existing) {
    db.prepare('UPDATE cover_letters SET company=?, role=?, job_url=?, body=?, updated_at=? WHERE id=?')
      .run(input.company, input.role, input.jobUrl ?? null, input.body, now, existing.id);
    return rowToCover(db.prepare('SELECT * FROM cover_letters WHERE id=?').get(existing.id));
  }
  const id = randomUUID();
  db.prepare('INSERT INTO cover_letters (id, company, role, job_url, application_id, label, body, is_final, created_at, updated_at) VALUES (?,?,?,?,?,?,?,0,?,?)')
    .run(id, input.company, input.role, input.jobUrl ?? null, applicationId, null, input.body, now, now);
  return rowToCover(db.prepare('SELECT * FROM cover_letters WHERE id=?').get(id));
}

// Snapshot a cover letter you LIKE as a kept version (is_final=1) for an application.
export function saveCoverLetterVersion(applicationId: string, input: { company: string; role: string; jobUrl?: string | null; body: string; label?: string | null }): CoverLetter {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare('INSERT INTO cover_letters (id, company, role, job_url, application_id, label, body, is_final, created_at, updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)')
    .run(id, input.company, input.role, input.jobUrl ?? null, applicationId, input.label ?? null, input.body, now, now);
  return rowToCover(db.prepare('SELECT * FROM cover_letters WHERE id=?').get(id));
}

export function saveCoverLetter(input: Partial<CoverLetter> & { company: string; role: string; body: string }): CoverLetter {
  const db = getDatabase();
  const now = new Date().toISOString();
  if (input.id) {
    db.prepare('UPDATE cover_letters SET company=?, role=?, job_url=?, body=?, is_final=?, updated_at=? WHERE id=?')
      .run(input.company, input.role, input.jobUrl ?? null, input.body, input.isFinal ? 1 : 0, now, input.id);
    return rowToCover(db.prepare('SELECT * FROM cover_letters WHERE id=?').get(input.id));
  }
  const id = randomUUID();
  db.prepare('INSERT INTO cover_letters (id, company, role, job_url, body, is_final, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, input.company, input.role, input.jobUrl ?? null, input.body, input.isFinal ? 1 : 0, now, now);
  return rowToCover(db.prepare('SELECT * FROM cover_letters WHERE id=?').get(id));
}

export function deleteCoverLetter(id: string): void {
  getDatabase().prepare('DELETE FROM cover_letters WHERE id=?').run(id);
}

// ── Key/value settings ───────────────────────────────────────────────────────
export function getSetting(key: string): string | null {
  const r = getDatabase().prepare('SELECT value FROM app_settings WHERE key=?').get(key) as any;
  return r ? r.value : null;
}
export function setSetting(key: string, value: string): void {
  getDatabase().prepare('INSERT INTO app_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}

