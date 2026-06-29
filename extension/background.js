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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'aplyd') {
    call(msg.path, msg.method || 'GET', msg.body).then(sendResponse);
    return true; // async
  }
  return false;
});
