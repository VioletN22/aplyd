// Type-only import - erased at compile time. The SDK is required lazily in
// getClient() so it stays off the app's cold-start path. The CLI path
// (runClaudeCLI) is what's normally used and needs no SDK at all.
import type Anthropic from "@anthropic-ai/sdk";
import { ExtractedJobData, GuidanceContent } from "../shared/types";
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { spawn } from 'child_process';

// Polyfill fetch, Headers, and FormData if not available (for Electron environment)
if (!globalThis.fetch) {
  const fetch = require('node-fetch');
  globalThis.fetch = fetch;
  globalThis.Headers = fetch.Headers;
  globalThis.FormData = require('form-data');
  globalThis.Response = fetch.Response;
  globalThis.Request = fetch.Request;
}

// Claude authentication using session tokens (like Claude CLI)
let client: Anthropic | null = null;

/**
 * Run Claude via the CLI (uses subscription authentication from `claude login`)
 * This is the same approach Inkd uses - spawns the claude command directly
 */
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
    // --model sonnet: ~10x faster than Opus so extractions finish in seconds.
    const proc = spawn('claude', ['-p', '--model', 'sonnet', '--output-format', 'text'], { env, shell: isWin });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      reject(new Error('claude subprocess timed out'));
    }, timeoutMs);

    proc.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
    proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    proc.on('error', (e: Error) => { clearTimeout(timer); reject(new Error('claude CLI not found / failed to start: ' + e.message)); });
    proc.on('close', (code: number) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`claude CLI exited ${code}: ${stderr.slice(0, 400)}`));
      else resolve(stdout.trim());
    });
    try { proc.stdin?.write(prompt); proc.stdin?.end(); } catch { /* ignore */ }
  });
}

function getStoredAuthToken(): string | null {
  try {
    // Check environment variables first
    const envToken = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (envToken) {
      console.log('[Claude Auth] Found token in environment variable');
      return envToken;
    }

    // Check multiple possible Claude CLI token locations
    const homeDir = app.getPath('home');
    const possiblePaths = [
      // macOS - most common locations
      path.join(homeDir, 'Library', 'Application Support', 'Claude', 'config.json'),
      path.join(homeDir, 'Library', 'Application Support', 'Claude', 'auth.json'),
      path.join(homeDir, '.cache', 'claude', 'auth.json'),
      path.join(homeDir, '.cache', 'claude', 'token'),
      // Linux/Unix
      path.join(homeDir, '.config', 'claude', 'config.json'),
      path.join(homeDir, '.config', 'claude', 'auth.json'),
      path.join(homeDir, '.claude', 'config.json'),
      path.join(homeDir, '.claude', 'auth.json'),
      path.join(homeDir, '.claude', 'auth-token'),
      path.join(homeDir, '.local', 'share', 'claude', 'auth.json'),
      // Windows
      path.join(homeDir, 'AppData', 'Local', 'Claude', 'config.json'),
      path.join(homeDir, 'AppData', 'Local', 'Claude', 'auth.json'),
      path.join(homeDir, 'AppData', 'Roaming', 'Claude', 'config.json'),
    ];

    console.log('[Claude Auth] Checking token locations:');
    console.log('[Claude Auth] Home directory:', homeDir);

    for (const tokenPath of possiblePaths) {
      console.log('[Claude Auth] Checking:', tokenPath, 'exists:', fs.existsSync(tokenPath));

      if (fs.existsSync(tokenPath)) {
        try {
          const content = fs.readFileSync(tokenPath, 'utf-8').trim();
          console.log('[Claude Auth] Found file at:', tokenPath);
          console.log('[Claude Auth] File size:', content.length, 'bytes');

          // If it's JSON, extract the token
          if (content.startsWith('{')) {
            try {
              const data = JSON.parse(content);
              // Try multiple possible token field names
              const token =
                data.token ||
                data.apiKey ||
                data.api_key ||
                data.authToken ||
                data.auth_token ||
                data.accessToken ||
                data.access_token ||
                (data.auth && data.auth.token) ||
                (data.auth && data.auth.api_key);

              if (token) {
                console.log('[Claude Auth] ✓ Found token in JSON at:', tokenPath);
                console.log('[Claude Auth] Token field was:', Object.keys(data).join(', '));
                return token;
              } else {
                console.log('[Claude Auth] JSON found but no recognized token field. Keys:', Object.keys(data).join(', '));
              }
            } catch (e) {
              console.log('[Claude Auth] JSON parse error:', e);
              // Not valid JSON, try as plain token
              if (content) {
                console.log('[Claude Auth] ✓ Using as plain text token from:', tokenPath);
                return content;
              }
            }
          } else if (content) {
            // Plain text token
            console.log('[Claude Auth] ✓ Using plain text token from:', tokenPath);
            return content;
          }
        } catch (err) {
          console.log('[Claude Auth] Error reading file:', err);
        }
      }
    }

    console.log('[Claude Auth] ✗ No token found in any location');
  } catch (error) {
    console.error('[Claude Auth] Error:', error);
  }
  return null;
}


export function getClient(): Anthropic {
  if (!client) {
    try {
      // Lazy require - the SDK only loads the first time the (fallback) API
      // client is actually needed, never during startup.
      const mod = require("@anthropic-ai/sdk");
      const AnthropicSDK = (mod.default || mod) as typeof import("@anthropic-ai/sdk").default;

      // First try to get stored session token
      const sessionToken = getStoredAuthToken();

      if (sessionToken) {
        console.log('[Claude Auth] Using stored session token');
        client = new AnthropicSDK({
          apiKey: sessionToken,
        });
      } else {
        // No token file found - try SDK's default auth chain
        // This includes environment variables and other default methods
        console.log('[Claude Auth] No token file found, trying SDK default auth...');
        client = new AnthropicSDK();
      }
    } catch (error) {
      console.error('[Claude Auth] Error initializing Anthropic client:', error);
      throw new Error(
        'Claude authentication required.\n\n' +
        'To set up Extract with AI, authenticate with Claude:\n' +
        '  claude login\n\n' +
        'Then restart the app. Your subscription will be used for AI features.'
      );
    }
  }
  return client!;
}

/**
 * Robustly parse JSON from a Claude response.
 * Handles markdown code fences and surrounding prose.
 */
function parseJSONResponse<T>(text: string): T {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  // Slice from first { to last } to drop any surrounding prose
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON object found in response: ${text.slice(0, 200)}`);
  }
  cleaned = cleaned.slice(start, end + 1);

  return JSON.parse(cleaned) as T;
}

/**
 * Extracts structured job data from raw job listing text
 * Uses Claude CLI (subscription auth) first, falls back to SDK if needed
 */
export async function extractJobListing(
  jobListingText: string
): Promise<ExtractedJobData> {
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

  // Try Claude CLI first (uses subscription auth from `claude login`)
  try {
    console.log('[Claude] Trying CLI (subscription mode)...');
    responseText = await runClaudeCLI(extractionPrompt);
    console.log('[Claude] ✓ CLI worked! Using subscription authentication');
  } catch (cliError) {
    console.log('[Claude] CLI failed:', cliError instanceof Error ? cliError.message : String(cliError));
    console.log('[Claude] Falling back to SDK (API key mode)...');

    // Fallback to SDK (requires API key)
    const response = await getClient().messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: extractionPrompt,
        },
      ],
    });

    // Extract text from response
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text content in Claude response");
    }
    responseText = textContent.text;
  }

  // Parse JSON response (handles code fences and surrounding prose)
  let extractedData: ExtractedJobData;
  try {
    extractedData = parseJSONResponse<ExtractedJobData>(responseText);
  } catch (error) {
    throw new Error(
      `Failed to parse Claude extraction response as JSON: ${responseText.slice(0, 300)}. Error: ${error}`
    );
  }

  // Fill safe defaults for optional-ish fields so validation doesn't reject good extractions
  extractedData.job_url = extractedData.job_url || '';
  extractedData.nice_to_have_skills = extractedData.nice_to_have_skills || '';
  extractedData.job_source = extractedData.job_source || null;

  // Validate truly required fields only (others get safe defaults)
  const requiredFields: (keyof ExtractedJobData)[] = [
    "company",
    "job_title",
    "job_description",
  ];

  for (const field of requiredFields) {
    if (!extractedData[field]) {
      throw new Error(
        `Missing required field in extraction: ${field}. Response: ${responseText.slice(0, 300)}`
      );
    }
  }

  extractedData.location = extractedData.location || '';
  extractedData.key_responsibilities = extractedData.key_responsibilities || '';
  extractedData.required_skills = extractedData.required_skills || '';

  // Ensure salary fields are numbers or null
  if (extractedData.salary_min !== null && extractedData.salary_min !== undefined) {
    extractedData.salary_min = Number(extractedData.salary_min);
  } else {
    extractedData.salary_min = null;
  }

  if (extractedData.salary_max !== null && extractedData.salary_max !== undefined) {
    extractedData.salary_max = Number(extractedData.salary_max);
  } else {
    extractedData.salary_max = null;
  }

  return extractedData;
}

/**
 * Generates stage-specific guidance documents for a job application
 */
export async function generateGuidance(
  company: string,
  jobTitle: string,
  location: string,
  jobDescription: string,
  keyResponsibilities: string,
  requiredSkills: string
): Promise<GuidanceContent> {
  const guidancePrompt = `You are an expert career coach specializing in job applications and interview preparation. Generate comprehensive guidance for a candidate applying to a specific role.

Company: ${company}
Job Title: ${jobTitle}
Location: ${location}

Job Description:
${jobDescription}

Key Responsibilities:
${keyResponsibilities}

Required Skills:
${requiredSkills}

Generate guidance in JSON format with these four sections (300-500 words each for the first three, 200-300 words for the template):

1. interview_prep: Specific interview preparation tips for this role and company, including potential question topics and how to showcase relevant experience.

2. company_research: Key insights about the company that the candidate should research and understand, including industry position, culture, and values.

3. application_strategy: A strategic approach for crafting a strong application, including how to highlight relevant skills and frame experience for this specific role.

4. follow_up_template: An email template for follow-up after submitting the application, including placeholder text.

Return ONLY this JSON object:
{
  "interview_prep": "...",
  "company_research": "...",
  "application_strategy": "...",
  "follow_up_template": "..."
}

No other text, only valid JSON.`;

  let responseText: string;

  // Try Claude CLI first (uses subscription auth)
  try {
    console.log('[Claude] Trying CLI for guidance generation...');
    responseText = await runClaudeCLI(guidancePrompt);
    console.log('[Claude] ✓ CLI worked for guidance!');
  } catch (cliError) {
    console.log('[Claude] CLI failed for guidance:', cliError instanceof Error ? cliError.message : String(cliError));

    // Fallback to SDK
    const response = await getClient().messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: guidancePrompt,
        },
      ],
    });

    // Extract text from response
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text content in Claude guidance response");
    }
    responseText = textContent.text;
  }

  // Parse JSON response (handles code fences and surrounding prose)
  let guidanceData: GuidanceContent;
  try {
    guidanceData = parseJSONResponse<GuidanceContent>(responseText);
  } catch (error) {
    throw new Error(
      `Failed to parse Claude guidance response as JSON: ${responseText.slice(0, 300)}. Error: ${error}`
    );
  }

  // Validate all required guidance sections are present
  const requiredSections: (keyof GuidanceContent)[] = [
    "interview_prep",
    "company_research",
    "application_strategy",
    "follow_up_template",
  ];

  for (const section of requiredSections) {
    if (!guidanceData[section] || typeof guidanceData[section] !== "string") {
      throw new Error(
        `Missing or invalid guidance section: ${section}. Response: ${responseText.slice(0, 300)}`
      );
    }
  }

  return guidanceData;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Chat about a specific application. The application context is injected
 * so the assistant already knows the job - no copy-pasting needed.
 */
export async function chatAboutApplication(
  appContext: string,
  history: ChatTurn[],
  userMessage: string
): Promise<string> {
  const historyText = history
    .slice(-10) // keep prompt small: last 10 turns
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
