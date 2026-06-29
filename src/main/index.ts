import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// File-based logging - survives even when there's no attached console. Uses the OS
// temp dir so it works on Windows too (not a hardcoded /tmp).
const LOG_PATH = path.join(os.tmpdir(), 'aplyd-main.log');
function log(...args: unknown[]) {
  const line = new Date().toISOString() + ' ' + args.map(String).join(' ') + '\n';
  try { fs.appendFileSync(LOG_PATH, line); } catch { /* ignore */ }
  console.log(...args);
}
process.on('unhandledRejection', (err) => log('[unhandledRejection]', err));
process.on('uncaughtException', (err) => log('[uncaughtException]', err));

// Single-instance lock - second launch focuses the existing window
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

import {
  initializeDatabase,
  getDatabase,
  closeDatabase,
  getAllApplications,
  getApplication,
  updateApplication,
  deleteApplication,
  getStageHistoryForApplication,
  createStageHistory,
  updateStageHistory,
  getGuidanceDocsForApplicationAndStage,
  getAllWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  createApplication,
  createGuidanceDocs,
  getDefaultWorkflowForCompany,
  createAttachment,
  getAttachmentsForApplication,
  deleteAttachment,
  addChatMessage,
  getChatMessages,
  getAnswerBank,
  upsertAnswer,
  deleteAnswer,
  getDocuments,
  addDocument,
  deleteDocument,
  setDocumentDefault,
  getResumeFocus,
  setResumeFocus,
  getVoiceNotes,
  addVoiceNote,
  deleteVoiceNote,
  getPortfolioLinks,
  addPortfolioLink,
  deletePortfolioLink,
  getCoverLetters,
  saveCoverLetter,
  deleteCoverLetter,
  getCoverLetterForApplication,
  saveCoverLetterForApplication,
  saveCoverLetterVersion,
  getSavedCoverLettersForApplication,
  getSetting,
  setSetting,
} from './database';
import { coverLetterPrompt, refineCoverLetterPrompt, parseCoverLetter, portfolioSnapshot, companyResearch, profileSeedPrompt, parseProfileSeed } from './prompts';
import { extractJobListing, generateGuidance, runClaudeCLI, chatAboutApplication } from './claude';
import { getFlowData } from './flow';
import { getLicenseStatus, activateLicense, deactivateLicense } from './license';
import { JobApplication, Workflow, ExtractedJobData } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let isStarting = false;

// Inline splash as base64 data URL - shows instantly, no file I/O
const SPLASH_HTML = Buffer.from(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#111010;display:flex;flex-direction:column;align-items:center;
     justify-content:center;height:100vh;font-family:-apple-system,sans-serif;
     color:#f0ede8;-webkit-app-region:drag;user-select:none}
.logo{font-size:52px;font-weight:300;letter-spacing:-.03em}
.logo span{color:#f23a17}
.bar{margin-top:28px;width:120px;height:3px;background:#222;border-radius:2px;overflow:hidden}
.bar i{display:block;height:100%;width:40%;background:#f23a17;border-radius:2px;
       animation:s 1.1s ease-in-out infinite}
@keyframes s{0%{margin-left:-42%}100%{margin-left:102%}}
.sub{margin-top:14px;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#555}
</style></head><body>
<div class="logo">aply<span>d</span></div>
<div class="bar"><i></i></div>
<div class="sub">loading…</div>
</body></html>`).toString('base64');
const SPLASH_URL = `data:text/html;base64,${SPLASH_HTML}`;

const APP_URL = isDev
  ? 'http://localhost:5173'
  : `file://${path.join(__dirname, '../renderer/index.html')}`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#111010',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'aplyd',
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log('[did-fail-load]', code, desc, url);
  });

  // Show the splash the moment it renders, then swap in the real app once it
  // has finished loading. We track which URL just loaded so the splash handler
  // doesn't re-trigger when the app URL finishes.
  let appLoadRequested = false;
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow) return;
    const current = mainWindow.webContents.getURL();
    log('[did-finish-load]', current.slice(0, 40));

    if (!appLoadRequested) {
      // Splash just rendered - reveal the window IMMEDIATELY, before any
      // heavy work. The user sees the loading screen right away.
      mainWindow.setAlwaysOnTop(true, 'floating');
      mainWindow.show();
      mainWindow.focus();
      app.focus({ steal: true });
      appLoadRequested = true;
      log('[show] window visible, uptime=' + process.uptime().toFixed(3));

      const swap = () => {
        if (!mainWindow) return;
        // Initialize the DB now - this triggers the native better-sqlite3
        // load, but the window is already on screen so the user never waits
        // on a blank dock icon. Done before loading the app so the first
        // renderer IPC call finds the DB ready.
        try {
          initializeDatabase();
          log('[swap] db initialized, uptime=' + process.uptime().toFixed(3));
        } catch (err) {
          log('[swap] DB init failed:', err);
        }
        log('[swap] loading app url', APP_URL.slice(0, 60));
        mainWindow.setAlwaysOnTop(false);
        mainWindow.loadURL(APP_URL);
        isStarting = false;
      };
      // Defer one tick so the splash actually paints before we block the
      // main thread loading the native module. In dev, Vite needs a beat.
      if (isDev) setTimeout(swap, 800);
      else setTimeout(swap, 16);
    } else if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  log('[createWindow] loading splash');
  mainWindow.loadURL(SPLASH_URL);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Headless boot self-check (CI smoke test): run the REAL packaged main process -
// load the native DB module, run a query - and exit 0/1 WITHOUT opening a window.
// Catches native-load / missing-module crashes on a runner with no display.
// Triggered with APLYD_SMOKETEST=1.
function runSmokeTest(): void {
  try {
    initializeDatabase();
    const row = getDatabase().prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
    if (!row || row.ok !== 1) throw new Error('db query failed');
    log('[smoketest] OK platform=' + process.platform);
    app.exit(0);
  } catch (e) {
    log('[smoketest] FAIL ' + String(e));
    app.exit(1);
  }
}

app.whenReady().then(() => {
  log('[whenReady] uptime=' + process.uptime().toFixed(3) + ' isPackaged=' + app.isPackaged);
  if (process.env.APLYD_SMOKETEST === '1') { runSmokeTest(); return; }
  isStarting = true;
  // Create the window FIRST - DB init is deferred until after the splash is
  // visible (see the show handler above), keeping cold start minimal.
  createWindow();
});

app.on('window-all-closed', () => {
  closeDatabase();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    if (!isStarting) {
      isStarting = true;
      createWindow();
    }
  } else if (mainWindow.isMinimized()) {
    mainWindow.restore();
    mainWindow.focus();
  } else if (!mainWindow.isVisible()) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    mainWindow.focus();
  }
});

// License (purpl hq) IPC Handlers

// This app's id for entitlement checks. inkd uses 'inkd' in its own copy.
const APP_ID = 'aplyd';

ipcMain.handle('license:status', async () => {
  try {
    return getLicenseStatus(APP_ID);
  } catch (error) {
    return { licensed: false, entitlements: [] };
  }
});

ipcMain.handle('license:activate', async (_event, key: string) => {
  try {
    return activateLicense(key);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('license:deactivate', async () => {
  try {
    deactivateLicense();
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

// Flow (Sankey) IPC Handler

/**
 * Get the aggregated application flow (nodes + links + summary) for the
 * Sankey view. Computed fresh from stage_history on each call.
 */
ipcMain.handle('flow:getData', async () => {
  try {
    return getFlowData();
  } catch (error) {
    throw new Error(`Failed to compute flow data: ${error}`);
  }
});

// Database IPC Handlers

/**
 * Get all applications with optional filters
 */
ipcMain.handle('db:getAllApplications', async (_event, filters?) => {
  try {
    return getAllApplications(filters);
  } catch (error) {
    throw new Error(`Failed to get applications: ${error}`);
  }
});

/**
 * Get a single application by ID
 */
ipcMain.handle('db:getApplication', async (_event, id: string) => {
  try {
    return getApplication(id);
  } catch (error) {
    throw new Error(`Failed to get application: ${error}`);
  }
});

/**
 * Update an application
 */
ipcMain.handle('db:updateApplication', async (_event, id: string, updates: Partial<JobApplication>) => {
  try {
    return updateApplication(id, updates);
  } catch (error) {
    throw new Error(`Failed to update application: ${error}`);
  }
});

/**
 * Delete an application
 */
ipcMain.handle('db:deleteApplication', async (_event, id: string) => {
  try {
    deleteApplication(id);
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to delete application: ${error}`);
  }
});

/**
 * Get stage history for an application
 */
ipcMain.handle('db:getStageHistory', async (_event, applicationId: string) => {
  try {
    return getStageHistoryForApplication(applicationId);
  } catch (error) {
    throw new Error(`Failed to get stage history: ${error}`);
  }
});

/**
 * Create a stage history entry
 */
ipcMain.handle('db:createStageHistory', async (_event, applicationId: string, stage: string, notes?: string) => {
  try {
    return createStageHistory(applicationId, stage, notes || null);
  } catch (error) {
    throw new Error(`Failed to create stage history: ${error}`);
  }
});

/**
 * Update a stage history entry
 */
ipcMain.handle('db:updateStageHistory', async (_event, id: string, updates: any) => {
  try {
    return updateStageHistory(id, updates);
  } catch (error) {
    throw new Error(`Failed to update stage history: ${error}`);
  }
});

/**
 * Get guidance docs for an application and stage
 */
ipcMain.handle('db:getGuidanceDocs', async (_event, applicationId: string, stage: string) => {
  try {
    return getGuidanceDocsForApplicationAndStage(applicationId, stage);
  } catch (error) {
    throw new Error(`Failed to get guidance docs: ${error}`);
  }
});

// Workflow IPC Handlers

/**
 * Get all workflows
 */
ipcMain.handle('db:getAllWorkflows', async (_event) => {
  try {
    return getAllWorkflows();
  } catch (error) {
    throw new Error(`Failed to get workflows: ${error}`);
  }
});

/**
 * Create a new workflow
 */
ipcMain.handle('db:createWorkflow', async (_event, company: string, name: string, stages: string[], isDefault: boolean) => {
  try {
    return createWorkflow(company, name, stages, isDefault);
  } catch (error) {
    throw new Error(`Failed to create workflow: ${error}`);
  }
});

/**
 * Update a workflow
 */
ipcMain.handle('db:updateWorkflow', async (_event, id: string, updates: Partial<Workflow>) => {
  try {
    return updateWorkflow(id, updates);
  } catch (error) {
    throw new Error(`Failed to update workflow: ${error}`);
  }
});

/**
 * Delete a workflow
 */
ipcMain.handle('db:deleteWorkflow', async (_event, id: string) => {
  try {
    deleteWorkflow(id);
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to delete workflow: ${error}`);
  }
});

// File Operations IPC Handler

/**
 * Open file dialog and return file content
 */
ipcMain.handle('file:selectFile', async (_event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'Text Files', extensions: ['txt', 'md'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const fs = require('fs');
    const content = fs.readFileSync(filePath, 'utf-8');

    return {
      filePath,
      content,
    };
  } catch (error) {
    throw new Error(`Failed to select file: ${error}`);
  }
});

// ── Structured profile (Core) ────────────────────────────────────────────────
ipcMain.handle('setup:profile:get', async () => { try { return JSON.parse(getSetting('profile') || '{}'); } catch { return {}; } });
ipcMain.handle('setup:profile:set', async (_e, profile: Record<string, string>) => { setSetting('profile', JSON.stringify(profile || {})); return { ok: true }; });
ipcMain.handle('setup:profile:seed', async () => {
  const out = await runClaudeCLI(profileSeedPrompt(), 60000).catch(() => '');
  const seeded = parseProfileSeed(out);
  if (Object.keys(seeded).length) {
    let current: Record<string, string> = {};
    try { current = JSON.parse(getSetting('profile') || '{}'); } catch { /* ignore */ }
    const merged = { ...seeded, ...current }; // never clobber values you already set
    setSetting('profile', JSON.stringify(merged));
    return merged;
  }
  return {};
});

// ── Setup IPC Handlers (answer bank / document locker / voice profile) ───────
ipcMain.handle('setup:getAnswerBank', async () => getAnswerBank());
ipcMain.handle('setup:upsertAnswer', async (_e, entry) => upsertAnswer(entry));
ipcMain.handle('setup:deleteAnswer', async (_e, id: string) => { deleteAnswer(id); return { ok: true }; });
ipcMain.handle('setup:getDocuments', async () => getDocuments());
ipcMain.handle('setup:pickDocument', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'md'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0]; // path only - never read PDF bytes as utf-8
});
ipcMain.handle('setup:addDocument', async (_e, label: string, filePath: string, tags: string[], isDefault: boolean) =>
  addDocument(label, filePath, tags, isDefault));
ipcMain.handle('setup:deleteDocument', async (_e, id: string) => { deleteDocument(id); return { ok: true }; });
ipcMain.handle('setup:setDocumentDefault', async (_e, id: string) => { setDocumentDefault(id); return { ok: true }; });
ipcMain.handle('setup:getResumeFocus', async () => getResumeFocus());
ipcMain.handle('setup:setResumeFocus', async (_e, docId: string, focus: string) => { setResumeFocus(docId, focus); return { ok: true }; });
ipcMain.handle('setup:getVoiceNotes', async () => getVoiceNotes());
ipcMain.handle('setup:addVoiceNote', async (_e, kind: string, note: string) => addVoiceNote(kind as any, note));
ipcMain.handle('setup:deleteVoiceNote', async (_e, id: string) => { deleteVoiceNote(id); return { ok: true }; });

// Portfolio links (a live website Claude can reference / fetch)
ipcMain.handle('setup:getPortfolioLinks', async () => getPortfolioLinks());
ipcMain.handle('setup:addPortfolioLink', async (_e, label: string, url: string) => addPortfolioLink(label, url));
ipcMain.handle('setup:deletePortfolioLink', async (_e, id: string) => { deletePortfolioLink(id); return { ok: true }; });

// Cover-letter vault + studio
ipcMain.handle('setup:getCoverLetters', async () => getCoverLetters());
ipcMain.handle('setup:saveCoverLetter', async (_e, input) => saveCoverLetter(input));
ipcMain.handle('setup:deleteCoverLetter', async (_e, id: string) => { deleteCoverLetter(id); return { ok: true }; });
ipcMain.handle('setup:generateCoverLetter', async (_e, opts: { company: string; role: string; jobText?: string }) => {
  const portfolioText = await portfolioSnapshot().catch(() => '');
  const body = await runClaudeCLI(coverLetterPrompt({ ...opts, portfolioText }), 90000);
  return { body: body.trim() };
});
ipcMain.handle('setup:refineCoverLetter', async (_e, opts: { company: string; role: string; body: string; feedback: string; remember?: boolean }) => {
  // Remember the feedback as a learned style note so future letters improve.
  if (opts.remember && opts.feedback.trim()) addVoiceNote('style', opts.feedback.trim());
  const body = await runClaudeCLI(refineCoverLetterPrompt(opts), 90000);
  return { body: body.trim() };
});

// ── Per-application cover letter (lives in the application's detail page) ─────
// Full context: everything aplyd knows about you (resume/portfolio/facts/voice) +
// LIVE company research (their site/values/this year's direction) + the job posting,
// matched to your resume. Generate → refine with feedback → copy. Persisted per app.
// Where cover-letter PDFs land (settable; default ~/Documents/work-stuff).
function coverLetterDir(): string {
  const custom = (getSetting('cover_letter_dir') || '').trim();
  return custom || path.join(app.getPath('documents'), 'work-stuff');
}
const safeCoverName = (s: string) => (s || '').replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Untitled';
// Render a cover letter to a labelled PDF, never overwriting an earlier version.
async function writeCoverPdf(company: string, role: string, body: string): Promise<string> {
  const dir = coverLetterDir();
  fs.mkdirSync(dir, { recursive: true });
  let file = path.join(dir, `Cover Letter - ${safeCoverName(company)} - ${safeCoverName(role)}.pdf`);
  if (fs.existsSync(file)) { const base = file.replace(/\.pdf$/, ''); let n = 2; while (fs.existsSync(`${base} (${n}).pdf`)) n++; file = `${base} (${n}).pdf`; }
  const paras = body.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>`).join('\n');
  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>` +
    `body{font-family:Georgia,'Times New Roman',serif;font-size:12pt;line-height:1.55;color:#111;margin:0;padding:0}` +
    `.doc{max-width:660px;margin:0 auto}p{margin:0 0 14px}` +
    `</style></head><body><div class="doc">${paras}</div></body></html>`;
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdf = await win.webContents.printToPDF({ printBackground: true, marginsType: 0 } as any);
    fs.writeFileSync(file, pdf);
  } finally { win.destroy(); }
  return file;
}

ipcMain.handle('coverletter:getForApp', async (_e, applicationId: string) => getCoverLetterForApplication(applicationId));
ipcMain.handle('coverletter:getVersions', async (_e, applicationId: string) => getSavedCoverLettersForApplication(applicationId));
ipcMain.handle('coverletter:deleteVersion', async (_e, id: string) => { deleteCoverLetter(id); return { ok: true }; });
ipcMain.handle('coverletter:getDir', async () => coverLetterDir());
ipcMain.handle('coverletter:setDir', async () => {
  const r = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory', 'createDirectory'], defaultPath: coverLetterDir() });
  if (r.canceled || !r.filePaths[0]) return { dir: coverLetterDir() };
  setSetting('cover_letter_dir', r.filePaths[0]);
  return { dir: r.filePaths[0] };
});
ipcMain.handle('coverletter:openFolder', async () => { try { fs.mkdirSync(coverLetterDir(), { recursive: true }); shell.openPath(coverLetterDir()); } catch { /* ignore */ } return { ok: true }; });
// Save a version you LIKE in BOTH places: aplyd's vault (kept version) + a PDF on disk.
ipcMain.handle('coverletter:saveVersion', async (_e, opts: { applicationId: string; company: string; role: string; jobUrl?: string; body: string; label?: string }) => {
  const label = (opts.label && opts.label.trim()) ? opts.label.trim() : `${opts.company} - ${opts.role}`;
  const version = saveCoverLetterVersion(opts.applicationId, { company: opts.company, role: opts.role, jobUrl: opts.jobUrl ?? null, body: opts.body, label });
  let pdfPath = '';
  try { pdfPath = await writeCoverPdf(opts.company, opts.role, opts.body); } catch (e) { log('[cover] pdf save err', String(e)); }
  return { version, pdfPath };
});
ipcMain.handle('coverletter:generate', async (_e, opts: { applicationId: string; company: string; role: string; jobText?: string; jobUrl?: string; location?: string }) => {
  const emit = (stage: string, message: string) => { try { mainWindow?.webContents.send('coverletter:progress', { applicationId: opts.applicationId, stage, message }); } catch { /* ignore */ } };
  const t0 = Date.now();
  try {
    log('[cover] generate start', opts.company, opts.role);
    emit('research', 'Researching ' + opts.company + ' on the web…');
    const portfolioText = await portfolioSnapshot().catch(() => '');
    // Live research: web-search the company and read a couple of their own pages.
    const researchText = await companyResearch(opts.company, opts.jobUrl).catch(() => '');
    const sources = (researchText.match(/SOURCE (\S+):/g) || []).map((m) => m.replace(/^SOURCE |:$/g, ''));
    log('[cover] research done', 'chars=' + researchText.length, 'sources=' + sources.length, Math.round((Date.now() - t0) / 1000) + 's');
    emit('writing', researchText ? 'Read ' + (sources.length || 1) + ' source(s) - now writing your letter…' : 'Writing your letter from your profile + the posting…');
    const raw = await runClaudeCLI(coverLetterPrompt({ ...opts, portfolioText, researchText }), 180000);
    const { letter: body, note } = parseCoverLetter(raw);
    if (!body) throw new Error('empty draft returned');
    try { saveCoverLetterForApplication(opts.applicationId, { company: opts.company, role: opts.role, jobUrl: opts.jobUrl ?? null, body }); } catch { /* persist best-effort */ }
    log('[cover] generate done', Math.round((Date.now() - t0) / 1000) + 's', 'len=' + body.length, note ? 'note' : '');
    emit('done', 'Done');
    return { body, note, researched: !!researchText, sources };
  } catch (e: any) {
    const msg = String(e?.message || e);
    log('[cover] generate FAILED', msg, Math.round((Date.now() - t0) / 1000) + 's');
    emit('error', /timed out/i.test(msg) ? 'timeout' : 'error');
    return { body: '', researched: false, sources: [], error: /timed out/i.test(msg) ? 'The draft took too long (the AI was busy). Try again in a moment.' : ('Could not generate: ' + msg) };
  }
});
ipcMain.handle('coverletter:refine', async (_e, opts: { applicationId: string; company: string; role: string; body: string; feedback: string; remember?: boolean; jobUrl?: string }) => {
  try {
    if (opts.remember && opts.feedback.trim()) addVoiceNote('style', opts.feedback.trim());
    const raw = await runClaudeCLI(refineCoverLetterPrompt(opts), 120000);
    const { letter: body, note } = parseCoverLetter(raw);
    // never wipe a good draft: if parsing somehow yields nothing, keep the old body
    const finalBody = body || opts.body;
    try { saveCoverLetterForApplication(opts.applicationId, { company: opts.company, role: opts.role, jobUrl: opts.jobUrl ?? null, body: finalBody }); } catch { /* persist best-effort */ }
    return { body: finalBody, note };
  } catch (e: any) {
    const msg = String(e?.message || e);
    log('[cover] refine FAILED', msg);
    return { body: opts.body, note: '', error: /timed out/i.test(msg) ? 'That refine took too long - try again in a moment.' : ('Could not refine: ' + msg) };
  }
});
ipcMain.handle('coverletter:saveForApp', async (_e, opts: { applicationId: string; company: string; role: string; jobUrl?: string; body: string }) =>
  saveCoverLetterForApplication(opts.applicationId, { company: opts.company, role: opts.role, jobUrl: opts.jobUrl ?? null, body: opts.body }));

// Attachment Operations IPC Handlers

/**
 * Add an attachment to an application
 */
ipcMain.handle('attachment:add', async (_event, applicationId: string, filePath: string) => {
  try {
    const fs = require('fs');
    const path = require('path');

    // Get file info
    const fileName = path.basename(filePath);
    const fileType = path.extname(filePath).substring(1) || 'unknown';

    // Copy file to app data directory
    const appPath = app.getPath('userData');
    const attachmentsDir = path.join(appPath, 'attachments', applicationId);

    // Ensure directory exists
    if (!fs.existsSync(attachmentsDir)) {
      fs.mkdirSync(attachmentsDir, { recursive: true });
    }

    const destPath = path.join(attachmentsDir, `${Date.now()}-${fileName}`);
    fs.copyFileSync(filePath, destPath);

    // Create attachment record in database
    const attachment = createAttachment(applicationId, fileName, fileType, destPath);

    return {
      success: true,
      attachment,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

/**
 * Get attachments for an application
 */
ipcMain.handle('attachment:getAll', async (_event, applicationId: string) => {
  try {
    const attachments = getAttachmentsForApplication(applicationId);
    return {
      success: true,
      attachments,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

/**
 * Delete an attachment
 */
ipcMain.handle('attachment:delete', async (_event, attachmentId: string) => {
  try {
    deleteAttachment(attachmentId);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// Claude Operations IPC Handler

/**
 * Orchestrate the entire job listing ingestion workflow
 */
ipcMain.handle('claude:ingestJobListing', async (_event, jobListingText: string, company: string, jobSource: string | null = null) => {
  console.log('[Extract with AI] Starting job listing ingestion');
  try {
    // Step 1: Extract job listing data
    let extractedData: ExtractedJobData;
    try {
      console.log('[Extract with AI] Calling extractJobListing...');
      extractedData = await extractJobListing(jobListingText);
      console.log('[Extract with AI] Successfully extracted:', extractedData.company, extractedData.job_title);
    } catch (claudeError) {
      // If Claude extraction fails, create basic data from the input
      // This allows Quick Add via paste to still work
      const errorMsg = claudeError instanceof Error ? claudeError.message : String(claudeError);
      console.error('[Extract with AI] Extraction error:', errorMsg, claudeError);

      // Try to extract company from input if not provided
      const finalCompany = company && company !== 'Unknown Company' ? company : 'Unknown Company';

      // Create minimal data - user can edit later
      extractedData = {
        company: finalCompany,
        job_title: 'Job Title (edit me)',
        location: '',
        job_url: '',
        salary_min: null,
        salary_max: null,
        equity: null,
        benefits: null,
        job_description: jobListingText || 'Job details to be filled in',
        key_responsibilities: '',
        required_skills: '',
        nice_to_have_skills: '',
        team_info: null,
        hiring_timeline: null,
        application_deadline: null,
        job_source: null,
      };
    }

    // A source the user explicitly picked in the form always wins over whatever
    // the AI inferred (or didn't).
    if (jobSource) {
      extractedData.job_source = jobSource;
    }

    // Step 2: Get or create default workflow for company
    let workflow = getDefaultWorkflowForCompany(extractedData.company);
    if (!workflow) {
      workflow = createWorkflow(
        extractedData.company,
        `${extractedData.company} Default Workflow`,
        ['applied', 'phone_screen', 'interview', 'offer'],
        true
      );
    }

    // Step 3: Create application with extracted data
    const application = createApplication(extractedData, workflow.id);

    // Step 4: Initial stage history entry. Adding a job means you've applied,
    // so 'applied' is the entry stage (no separate 'started' bucket).
    createStageHistory(application.id, 'applied', 'Application added');

    console.log('[Extract with AI] Success! Created application:', application.id);
    return {
      success: true,
      application,
      workflow,
    };
  } catch (error) {
    console.error('[Extract with AI] Fatal error:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMsg,
    };
  }
});

/**
 * Check if Claude is authenticated by running the Claude CLI
 * (subscription auth from `claude login` - same approach as Inkd)
 */
ipcMain.handle('claude:checkAuth', async () => {
  try {
    console.log('[Claude Auth] Testing authentication via Claude CLI...');

    const reply = await runClaudeCLI('Reply with exactly: ok', 60000);
    console.log('[Claude Auth] ✓ CLI replied:', reply.slice(0, 100));

    return {
      authenticated: true,
      tokenPath: null,
      method: 'subscription (claude CLI)',
    };
  } catch (error) {
    console.error('[Claude Auth] CLI authentication test failed:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);

    return {
      authenticated: false,
      tokenPath: null,
      error: errorMsg,
    };
  }
});

/**
 * Get chat history for an application
 */
ipcMain.handle('chat:getMessages', async (_event, applicationId: string) => {
  try {
    return getChatMessages(applicationId);
  } catch (error) {
    throw new Error(`Failed to get chat messages: ${error}`);
  }
});

/**
 * Send a chat message about an application.
 * Injects the application context so Claude already knows the job.
 */
ipcMain.handle('chat:send', async (_event, applicationId: string, message: string) => {
  try {
    const application = getApplication(applicationId);
    if (!application) {
      return { success: false, error: 'Application not found' };
    }

    const history = getChatMessages(applicationId).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const appContext = [
      `Company: ${application.company}`,
      `Role: ${application.job_title}`,
      application.location ? `Location: ${application.location}` : '',
      `Current stage: ${application.current_stage}`,
      application.salary_min || application.salary_max
        ? `Salary: ${application.salary_min ?? '?'} - ${application.salary_max ?? '?'}`
        : '',
      `Description: ${application.job_description.slice(0, 1500)}`,
      application.key_responsibilities ? `Responsibilities: ${application.key_responsibilities}` : '',
      application.required_skills ? `Required skills: ${application.required_skills}` : '',
      application.notes ? `User's own notes: ${application.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const reply = await chatAboutApplication(appContext, history, message);

    // Persist both turns
    const userMsg = addChatMessage(applicationId, 'user', message);
    const assistantMsg = addChatMessage(applicationId, 'assistant', reply);

    return { success: true, userMessage: userMsg, assistantMessage: assistantMsg };
  } catch (error) {
    console.error('[Chat] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

/**
 * Quick add an application with just company and job title
 */
ipcMain.handle('quickAddApplication', async (_event, company: string, jobTitle: string, jobSource: string | null = null) => {
  try {
    // Get or create default workflow for company
    let workflow = getDefaultWorkflowForCompany(company);
    if (!workflow) {
      workflow = createWorkflow(company, `${company} Default Workflow`, ['applied', 'phone_screen', 'interview', 'offer'], true);
    }

    // Create minimal application entry
    const minimalData: ExtractedJobData = {
      company,
      job_title: jobTitle,
      location: '',
      job_url: '',
      job_source: jobSource,
      salary_min: null,
      salary_max: null,
      equity: null,
      benefits: null,
      job_description: 'Job details to be added. You can paste the job description or link later and Claude will extract all the details.',
      key_responsibilities: '',
      required_skills: '',
      nice_to_have_skills: '',
      team_info: null,
      hiring_timeline: null,
      application_deadline: null,
    };

    const application = createApplication(minimalData, workflow.id);

    // Create initial stage history entry. Adding a job means you've applied.
    createStageHistory(application.id, 'applied', 'Quick added - details to be filled in');

    return {
      success: true,
      application,
      workflow,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
