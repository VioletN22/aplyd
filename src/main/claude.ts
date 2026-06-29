// Calls the `claude` CLI in subscription mode (from `claude login`). No API key and
// no SDK: the prompt is piped in via stdin, the model is sonnet for speed. This is the
// only path the app uses for AI (cover letters, listing extraction, chat).
import { ExtractedJobData } from "../shared/types";
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

const CLAUDE_HELP =
  'Claude CLI not available. Install it and run `claude login` (the app uses your ' +
  'Claude subscription, no API key needed), then try again.';

// Track in-flight claude subprocesses so we can kill them when the app quits;
// otherwise quitting mid-generation leaves an orphaned process behind.
const liveProcs = new Set<ChildProcess>();
export function killClaudeProcesses(): void {
  for (const p of liveProcs) { try { p.kill(); } catch { /* ignore */ } }
  liveProcs.clear();
}

// Cross-platform (macOS + Windows): spawn the `claude` CLI in subscription mode and
// feed the prompt via stdin. We strip API-key env vars to force subscription auth,
// and prepend the usual CLI install locations to PATH (the GUI app often launches
// with a minimal PATH). On Windows we use shell:true so `claude.cmd` resolves.
export function runClaudeCLI(prompt: string, timeoutMs = 60000): Promise<string> {
  const isWin = process.platform === 'win32';
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_CHILD_SESSION']) delete env[k];
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const extraPaths = isWin
    ? [path.join(process.env.APPDATA || '', 'npm'), path.join(home, 'AppData', 'Local', 'Microsoft', 'WindowsApps')]
    : ['/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.local', 'bin'), path.join(home, 'bin')];
  env.PATH = [...extraPaths, env.PATH || ''].filter(Boolean).join(path.delimiter);

  return new Promise((resolve, reject) => {
    // SECURITY: argv is a FIXED constant array and the prompt goes in via stdin, so
    // there is no command/argument injection even with shell:true on Windows. Never
    // append any user-controlled value to this args array.
    const proc = spawn('claude', ['-p', '--model', 'sonnet', '--output-format', 'text'], { env, shell: isWin });
    liveProcs.add(proc);
    const done = () => { liveProcs.delete(proc); };
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { try { proc.kill(); } catch { /* ignore */ } done(); reject(new Error('claude subprocess timed out')); }, timeoutMs);
    proc.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
    proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    proc.on('error', (e: Error) => { clearTimeout(timer); done(); reject(new Error('claude CLI not found / failed to start: ' + e.message)); });
    proc.on('close', (code: number) => {
      clearTimeout(timer); done();
      if (code !== 0) reject(new Error(`claude CLI exited ${code}: ${stderr.slice(0, 400)}`));
      else resolve(stdout.trim());
    });
    try { proc.stdin?.write(prompt); proc.stdin?.end(); } catch { /* ignore */ }
  });
}

// Robustly parse JSON from a Claude response (handles code fences + surrounding prose).
function parseJSONResponse<T>(text: string): T {
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON object found in response: ${text.slice(0, 200)}`);
  }
  cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned) as T;
}

// Extract structured job data from raw job-listing text, via the Claude CLI.
export async function extractJobListing(jobListingText: string): Promise<ExtractedJobData> {
  const extractionPrompt = `Extract structured data from this job listing (it may be a messy copy-paste from LinkedIn or another job board, full of UI text like "Apply", "Save", "Promoted", "Premium" - ignore all that noise).

CRITICAL RULES:
- company and job_title are almost always present - look carefully. E.g. "Software Engineer at Frollo" means job_title="Software Engineer", company="Frollo". Never return "Unknown" if the info exists anywhere in the text.
- job_description must be a CLEAN, CONCISE rewrite (max 150 words): what the company does + what the role is. Strip ALL job-board boilerplate, promo text, premium upsells, follower counts, etc.
- key_responsibilities, required_skills, nice_to_have_skills: short bullet-style lines separated by newlines, max 6 each.
- Salaries: convert to numbers (e.g. "$120k" -> 120000). Use null if not stated.
- job_source: the job site/channel this listing came from, IF it's obvious from the text or URL. Choose EXACTLY ONE from: "Seek", "LinkedIn", "Indeed", "Prosple", "GradConnection", "Jora", "Glassdoor", "CareerOne", "Workforce Australia", "Hatch", "Company website", "Referral", "Recruiter / Agency", "Other". Use null if you can't tell. Do NOT guess "Company website" just because a company is named.

Return ONLY a valid JSON object (no markdown fences, no commentary) with exactly these fields:
{
  "company": string,
  "job_title": string,
  "location": string,
  "job_url": string (empty string if not found),
  "job_source": string | null,
  "salary_min": number | null,
  "salary_max": number | null,
  "equity": string | null,
  "benefits": string | null (one short line),
  "job_description": string (clean, max 150 words),
  "key_responsibilities": string (newline-separated bullets),
  "required_skills": string (newline-separated bullets),
  "nice_to_have_skills": string (newline-separated bullets, empty string if none),
  "team_info": string | null,
  "hiring_timeline": string | null,
  "application_deadline": string | null
}

Job listing text:
${jobListingText}`;

  let responseText: string;
  try {
    responseText = await runClaudeCLI(extractionPrompt);
  } catch {
    throw new Error(CLAUDE_HELP);
  }

  let extractedData: ExtractedJobData;
  try {
    extractedData = parseJSONResponse<ExtractedJobData>(responseText);
  } catch (error) {
    throw new Error(`Failed to parse Claude extraction response as JSON: ${responseText.slice(0, 300)}. Error: ${error}`);
  }

  // Safe defaults so validation doesn't reject good extractions.
  extractedData.job_url = extractedData.job_url || '';
  extractedData.nice_to_have_skills = extractedData.nice_to_have_skills || '';
  extractedData.job_source = extractedData.job_source || null;

  const requiredFields: (keyof ExtractedJobData)[] = ["company", "job_title", "job_description"];
  for (const field of requiredFields) {
    if (!extractedData[field]) {
      throw new Error(`Missing required field in extraction: ${field}. Response: ${responseText.slice(0, 300)}`);
    }
  }

  extractedData.location = extractedData.location || '';
  extractedData.key_responsibilities = extractedData.key_responsibilities || '';
  extractedData.required_skills = extractedData.required_skills || '';
  extractedData.salary_min = (extractedData.salary_min !== null && extractedData.salary_min !== undefined) ? Number(extractedData.salary_min) : null;
  extractedData.salary_max = (extractedData.salary_max !== null && extractedData.salary_max !== undefined) ? Number(extractedData.salary_max) : null;

  return extractedData;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

// Chat about a specific application; the application context is injected so the
// assistant already knows the job (no copy-pasting needed).
export async function chatAboutApplication(appContext: string, history: ChatTurn[], userMessage: string): Promise<string> {
  const historyText = history
    .slice(-10)
    .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
    .join('\n\n');

  const prompt = `You are a sharp, concise job application coach inside a job tracker app. You already have full context on the application below - never ask the user to paste the job listing.

APPLICATION CONTEXT:
${appContext}

${historyText ? `CONVERSATION SO FAR:\n${historyText}\n\n` : ''}User: ${userMessage}

Rules for your reply:
- Be brief and direct. Short paragraphs or tight bullet lists. No essays.
- Plain text only (no markdown headers). Max ~150 words unless the user explicitly asks for something long (like a cover letter).
- Be specific to THIS company and role, not generic advice.

Reply now as the assistant:`;

  return runClaudeCLI(prompt, 90000);
}
