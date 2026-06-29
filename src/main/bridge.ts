// Local HTTP bridge for the aplyd Chrome extension. A content script can't call
// localhost directly (CORS), so the extension's background service worker proxies
// here. Everything is local and runs on the user's own Claude subscription.
//
// SECURITY: binds to 127.0.0.1 only, and REFUSES any request that carries a normal
// website Origin (http/https). The extension's service worker reaches it via its
// host_permission (it does not need CORS), so we never send a permissive
// Access-Control-Allow-Origin. This stops any random web page the user visits from
// reading their profile/answers/documents off localhost.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { runClaudeCLI } from './claude';
import { getAnswerBank, upsertAnswer, getDocuments, addVoiceNote } from './database';
import {
  resolveFieldPrompt, parseFieldAction, tailorAnswerPrompt,
  coverLetterStudioPrompt, refineCoverLetterPrompt, extractResumeText, portfolioSnapshotAll,
} from './prompts';
import type { AnswerBankEntry } from '../shared/types';

export const BRIDGE_PORT = 17872;
let server: http.Server | null = null;

// In-memory handoff: the last LinkedIn job the user viewed, so an external Apply
// tab can label the application correctly. Last-write-wins, short-lived.
let pendingJob: { company: string; title: string; jobText?: string; jobUrl?: string; at: number } | null = null;
const PENDING_TTL_MS = 30 * 60 * 1000;

// Reject requests that come from a real website. The extension SW sends either no
// Origin or a chrome-extension:// origin; a malicious page always sends its http(s)
// origin on a cross-origin fetch, so this blocks page-driven exfiltration/CSRF.
function isAllowedOrigin(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;                       // extension SW / curl health check
  if (/^chrome-extension:\/\//i.test(origin)) return true;
  return false;                                   // http(s) website origin -> deny
}

function send(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let d = '';
    let tooBig = false;
    req.on('data', (c) => { d += c; if (d.length > 1_000_000) { tooBig = true; req.destroy(); } }); // 1MB cap
    req.on('end', () => { if (tooBig) return resolve({}); try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Cache lookup: does any saved answer match this field label?
function matchBank(bank: AnswerBankEntry[], label: string): AnswerBankEntry | null {
  const n = norm(label);
  if (!n) return null;
  for (const e of bank) {
    const keys = [e.label, ...(e.patterns || [])].map(norm).filter(Boolean);
    if (keys.some((k) => k && (n === k || n.includes(k) || k.includes(n)))) return e;
  }
  return null;
}

export function startBridge(deps: {
  onApply: (company: string, jobTitle: string, jobUrl: string) => void;
  saveCover: (opts: { company: string; role: string; body: string }) => Promise<{ path: string }>;
}): void {
  if (server) return;
  server = http.createServer(async (req, res) => {
    if (!isAllowedOrigin(req)) return send(res, 403, { error: 'forbidden origin' });
    if (req.method === 'OPTIONS') return send(res, 204, {});
    const url = new URL(req.url || '/', 'http://localhost');
    try {
      if (url.pathname === '/status') return send(res, 200, { ok: true });

      // cross-tab job handoff (LinkedIn -> external ATS)
      if (url.pathname === '/pending-job') {
        if (req.method === 'POST') {
          const b = await readBody(req);
          if (b && b.job && b.job.company) pendingJob = { ...b.job, at: Date.now() };
          return send(res, 200, { ok: true });
        }
        const fresh = pendingJob && Date.now() - pendingJob.at < PENDING_TTL_MS ? pendingJob : null;
        return send(res, 200, { job: fresh });
      }

      // answer bank
      if (url.pathname === '/bank') return send(res, 200, { entries: getAnswerBank() });
      if (url.pathname === '/answer' && req.method === 'POST') {
        const b = await readBody(req);
        return send(res, 200, upsertAnswer(b));
      }

      // document locker
      if (url.pathname === '/documents') return send(res, 200, { documents: getDocuments() });
      if (url.pathname === '/document') {
        const id = url.searchParams.get('id');
        // only serve a file that is a registered document (no arbitrary path read)
        const doc = getDocuments().find((d) => d.id === id);
        if (!doc || !fs.existsSync(doc.filePath)) return send(res, 404, { error: 'not found' });
        const buf = fs.readFileSync(doc.filePath);
        return send(res, 200, { fileName: path.basename(doc.filePath), base64: buf.toString('base64') });
      }

      // resolve an unknown field: cache first, then Claude derives or says "ask".
      if (url.pathname === '/resolve' && req.method === 'POST') {
        const b = await readBody(req); // { label, type, options?, cacheOnly? }
        const bank = getAnswerBank();
        const hit = matchBank(bank, b.label);
        if (hit) return send(res, 200, { action: 'fill', value: hit.value, source: 'bank' });
        if (b.cacheOnly) return send(res, 200, { action: 'none' });
        const out = await runClaudeCLI(resolveFieldPrompt({ label: b.label, type: b.type, options: b.options }), 40000).catch(() => '');
        return send(res, 200, parseFieldAction(out));
      }

      // tailor an open-ended answer to the job, in the user's voice
      if (url.pathname === '/tailor' && req.method === 'POST') {
        const b = await readBody(req); // { question, jobText }
        const out = await runClaudeCLI(tailorAnswerPrompt({ question: b.question, jobText: b.jobText }), 60000).catch(() => '');
        return send(res, 200, { answer: out.trim() });
      }

      // cover-letter studio: draft with full context + surface clarifying questions
      if (url.pathname === '/cover/generate' && req.method === 'POST') {
        const b = await readBody(req); // { company, role, jobText, extra? }
        const [resume, portfolioText] = await Promise.all([extractResumeText(), portfolioSnapshotAll()]);
        const out = await runClaudeCLI(coverLetterStudioPrompt({
          company: b.company, role: b.role, jobText: b.jobText, resumeText: resume, portfolioText, extra: b.extra,
        }), 90000).catch(() => '');
        let letter = out.trim();
        let questions: string[] = [];
        try {
          const m = out.match(/\{[\s\S]*\}/);
          if (m) { const j = JSON.parse(m[0]); if (j.letter) { letter = String(j.letter).trim(); questions = Array.isArray(j.questions) ? j.questions.slice(0, 2) : []; } }
        } catch { /* keep raw */ }
        return send(res, 200, { letter, questions });
      }

      // refine a draft from the user's feedback; remember the feedback as a style note
      if (url.pathname === '/cover/refine' && req.method === 'POST') {
        const b = await readBody(req); // { company, role, body, feedback, remember? }
        if (b.remember && (b.feedback || '').trim()) { try { addVoiceNote('style', b.feedback.trim()); } catch { /* ignore */ } }
        const out = await runClaudeCLI(refineCoverLetterPrompt({ company: b.company, role: b.role, body: b.body, feedback: b.feedback }), 90000).catch(() => '');
        // refine prompt returns {letter, note} JSON; degrade to raw text
        let letter = out.trim();
        try { const m = out.match(/\{[\s\S]*\}/); if (m) { const j = JSON.parse(m[0]); if (j.letter) letter = String(j.letter).trim(); } } catch { /* keep raw */ }
        return send(res, 200, { letter });
      }

      // save the finished letter to disk (PDF) + the in-app vault
      if (url.pathname === '/cover/save' && req.method === 'POST') {
        const b = await readBody(req); // { company, role, body }
        try { const r = await deps.saveCover({ company: b.company || 'Company', role: b.role || 'Role', body: b.body || '' }); return send(res, 200, { ok: true, path: r.path }); }
        catch (e) { return send(res, 200, { ok: false, error: String(e) }); }
      }

      // log a submitted application into the tracker
      if (url.pathname === '/log' && req.method === 'POST') {
        const b = await readBody(req); // { company, jobTitle, jobUrl }
        try { deps.onApply(b.company || 'Unknown', b.jobTitle || 'Role', b.jobUrl || ''); } catch { /* best effort */ }
        return send(res, 200, { ok: true });
      }

      return send(res, 404, { error: 'unknown route' });
    } catch (e) {
      return send(res, 500, { error: String(e) });
    }
  });
  server.on('error', () => { /* port in use / second instance: ignore */ });
  server.listen(BRIDGE_PORT, '127.0.0.1');
}

export function stopBridge(): void {
  try { server?.close(); } catch { /* ignore */ }
  server = null;
}
