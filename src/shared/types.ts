// Shared TypeScript types for Job Application Tracker

/**
 * The job sites / channels an application can be found on.
 * Single source of truth - the Add form dropdown, the AI extraction prompt,
 * and any display all reference this list. Ordered roughly by AU popularity,
 * with generic channels and "Other" last.
 */
export const JOB_SOURCES = [
  'Seek',
  'LinkedIn',
  'Indeed',
  'Prosple',
  'GradConnection',
  'Jora',
  'Glassdoor',
  'CareerOne',
  'Workforce Australia',
  'Hatch',
  'Company website',
  'Referral',
  'Recruiter / Agency',
  'Other',
] as const;

export type JobSource = (typeof JOB_SOURCES)[number];

/**
 * Represents a job application with all relevant information
 */
export interface JobApplication {
  id: string;
  company: string;
  job_title: string;
  location: string;
  job_url: string;
  /** Which job site / channel this was found on, e.g. "Seek". null = not specified. */
  job_source: string | null;
  salary_min: number | null;
  salary_max: number | null;
  equity: string | null;
  benefits: string | null;
  job_description: string;
  key_responsibilities: string;
  required_skills: string;
  nice_to_have_skills: string;
  team_info: string | null;
  hiring_timeline: string | null;
  application_deadline: string | null;
  current_stage: string;
  workflow_id: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Represents a workflow template with stages
 */
export interface Workflow {
  id: string;
  company: string;
  name: string;
  stages: string[];
  is_default: boolean;
  created_at: string;
}

/**
 * Represents the history of stage transitions for an application
 */
export interface StageHistory {
  id: string;
  application_id: string;
  stage: string;
  entered_at: string;
  exited_at: string | null;
  notes: string | null;
  guidance: string | null;
  outcome: string | null;
}

/**
 * Type for guidance document types
 */
export type GuidanceType = 'interview_prep' | 'company_research' | 'application_strategy' | 'follow_up_template';

/**
 * Represents a guidance document for an application stage
 */
export interface GuidanceDoc {
  id: string;
  application_id: string;
  stage: string;
  guidance_type: GuidanceType;
  content: string;
  generated_at: string;
}

/**
 * Represents job data extracted from a job listing
 * (without application-specific fields like id, current_stage, workflow_id, notes, created_at, updated_at)
 */
export interface ExtractedJobData {
  company: string;
  job_title: string;
  location: string;
  job_url: string;
  job_source: string | null;
  salary_min: number | null;
  salary_max: number | null;
  equity: string | null;
  benefits: string | null;
  job_description: string;
  key_responsibilities: string;
  required_skills: string;
  nice_to_have_skills: string;
  team_info: string | null;
  hiring_timeline: string | null;
  application_deadline: string | null;
}

/**
 * Represents content for guidance documents
 */
export interface GuidanceContent {
  interview_prep: string;
  company_research: string;
  application_strategy: string;
  follow_up_template: string;
}

/**
 * Represents an attachment (screenshot, image, PDF, etc.)
 */
export interface Attachment {
  id: string;
  application_id: string;
  file_name: string;
  file_type: string;
  file_path: string;
  created_at: string;
}

/**
 * Application flow (Sankey) aggregation types.
 * Built by aggregating every application's stage_history into nodes + links.
 */
export type FlowNodeKind = 'active' | 'offer' | 'rejected' | 'withdrawn';

export interface FlowNode {
  /** canonical stage key, e.g. 'applied' */
  id: string;
  /** display label, e.g. 'Applied' */
  label: string;
  /** number of applications that passed through this stage */
  count: number;
  kind: FlowNodeKind;
}

export interface FlowLink {
  /** source stage key */
  source: string;
  /** target stage key */
  target: string;
  /** number of applications that made this transition */
  count: number;
}

export interface FlowSummary {
  total: number;
  offers: number;
  rejected: number;
  withdrawn: number;
  inProgress: number;
}

export interface FlowData {
  nodes: FlowNode[];
  links: FlowLink[];
  summary: FlowSummary;
}

// ── Setup data the Chrome extension and cover letters use ───────────────────────────────────────────────────
export interface AnswerBankEntry {
  id: string;
  fieldKey: string;        // normalized concept, e.g. "legal_name", "years_experience"
  label: string;           // human label, e.g. "Legal name"
  value: string;           // the answer to fill
  context: string | null;  // when to use it, e.g. "when the field asks for legal/full name"
  patterns: string[];      // field-label substrings that map to this answer
  createdAt: string;
  updatedAt: string;
}

export interface LockerDocument {
  id: string;
  label: string;           // "Resume", "Cover letter (eng roles)"
  filePath: string;        // local path; the companion hands it to the page
  tags: string[];          // ["resume"], ["cover-letter"], ...
  isDefault: boolean;      // default file for its primary tag
  createdAt: string;
}

export type VoiceNoteKind = 'like' | 'dislike' | 'style';
export interface VoiceNote {
  id: string;
  kind: VoiceNoteKind;
  note: string;            // a learned writing preference, grown from feedback
  createdAt: string;
}

// Portfolio is a live website (or several links) Claude can reference/fetch.
export interface PortfolioLink {
  id: string;
  label: string;           // "Portfolio site", "GitHub", "Case study - Acme"
  url: string;
  createdAt: string;
}

// The cover-letter vault: perfected letters saved for reuse, plus your own.
export interface CoverLetter {
  id: string;
  company: string;
  role: string;
  jobUrl: string | null;
  applicationId: string | null;   // set when this draft belongs to a tracked application
  label: string | null;           // friendly name for a saved version
  body: string;
  isFinal: boolean;        // marked perfected/locked in the vault
  createdAt: string;
  updatedAt: string;
}

