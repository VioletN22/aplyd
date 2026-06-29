// Shared Claude prompt-building. Used by the in-app cover-letter studio and the
// profile seeder so cover letters and field answers draw on the SAME profile:
// answer bank + portfolio links + resume + the learned voice profile.
import fs from 'fs';
import http from 'http';
import https from 'https';
import {
  getAnswerBank, getDocuments, getVoiceNotes, getPortfolioLinks, getSetting,
} from './database';
import type { AnswerBankEntry } from '../shared/types';

// The structured profile (identity / work-auth / salary / locations / links),
// stored as a JSON object in app_settings under 'profile'. Rendered as facts.
export function getProfile(): Record<string, string> {
  try { const raw = getSetting('profile'); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
export function structuredProfileBlock(): string {
  const p = getProfile();
  const lines = Object.entries(p).filter(([, v]) => v && String(v).trim()).map(([k, v]) => `- ${k}: ${v}`);
  return lines.length ? lines.join('\n') : '(none yet)';
}

export function factsBlock(bank: AnswerBankEntry[] = getAnswerBank()): string {
  return bank.map((e) => `- ${e.label}${e.context ? ` (${e.context})` : ''}: ${e.value}`).join('\n') || '(none yet)';
}

export function portfolioBlock(): string {
  const links = getPortfolioLinks();
  return links.length ? links.map((p) => `- ${p.label}: ${p.url}`).join('\n') : '(none)';
}

export function voiceBlocks(): { likes: string; avoid: string } {
  const v = getVoiceNotes();
  return {
    likes: v.filter((n) => n.kind !== 'dislike').map((n) => `- ${n.note}`).join('\n') || '(none yet)',
    avoid: v.filter((n) => n.kind === 'dislike').map((n) => `- ${n.note}`).join('\n') || '(none yet)',
  };
}

export function resumeText(): string {
  const resume = getDocuments().find((d) => d.isDefault && d.tags.includes('resume'))
    || getDocuments().find((d) => d.tags.includes('resume'));
  if (resume && /\.(txt|md|markdown)$/i.test(resume.filePath) && fs.existsSync(resume.filePath)) {
    try { return fs.readFileSync(resume.filePath, 'utf-8').slice(0, 8000); } catch { /* ignore */ }
  }
  return '';
}

// Best-effort fetch of a portfolio page, stripped to text, so Claude can ground
// a letter in the actual site content. Short timeout; failure is non-fatal.
export function fetchUrlText(url: string, timeoutMs = 6000): Promise<string> {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { headers: { 'User-Agent': 'aplyd' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          fetchUrlText(new URL(res.headers.location, url).toString(), timeoutMs).then(resolve);
          return;
        }
        let data = '';
        res.on('data', (c) => { if (data.length < 200000) data += c; });
        res.on('end', () => {
          const text = data
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 3000);
          resolve(text);
        });
      });
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve(''); });
      req.on('error', () => resolve(''));
    } catch { resolve(''); }
  });
}

// Raw fetch (HTML kept) - used to parse search-result links. Browser-like UA so
// search endpoints don't 403 us. Caps the body and never rejects.
export function fetchUrlRaw(url: string, timeoutMs = 7000): Promise<string> {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', 'Accept-Language': 'en-AU,en;q=0.9' };
      const req = lib.get(url, { headers }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          fetchUrlRaw(new URL(res.headers.location, url).toString(), timeoutMs).then(resolve);
          return;
        }
        let data = '';
        res.on('data', (c) => { if (data.length < 400000) data += c; });
        res.on('end', () => resolve(data));
      });
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve(''); });
      req.on('error', () => resolve(''));
    } catch { resolve(''); }
  });
}

// LIVE company research for cover letters: web-search the company and read a couple
// of their own pages, so the letter can speak to what they do, recent work, this
// year's goals, and values. Best-effort + capped; returns '' on failure (the letter
// then leans on the job posting + the model's own knowledge).
export async function companyResearch(company: string, jobUrl?: string): Promise<string> {
  const name = (company || '').trim();
  if (!name) return '';
  const year = new Date().getFullYear();
  const enc = (s: string) => encodeURIComponent(s);
  const pickLinks = (html: string): string[] => {
    const urls: string[] = [];
    const re = /uddg=([^"&]+)/g; // DuckDuckGo HTML wraps results as /l/?uddg=<encoded>
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && urls.length < 30) {
      try { const u = decodeURIComponent(m[1]); if (/^https?:\/\//.test(u)) urls.push(u); } catch { /* skip */ }
    }
    return urls;
  };
  const junk = /duckduckgo|google\.|bing\.|facebook\.|twitter\.|x\.com|instagram\.|youtube\.|wikipedia\.|glassdoor\.|indeed\.|linkedin\.com\/(?!company)|crunchbase\.|bloomberg\.|zoominfo/i;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const score = (u: string) => {
    let s = 0;
    try {
      const host = new URL(u).host.toLowerCase();
      if (host.replace(/[^a-z0-9]/g, '').includes(slug.slice(0, 8))) s += 5; // their own domain
    } catch { /* ignore */ }
    if (/about|values|mission|culture|careers|company|who-we-are|annual|investor|sustainab|strateg/i.test(u)) s += 2;
    return s;
  };
  // two angles: who they are / values, and this year's direction
  const queries = [name + ' company about values mission', name + ' ' + year + ' strategy goals annual report'];
  const candidates: string[] = [];
  for (const q of queries) {
    const html = await fetchUrlRaw('https://html.duckduckgo.com/html/?q=' + enc(q)).catch(() => '');
    for (const u of pickLinks(html)) if (!junk.test(u) && !candidates.includes(u)) candidates.push(u);
  }
  // prefer their own / about-ish pages; always consider the job's own host too
  if (jobUrl) { try { candidates.unshift(new URL(jobUrl).origin); } catch { /* ignore */ } }
  const ranked = candidates.sort((a, b) => score(b) - score(a)).slice(0, 3);
  const chunks: string[] = [];
  for (const u of ranked) {
    const t = await fetchUrlText(u, 7000).catch(() => '');
    if (t && t.length > 120) chunks.push('SOURCE ' + u + ':\n' + t.slice(0, 1600));
    if (chunks.length >= 2) break;
  }
  return chunks.join('\n\n').slice(0, 3500);
}

// Pull a short text snapshot of the default/first portfolio site for grounding.
export async function portfolioSnapshot(): Promise<string> {
  const links = getPortfolioLinks();
  if (!links.length) return '';
  const text = await fetchUrlText(links[0].url);
  return text ? `PORTFOLIO SITE CONTENT (${links[0].url}):\n${text}\n` : '';
}

// Shared profile block for cover letters - the Core profile (identity / contact /
// links) + resume + portfolio + answer-bank facts + voice. The structured PROFILE
// is where Email / Phone / name live, so it MUST be here (this was the missing piece
// that made the letter ask for a phone number it already had).
function profileBlock(opts: { resumeText?: string; portfolioText?: string; extra?: string }): string {
  const { likes, avoid } = voiceBlocks();
  const resume = opts.resumeText ?? resumeText();
  return (
    `USER PROFILE (identity, contact, links - use these for the signature/contact line):\n${structuredProfileBlock()}\n\n` +
    (resume ? `USER RESUME:\n${resume}\n\n` : '') +
    `PORTFOLIO LINKS:\n${portfolioBlock()}\n` +
    (opts.portfolioText ? `\n${opts.portfolioText}\n` : '') +
    `\nKNOWN FACTS (answer bank):\n${factsBlock()}\n\n` +
    (opts.extra ? `EXTRA CONTEXT THE USER PROVIDED:\n${opts.extra}\n\n` : '') +
    `WRITING STYLE TO FOLLOW:\n${likes}\nAVOID:\n${avoid}\n\n`
  );
}

// JSON contract shared by generate + refine: the LETTER is always a complete,
// ready cover letter (never a question), and any message to the user (a clarifying
// question, a heads-up about a placeholder, what changed) goes in NOTE - so it never
// pollutes or replaces the letter. NOTE is '' when there's nothing to say.
const COVER_JSON_RULES =
  `\nCONTACT LINE: end the letter with the user's sign-off - their name, then their email and phone on the next line - taken from USER PROFILE. ` +
  `If a contact detail is genuinely missing from the profile, still write the COMPLETE letter (use a clear placeholder like [your phone]) and ask for it in NOTE - NEVER replace the letter with a question.\n` +
  `OUTPUT: respond with ONLY valid JSON, no markdown fences: {"letter":"<the full cover letter body, ready to send>","note":"<a short message to the user: a clarifying question, a heads-up about any placeholder, or what you changed - empty string if nothing>"}. ` +
  `The "letter" field must ALWAYS contain a complete cover letter; questions and commentary go ONLY in "note".`;

export function coverLetterPrompt(opts: { company: string; role: string; jobText?: string; portfolioText?: string; resumeText?: string; researchText?: string; extra?: string }): string {
  return (
    `Write a cover letter for the user, first person, tailored to THIS specific role. ` +
    `Ground every claim in the user's real experience (resume, portfolio, known facts) - do NOT invent anything.\n\n` +
    `ROLE: ${opts.role}\nCOMPANY: ${opts.company}\n\n` +
    (opts.jobText ? `JOB POSTING:\n${opts.jobText.slice(0, 4000)}\n\n` : '') +
    (opts.researchText ? `COMPANY RESEARCH (pulled from the web - may be imperfect). FIRST verify it actually describes the SAME company as in the JOB POSTING above: same line of business, consistent with the role/location. If it looks like a different company (e.g. a same-named business in another country/industry), IGNORE this research entirely and write only from the posting + the user's experience - do NOT use any detail you cannot trust. If it does match, weave in 1-2 concrete, accurate, verifiable details (what they do, this year's direction, their values). Never fabricate or overstate.\n${opts.researchText}\n\n` : '') +
    profileBlock(opts) +
    `Approach: read what the role actually wants (from the job posting), then MATCH the user's real resume experience to those needs - lead with the overlaps that matter most, and connect them to where the company is heading. ` +
    `Keep it to 3-4 tight paragraphs, specific and genuine, no corporate fluff or clichés.` +
    COVER_JSON_RULES
  );
}

// Parse the {letter, note} JSON; tolerate a plain-text letter (treat as letter, no note).
export function parseCoverLetter(out: string): { letter: string; note: string } {
  const raw = (out || '').trim();
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      if (typeof j.letter === 'string' && j.letter.trim()) return { letter: j.letter.trim(), note: String(j.note || '').trim() };
    }
  } catch { /* fall through to plain text */ }
  // not JSON → assume the whole thing is the letter (back-compat / safety)
  return { letter: raw.replace(/^```[a-z]*\n?|\n?```$/g, '').trim(), note: '' };
}

export function refineCoverLetterPrompt(opts: { company: string; role: string; body: string; feedback: string }): string {
  const { likes, avoid } = voiceBlocks();
  return (
    `Revise the cover letter below based on the user's feedback. Change ONLY what the feedback asks for; keep every other sentence exactly as it is so the change is surgical. Stay grounded in real experience.\n\n` +
    `ROLE: ${opts.role} @ ${opts.company}\n\n` +
    `USER PROFILE (identity, contact, links - use for the sign-off / contact line):\n${structuredProfileBlock()}\n\n` +
    `CURRENT DRAFT:\n${opts.body}\n\n` +
    `USER FEEDBACK:\n${opts.feedback}\n\n` +
    `EXISTING STYLE PREFERENCES:\n${likes}\nAVOID:\n${avoid}\n` +
    COVER_JSON_RULES
  );
}

// Seed the structured profile from the resume + known facts. Returns a flat
// map of standard application fields. Only fields the resume/facts actually
// support are included (no guessing personal/legal details).
export function profileSeedPrompt(): string {
  const resume = resumeText();
  return (
    `Extract a structured job-application profile from the user's materials below.\n` +
    `Return ONLY JSON: a flat object whose keys are standard application fields and whose values are the user's answers. Use these keys where the materials support them: ` +
    `"Legal first name", "Legal last name", "Preferred name", "Full name", "Email", "Phone", "Location", "Work authorization", "Require visa sponsorship", "Years of experience", "Current title", "LinkedIn", "GitHub", "Portfolio", "Salary expectation", "Notice period", "Open to remote".\n` +
    `For names: "Legal first name"/"Legal last name" are the real/legal name as on official ID; "Preferred name" is the name the person goes by if different (e.g. a chosen first name). If the materials only show one name, set the legal fields and leave Preferred name out.\n` +
    `Omit any key you cannot fill from the materials (do not invent). Keep values short.\n\n` +
    (resume ? `RESUME:\n${resume.slice(0, 6000)}\n\n` : '') +
    `KNOWN FACTS:\n${factsBlock()}\n\nPORTFOLIO:\n${portfolioBlock()}`
  );
}
export function parseProfileSeed(out: string): Record<string, string> {
  try {
    const m = out.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(j)) {
        if (v != null && String(v).trim()) clean[k] = String(v).trim().slice(0, 200);
      }
      return clean;
    }
  } catch { /* fall through */ }
  return {};
}
