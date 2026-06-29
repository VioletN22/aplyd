// Service worker: the content script can't fetch 127.0.0.1 from a linkedin.com
// page (mixed-origin), so it sends messages here and we proxy to the aplyd
// local bridge. Mirrors inkd's background.js.
const BASE = 'http://127.0.0.1:17872';

async function call(path, method, body) {
  try {
    const opts = { method };
    if (body !== undefined) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(`${BASE}${path}`, opts);
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Only forward to these known bridge routes. Anything else is rejected so a
// compromised/foreign page can't proxy arbitrary requests through the worker.
// Match on the path portion only (ignore any ?query / #hash).
const ALLOWED_PATHS = new Set([
  '/status', '/pending-job', '/bank', '/answer', '/documents', '/document',
  '/resolve', '/tailor', '/cover/generate', '/cover/refine', '/cover/save', '/log',
]);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Reject messages that didn't originate from this extension's own scripts.
  if (!sender || sender.id !== chrome.runtime.id) return false;
  if (msg && msg.type === 'aplyd') {
    const rawPath = typeof msg.path === 'string' ? msg.path : '';
    const route = rawPath.split('?')[0].split('#')[0];
    if (!ALLOWED_PATHS.has(route)) {
      sendResponse({ ok: false, error: 'path not allowed' });
      return true;
    }
    call(rawPath, msg.method || 'GET', msg.body).then(sendResponse);
    return true; // async
  }
  return false;
});
